import type { ITtsProvider, TtsAudioFormat } from './tts-provider'

const DEFAULT_URL = 'http://localhost:8880'
const DEFAULT_VOICE = 'jf_alpha'
export class KokoroTts implements ITtsProvider {
  private url: string
  private voice: string
  private stopped = false

  readonly audioFormat: TtsAudioFormat = { type: 'encoded' }

  get isStopped(): boolean {
    return this.stopped
  }

  constructor(url?: string, voice?: string) {
    this.url = url ?? DEFAULT_URL
    this.voice = voice ?? DEFAULT_VOICE
  }

  async *stream(text: string): AsyncGenerator<Buffer> {
    this.stopped = false

    const res = await fetch(`${this.url}/v1/audio/speech`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'kokoro',
        input: text,
        voice: this.voice,
        response_format: 'mp3'
      })
    })
    if (!res.ok) throw new Error(`Kokoro TTS failed: ${res.status}`)

    const buf = Buffer.from(await res.arrayBuffer())
    if (!this.stopped) {
      yield buf
    }
  }

  setUrl(url: string): void {
    this.url = url
  }

  setVoice(voice: string): void {
    this.voice = voice
  }

  stop(): void {
    this.stopped = true
  }
}
