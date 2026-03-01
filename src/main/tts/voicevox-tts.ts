import type { ITtsProvider, TtsAudioFormat } from './tts-provider'

const DEFAULT_URL = 'http://localhost:50021'

export class VoicevoxTts implements ITtsProvider {
  private url: string
  private speakerId: number
  private stopped = false

  readonly audioFormat: TtsAudioFormat = { type: 'encoded' }

  get isStopped(): boolean {
    return this.stopped
  }

  constructor(url?: string, speakerId = 1) {
    this.url = url ?? DEFAULT_URL
    this.speakerId = speakerId
  }

  async *stream(text: string): AsyncGenerator<Buffer> {
    this.stopped = false

    const queryRes = await fetch(
      `${this.url}/audio_query?text=${encodeURIComponent(text)}&speaker=${this.speakerId}`,
      { method: 'POST' }
    )
    if (!queryRes.ok) throw new Error(`VOICEVOX audio_query failed: ${queryRes.status}`)
    const query = await queryRes.json()

    const synthRes = await fetch(`${this.url}/synthesis?speaker=${this.speakerId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(query)
    })
    if (!synthRes.ok) throw new Error(`VOICEVOX synthesis failed: ${synthRes.status}`)

    if (this.stopped) return

    // Yield the complete WAV as a single buffer — decodeAudioData requires
    // a valid audio file with headers, so splitting would cause decode failures.
    const buf = Buffer.from(await synthRes.arrayBuffer())
    if (!this.stopped) yield buf
  }

  setUrl(url: string): void {
    this.url = url
  }

  stop(): void {
    this.stopped = true
  }
}
