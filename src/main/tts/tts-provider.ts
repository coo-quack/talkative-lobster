export type TtsAudioFormat =
  | { type: 'encoded' }
  | { type: 'pcm'; sampleRate: number; channels: number; bitDepth: number }

export interface ITtsProvider {
  readonly audioFormat: TtsAudioFormat
  stream(text: string): AsyncGenerator<Buffer>
  stop(): void
  reset(): void
  readonly isStopped: boolean
}
