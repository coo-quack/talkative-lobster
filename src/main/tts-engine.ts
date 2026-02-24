import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js'

interface TtsConfig {
  apiKey: string
  voiceId: string
  modelId?: string
}

export class TtsEngine {
  private client: ElevenLabsClient
  private voiceId: string
  private modelId: string
  private stopped = false

  get isStopped(): boolean {
    return this.stopped
  }

  constructor(config: TtsConfig) {
    this.client = new ElevenLabsClient({ apiKey: config.apiKey })
    this.voiceId = config.voiceId
    this.modelId = config.modelId ?? 'eleven_multilingual_v2'
  }

  async synthesize(text: string): Promise<Buffer> {
    this.stopped = false
    const audio = await this.client.textToSpeech.convert(this.voiceId, {
      text,
      modelId: this.modelId,
    })
    return Buffer.from(audio as unknown as ArrayBuffer)
  }

  async *stream(text: string): AsyncGenerator<Buffer> {
    this.stopped = false
    const audioStream = await this.client.textToSpeech.stream(this.voiceId, {
      text,
      modelId: this.modelId,
    })
    for await (const chunk of audioStream) {
      if (this.stopped) return
      yield Buffer.from(chunk)
    }
  }

  stop(): void {
    this.stopped = true
  }

  splitIntoSentences(text: string): string[] {
    return text
      .split(/(?<=[.!?。！？])\s*/)
      .map((s) => s.trim())
      .filter(Boolean)
  }
}
