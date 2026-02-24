import WebSocket from 'ws'
import { EventEmitter } from 'node:events'

export class OpenClawClient extends EventEmitter {
  private ws: WebSocket | null = null
  private reqId = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = 1000

  constructor(
    private url: string,
    private token: string,
    public readonly sessionKey: string,
  ) {
    super()
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url)

      this.ws.on('open', () => {
        this.reconnectDelay = 1000
        this.sendRaw({
          type: 'req',
          id: this.nextId(),
          method: 'auth',
          params: { token: this.token },
        })
        this.emit('connected')
        resolve()
      })

      this.ws.on('message', (data: Buffer | string) => {
        try {
          const msg = JSON.parse(data.toString())
          this.handleMessage(msg)
        } catch {
          /* ignore malformed */
        }
      })

      this.ws.on('close', () => {
        this.emit('disconnected')
        this.scheduleReconnect()
      })

      this.ws.on('error', (err: Error) => {
        this.emit('error', err)
        if (this.ws?.readyState !== WebSocket.OPEN) reject(err)
      })
    })
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.ws?.close()
    this.ws = null
  }

  sendMessage(text: string): void {
    this.sendRaw({
      type: 'req',
      id: this.nextId(),
      method: 'chat.send',
      params: { text, sessionKey: this.sessionKey },
    })
  }

  private handleMessage(msg: Record<string, unknown>): void {
    if (msg.type === 'event' && msg.event === 'agent') {
      const payload = msg.payload as Record<string, unknown>
      if (payload.streaming) {
        this.emit('stream', payload.text)
      }
      if (payload.done) {
        this.emit('done', payload.text)
      }
    }
    if (msg.type === 'res') {
      this.emit('response', msg)
    }
  }

  private sendRaw(data: unknown): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    }
  }

  private nextId(): number {
    return ++this.reqId
  }

  private scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => {})
    }, this.reconnectDelay)
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000)
  }
}
