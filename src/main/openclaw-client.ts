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

/** Content block types that should be skipped during text extraction */
const SKIP_CONTENT_TYPES = new Set(['tool_use', 'tool_result', 'image', 'image_url'])

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
          if (content) {
            this.emit('done', content)
          } else {
            // Empty final — may happen after interruption or when the gateway
            // sends a completion signal without a message body. Emit 'done'
            // with empty string so the orchestrator can transition out of
            // thinking state instead of getting stuck.
            try {
              console.warn(
                '[openclaw] Final message had no extractable text:',
                JSON.stringify(payload.message)?.slice(0, 500)
              )
            } catch {
              console.warn('[openclaw] Final message had no extractable text (unserializable)')
            }
            this.emit('done', '')
          }
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
        if (payload.stream === 'assistant' && payload.runId) {
          const text = this.extractText(payload.data ?? null)
          if (text) this.lastAgentText.set(payload.runId, text)
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

  /**
   * Recursively extract text from an LLM response regardless of provider.
   *
   * Instead of branching on provider name, we inspect the actual data
   * structure and collect text from wherever it lives:
   *
   *   - string value at `.text` or `.content`
   *   - array at `.content`, `.parts`, `.choices`, or `.candidates`
   *     → recurse into each element
   *   - object at `.message`, `.delta`, or `.content`
   *     → recurse into it
   *
   * A depth limit prevents runaway recursion on unexpected payloads.
   */
  private extractText(message: unknown): string | null {
    const result = this.collectText(message, 6)
    return result || null
  }

  private collectText(node: unknown, depth: number): string {
    if (depth <= 0 || node == null) return ''

    // Leaf: plain string — return as-is
    if (typeof node === 'string') return node

    if (typeof node !== 'object') return ''

    // Array: collect text from each element
    if (Array.isArray(node)) {
      return node.map((el) => this.collectText(el, depth - 1)).join('')
    }

    const obj = node as Record<string, unknown>

    // Skip known non-text content blocks (tool_use, tool_result, etc.)
    // but allow other typed objects (e.g. type: "message") to continue
    // recursive traversal into their content/parts/etc.
    if (typeof obj.type === 'string') {
      if (obj.type === 'text' && typeof obj.text === 'string') return obj.text
      if (SKIP_CONTENT_TYPES.has(obj.type)) return ''
    }

    // Object with a `text` string field — this is the most common leaf
    if (typeof obj.text === 'string') return obj.text

    // Object with `content` — may be string, array of blocks, or nested object
    if (obj.content !== undefined) {
      const inner = this.collectText(obj.content, depth - 1)
      if (inner) return inner
    }

    // Object with `parts` array (list of content parts)
    if (Array.isArray(obj.parts)) {
      const inner = this.collectText(obj.parts, depth - 1)
      if (inner) return inner
    }

    // Object wrapping items in `choices` or `candidates` arrays
    if (Array.isArray(obj.choices)) {
      const inner = this.collectText(obj.choices, depth - 1)
      if (inner) return inner
    }
    if (Array.isArray(obj.candidates)) {
      const inner = this.collectText(obj.candidates, depth - 1)
      if (inner) return inner
    }

    // Object with `message` or `delta` sub-object
    if (obj.message && typeof obj.message === 'object') {
      const inner = this.collectText(obj.message, depth - 1)
      if (inner) return inner
    }
    if (obj.delta && typeof obj.delta === 'object') {
      const inner = this.collectText(obj.delta, depth - 1)
      if (inner) return inner
    }

    return ''
  }

  private scheduleReconnect(): void {
    this.reconnectTimer = setTimeout(() => {
      this.connect().catch(() => {})
    }, this.reconnectDelay)
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000)
  }
}
