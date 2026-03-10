import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js'
import type { ITtsProvider, TtsAudioFormat } from './tts-provider'

const PCM_SAMPLE_RATE = 24000

interface ElevenLabsTtsConfig {
  apiKey: string
  voiceId: string
  modelId?: string
}

export class ElevenLabsTts implements ITtsProvider {
  private client: ElevenLabsClient
  private voiceId: string
  private modelId: string
  private stopped = false

  readonly audioFormat: TtsAudioFormat = {
    type: 'pcm',
    sampleRate: PCM_SAMPLE_RATE,
    channels: 1,
    bitDepth: 16
  }

  get isStopped(): boolean {
    return this.stopped
  }

  constructor(config: ElevenLabsTtsConfig) {
    this.client = new ElevenLabsClient({ apiKey: config.apiKey })
    this.voiceId = config.voiceId
    this.modelId = config.modelId ?? 'eleven_flash_v2_5'
  }

  async *stream(text: string): AsyncGenerator<Buffer> {
    this.stopped = false
    const audioStream = await this.client.textToSpeech.stream(this.voiceId, {
      text,
      modelId: this.modelId,
      outputFormat: `pcm_${PCM_SAMPLE_RATE}`
    })
    for await (const chunk of audioStream) {
      if (this.stopped) return
      yield Buffer.from(chunk)
    }
  }

  setVoiceId(voiceId: string): void {
    this.voiceId = voiceId
  }

  setModelId(modelId: string): void {
    this.modelId = modelId
  }

  stop(): void {
    this.stopped = true
  }
}
