export interface GatewayClientEvents {
  connected: []
  disconnected: []
  error: [err: Error]
  stream: [text: string]
  done: [text: string]
  chatError: [message: string]
}

export interface IGatewayClient {
  connect(): Promise<void>
  disconnect(): void
  sendMessage(text: string): void
  cancelActiveRuns(): void
  on<K extends keyof GatewayClientEvents>(
    event: K,
    listener: (...args: GatewayClientEvents[K]) => void
  ): this
}
