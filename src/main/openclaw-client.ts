import WebSocket from 'ws'
import { EventEmitter } from 'node:events'
import crypto from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const PROTOCOL_VERSION = 3

interface DeviceIdentity {
  deviceId: string
  publicKeyPem: string
  privateKeyPem: string
}

function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64url')
}

function derivePublicKeyRaw(publicKeyPem: string): Buffer {
  const key = crypto.createPublicKey(publicKeyPem)
  const spki = key.export({ type: 'spki', format: 'der' })
  // ED25519 SPKI is 44 bytes: 12 byte header + 32 byte raw key
  return Buffer.from(spki).subarray(-32)
}

function fingerprintPublicKey(publicKeyPem: string): string {
  const raw = derivePublicKeyRaw(publicKeyPem)
  return crypto.createHash('sha256').update(raw).digest('hex')
}

function loadOrCreateDeviceIdentity(): DeviceIdentity {
  const dir = join(homedir(), '.config', 'budgie')
  const filePath = join(dir, 'device-identity.json')

  if (existsSync(filePath)) {
    try {
      const parsed = JSON.parse(readFileSync(filePath, 'utf8'))
      if (parsed?.version === 1 && parsed.publicKeyPem && parsed.privateKeyPem) {
        const deviceId = fingerprintPublicKey(parsed.publicKeyPem)
        return { deviceId, publicKeyPem: parsed.publicKeyPem, privateKeyPem: parsed.privateKeyPem }
      }
    } catch {
      /* regenerate */
    }
  }

  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
  const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
  const deviceId = fingerprintPublicKey(publicKeyPem)

  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(
    filePath,
    JSON.stringify({ version: 1, deviceId, publicKeyPem, privateKeyPem, createdAtMs: Date.now() }, null, 2) + '\n',
    { mode: 0o600 }
  )

  return { deviceId, publicKeyPem, privateKeyPem }
}

function signDevicePayload(privateKeyPem: string, payload: string): string {
  const key = crypto.createPrivateKey(privateKeyPem)
  return base64UrlEncode(crypto.sign(null, Buffer.from(payload, 'utf8'), key))
}

function buildDeviceAuthPayload(params: {
  deviceId: string
  clientId: string
  clientMode: string
  role: string
  scopes: string[]
  signedAtMs: number
  token: string | null
  nonce: string
}): string {
  return [
    'v2',
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    params.scopes.join(','),
    String(params.signedAtMs),
    params.token ?? '',
    params.nonce,
  ].join('|')
}

export class OpenClawClient extends EventEmitter {
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

  sendMessage(text: string): void {
    const idempotencyKey = crypto.randomUUID()
    console.log(`[openclaw] Sending chat.send: "${text.slice(0, 50)}"`)
    this.request('chat.send', {
      sessionKey: this.sessionKey,
      message: text,
      idempotencyKey,
    })
      .then((payload) => {
        const res = payload as { runId?: string }
        if (res?.runId) this.activeRunIds.add(res.runId)
        console.log('[openclaw] chat.send accepted:', JSON.stringify(payload))
      })
      .catch((err) => {
        console.error('[openclaw] chat.send failed:', err.message)
      })
  }

  private handleMessage(
    msg: Record<string, unknown>,
    onConnected?: (value: void) => void
  ): void {
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
          if (payload.state === 'final') console.log(`[openclaw] Ignoring external chat (runId: ${payload.runId ?? 'none'})`)
          return
        }
        if (payload.state === 'delta') {
          const content = this.extractText(payload.message)
          if (content) this.emit('stream', content)
        } else if (payload.state === 'final') {
          this.activeRunIds.delete(payload.runId)
          const content = this.extractText(payload.message)
          if (content) this.emit('done', content)
        } else if (payload.state === 'error') {
          this.activeRunIds.delete(payload.runId)
          console.error('[openclaw] Chat error:', payload.errorMessage)
          this.emit('chatError', payload.errorMessage ?? 'Unknown LLM error')
        }
        return
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

  private sendConnect(nonce: string, onConnected?: (value: void) => void): void {
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
      nonce,
    })
    const signature = signDevicePayload(this.identity.privateKeyPem, payload)
    const publicKeyRaw = base64UrlEncode(derivePublicKeyRaw(this.identity.publicKeyPem))

    const params = {
      minProtocol: PROTOCOL_VERSION,
      maxProtocol: PROTOCOL_VERSION,
      client: {
        id: 'gateway-client',
        displayName: 'Budgie',
        version: '1.0.0',
        platform: process.platform,
        mode: 'backend',
      },
      caps: [],
      auth: {
        token: this.token,
      },
      role,
      scopes,
      device: {
        id: this.identity.deviceId,
        publicKey: publicKeyRaw,
        signature,
        signedAt: signedAtMs,
        nonce,
      },
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

  private request(method: string, params: unknown): Promise<unknown> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error('gateway not connected'))
    }

    const id = crypto.randomUUID()
    const frame = { type: 'req', id, method, params }

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws!.send(JSON.stringify(frame))
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
            typeof c === 'object' &&
            c !== null &&
            (c as Record<string, unknown>).type === 'text'
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
