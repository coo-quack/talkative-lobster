import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js'
import { execFileSync } from 'node:child_process'
import type { SttProviderConfig } from '../shared/types'

const TIMEOUT_MS = 5_000

export interface SttEngineConfig {
  elevenlabsApiKey: string | null
  openaiApiKey: string | null
  localWhisperPath: string | null
  providers: SttProviderConfig
}

export class SttEngine {
  private config: SttEngineConfig

  constructor(config: SttEngineConfig) {
    this.config = config
  }

  async transcribe(audio: Float32Array, sampleRate: number): Promise<string | null> {
    const wav = this.float32ToWav(audio, sampleRate)

    const chain: Array<{ name: string; enabled: boolean; fn: (wav: Buffer) => Promise<string> }> = [
      {
        name: 'elevenlabs',
        enabled: this.config.providers.elevenlabs,
        fn: (w) => this.transcribeElevenlabs(w),
      },
      {
        name: 'openaiWhisper',
        enabled: this.config.providers.openaiWhisper,
        fn: (w) => this.transcribeOpenaiWhisper(w),
      },
      {
        name: 'localWhisper',
        enabled: this.config.providers.localWhisper,
        fn: (w) => this.transcribeLocalWhisper(w),
      },
    ]

    for (const provider of chain) {
      if (!provider.enabled) continue
      try {
        const result = await Promise.race([
          provider.fn(wav),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`${provider.name} timeout`)), TIMEOUT_MS),
          ),
        ])
        return result
      } catch {
        // fall through to next provider
      }
    }

    return null
  }

  private async transcribeElevenlabs(wav: Buffer): Promise<string> {
    const client = new ElevenLabsClient({ apiKey: this.config.elevenlabsApiKey! })
    const file = new Blob([new Uint8Array(wav)], { type: 'audio/wav' })
    const result = await client.speechToText.convert({
      file,
      modelId: 'scribe_v2',
    })
    return (result as any).text
  }

  private async transcribeOpenaiWhisper(wav: Buffer): Promise<string> {
    const formData = new FormData()
    formData.append('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'audio.wav')
    formData.append('model', 'whisper-1')

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.config.openaiApiKey}` },
      body: formData,
    })

    if (!res.ok) throw new Error(`OpenAI Whisper HTTP ${res.status}`)
    const json = (await res.json()) as { text: string }
    return json.text
  }

  private async transcribeLocalWhisper(wav: Buffer): Promise<string> {
    if (!this.config.localWhisperPath) throw new Error('localWhisperPath not configured')

    const { writeFileSync, mkdtempSync, rmSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { tmpdir } = await import('node:os')

    const dir = mkdtempSync(join(tmpdir(), 'budgie-stt-'))
    const wavPath = join(dir, 'audio.wav')
    try {
      writeFileSync(wavPath, wav)
      const output = execFileSync(this.config.localWhisperPath, [wavPath, '--output-txt'], {
        timeout: TIMEOUT_MS,
        encoding: 'utf-8',
      })
      return output.trim()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  private float32ToWav(samples: Float32Array, sampleRate: number): Buffer {
    const numChannels = 1
    const bitsPerSample = 16
    const byteRate = (sampleRate * numChannels * bitsPerSample) / 8
    const blockAlign = (numChannels * bitsPerSample) / 8
    const dataSize = samples.length * 2
    const buffer = Buffer.alloc(44 + dataSize)

    // RIFF header
    buffer.write('RIFF', 0)
    buffer.writeUInt32LE(36 + dataSize, 4)
    buffer.write('WAVE', 8)

    // fmt chunk
    buffer.write('fmt ', 12)
    buffer.writeUInt32LE(16, 16)
    buffer.writeUInt16LE(1, 20) // PCM
    buffer.writeUInt16LE(numChannels, 22)
    buffer.writeUInt32LE(sampleRate, 24)
    buffer.writeUInt32LE(byteRate, 28)
    buffer.writeUInt16LE(blockAlign, 32)
    buffer.writeUInt16LE(bitsPerSample, 34)

    // data chunk
    buffer.write('data', 36)
    buffer.writeUInt32LE(dataSize, 40)

    for (let i = 0; i < samples.length; i++) {
      const clamped = Math.max(-1, Math.min(1, samples[i]))
      buffer.writeInt16LE(clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, 44 + i * 2)
    }

    return buffer
  }
}
