import { beforeEach, describe, expect, it } from 'vitest'
import { SettingsStore } from '../settings-store'

describe('SettingsStore', () => {
  let store: SettingsStore

  beforeEach(() => {
    store = new SettingsStore(':memory:')
  })

  it('returns defaults for all keys', () => {
    expect(store.get('sttProvider')).toBe('elevenlabs')
    expect(store.get('ttsProvider')).toBe('elevenlabs')
    expect(store.get('voicevoxUrl')).toBe('http://localhost:50021')
    expect(store.get('voicevoxSpeakerId')).toBe(1)
    expect(store.get('kokoroUrl')).toBe('http://localhost:8880')
    expect(store.get('piperPath')).toBe('')
    expect(store.get('piperModelPath')).toBe('')
    expect(store.get('localWhisperPath')).toBe('')
  })

  it('persists set values', () => {
    store.set('sttProvider', 'localWhisper')
    expect(store.get('sttProvider')).toBe('localWhisper')

    store.set('ttsProvider', 'voicevox')
    expect(store.get('ttsProvider')).toBe('voicevox')

    store.set('voicevoxSpeakerId', 3)
    expect(store.get('voicevoxSpeakerId')).toBe(3)

    store.set('piperModelPath', '/path/to/model.onnx')
    expect(store.get('piperModelPath')).toBe('/path/to/model.onnx')
  })

  it('getAll returns a copy of all settings', () => {
    store.set('ttsProvider', 'kokoro')
    const all = store.getAll()
    expect(all.ttsProvider).toBe('kokoro')
    expect(all.sttProvider).toBe('elevenlabs')

    // Modifying the returned object should not affect the store
    all.ttsProvider = 'piper'
    expect(store.get('ttsProvider')).toBe('kokoro')
  })
})
