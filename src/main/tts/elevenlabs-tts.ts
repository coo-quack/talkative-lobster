import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js'
import type { ITtsProvider } from './tts-provider'

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
      optimizeStreamingLatency: 2,
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
