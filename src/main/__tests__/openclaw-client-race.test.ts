import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OpenClawClient } from '../openclaw-client'

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn()
}))

vi.mock('ws', () => {
  const { EventEmitter } = require('node:events')
  class MockWebSocket extends EventEmitter {
    readyState = 1
    send = vi.fn()
    close = vi.fn()
    static OPEN = 1

    constructor() {
      super()
      process.nextTick(() => {
        this.emit('open')
        process.nextTick(() => {
          this.emit(
            'message',
            JSON.stringify({
              type: 'event',
              event: 'connect.challenge',
              payload: { nonce: 'test-nonce' }
            })
          )
        })
      })
    }

    resolveConnect(): void {
      const calls = (this.send as ReturnType<typeof vi.fn>).mock.calls
      const connectCall = calls.find((c: string[]) => {
        const parsed = JSON.parse(c[0])
        return parsed.method === 'connect'
      })
      if (connectCall) {
        const parsed = JSON.parse(connectCall[0])
        this.emit('message', JSON.stringify({ type: 'res', id: parsed.id, ok: true, payload: {} }))
      }
    }

    resolveChatSend(runId: string): void {
      const calls = (this.send as ReturnType<typeof vi.fn>).mock.calls
      const chatCall = [...calls].reverse().find((c: string[]) => {
        const parsed = JSON.parse(c[0])
        return parsed.method === 'chat.send'
      })
      if (chatCall) {
        const parsed = JSON.parse(chatCall[0])
        this.emit(
          'message',
          JSON.stringify({ type: 'res', id: parsed.id, ok: true, payload: { runId } })
        )
      }
    }
  }
  return { default: MockWebSocket, WebSocket: MockWebSocket }
})

interface MockWs {
  send: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  emit: (event: string, ...args: unknown[]) => boolean
  resolveConnect: () => void
  resolveChatSend: (runId: string) => void
}

async function connectClient(client: OpenClawClient): Promise<MockWs> {
  const connectPromise = client.connect()
  await new Promise((r) => setTimeout(r, 10))
  // biome-ignore lint/complexity/useLiteralKeys: accessing private member for testing
  const ws = client['ws'] as unknown as MockWs
  ws.resolveConnect()
  await connectPromise
  return ws
}

// ── Race condition tests ────────────────────────────────────────────

describe('OpenClawClient race conditions', () => {
  let client: OpenClawClient

  beforeEach(() => {
    client = new OpenClawClient('ws://127.0.0.1:18789', 'test-token', 'agent:main:lobster')
  })

  afterEach(() => {
    client.disconnect()
  })

  // ── Optimistic runId acceptance ──────────────────────────────

  describe('optimistic runId acceptance', () => {
    it('accepts chat event before chat.send response when pendingMessageId is set', async () => {
      const ws = await connectClient(client)
      const streamHandler = vi.fn()
      client.on('stream', streamHandler)

      // Send message — sets pendingMessageId
      client.sendMessage('hello')
      await new Promise((r) => setTimeout(r, 5))

      // Chat event arrives BEFORE chat.send response (race condition)
      ws.emit(
        'message',
        JSON.stringify({
          type: 'event',
          event: 'chat',
          payload: { state: 'delta', runId: 'optimistic-run', message: { text: 'Hi' } }
        })
      )

      // Should be accepted optimistically
      expect(streamHandler).toHaveBeenCalledWith('Hi')
    })

    it('tracks optimistically accepted runId for subsequent events', async () => {
      const ws = await connectClient(client)
      const doneHandler = vi.fn()
      client.on('done', doneHandler)

      client.sendMessage('hello')
      await new Promise((r) => setTimeout(r, 5))

      // First event accepted optimistically
      ws.emit(
        'message',
        JSON.stringify({
          type: 'event',
          event: 'chat',
          payload: { state: 'delta', runId: 'opt-run', message: { text: 'partial' } }
        })
      )

      // Subsequent event uses the now-tracked runId
      ws.emit(
        'message',
        JSON.stringify({
          type: 'event',
          event: 'chat',
          payload: { state: 'final', runId: 'opt-run', message: { text: 'Full response' } }
        })
      )

      expect(doneHandler).toHaveBeenCalledWith('Full response')
    })

    it('does not optimistically accept when no pendingMessageId', async () => {
      const ws = await connectClient(client)
      const streamHandler = vi.fn()
      client.on('stream', streamHandler)

      // No sendMessage called — no pendingMessageId
      ws.emit(
        'message',
        JSON.stringify({
          type: 'event',
          event: 'chat',
          payload: { state: 'delta', runId: 'unknown-run', message: { text: 'Ignored' } }
        })
      )

      expect(streamHandler).not.toHaveBeenCalled()
    })
  })

  // ── cancelActiveRuns with late responses ────────────────────

  describe('cancelActiveRuns with late responses', () => {
    it('late chat.send response after cancel → runId added to ignoredRunIds', async () => {
      const ws = await connectClient(client)
      const doneHandler = vi.fn()
      client.on('done', doneHandler)

      client.sendMessage('hello')
      await new Promise((r) => setTimeout(r, 5))

      // Cancel BEFORE response
      client.cancelActiveRuns()

      // Late response arrives
      ws.resolveChatSend('late-run')
      await new Promise((r) => setTimeout(r, 5))

      // Events for this run should be ignored
      ws.emit(
        'message',
        JSON.stringify({
          type: 'event',
          event: 'chat',
          payload: { state: 'final', runId: 'late-run', message: { text: 'Should be ignored' } }
        })
      )

      expect(doneHandler).not.toHaveBeenCalled()
    })

    it('late final event after cancel → ignored and cleaned up', async () => {
      const ws = await connectClient(client)
      const streamHandler = vi.fn()
      const doneHandler = vi.fn()
      client.on('stream', streamHandler)
      client.on('done', doneHandler)

      client.sendMessage('hello')
      await new Promise((r) => setTimeout(r, 5))
      ws.resolveChatSend('run-to-cancel')
      await new Promise((r) => setTimeout(r, 5))

      // Cancel the active run
      client.cancelActiveRuns()

      // Late events arrive
      ws.emit(
        'message',
        JSON.stringify({
          type: 'event',
          event: 'chat',
          payload: { state: 'delta', runId: 'run-to-cancel', message: { text: 'Ignored delta' } }
        })
      )
      expect(streamHandler).not.toHaveBeenCalled()

      // Final event should clean up ignoredRunIds
      ws.emit(
        'message',
        JSON.stringify({
          type: 'event',
          event: 'chat',
          payload: {
            state: 'final',
            runId: 'run-to-cancel',
            message: { text: 'Ignored final' }
          }
        })
      )
      expect(doneHandler).not.toHaveBeenCalled()
    })

    it('late error event after cancel → ignored and cleaned up', async () => {
      const ws = await connectClient(client)
      const errorHandler = vi.fn()
      client.on('chatError', errorHandler)

      client.sendMessage('hello')
      await new Promise((r) => setTimeout(r, 5))
      ws.resolveChatSend('run-err')
      await new Promise((r) => setTimeout(r, 5))

      client.cancelActiveRuns()

      ws.emit(
        'message',
        JSON.stringify({
          type: 'event',
          event: 'chat',
          payload: { state: 'error', runId: 'run-err', errorMessage: 'Rate limited' }
        })
      )

      expect(errorHandler).not.toHaveBeenCalled()
    })
  })

  // ── cancelActiveRuns + new sendMessage (idempotency) ────────

  describe('cancel then new message', () => {
    it('cancel + new sendMessage → new run is tracked independently', async () => {
      const ws = await connectClient(client)
      const doneHandler = vi.fn()
      client.on('done', doneHandler)

      // First message
      client.sendMessage('first')
      await new Promise((r) => setTimeout(r, 5))
      ws.resolveChatSend('run-1')
      await new Promise((r) => setTimeout(r, 5))

      // Cancel first run
      client.cancelActiveRuns()

      // New message
      client.sendMessage('second')
      await new Promise((r) => setTimeout(r, 5))
      ws.resolveChatSend('run-2')
      await new Promise((r) => setTimeout(r, 5))

      // Events from run-1 should be ignored
      ws.emit(
        'message',
        JSON.stringify({
          type: 'event',
          event: 'chat',
          payload: { state: 'final', runId: 'run-1', message: { text: 'Old response' } }
        })
      )
      expect(doneHandler).not.toHaveBeenCalled()

      // Events from run-2 should be processed
      ws.emit(
        'message',
        JSON.stringify({
          type: 'event',
          event: 'chat',
          payload: { state: 'final', runId: 'run-2', message: { text: 'New response' } }
        })
      )
      expect(doneHandler).toHaveBeenCalledWith('New response')
    })

    it('rapid cancel + send cycle does not lose new run', async () => {
      const ws = await connectClient(client)
      const doneHandler = vi.fn()
      client.on('done', doneHandler)

      // Send → cancel → send rapidly
      client.sendMessage('msg1')
      await new Promise((r) => setTimeout(r, 5))
      client.cancelActiveRuns()

      client.sendMessage('msg2')
      await new Promise((r) => setTimeout(r, 5))
      ws.resolveChatSend('run-rapid')
      await new Promise((r) => setTimeout(r, 5))

      ws.emit(
        'message',
        JSON.stringify({
          type: 'event',
          event: 'chat',
          payload: { state: 'final', runId: 'run-rapid', message: { text: 'Rapid response' } }
        })
      )

      expect(doneHandler).toHaveBeenCalledWith('Rapid response')
    })
  })

  // ── Synchronous callback (onResolveSync) ──────────────────────

  describe('synchronous runId tracking', () => {
    it('onResolveSync tracks runId before next WebSocket frame', async () => {
      const ws = await connectClient(client)
      const streamHandler = vi.fn()
      client.on('stream', streamHandler)

      client.sendMessage('hello')
      await new Promise((r) => setTimeout(r, 5))

      // Simulate: chat.send response + chat event in same "frame"
      // The onResolveSync callback should add runId to activeRunIds synchronously
      ws.resolveChatSend('sync-run')

      // This event should work because runId was added synchronously
      ws.emit(
        'message',
        JSON.stringify({
          type: 'event',
          event: 'chat',
          payload: { state: 'delta', runId: 'sync-run', message: { text: 'Sync hello' } }
        })
      )

      expect(streamHandler).toHaveBeenCalledWith('Sync hello')
    })
  })

  // ── Multiple active runs ──────────────────────────────────────

  describe('multiple active runs', () => {
    it('events from different tracked runs are processed independently', async () => {
      const ws = await connectClient(client)
      const streamHandler = vi.fn()
      const doneHandler = vi.fn()
      client.on('stream', streamHandler)
      client.on('done', doneHandler)

      // First message
      client.sendMessage('first')
      await new Promise((r) => setTimeout(r, 5))
      ws.resolveChatSend('run-a')
      await new Promise((r) => setTimeout(r, 5))

      // Second message (before first is done)
      client.sendMessage('second')
      await new Promise((r) => setTimeout(r, 5))
      ws.resolveChatSend('run-b')
      await new Promise((r) => setTimeout(r, 5))

      // Events from both runs
      ws.emit(
        'message',
        JSON.stringify({
          type: 'event',
          event: 'chat',
          payload: { state: 'delta', runId: 'run-a', message: { text: 'A-delta' } }
        })
      )
      ws.emit(
        'message',
        JSON.stringify({
          type: 'event',
          event: 'chat',
          payload: { state: 'final', runId: 'run-b', message: { text: 'B-final' } }
        })
      )

      expect(streamHandler).toHaveBeenCalledWith('A-delta')
      expect(doneHandler).toHaveBeenCalledWith('B-final')
    })
  })
})
