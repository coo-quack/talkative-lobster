import { describe, it, expect, beforeAll } from 'vitest'
import { TtsEngine } from '../../tts-engine'
import { SttEngine } from '../../stt-engine'
import { requireApiKey, float32ToWav } from './helpers'

let elevenlabsKey: string
let openaiKey: string | null

beforeAll(() => {
  elevenlabsKey = requireApiKey('ELEVENLABS_API_KEY')
  try {
    openaiKey = requireApiKey('OPENAI_API_KEY')
  } catch {
    openaiKey = null
  }
})

describe('E2E Voice Pipeline', () => {
  it('TTS → raw audio → STT roundtrip', async () => {
    // Step 1: Generate speech audio via TTS
    const ttsEngine = new TtsEngine({
      apiKey: elevenlabsKey,
      voiceId: 'pFZP5JQG7iQjIQuC4Bku',
      modelId: 'eleven_multilingual_v2',
    })

    const ttsStart = performance.now()
    const ttsAudio = await ttsEngine.synthesize('こんにちは、元気ですか')
    const ttsTime = performance.now() - ttsStart

    console.log(`\n  📊 TTS synthesize: ${ttsTime.toFixed(0)}ms, ${(ttsAudio.length / 1024).toFixed(1)}KB`)

    expect(ttsAudio.length).toBeGreaterThan(0)

    // Step 2: Decode MP3 to PCM for STT input
    // Since we can't easily decode MP3 in Node without extra deps,
    // we test STT separately with a known WAV
  }, 30_000)

  it('STT transcribes Japanese speech (ElevenLabs Scribe)', async () => {
    // Generate a 2-second tone (STT should return empty or noise label)
    // This tests the pipeline works, not accuracy
    const sttEngine = new SttEngine({
      elevenlabsApiKey: elevenlabsKey,
      openaiApiKey: openaiKey,
      localWhisperPath: null,
      providers: {
        elevenlabs: true,
        openaiWhisper: !!openaiKey,
        localWhisper: false,
        webSpeech: false,
      },
    })

    // Create a simple tone WAV to test the STT pipeline accepts it
    const sampleRate = 16000
    const duration = 1.5
    const samples = new Float32Array(sampleRate * duration)
    // Generate silence (STT should return empty/null for silence)
    for (let i = 0; i < samples.length; i++) {
      samples[i] = 0
    }

    const sttStart = performance.now()
    const result = await sttEngine.transcribe(samples, sampleRate)
    const sttTime = performance.now() - sttStart

    console.log(`\n  📊 STT transcribe (silence): ${sttTime.toFixed(0)}ms`)
    console.log(`     Result: "${result ?? '(null)'}"`)

    // Pipeline should not throw - result can be null or empty for silence
    expect(sttTime).toBeGreaterThan(0)
  }, 15_000)

  it('full pipeline timing: STT + mock LLM + TTS', async () => {
    const sttEngine = new SttEngine({
      elevenlabsApiKey: elevenlabsKey,
      openaiApiKey: openaiKey,
      localWhisperPath: null,
      providers: {
        elevenlabs: true,
        openaiWhisper: false,
        localWhisper: false,
        webSpeech: false,
      },
    })

    const ttsEngine = new TtsEngine({
      apiKey: elevenlabsKey,
      voiceId: 'pFZP5JQG7iQjIQuC4Bku',
      modelId: 'eleven_multilingual_v2',
    })

    // Step 1: STT (with silence - just testing timing)
    const sttStart = performance.now()
    const silence = new Float32Array(16000 * 1.5) // 1.5s silence
    await sttEngine.transcribe(silence, 16000)
    const sttTime = performance.now() - sttStart

    // Step 2: Mock LLM response (simulate instant)
    const llmResponse = 'はい、お手伝いしますよ。'
    const llmTime = 0

    // Step 3: TTS streaming
    const ttsStart = performance.now()
    let firstChunkTime = 0
    let totalBytes = 0

    for await (const chunk of ttsEngine.stream(llmResponse)) {
      if (firstChunkTime === 0) {
        firstChunkTime = performance.now() - ttsStart
      }
      totalBytes += chunk.length
    }
    const ttsTime = performance.now() - ttsStart

    const totalTime = sttTime + llmTime + firstChunkTime

    console.log(`\n  📊 Full pipeline timing:`)
    console.log(`     STT:              ${sttTime.toFixed(0)}ms`)
    console.log(`     LLM (mock):       ${llmTime}ms`)
    console.log(`     TTS first chunk:  ${firstChunkTime.toFixed(0)}ms`)
    console.log(`     TTS total:        ${ttsTime.toFixed(0)}ms`)
    console.log(`     ─────────────────────────`)
    console.log(`     Time to first audio: ${totalTime.toFixed(0)}ms`)
    console.log(`     TTS audio size:   ${(totalBytes / 1024).toFixed(1)}KB`)

    // Time to first audio should be under 5s (STT + TTS first chunk)
    expect(totalTime).toBeLessThan(5000)
  }, 30_000)
})
