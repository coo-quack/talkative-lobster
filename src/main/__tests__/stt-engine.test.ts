import { describe, it, expect, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from './msw/server'
import { SttEngine } from '../stt-engine'

describe('SttEngine', () => {
  let engine: SttEngine

  beforeEach(() => {
    engine = new SttEngine({
      elevenlabsApiKey: 'sk_test',
      openaiApiKey: 'sk_openai_test',
      localWhisperPath: null,
      providers: { elevenlabs: true, openaiWhisper: true, localWhisper: false }
    })
  })

  it('creates with providers config', () => {
    expect(engine).toBeDefined()
  })

  it('transcribes via ElevenLabs STT (MSW mock)', async () => {
    engine = new SttEngine({
      elevenlabsApiKey: 'sk_test',
      openaiApiKey: null,
      localWhisperPath: null,
      providers: { elevenlabs: true, openaiWhisper: false, localWhisper: false }
    })

    const audio = new Float32Array(16000)
    const result = await engine.transcribe(audio, 16000)

    expect(result).toBe('こんにちは')
  })

  it('transcribes via OpenAI Whisper (MSW mock)', async () => {
    engine = new SttEngine({
      elevenlabsApiKey: null,
      openaiApiKey: 'sk_openai_test',
      localWhisperPath: null,
      providers: { elevenlabs: false, openaiWhisper: true, localWhisper: false }
    })

    const audio = new Float32Array(16000)
    const result = await engine.transcribe(audio, 16000)

    expect(result).toBe('hello world')
  })

  it('falls back to OpenAI Whisper when ElevenLabs fails', async () => {
    server.use(
      http.post('https://api.elevenlabs.io/v1/speech-to-text', () =>
        HttpResponse.json({ error: 'Server Error' }, { status: 500 })
      )
    )

    const audio = new Float32Array(16000)
    const result = await engine.transcribe(audio, 16000)

    expect(result).toBe('hello world')
  })

  it('returns null when all providers fail', async () => {
    server.use(
      http.post('https://api.elevenlabs.io/v1/speech-to-text', () =>
        HttpResponse.json({ error: 'fail' }, { status: 500 })
      ),
      http.post('https://api.openai.com/v1/audio/transcriptions', () =>
        HttpResponse.json({ error: 'fail' }, { status: 500 })
      )
    )

    const audio = new Float32Array(16000)
    const result = await engine.transcribe(audio, 16000)

    expect(result).toBeNull()
  })

  it('skips disabled providers', async () => {
    engine = new SttEngine({
      elevenlabsApiKey: null,
      openaiApiKey: 'sk_openai_test',
      localWhisperPath: null,
      providers: { elevenlabs: false, openaiWhisper: true, localWhisper: false }
    })

    // Override ElevenLabs to track if it's called
    let elevenlabsCalled = false
    server.use(
      http.post('https://api.elevenlabs.io/v1/speech-to-text', () => {
        elevenlabsCalled = true
        return HttpResponse.json({ text: 'should not be called' })
      })
    )

    const audio = new Float32Array(16000)
    const result = await engine.transcribe(audio, 16000)

    expect(elevenlabsCalled).toBe(false)
    expect(result).toBe('hello world')
  })
})
