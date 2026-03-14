import { describe, expect, it } from 'vitest'
import { IPC } from '../ipc-channels'
import type { ChatMessage, VoiceState } from '../types'

describe('shared types', () => {
  it('VoiceState has all expected values', () => {
    const states: VoiceState[] = ['idle', 'listening', 'processing', 'thinking', 'speaking']
    expect(states).toHaveLength(5)
  })

  it('ChatMessage shape is correct', () => {
    const msg: ChatMessage = { id: '1', role: 'user', text: 'hello', timestamp: Date.now() }
    expect(msg.role).toBe('user')
  })

  it('IPC channels are all unique strings', () => {
    const values = Object.values(IPC)
    expect(new Set(values).size).toBe(values.length)
  })
})
