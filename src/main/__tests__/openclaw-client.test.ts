import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { OpenClawClient } from '../openclaw-client'

// Mock ws module
vi.mock('ws', () => {
  const { EventEmitter } = require('node:events')
  class MockWebSocket extends EventEmitter {
    readyState = 1 // OPEN
    send = vi.fn()
    close = vi.fn()
    static OPEN = 1

    constructor() {
      super()
      // Auto-emit 'open' on next tick so connect() promise resolves
      process.nextTick(() => this.emit('open'))
    }
  }
  return { default: MockWebSocket, WebSocket: MockWebSocket }
})

describe('OpenClawClient', () => {
  let client: OpenClawClient

  beforeEach(() => {
    client = new OpenClawClient('ws://127.0.0.1:18789', 'test-token', 'agent:main:budgie')
  })

  afterEach(() => {
    client.disconnect()
  })

  it('creates with correct config', () => {
    expect(client.sessionKey).toBe('agent:main:budgie')
  })

  it('sends auth on connect', async () => {
    await client.connect()
    const ws = client['ws']!
    expect(ws.send).toHaveBeenCalledWith(expect.stringContaining('"method":"auth"'))
  })

  it('sends chat message with session key', async () => {
    await client.connect()
    client.sendMessage('hello')
    const ws = client['ws']!
    const send = ws.send as unknown as Mock
    const lastCall = send.mock.calls[send.mock.calls.length - 1][0]
    const parsed = JSON.parse(lastCall)
    expect(parsed.method).toBe('chat.send')
    expect(parsed.params.text).toBe('hello')
    expect(parsed.params.sessionKey).toBe('agent:main:budgie')
  })

  it('emits stream events', async () => {
    await client.connect()
    const streamHandler = vi.fn()
    client.on('stream', streamHandler)
    const ws = client['ws']!
    ws.emit('message', JSON.stringify({
      type: 'event', event: 'agent',
      payload: { streaming: true, text: 'Hello' }
    }))
    expect(streamHandler).toHaveBeenCalledWith('Hello')
  })

  it('emits done event', async () => {
    await client.connect()
    const doneHandler = vi.fn()
    client.on('done', doneHandler)
    const ws = client['ws']!
    ws.emit('message', JSON.stringify({
      type: 'event', event: 'agent',
      payload: { done: true, text: 'Full response' }
    }))
    expect(doneHandler).toHaveBeenCalledWith('Full response')
  })

  it('increments request ids', async () => {
    await client.connect()
    client.sendMessage('a')
    client.sendMessage('b')
    const ws = client['ws']!
    const send = ws.send as unknown as Mock
    const call1 = JSON.parse(send.mock.calls[1][0])
    const call2 = JSON.parse(send.mock.calls[2][0])
    expect(call2.id).toBe(call1.id + 1)
  })
})
