import { describe, expect, it, vi } from 'vitest'
import { createActor, type EventFromLogic } from 'xstate'
import { voiceMachine } from '../voice-machine'

type VoiceEvent = EventFromLogic<typeof voiceMachine>

function toEvent(name: string): VoiceEvent {
  if (name === 'STT_DONE') return { type: 'STT_DONE', text: 'test' }
  return { type: name } as VoiceEvent
}

function actorSnapshot(events: string[]) {
  const actor = createActor(voiceMachine)
  actor.start()
  for (const e of events) actor.send(toEvent(e))
  const snap = actor.getSnapshot()
  actor.stop()
  return snap.value
}

describe('voiceMachine', () => {
  // Normal flow: Ready → Listening → Recognizing → Thinking → Speaking → Ready
  it('starts in idle (Ready)', () => {
    expect(actorSnapshot([])).toBe('idle')
  })

  it('idle → listening on SPEECH_START', () => {
    expect(actorSnapshot(['SPEECH_START'])).toBe('listening')
  })

  it('listening → processing (Recognizing) on SPEECH_END', () => {
    expect(actorSnapshot(['SPEECH_START', 'SPEECH_END'])).toBe('processing')
  })

  it('processing → thinking on STT_DONE', () => {
    expect(actorSnapshot(['SPEECH_START', 'SPEECH_END', 'STT_DONE'])).toBe('thinking')
  })

  it('thinking → speaking on TTS_PLAYING', () => {
    expect(actorSnapshot(['SPEECH_START', 'SPEECH_END', 'STT_DONE', 'TTS_PLAYING'])).toBe(
      'speaking'
    )
  })

  it('speaking → idle on TTS_DONE', () => {
    expect(
      actorSnapshot(['SPEECH_START', 'SPEECH_END', 'STT_DONE', 'TTS_PLAYING', 'TTS_DONE'])
    ).toBe('idle')
  })

  it('speaking → idle on CANCEL', () => {
    expect(actorSnapshot(['SPEECH_START', 'SPEECH_END', 'STT_DONE', 'TTS_PLAYING', 'CANCEL'])).toBe(
      'idle'
    )
  })

  // Interruption: processing/thinking/speaking → listening
  it('processing → listening on SPEECH_START (interruption)', () => {
    expect(actorSnapshot(['SPEECH_START', 'SPEECH_END', 'SPEECH_START'])).toBe('listening')
  })

  it('thinking → listening on SPEECH_START (interruption)', () => {
    expect(actorSnapshot(['SPEECH_START', 'SPEECH_END', 'STT_DONE', 'SPEECH_START'])).toBe(
      'listening'
    )
  })

  it('speaking → listening on SPEECH_START (interruption)', () => {
    expect(
      actorSnapshot(['SPEECH_START', 'SPEECH_END', 'STT_DONE', 'TTS_PLAYING', 'SPEECH_START'])
    ).toBe('listening')
  })

  // Edge cases
  it('thinking → idle on TTS_DONE (no TTS provider)', () => {
    expect(actorSnapshot(['SPEECH_START', 'SPEECH_END', 'STT_DONE', 'TTS_DONE'])).toBe('idle')
  })

  it('processing → idle on CANCEL', () => {
    expect(actorSnapshot(['SPEECH_START', 'SPEECH_END', 'CANCEL'])).toBe('idle')
  })

  it('processing → idle on STT_FAIL', () => {
    expect(actorSnapshot(['SPEECH_START', 'SPEECH_END', 'STT_FAIL'])).toBe('idle')
  })

  it('listening → idle on CANCEL', () => {
    expect(actorSnapshot(['SPEECH_START', 'CANCEL'])).toBe('idle')
  })

  it('thinking → idle on CANCEL', () => {
    expect(actorSnapshot(['SPEECH_START', 'SPEECH_END', 'STT_DONE', 'CANCEL'])).toBe('idle')
  })

  // Timeout
  it('listening → idle after 10s timeout', () => {
    vi.useFakeTimers()
    const actor = createActor(voiceMachine)
    actor.start()
    actor.send({ type: 'SPEECH_START' })
    expect(actor.getSnapshot().value).toBe('listening')

    vi.advanceTimersByTime(10_000)
    expect(actor.getSnapshot().value).toBe('idle')

    actor.stop()
    vi.useRealTimers()
  })

  it('listening does NOT timeout before 10s', () => {
    vi.useFakeTimers()
    const actor = createActor(voiceMachine)
    actor.start()
    actor.send({ type: 'SPEECH_START' })

    vi.advanceTimersByTime(9_999)
    expect(actor.getSnapshot().value).toBe('listening')

    actor.stop()
    vi.useRealTimers()
  })

  // Ignored events (no transition)
  it('idle ignores SPEECH_END (no-op)', () => {
    expect(actorSnapshot(['SPEECH_END'])).toBe('idle')
  })

  it('idle ignores TTS_DONE (no-op)', () => {
    expect(actorSnapshot(['TTS_DONE'])).toBe('idle')
  })

  it('idle ignores CANCEL (no-op)', () => {
    expect(actorSnapshot(['CANCEL'])).toBe('idle')
  })

  // Full conversation cycle
  it('completes full conversation cycle', () => {
    const events = [
      'SPEECH_START',
      'SPEECH_END',
      'STT_DONE',
      'TTS_PLAYING',
      'TTS_DONE',
      'SPEECH_START',
      'SPEECH_END',
      'STT_DONE',
      'TTS_PLAYING',
      'TTS_DONE'
    ]
    expect(actorSnapshot(events)).toBe('idle')
  })

  // Multiple interruptions
  it('handles multiple consecutive interruptions', () => {
    const events = [
      'SPEECH_START',
      'SPEECH_END',
      'STT_DONE',
      'TTS_PLAYING', // speaking
      'SPEECH_START', // interrupt → listening
      'SPEECH_END',
      'STT_DONE', // thinking
      'SPEECH_START' // interrupt again → listening
    ]
    expect(actorSnapshot(events)).toBe('listening')
  })
})
