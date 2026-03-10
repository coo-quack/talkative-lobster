import WebSocket from 'ws'
import { EventEmitter } from 'node:events'
import crypto from 'node:crypto'
import {
  type DeviceIdentity,
  base64UrlEncode,
  derivePublicKeyRaw,
  loadOrCreateDeviceIdentity,
  signDevicePayload,
  buildDeviceAuthPayload
} from './device-identity'
import type { IGatewayClient } from './gateway-client'

const PROTOCOL_VERSION = 3

export class OpenClawClient extends EventEmitter implements IGatewayClient {
  private ws: WebSocket | null = null
  private pending = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (err: Error) => void }
  >()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private reconnectDelay = 1000
  private connectSent = false
  private identity: DeviceIdentity
  private activeRunIds = new Set<string>()
  private lastAgentText = new Map<string, string>()

  constructor(
    private url: string,
    private token: string,
    public readonly sessionKey: string
  ) {
    super()
    this.identity = loadOrCreateDeviceIdentity()
    console.log(`[openclaw] Device ID: ${this.identity.deviceId.slice(0, 16)}...`)
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.connectSent = false
      this.ignoredRunIds.clear()
      this.activeRunIds.clear()
      this.ws = new WebSocket(this.url)

      this.ws.on('open', () => {
        this.reconnectDelay = 1000
        console.log('[openclaw] WebSocket opened, waiting for challenge...')
      })

      this.ws.on('message', (data: Buffer | string) => {
        try {
          const msg = JSON.parse(data.toString())
          this.handleMessage(msg, resolve)
        } catch {
          /* ignore malformed */
        }
      })

      this.ws.on('close', (code: number, reason: Buffer) => {
        console.log(`[openclaw] WebSocket closed: ${code} ${reason.toString()}`)
        this.rejectAllPending()
        this.emit('disconnected')
        this.scheduleReconnect()
      })

      this.ws.on('error', (err: Error) => {
        console.error('[openclaw] WebSocket error:', err.message)
        this.emit('error', err)
        if (!this.connectSent) reject(err)
      })
    })
  }

  disconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.rejectAllPending()
    this.ws?.close()
    this.ws = null
  }

  private ignoredRunIds = new Set<string>()
  private pendingMessageId: string | null = null

  cancelActiveRuns(): void {
    // Mark current pending message so its runId will be ignored when it arrives
    if (this.pendingMessageId) {
      this.ignoredRunIds.add(this.pendingMessageId)
      this.pendingMessageId = null
    }
    for (const id of this.activeRunIds) {
      this.ignoredRunIds.add(id)
    }
    this.activeRunIds.clear()
  }

  sendMessage(text: string): void {
    const idempotencyKey = crypto.randomUUID()
    // Track the idempotency key so cancelActiveRuns can ignore late responses
    this.pendingMessageId = idempotencyKey
    console.log(`[openclaw] Sending chat.send: "${text.slice(0, 80)}"`)
    this.request(
      'chat.send',
      {
        sessionKey: this.sessionKey,
        message: text,
        idempotencyKey
      },
      30_000,
      // Synchronous callback — runs inside handleMessage before the next
      // WebSocket frame is processed.  This prevents a race where chat
      // events arriving in the same TCP segment are dropped because the
      // runId hasn't been added to activeRunIds yet.
      (payload) => {
        const res = payload as { runId?: string }
        if (res?.runId) {
          if (this.ignoredRunIds.has(idempotencyKey)) {
            this.ignoredRunIds.delete(idempotencyKey)
            this.ignoredRunIds.add(res.runId)
          } else {
            this.activeRunIds.add(res.runId)
          }
          if (this.pendingMessageId === idempotencyKey) {
            this.pendingMessageId = null
          }
        }
      }
    )
      .then((payload) => {
        console.log('[openclaw] chat.send accepted:', JSON.stringify(payload))
      })
      .catch((err) => {
        console.error('[openclaw] chat.send failed:', err.message)
        if (this.pendingMessageId === idempotencyKey) {
          this.pendingMessageId = null
        }
      })
  }

  private handleMessage(msg: Record<string, unknown>, onConnected?: () => void): void {
    // Event frames
    if (msg.type === 'event') {
      const event = msg.event as string

      if (event === 'connect.challenge') {
        const payload = msg.payload as { nonce?: string }
        const nonce = payload?.nonce
        if (!nonce) {
          console.error('[openclaw] Challenge missing nonce')
          this.ws?.close(1008, 'connect challenge missing nonce')
          return
        }
        console.log('[openclaw] Received challenge, sending connect...')
        this.sendConnect(nonce, onConnected)
        return
      }

      if (event === 'chat') {
        const payload = msg.payload as {
          state?: string
          message?: unknown
          errorMessage?: string
          runId?: string
        }
        // Only process responses to our own chat.send requests
        if (!payload.runId || !this.activeRunIds.has(payload.runId)) {
          // Chat events may arrive before the chat.send response that
          // provides the runId.  If we have a pending request, optimistically
          // accept the event and track the runId.
          if (payload.runId && this.pendingMessageId) {
            this.activeRunIds.add(payload.runId)
            this.pendingMessageId = null
          } else {
            if (payload.state === 'final')
              console.log(`[openclaw] Ignoring external chat (runId: ${payload.runId ?? 'none'})`)
            return
          }
        }
        // Ignore cancelled runs
        if (this.ignoredRunIds.has(payload.runId)) {
          if (payload.state === 'final' || payload.state === 'error') {
            this.ignoredRunIds.delete(payload.runId)
            this.activeRunIds.delete(payload.runId)
            this.lastAgentText.delete(payload.runId)
          }
          return
        }
        if (payload.state === 'delta') {
          const content = this.extractText(payload.message)
          if (content) this.emit('stream', content)
        } else if (payload.state === 'final') {
          this.activeRunIds.delete(payload.runId)
          const content =
            this.extractText(payload.message) ?? this.lastAgentText.get(payload.runId) ?? null
          this.lastAgentText.delete(payload.runId)
          if (content) this.emit('done', content)
        } else if (payload.state === 'error') {
          this.activeRunIds.delete(payload.runId)
          this.lastAgentText.delete(payload.runId)
          console.error('[openclaw] Chat error:', payload.errorMessage)
          this.emit('chatError', payload.errorMessage ?? 'Unknown LLM error')
        }
        return
      }

      if (event === 'agent') {
        const payload = msg.payload as {
          runId?: string
          stream?: string
          data?: Record<string, unknown>
        }
        // Buffer the latest assistant text from agent events as fallback
        // in case the chat final event arrives without a message body.
        if (
          payload.stream === 'assistant' &&
          payload.runId &&
          typeof payload.data?.text === 'string'
        ) {
          this.lastAgentText.set(payload.runId, payload.data.text)
        }
      }

      if (event === 'tick') return
      return
    }

    // Response frames
    if (msg.type === 'res') {
      const id = msg.id as string
      const pending = this.pending.get(id)
      if (!pending) return
      this.pending.delete(id)
      if (msg.ok) {
        pending.resolve(msg.payload)
      } else {
        const error = msg.error as { message?: string } | undefined
        pending.reject(new Error(error?.message ?? 'unknown error'))
      }
    }
  }

  private sendConnect(nonce: string, onConnected?: () => void): void {
    if (this.connectSent) return
    this.connectSent = true

    const role = 'operator'
    const scopes = ['operator.admin', 'operator.write', 'operator.read']
    const signedAtMs = Date.now()

    const payload = buildDeviceAuthPayload({
      deviceId: this.identity.deviceId,
      clientId: 'gateway-client',
      clientMode: 'backend',
      role,
      scopes,
      signedAtMs,
      token: this.token,
      nonce
    })
    const signature = signDevicePayload(this.identity.privateKeyPem, payload)
    const publicKeyRaw = base64UrlEncode(derivePublicKeyRaw(this.identity.publicKeyPem))

    const params = {
      minProtocol: PROTOCOL_VERSION,
      maxProtocol: PROTOCOL_VERSION,
      client: {
        id: 'gateway-client',
        displayName: 'Lobster',
        version: '1.0.0',
        platform: process.platform,
        mode: 'backend'
      },
      caps: [],
      auth: {
        token: this.token
      },
      role,
      scopes,
      device: {
        id: this.identity.deviceId,
        publicKey: publicKeyRaw,
        signature,
        signedAt: signedAtMs,
        nonce
      }
    }

    this.request('connect', params)
      .then(() => {
        console.log('[openclaw] Connected and authenticated with device identity')
        this.emit('connected')
        onConnected?.()
      })
      .catch((err) => {
        console.error('[openclaw] Connect failed:', (err as Error).message)
        this.ws?.close(1008, 'connect failed')
      })
  }

  private rejectAllPending(): void {
    for (const [, { reject }] of this.pending) {
      reject(new Error('disconnected'))
    }
    this.pending.clear()
  }

  private request(
    method: string,
    params: unknown,
    timeoutMs = 30_000,
    onResolveSync?: (payload: unknown) => void
  ): Promise<unknown> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('gateway not connected'))
    }

    const id = crypto.randomUUID()
    const frame = { type: 'req', id, method, params }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`Request '${method}' timed out after ${timeoutMs}ms`))
      }, timeoutMs)

      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer)
          onResolveSync?.(value)
          resolve(value)
        },
        reject: (err) => {
          clearTimeout(timer)
          reject(err)
        }
      })
      this.ws?.send(JSON.stringify(frame))
    })
  }

  private extractText(message: unknown): string | null {
    if (!message || typeof message !== 'object') return null
    const msg = message as Record<string, unknown>
    if (typeof msg.text === 'string') return msg.text
    if (Array.isArray(msg.content)) {
      const textParts = msg.content
        .filter(
          (c: unknown) =>
            typeof c === 'object' && c !== null && (c as Record<string, unknown>).type === 'text'
        )
        .map((c: unknown) => (c as Record<string, unknown>).text as string)
      return textParts.join('') || null
    }
    if (typeof msg.content === 'string') return msg.content
    return null
  }

  private scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => {})
    }, this.reconnectDelay)
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000)
  }
}
