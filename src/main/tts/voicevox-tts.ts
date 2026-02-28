import type { ITtsProvider } from './tts-provider'

const DEFAULT_URL = 'http://localhost:50021'
const CHUNK_SIZE = 8 * 1024

export class VoicevoxTts implements ITtsProvider {
  private url: string
  private speakerId: number
  private stopped = false

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
      { method: 'POST' },
    )
    if (!queryRes.ok) throw new Error(`VOICEVOX audio_query failed: ${queryRes.status}`)
    const query = await queryRes.json()

    const synthRes = await fetch(
      `${this.url}/synthesis?speaker=${this.speakerId}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(query),
      },
    )
    if (!synthRes.ok) throw new Error(`VOICEVOX synthesis failed: ${synthRes.status}`)

    const body = synthRes.body
    if (!body) {
      const buf = Buffer.from(await synthRes.arrayBuffer())
      yield buf
      return
    }

    const reader = body.getReader()
    const chunks: Buffer[] = []
    while (true) {
      if (this.stopped) return
      const { done, value } = await reader.read()
      if (done) break
      chunks.push(Buffer.from(value))
    }
    if (this.stopped) return
    const full = Buffer.concat(chunks)
    for (let i = 0; i < full.length; i += CHUNK_SIZE) {
      yield full.subarray(i, Math.min(i + CHUNK_SIZE, full.length))
    }
  }

  setUrl(url: string): void {
    this.url = url
  }

  stop(): void {
    this.stopped = true
  }
}
