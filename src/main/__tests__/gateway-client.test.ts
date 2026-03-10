import { describe, it, expect } from 'vitest'
import type { IGatewayClient, GatewayClientEvents } from '../gateway-client'
import { OpenClawClient } from '../openclaw-client'

describe('IGatewayClient', () => {
  it('OpenClawClient satisfies IGatewayClient interface at type level', () => {
    // This test verifies the type contract — it does not make network calls.
    // If OpenClawClient stops implementing IGatewayClient, this file will fail to compile.
    const assertImplements = (_client: IGatewayClient): void => {}
    const client = new OpenClawClient('ws://localhost:0', 'test-token', 'test-session')
    assertImplements(client)
    client.disconnect()
  })

  it('has connect method', () => {
    const client = new OpenClawClient('ws://localhost:0', 'test-token', 'test-session')
    expect(typeof client.connect).toBe('function')
    client.disconnect()
  })

  it('has disconnect method', () => {
    const client = new OpenClawClient('ws://localhost:0', 'test-token', 'test-session')
    expect(typeof client.disconnect).toBe('function')
    client.disconnect()
  })

  it('has sendMessage method', () => {
    const client = new OpenClawClient('ws://localhost:0', 'test-token', 'test-session')
    expect(typeof client.sendMessage).toBe('function')
    client.disconnect()
  })

  it('has cancelActiveRuns method', () => {
    const client = new OpenClawClient('ws://localhost:0', 'test-token', 'test-session')
    expect(typeof client.cancelActiveRuns).toBe('function')
    client.disconnect()
  })

  it('GatewayClientEvents type covers all expected events', () => {
    // Type-level check: ensure all event names exist
    type EventNames = keyof GatewayClientEvents
    const events: EventNames[] = [
      'connected',
      'disconnected',
      'error',
      'stream',
      'done',
      'chatError'
    ]
    expect(events).toHaveLength(6)
  })
})
