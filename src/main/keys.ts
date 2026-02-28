import { safeStorage } from 'electron'
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { KeyInfo } from '../shared/types'

const MANAGED_KEYS = ['ELEVENLABS_API_KEY', 'GATEWAY_TOKEN', 'OPENAI_API_KEY'] as const

interface StoredKey {
  encrypted: string // base64 encoded encrypted buffer
  source: KeyInfo['source']
}

export class KeyManager {
  private storePath: string
  private cache: Map<string, { value: string; source: KeyInfo['source'] }> = new Map()

  constructor(storePath?: string) {
    if (storePath === ':memory:') {
      this.storePath = ':memory:'
    } else {
      const dir = storePath ?? join(homedir(), '.config', 'budgie')
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
        if (!safeStorage.isEncryptionAvailable()) continue
        const decrypted = safeStorage.decryptString(Buffer.from(stored.encrypted, 'base64'))
        this.cache.set(name, { value: decrypted, source: stored.source })
      }
    } catch {
      /* ignore corrupt file */
    }
  }

  private save(): void {
    if (this.storePath === ':memory:') return
    if (!safeStorage.isEncryptionAvailable()) return
    const data: Record<string, StoredKey> = {}
    for (const [name, entry] of this.cache) {
      const encrypted = safeStorage.encryptString(entry.value).toString('base64')
      data[name] = { encrypted, source: entry.source }
    }
    writeFileSync(this.storePath, JSON.stringify(data, null, 2))
  }
}
