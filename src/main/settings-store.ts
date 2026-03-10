import { readFileSync, existsSync, mkdirSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir } from 'node:os'
import {
  DEFAULT_STT_PROVIDER,
  DEFAULT_TTS_PROVIDER,
  DEFAULT_TTS_VOICE_ID,
  DEFAULT_TTS_MODEL_ID,
  DEFAULT_KOKORO_VOICE,
  type SttProvider,
  type TtsProviderType
} from '../shared/types'

export interface Settings {
  sttProvider: SttProvider
  localWhisperPath: string
  ttsProvider: TtsProviderType
  ttsVoiceId: string
  ttsModelId: string
  voicevoxUrl: string
  voicevoxSpeakerId: number
  kokoroUrl: string
  kokoroVoice: string
  piperPath: string
  piperModelPath: string
  vadSensitivity: 'auto' | number
  gatewayUrl: string
}

const DEFAULTS: Settings = {
  sttProvider: DEFAULT_STT_PROVIDER,
  localWhisperPath: '',
  ttsProvider: DEFAULT_TTS_PROVIDER,
  ttsVoiceId: DEFAULT_TTS_VOICE_ID,
  ttsModelId: DEFAULT_TTS_MODEL_ID,
  voicevoxUrl: 'http://localhost:50021',
  voicevoxSpeakerId: 1,
  kokoroUrl: 'http://localhost:8880',
  kokoroVoice: DEFAULT_KOKORO_VOICE,
  piperPath: '',
  piperModelPath: '',
  vadSensitivity: 'auto' as const,
  gatewayUrl: 'ws://127.0.0.1:18789'
}

export class SettingsStore {
  private filePath: string | null
  private data: Settings
  private saveTimer: ReturnType<typeof setTimeout> | null = null

  constructor(dirPath?: string) {
    if (dirPath === ':memory:') {
      this.filePath = null
      this.data = { ...DEFAULTS }
      return
    }
    const dir = dirPath ?? join(homedir(), '.config', 'lobster')
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    this.filePath = join(dir, 'settings.json')
    this.data = { ...DEFAULTS }
    this.load()
  }

  get<K extends keyof Settings>(key: K): Settings[K] {
    return this.data[key]
  }

  set<K extends keyof Settings>(key: K, value: Settings[K]): void {
    this.data[key] = value
    this.scheduleSave()
  }

  getAll(): Settings {
    return { ...this.data }
  }

  private load(): void {
    if (!this.filePath || !existsSync(this.filePath)) return
    try {
      const raw = JSON.parse(readFileSync(this.filePath, 'utf-8'))
      for (const key of Object.keys(DEFAULTS) as (keyof Settings)[]) {
        if (!(key in raw)) continue
        // vadSensitivity accepts both 'auto' (string) and a number
        if (key === 'vadSensitivity') {
          if (raw[key] === 'auto' || typeof raw[key] === 'number') {
            Object.assign(this.data, { [key]: raw[key] })
          }
          continue
        }
        if (typeof raw[key] === typeof DEFAULTS[key]) {
          Object.assign(this.data, { [key]: raw[key] })
        }
      }
    } catch {
      /* ignore corrupt file */
    }
  }

  private scheduleSave(): void {
    if (!this.filePath) return
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      this.save()
    }, 100)
  }

  private save(): void {
    if (!this.filePath) return
    writeFile(this.filePath, JSON.stringify(this.data, null, 2)).catch((err) => {
      console.error('[settings] Failed to save:', err)
    })
  }
}
