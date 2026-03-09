import { describe, it, expect, vi, beforeEach } from 'vitest'
import crypto from 'node:crypto'

// ── FS mock ──────────────────────────────────────────────────────
const mockExistsSync = vi.fn()
const mockReadFileSync = vi.fn()
const mockWriteFileSync = vi.fn()
const mockMkdirSync = vi.fn()

vi.mock('node:fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
  writeFileSync: (...args: unknown[]) => mockWriteFileSync(...args),
  mkdirSync: (...args: unknown[]) => mockMkdirSync(...args)
}))

import {
  base64UrlEncode,
  derivePublicKeyRaw,
  fingerprintPublicKey,
  loadOrCreateDeviceIdentity,
  signDevicePayload,
  buildDeviceAuthPayload
} from '../device-identity'

describe('device-identity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ── base64UrlEncode ──────────────────────────────────────────

  describe('base64UrlEncode', () => {
    it('encodes buffer to base64url string', () => {
      const buf = Buffer.from([0xff, 0xfe, 0xfd])
      const result = base64UrlEncode(buf)
      expect(result).toBe(buf.toString('base64url'))
    })

    it('encodes empty buffer', () => {
      expect(base64UrlEncode(Buffer.alloc(0))).toBe('')
    })

    it('does not use + or / characters', () => {
      // Create a buffer that would produce + and / in standard base64
      const buf = Buffer.from([0xfb, 0xef, 0xbe])
      const result = base64UrlEncode(buf)
      expect(result).not.toContain('+')
      expect(result).not.toContain('/')
    })
  })

  // ── derivePublicKeyRaw ───────────────────────────────────────

  describe('derivePublicKeyRaw', () => {
    it('extracts 32-byte raw key from ED25519 public key PEM', () => {
      const { publicKey } = crypto.generateKeyPairSync('ed25519')
      const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
      const raw = derivePublicKeyRaw(pem)
      expect(raw).toBeInstanceOf(Buffer)
      expect(raw.length).toBe(32)
    })

    it('returns same raw key for same PEM', () => {
      const { publicKey } = crypto.generateKeyPairSync('ed25519')
      const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
      const raw1 = derivePublicKeyRaw(pem)
      const raw2 = derivePublicKeyRaw(pem)
      expect(raw1.equals(raw2)).toBe(true)
    })

    it('returns different raw keys for different key pairs', () => {
      const kp1 = crypto.generateKeyPairSync('ed25519')
      const kp2 = crypto.generateKeyPairSync('ed25519')
      const pem1 = kp1.publicKey.export({ type: 'spki', format: 'pem' }).toString()
      const pem2 = kp2.publicKey.export({ type: 'spki', format: 'pem' }).toString()
      const raw1 = derivePublicKeyRaw(pem1)
      const raw2 = derivePublicKeyRaw(pem2)
      expect(raw1.equals(raw2)).toBe(false)
    })
  })

  // ── fingerprintPublicKey ─────────────────────────────────────

  describe('fingerprintPublicKey', () => {
    it('returns hex SHA-256 of raw public key', () => {
      const { publicKey } = crypto.generateKeyPairSync('ed25519')
      const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
      const fp = fingerprintPublicKey(pem)
      expect(fp).toMatch(/^[0-9a-f]{64}$/)
    })

    it('returns same fingerprint for same key', () => {
      const { publicKey } = crypto.generateKeyPairSync('ed25519')
      const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
      expect(fingerprintPublicKey(pem)).toBe(fingerprintPublicKey(pem))
    })

    it('returns different fingerprints for different keys', () => {
      const kp1 = crypto.generateKeyPairSync('ed25519')
      const kp2 = crypto.generateKeyPairSync('ed25519')
      const pem1 = kp1.publicKey.export({ type: 'spki', format: 'pem' }).toString()
      const pem2 = kp2.publicKey.export({ type: 'spki', format: 'pem' }).toString()
      expect(fingerprintPublicKey(pem1)).not.toBe(fingerprintPublicKey(pem2))
    })
  })

  // ── signDevicePayload ────────────────────────────────────────

  describe('signDevicePayload', () => {
    it('produces a valid ED25519 signature', () => {
      const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
      const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
      const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()

      const payload = 'test-payload-data'
      const sig = signDevicePayload(privatePem, payload)

      // Verify signature with public key
      const sigBuf = Buffer.from(sig, 'base64url')
      const valid = crypto.verify(null, Buffer.from(payload, 'utf8'), publicPem, sigBuf)
      expect(valid).toBe(true)
    })

    it('returns base64url-encoded string', () => {
      const { privateKey } = crypto.generateKeyPairSync('ed25519')
      const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
      const sig = signDevicePayload(privatePem, 'test')
      expect(sig).not.toContain('+')
      expect(sig).not.toContain('/')
      expect(sig).not.toContain('=')
    })

    it('produces different signatures for different payloads', () => {
      const { privateKey } = crypto.generateKeyPairSync('ed25519')
      const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
      const sig1 = signDevicePayload(privatePem, 'payload-1')
      const sig2 = signDevicePayload(privatePem, 'payload-2')
      expect(sig1).not.toBe(sig2)
    })

    it('produces same signature for same payload and key', () => {
      const { privateKey } = crypto.generateKeyPairSync('ed25519')
      const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()
      const sig1 = signDevicePayload(privatePem, 'same-payload')
      const sig2 = signDevicePayload(privatePem, 'same-payload')
      expect(sig1).toBe(sig2)
    })
  })

  // ── buildDeviceAuthPayload ───────────────────────────────────

  describe('buildDeviceAuthPayload', () => {
    it('builds pipe-delimited payload string', () => {
      const result = buildDeviceAuthPayload({
        deviceId: 'device-123',
        clientId: 'client-1',
        clientMode: 'backend',
        role: 'operator',
        scopes: ['admin', 'write'],
        signedAtMs: 1000000,
        token: 'tok-abc',
        nonce: 'nonce-xyz'
      })
      expect(result).toBe('v2|device-123|client-1|backend|operator|admin,write|1000000|tok-abc|nonce-xyz')
    })

    it('uses empty string for null token', () => {
      const result = buildDeviceAuthPayload({
        deviceId: 'd',
        clientId: 'c',
        clientMode: 'm',
        role: 'r',
        scopes: ['s'],
        signedAtMs: 0,
        token: null,
        nonce: 'n'
      })
      expect(result).toBe('v2|d|c|m|r|s|0||n')
    })

    it('joins scopes with commas', () => {
      const result = buildDeviceAuthPayload({
        deviceId: 'd',
        clientId: 'c',
        clientMode: 'm',
        role: 'r',
        scopes: ['a', 'b', 'c'],
        signedAtMs: 1,
        token: 't',
        nonce: 'n'
      })
      expect(result).toContain('a,b,c')
    })

    it('handles empty scopes array', () => {
      const result = buildDeviceAuthPayload({
        deviceId: 'd',
        clientId: 'c',
        clientMode: 'm',
        role: 'r',
        scopes: [],
        signedAtMs: 1,
        token: 't',
        nonce: 'n'
      })
      expect(result).toBe('v2|d|c|m|r||1|t|n')
    })
  })

  // ── loadOrCreateDeviceIdentity ───────────────────────────────

  describe('loadOrCreateDeviceIdentity', () => {
    it('creates new identity when file does not exist', () => {
      mockExistsSync.mockReturnValue(false)
      const identity = loadOrCreateDeviceIdentity()

      expect(identity.deviceId).toMatch(/^[0-9a-f]{64}$/)
      expect(identity.publicKeyPem).toContain('BEGIN PUBLIC KEY')
      expect(identity.privateKeyPem).toContain('BEGIN PRIVATE KEY')
      expect(mockWriteFileSync).toHaveBeenCalled()
      expect(mockMkdirSync).toHaveBeenCalled()
    })

    it('writes identity file with mode 0o600', () => {
      mockExistsSync.mockReturnValue(false)
      loadOrCreateDeviceIdentity()

      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        { mode: 0o600 }
      )
    })

    it('writes valid JSON to file', () => {
      mockExistsSync.mockReturnValue(false)
      loadOrCreateDeviceIdentity()

      const written = mockWriteFileSync.mock.calls[0][1] as string
      const parsed = JSON.parse(written)
      expect(parsed.version).toBe(1)
      expect(parsed.deviceId).toMatch(/^[0-9a-f]{64}$/)
      expect(parsed.publicKeyPem).toContain('BEGIN PUBLIC KEY')
      expect(parsed.privateKeyPem).toContain('BEGIN PRIVATE KEY')
      expect(typeof parsed.createdAtMs).toBe('number')
    })

    it('loads existing identity from file', () => {
      const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
      const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
      const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()

      mockExistsSync.mockReturnValue(true)
      mockReadFileSync.mockReturnValue(
        JSON.stringify({ version: 1, publicKeyPem, privateKeyPem })
      )

      const identity = loadOrCreateDeviceIdentity()
      expect(identity.publicKeyPem).toBe(publicKeyPem)
      expect(identity.privateKeyPem).toBe(privateKeyPem)
      expect(identity.deviceId).toBe(fingerprintPublicKey(publicKeyPem))
      expect(mockWriteFileSync).not.toHaveBeenCalled()
    })

    it('regenerates when file has wrong version', () => {
      mockExistsSync.mockImplementation((p: string) => p.endsWith('device-identity.json'))
      mockReadFileSync.mockReturnValue(
        JSON.stringify({ version: 99, publicKeyPem: 'x', privateKeyPem: 'y' })
      )

      const identity = loadOrCreateDeviceIdentity()
      expect(identity.deviceId).toMatch(/^[0-9a-f]{64}$/)
      expect(mockWriteFileSync).toHaveBeenCalled()
    })

    it('regenerates when file has invalid JSON', () => {
      mockExistsSync.mockImplementation((p: string) => p.endsWith('device-identity.json'))
      mockReadFileSync.mockReturnValue('not-json{{{')

      const identity = loadOrCreateDeviceIdentity()
      expect(identity.deviceId).toMatch(/^[0-9a-f]{64}$/)
      expect(mockWriteFileSync).toHaveBeenCalled()
    })

    it('regenerates when file is missing publicKeyPem', () => {
      mockExistsSync.mockImplementation((p: string) => p.endsWith('device-identity.json'))
      mockReadFileSync.mockReturnValue(
        JSON.stringify({ version: 1, privateKeyPem: 'y' })
      )

      const identity = loadOrCreateDeviceIdentity()
      expect(identity.deviceId).toMatch(/^[0-9a-f]{64}$/)
      expect(mockWriteFileSync).toHaveBeenCalled()
    })

    it('creates directory if it does not exist', () => {
      mockExistsSync.mockReturnValue(false)
      loadOrCreateDeviceIdentity()

      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('lobster'),
        { recursive: true }
      )
    })

    it('does not recreate directory if it exists', () => {
      // First call (dir check) returns true, second (file check) returns false
      mockExistsSync
        .mockReturnValueOnce(false) // file doesn't exist
        .mockReturnValueOnce(true)  // dir exists

      loadOrCreateDeviceIdentity()
      expect(mockMkdirSync).not.toHaveBeenCalled()
    })

    it('deviceId matches fingerprint of generated public key', () => {
      mockExistsSync.mockReturnValue(false)
      const identity = loadOrCreateDeviceIdentity()
      expect(identity.deviceId).toBe(fingerprintPublicKey(identity.publicKeyPem))
    })
  })

  // ── Integration: sign + verify round-trip ────────────────────

  describe('integration', () => {
    it('generated identity can sign and verify payloads', () => {
      mockExistsSync.mockReturnValue(false)
      const identity = loadOrCreateDeviceIdentity()

      const payload = buildDeviceAuthPayload({
        deviceId: identity.deviceId,
        clientId: 'test',
        clientMode: 'backend',
        role: 'operator',
        scopes: ['admin'],
        signedAtMs: Date.now(),
        token: 'tok',
        nonce: 'n'
      })

      const sig = signDevicePayload(identity.privateKeyPem, payload)
      const sigBuf = Buffer.from(sig, 'base64url')
      const valid = crypto.verify(
        null,
        Buffer.from(payload, 'utf8'),
        identity.publicKeyPem,
        sigBuf
      )
      expect(valid).toBe(true)
    })
  })
})
