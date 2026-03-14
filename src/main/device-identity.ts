import crypto from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export interface DeviceIdentity {
  deviceId: string
  publicKeyPem: string
  privateKeyPem: string
}

export function base64UrlEncode(buf: Buffer): string {
  return buf.toString('base64url')
}

export function derivePublicKeyRaw(publicKeyPem: string): Buffer {
  const key = crypto.createPublicKey(publicKeyPem)
  const spki = key.export({ type: 'spki', format: 'der' })
  // ED25519 SPKI is 44 bytes: 12 byte header + 32 byte raw key
  return Buffer.from(spki).subarray(-32)
}

export function fingerprintPublicKey(publicKeyPem: string): string {
  const raw = derivePublicKeyRaw(publicKeyPem)
  return crypto.createHash('sha256').update(raw).digest('hex')
}

export function loadOrCreateDeviceIdentity(): DeviceIdentity {
  const dir = join(homedir(), '.config', 'lobster')
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
    `${JSON.stringify({ version: 1, deviceId, publicKeyPem, privateKeyPem, createdAtMs: Date.now() }, null, 2)}\n`,
    { mode: 0o600 }
  )

  return { deviceId, publicKeyPem, privateKeyPem }
}

export function signDevicePayload(privateKeyPem: string, payload: string): string {
  const key = crypto.createPrivateKey(privateKeyPem)
  return base64UrlEncode(crypto.sign(null, Buffer.from(payload, 'utf8'), key))
}

export function buildDeviceAuthPayload(params: {
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
    params.nonce
  ].join('|')
}
