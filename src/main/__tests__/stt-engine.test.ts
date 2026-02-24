import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SttEngine } from '../stt-engine'

describe('SttEngine', () => {
  let engine: SttEngine

  beforeEach(() => {
    engine = new SttEngine({
      elevenlabsApiKey: 'sk_test',
      openaiApiKey: 'sk_openai_test',
      localWhisperPath: null,
      providers: { elevenlabs: true, openaiWhisper: true, localWhisper: false, webSpeech: false },
    })
  })

  it('creates with providers config', () => {
    expect(engine).toBeDefined()
  })

  it('falls back to next provider on failure', async () => {
    const mockElevenlabs = vi.spyOn(engine as any, 'transcribeElevenlabs').mockRejectedValue(new Error('timeout'))
    const mockWhisper = vi.spyOn(engine as any, 'transcribeOpenaiWhisper').mockResolvedValue('hello world')

    const audio = new Float32Array(16000)
    const result = await engine.transcribe(audio, 16000)

    expect(mockElevenlabs).toHaveBeenCalled()
    expect(mockWhisper).toHaveBeenCalled()
    expect(result).toBe('hello world')
  })

  it('returns null when all providers fail', async () => {
    vi.spyOn(engine as any, 'transcribeElevenlabs').mockRejectedValue(new Error('fail'))
    vi.spyOn(engine as any, 'transcribeOpenaiWhisper').mockRejectedValue(new Error('fail'))

    const audio = new Float32Array(16000)
    const result = await engine.transcribe(audio, 16000)

    expect(result).toBeNull()
  })

  it('skips disabled providers', async () => {
    engine = new SttEngine({
      elevenlabsApiKey: null,
      openaiApiKey: 'sk_openai_test',
      localWhisperPath: null,
      providers: { elevenlabs: false, openaiWhisper: true, localWhisper: false, webSpeech: false },
    })
    const mockElevenlabs = vi.spyOn(engine as any, 'transcribeElevenlabs')
    const mockWhisper = vi.spyOn(engine as any, 'transcribeOpenaiWhisper').mockResolvedValue('test')

    const audio = new Float32Array(16000)
    await engine.transcribe(audio, 16000)

    expect(mockElevenlabs).not.toHaveBeenCalled()
    expect(mockWhisper).toHaveBeenCalled()
  })
})
