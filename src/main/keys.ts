import { app } from 'electron'
import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { createCipheriv, createDecipheriv, createHash } from 'node:crypto'
import type { KeyInfo } from '../shared/types'

const MANAGED_KEYS = ['ELEVENLABS_API_KEY', 'GATEWAY_TOKEN', 'OPENAI_API_KEY'] as const

const ALGO = 'aes-256-cbc'
const IV_LEN = 16

/** Derive a stable 32-byte key from machine-specific values. */
function deriveKey(): Buffer {
  const seed = [
    process.platform,
    homedir(),
    'lobster-keystore-v1'
  ].join(':')
  return createHash('sha256').update(seed).digest()
}

function encrypt(plaintext: string): string {
  const key = deriveKey()
  const iv = Buffer.alloc(IV_LEN, 0)
  // Use a deterministic IV derived from the key for simplicity
  createHash('md5').update(key).digest().copy(iv)
  const cipher = createCipheriv(ALGO, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return encrypted.toString('base64')
}

function decrypt(encoded: string): string {
  const key = deriveKey()
  const iv = Buffer.alloc(IV_LEN, 0)
  createHash('md5').update(key).digest().copy(iv)
  const decipher = createDecipheriv(ALGO, key, iv)
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encoded, 'base64')), decipher.final()])
  return decrypted.toString('utf8')
}

interface StoredKey {
  encrypted: string // base64 encoded
  source: KeyInfo['source']
}

export class KeyManager {
  private storePath: string
  private cache: Map<string, { value: string; source: KeyInfo['source'] }> = new Map()

  constructor(storePath?: string) {
    if (storePath === ':memory:') {
      this.storePath = ':memory:'
    } else if (storePath) {
      if (!existsSync(storePath)) mkdirSync(storePath, { recursive: true })
      this.storePath = join(storePath, 'keys.json')
      this.load()
    } else {
      // Use Electron userData path (~/Library/Application Support/Lobster/)
      const dir = app.getPath('userData')
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
      this.storePath = join(dir, 'keys.json')
      this.load()
    }
  }

  getAll(): KeyInfo[] {
    return MANAGED_KEYS.map((name) => {
      const entry = this.cache.get(name)
      return { name, isSet: !!entry, source: entry?.source ?? null }
    })
  }

  get(name: string): string | null {
    return this.cache.get(name)?.value ?? null
  }

  set(name: string, value: string, source: KeyInfo['source']): void {
    this.cache.set(name, { value, source })
    this.save()
  }

  readFromEnv(name: string): string | null {
    return process.env[name] ?? null
  }

  readFromOpenclaw(name: string): string | null {
    const configPath = join(homedir(), '.openclaw', 'openclaw.json')
    if (!existsSync(configPath)) return null
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'))
      if (name === 'GATEWAY_TOKEN') return config?.gateway?.auth?.token ?? null
      return config?.env?.[name] ?? null
    } catch {
      return null
    }
  }

  private load(): void {
    if (this.storePath === ':memory:' || !existsSync(this.storePath)) return
    try {
      const data: Record<string, StoredKey> = JSON.parse(readFileSync(this.storePath, 'utf-8'))
      for (const [name, stored] of Object.entries(data)) {
        const decrypted = decrypt(stored.encrypted)
        this.cache.set(name, { value: decrypted, source: stored.source })
      }
    } catch {
      /* ignore corrupt file */
    }
  }

  private save(): void {
    if (this.storePath === ':memory:') return
    const data: Record<string, StoredKey> = {}
    for (const [name, entry] of this.cache) {
      data[name] = { encrypted: encrypt(entry.value), source: entry.source }
    }
    writeFile(this.storePath, JSON.stringify(data, null, 2)).catch((err) => {
      console.error('[keys] Failed to save:', err)
    })
  }
}
