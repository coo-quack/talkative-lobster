import { describe, it, expect } from 'vitest'
import { createActor } from 'xstate'
import { voiceMachine } from '../voice-machine'

function actorSnapshot(events: string[]) {
  const actor = createActor(voiceMachine)
  actor.start()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const e of events) actor.send({ type: e } as any)
  const snap = actor.getSnapshot()
  actor.stop()
  return snap.value
}

describe('voiceMachine', () => {
  it('starts in idle', () => {
    expect(actorSnapshot([])).toBe('idle')
  })

  it('idle → listening on SPEECH_START', () => {
    expect(actorSnapshot(['SPEECH_START'])).toBe('listening')
  })

  it('listening → processing on SPEECH_END', () => {
    expect(actorSnapshot(['SPEECH_START', 'SPEECH_END'])).toBe('processing')
  })

  it('processing → thinking on STT_DONE', () => {
    expect(actorSnapshot(['SPEECH_START', 'SPEECH_END', 'STT_DONE'])).toBe('thinking')
  })

  it('thinking → speaking on LLM_STREAM_START', () => {
    expect(actorSnapshot(['SPEECH_START', 'SPEECH_END', 'STT_DONE', 'LLM_STREAM_START'])).toBe('speaking')
  })

  it('speaking → idle on TTS_DONE', () => {
    expect(actorSnapshot(['SPEECH_START', 'SPEECH_END', 'STT_DONE', 'LLM_STREAM_START', 'TTS_DONE'])).toBe('idle')
  })

  it('speaking → idle on INTERRUPT (user barge-in)', () => {
    expect(actorSnapshot(['SPEECH_START', 'SPEECH_END', 'STT_DONE', 'LLM_STREAM_START', 'INTERRUPT'])).toBe('idle')
  })

  it('processing → idle on STT_FAIL', () => {
    expect(actorSnapshot(['SPEECH_START', 'SPEECH_END', 'STT_FAIL'])).toBe('idle')
  })

  it('listening → idle on CANCEL', () => {
    expect(actorSnapshot(['SPEECH_START', 'CANCEL'])).toBe('idle')
  })
})
