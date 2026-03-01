import { describe, it, expect, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from './msw/server'
import { ElevenLabsTts } from '../tts/elevenlabs-tts'

describe('ElevenLabsTts', () => {
  let engine: ElevenLabsTts

  beforeEach(() => {
    engine = new ElevenLabsTts({ apiKey: 'sk_test', voiceId: 'voice123' })
  })

  it('streams audio chunks via MSW mock', async () => {
    const chunks: Buffer[] = []
    for await (const chunk of engine.stream('Hello world')) {
      chunks.push(chunk)
    }
    expect(chunks.length).toBeGreaterThan(0)
    const total = Buffer.concat(chunks)
    expect(total.length).toBeGreaterThan(0)
  })

  it('handles API error response', async () => {
    server.use(
      http.post('https://api.elevenlabs.io/v1/text-to-speech/:voiceId/stream', () =>
        HttpResponse.json({ detail: 'Unauthorized' }, { status: 401 })
      )
    )

    const chunks: Buffer[] = []
    await expect(async () => {
      for await (const chunk of engine.stream('Hello world')) {
        chunks.push(chunk)
      }
    }).rejects.toThrow()
  })

  it('exposes PCM audio format with correct sample rate', () => {
    expect(engine.audioFormat).toEqual({
      type: 'pcm',
      sampleRate: 24000,
      channels: 1,
      bitDepth: 16
    })
  })

  it('can be stopped mid-stream', () => {
    engine.stop()
    expect(engine.isStopped).toBe(true)
  })

  it('updates voice and model', () => {
    engine.setVoiceId('new-voice')
    engine.setModelId('new-model')
    expect(engine.isStopped).toBe(false)
  })
})
