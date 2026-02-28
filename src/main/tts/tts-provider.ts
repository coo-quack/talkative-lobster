export interface ITtsProvider {
  stream(text: string): AsyncGenerator<Buffer>
  stop(): void
  readonly isStopped: boolean
}
