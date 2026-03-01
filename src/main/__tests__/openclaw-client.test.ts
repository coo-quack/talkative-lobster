import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OpenClawClient } from '../openclaw-client'

// Mock crypto for deterministic device identity
vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}))

// Mock ws module with challenge-response simulation
vi.mock('ws', () => {
  const { EventEmitter } = require('node:events')
  class MockWebSocket extends EventEmitter {
    readyState = 1 // OPEN
    send = vi.fn()
    close = vi.fn()
    static OPEN = 1

    constructor() {
      super()
      // 1. Emit 'open'
      // 2. Emit connect.challenge with nonce
      process.nextTick(() => {
        this.emit('open')
        process.nextTick(() => {
          this.emit(
            'message',
            JSON.stringify({
              type: 'event',
              event: 'connect.challenge',
              payload: { nonce: 'test-nonce-123' },
            })
          )
        })
      })
    }

    /** Helper: simulate server responding OK to the first pending request (connect) */
    resolveConnect(): void {
      const calls = (this.send as ReturnType<typeof vi.fn>).mock.calls
      const connectCall = calls.find((c: string[]) => {
        const parsed = JSON.parse(c[0])
        return parsed.method === 'connect'
      })
      if (connectCall) {
        const parsed = JSON.parse(connectCall[0])
        this.emit(
          'message',
          JSON.stringify({ type: 'res', id: parsed.id, ok: true, payload: {} })
        )
      }
    }

    /** Helper: respond OK to a chat.send request with a runId */
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

async function connectClient(client: OpenClawClient): Promise<any> {
  const connectPromise = client.connect()
  // Wait for challenge to arrive and connect request to be sent
  await new Promise((r) => setTimeout(r, 10))
  const ws = client['ws'] as any
  ws.resolveConnect()
  await connectPromise
  return ws
}

describe('OpenClawClient', () => {
  let client: OpenClawClient

  beforeEach(() => {
    client = new OpenClawClient('ws://127.0.0.1:18789', 'test-token', 'agent:main:lobster')
  })

  afterEach(() => {
    client.disconnect()
  })

  it('creates with correct config', () => {
    expect(client.sessionKey).toBe('agent:main:lobster')
  })

  it('sends connect request after receiving challenge', async () => {
    const ws = await connectClient(client)
    const calls = ws.send.mock.calls.map((c: string[]) => JSON.parse(c[0]))
    const connectReq = calls.find((c: any) => c.method === 'connect')
    expect(connectReq).toBeDefined()
    expect(connectReq.params.auth.token).toBe('test-token')
    expect(connectReq.params.device.nonce).toBe('test-nonce-123')
    expect(connectReq.params.client.displayName).toBe('Lobster')
  })

  it('sends chat.send with session key and message', async () => {
    const ws = await connectClient(client)
    client.sendMessage('hello')
    await new Promise((r) => setTimeout(r, 5))
    const calls = ws.send.mock.calls.map((c: string[]) => JSON.parse(c[0]))
    const chatReq = calls.find((c: any) => c.method === 'chat.send')
    expect(chatReq).toBeDefined()
    expect(chatReq.params.message).toBe('hello')
    expect(chatReq.params.sessionKey).toBe('agent:main:lobster')
  })

  it('emits stream events for tracked runId', async () => {
    const ws = await connectClient(client)
    const streamHandler = vi.fn()
    client.on('stream', streamHandler)

    client.sendMessage('hello')
    await new Promise((r) => setTimeout(r, 5))
    ws.resolveChatSend('run-1')
    await new Promise((r) => setTimeout(r, 5))

    ws.emit(
      'message',
      JSON.stringify({
        type: 'event',
        event: 'chat',
        payload: { state: 'delta', runId: 'run-1', message: { text: 'Hello' } },
      })
    )
    expect(streamHandler).toHaveBeenCalledWith('Hello')
  })

  it('emits done event for tracked runId', async () => {
    const ws = await connectClient(client)
    const doneHandler = vi.fn()
    client.on('done', doneHandler)

    client.sendMessage('hello')
    await new Promise((r) => setTimeout(r, 5))
    ws.resolveChatSend('run-2')
    await new Promise((r) => setTimeout(r, 5))

    ws.emit(
      'message',
      JSON.stringify({
        type: 'event',
        event: 'chat',
        payload: { state: 'final', runId: 'run-2', message: { text: 'Full response' } },
      })
    )
    expect(doneHandler).toHaveBeenCalledWith('Full response')
  })

  it('rejects pending requests on disconnect', async () => {
    const ws = await connectClient(client)

    // Access internal request method to create a pending request
    const requestPromise = (client as any).request('test.method', { data: 'hello' })

    // Disconnect while request is pending
    client.disconnect()

    await expect(requestPromise).rejects.toThrow('disconnected')
  })

  it('emits chatError event on chat error state', async () => {
    const ws = await connectClient(client)

    const errors: string[] = []
    client.on('chatError', (msg: string) => errors.push(msg))

    // Trigger a chat.send to register the runId
    client.sendMessage('hello')
    await new Promise((r) => setTimeout(r, 5))
    ws.resolveChatSend('run-err')
    await new Promise((r) => setTimeout(r, 5))

    // Simulate chat error event
    ws.emit(
      'message',
      JSON.stringify({
        type: 'event',
        event: 'chat',
        payload: { state: 'error', runId: 'run-err', errorMessage: 'Rate limit exceeded' },
      })
    )

    expect(errors).toEqual(['Rate limit exceeded'])
  })

  it('ignores chat events with unknown runId', async () => {
    const ws = await connectClient(client)
    const streamHandler = vi.fn()
    client.on('stream', streamHandler)

    ws.emit(
      'message',
      JSON.stringify({
        type: 'event',
        event: 'chat',
        payload: { state: 'delta', runId: 'unknown-run', message: { text: 'Ignored' } },
      })
    )
    expect(streamHandler).not.toHaveBeenCalled()
  })

  it('cancelActiveRuns ignores events from cancelled run', async () => {
    const ws = await connectClient(client)
    const streamHandler = vi.fn()
    const doneHandler = vi.fn()
    client.on('stream', streamHandler)
    client.on('done', doneHandler)

    client.sendMessage('hello')
    await new Promise((r) => setTimeout(r, 5))
    ws.resolveChatSend('run-cancel-1')
    await new Promise((r) => setTimeout(r, 5))

    // Cancel all active runs
    client.cancelActiveRuns()

    // Events from cancelled run should be ignored
    ws.emit(
      'message',
      JSON.stringify({
        type: 'event',
        event: 'chat',
        payload: { state: 'delta', runId: 'run-cancel-1', message: { text: 'Should be ignored' } },
      })
    )
    expect(streamHandler).not.toHaveBeenCalled()

    // Final event should clean up ignoredRunIds
    ws.emit(
      'message',
      JSON.stringify({
        type: 'event',
        event: 'chat',
        payload: { state: 'final', runId: 'run-cancel-1', message: { text: 'Also ignored' } },
      })
    )
    expect(doneHandler).not.toHaveBeenCalled()
  })

  it('cancelActiveRuns with pendingMessageId marks late response as ignored', async () => {
    const ws = await connectClient(client)
    const doneHandler = vi.fn()
    client.on('done', doneHandler)

    client.sendMessage('hello')
    await new Promise((r) => setTimeout(r, 5))

    // Cancel BEFORE chat.send response arrives
    client.cancelActiveRuns()

    // Now the response arrives with a runId
    ws.resolveChatSend('run-late-1')
    await new Promise((r) => setTimeout(r, 5))

    // Events for this run should be ignored because idempotencyKey was in ignoredRunIds
    ws.emit(
      'message',
      JSON.stringify({
        type: 'event',
        event: 'chat',
        payload: { state: 'delta', runId: 'run-late-1', message: { text: 'Ignored' } },
      })
    )
    expect(doneHandler).not.toHaveBeenCalled()
  })

  it('extractText handles content array format', async () => {
    const ws = await connectClient(client)
    const doneHandler = vi.fn()
    client.on('done', doneHandler)

    client.sendMessage('hello')
    await new Promise((r) => setTimeout(r, 5))
    ws.resolveChatSend('run-content')
    await new Promise((r) => setTimeout(r, 5))

    ws.emit(
      'message',
      JSON.stringify({
        type: 'event',
        event: 'chat',
        payload: {
          state: 'final',
          runId: 'run-content',
          message: {
            content: [
              { type: 'text', text: 'Hello ' },
              { type: 'text', text: 'world' },
            ],
          },
        },
      })
    )
    expect(doneHandler).toHaveBeenCalledWith('Hello world')
  })

  it('extractText handles string content format', async () => {
    const ws = await connectClient(client)
    const doneHandler = vi.fn()
    client.on('done', doneHandler)

    client.sendMessage('hello')
    await new Promise((r) => setTimeout(r, 5))
    ws.resolveChatSend('run-string')
    await new Promise((r) => setTimeout(r, 5))

    ws.emit(
      'message',
      JSON.stringify({
        type: 'event',
        event: 'chat',
        payload: {
          state: 'final',
          runId: 'run-string',
          message: { content: 'Direct string content' },
        },
      })
    )
    expect(doneHandler).toHaveBeenCalledWith('Direct string content')
  })

  it('ignores tick events', async () => {
    const ws = await connectClient(client)
    const streamHandler = vi.fn()
    client.on('stream', streamHandler)

    ws.emit(
      'message',
      JSON.stringify({ type: 'event', event: 'tick' })
    )
    expect(streamHandler).not.toHaveBeenCalled()
  })

  it('handles error response for request', async () => {
    const ws = await connectClient(client)

    const requestPromise = (client as any).request('test.method', {})
    const calls = ws.send.mock.calls.map((c: string[]) => JSON.parse(c[0]))
    const testReq = [...calls].reverse().find((c: any) => c.method === 'test.method')

    ws.emit(
      'message',
      JSON.stringify({
        type: 'res',
        id: testReq.id,
        ok: false,
        error: { message: 'Not authorized' },
      })
    )

    await expect(requestPromise).rejects.toThrow('Not authorized')
  })

  it('rejects request when not connected', async () => {
    client.disconnect()
    await expect((client as any).request('test.method', {})).rejects.toThrow('gateway not connected')
  })
})
