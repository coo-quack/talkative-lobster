import { describe, it, expect } from 'vitest'
import type { VoiceState, ChatMessage, InputMode } from '../types'
import { IPC } from '../ipc-channels'

describe('shared types', () => {
  it('VoiceState has all expected values', () => {
    const states: VoiceState[] = ['idle', 'listening', 'processing', 'thinking', 'speaking']
    expect(states).toHaveLength(5)
  })

  it('InputMode has all expected values', () => {
    const modes: InputMode[] = ['hands-free', 'push-to-talk']
    expect(modes).toHaveLength(2)
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
