import { describe, it, expect, vi, beforeEach } from 'vitest'
import { KeyManager } from '../keys'

// Mock electron safeStorage
vi.mock('electron', () => ({
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (s: string) => Buffer.from(`enc:${s}`),
    decryptString: (buf: Buffer) => buf.toString().replace('enc:', ''),
  },
}))

// Mock fs for OpenClaw config reading
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
}))

describe('KeyManager', () => {
  let km: KeyManager

  beforeEach(() => {
    km = new KeyManager(':memory:')
  })

  it('returns empty state when no keys set', () => {
    const keys = km.getAll()
    expect(keys).toEqual([
      { name: 'ELEVENLABS_API_KEY', isSet: false, source: null },
      { name: 'OPENAI_API_KEY', isSet: false, source: null },
      { name: 'GATEWAY_TOKEN', isSet: false, source: null },
    ])
  })

  it('stores and retrieves a key via safeStorage', () => {
    km.set('ELEVENLABS_API_KEY', 'sk_test123', 'manual')
    const keys = km.getAll()
    const el = keys.find((k) => k.name === 'ELEVENLABS_API_KEY')
    expect(el?.isSet).toBe(true)
    expect(el?.source).toBe('manual')
    expect(km.get('ELEVENLABS_API_KEY')).toBe('sk_test123')
  })

  it('reads key from environment variable', () => {
    process.env.ELEVENLABS_API_KEY = 'sk_from_env'
    const value = km.readFromEnv('ELEVENLABS_API_KEY')
    expect(value).toBe('sk_from_env')
    delete process.env.ELEVENLABS_API_KEY
  })

  it('reads key from OpenClaw config', async () => {
    const fs = await import('node:fs')
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        env: { ELEVENLABS_API_KEY: 'sk_from_openclaw' },
      })
    )
    const value = km.readFromOpenclaw('ELEVENLABS_API_KEY')
    expect(value).toBe('sk_from_openclaw')
  })

  it('reads gateway token from OpenClaw config', async () => {
    const fs = await import('node:fs')
    vi.mocked(fs.existsSync).mockReturnValue(true)
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        gateway: { token: 'gw_token_123' },
      })
    )
    const value = km.readFromOpenclaw('GATEWAY_TOKEN')
    expect(value).toBe('gw_token_123')
  })
})
