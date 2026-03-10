import { existsSync, accessSync, constants as fsConstants } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import type { KeyManager } from './keys'
import type { SettingsStore } from './settings-store'
import { WHISPER_MODEL_SUBPATH } from './stt-engine'

export type HealthCheckResult = { ok: boolean; message: string }

const DEFAULT_GATEWAY_URL = 'ws://127.0.0.1:18789'

export async function checkGateway(
  keyManager: KeyManager,
  gatewayUrl = DEFAULT_GATEWAY_URL
): Promise<HealthCheckResult> {
  const token = keyManager.get('GATEWAY_TOKEN')
  if (!token) return { ok: false, message: 'GATEWAY_TOKEN is not set' }
  const httpUrl = gatewayUrl.replace(/^ws/, 'http')
  const res = await fetch(httpUrl)
  if (!res.ok) return { ok: false, message: `Gateway error: ${res.status}` }
  return { ok: true, message: 'Gateway connected' }
}

export async function checkElevenLabsApi(keyManager: KeyManager): Promise<HealthCheckResult> {
  const key = keyManager.get('ELEVENLABS_API_KEY')
  if (!key) return { ok: false, message: 'ELEVENLABS_API_KEY is not set' }
  const res = await fetch('https://api.elevenlabs.io/v1/user', {
    headers: { 'xi-api-key': key }
  })
  if (!res.ok) return { ok: false, message: `ElevenLabs API error: ${res.status}` }
  return { ok: true, message: 'ElevenLabs API connected' }
}

export async function checkSttProvider(
  keyManager: KeyManager,
  settings: SettingsStore,
  provider: string
): Promise<HealthCheckResult> {
  switch (provider) {
    case 'elevenlabs':
      return checkElevenLabsApi(keyManager)
    case 'openaiWhisper': {
      const key = keyManager.get('OPENAI_API_KEY')
      if (!key) return { ok: false, message: 'OPENAI_API_KEY is not set' }
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${key}` }
      })
      if (!res.ok) return { ok: false, message: `OpenAI API error: ${res.status}` }
      return { ok: true, message: 'OpenAI API connected' }
    }
    case 'localWhisper': {
      const bin = settings.get('localWhisperPath')?.trim()
      if (!bin) return { ok: false, message: 'whisper.cpp path is not set' }
      if (!existsSync(bin)) return { ok: false, message: `Binary not found: ${bin}` }
      try {
        accessSync(bin, fsConstants.X_OK)
      } catch {
        return { ok: false, message: `Binary not executable: ${bin}` }
      }
      const modelPath = join(homedir(), WHISPER_MODEL_SUBPATH)
      if (!existsSync(modelPath)) return { ok: false, message: `Model not found: ${modelPath}` }
      return { ok: true, message: 'whisper.cpp binary and model found' }
    }
    default:
      return { ok: false, message: `Unknown provider: ${provider}` }
  }
}

export async function checkTtsProvider(
  keyManager: KeyManager,
  settings: SettingsStore,
  provider: string
): Promise<HealthCheckResult> {
  switch (provider) {
    case 'elevenlabs':
      return checkElevenLabsApi(keyManager)
    case 'voicevox': {
      const url = settings.get('voicevoxUrl') || 'http://localhost:50021'
      const res = await fetch(`${url}/version`)
      if (!res.ok) return { ok: false, message: `VOICEVOX error: ${res.status}` }
      const version = await res.text()
      return { ok: true, message: `VOICEVOX v${version.replace(/"/g, '')}` }
    }
    case 'kokoro': {
      const url = settings.get('kokoroUrl') || 'http://localhost:8880'
      const res = await fetch(`${url}/v1/models`)
      if (!res.ok) return { ok: false, message: `Kokoro error: ${res.status}` }
      return { ok: true, message: 'Kokoro API connected' }
    }
    case 'piper': {
      const bin = settings.get('piperPath')?.trim()
      const model = settings.get('piperModelPath')?.trim()
      if (!bin) return { ok: false, message: 'Piper binary path is not set' }
      if (!model) return { ok: false, message: 'Piper model path is not set' }
      if (!existsSync(bin)) return { ok: false, message: `Binary not found: ${bin}` }
      if (!existsSync(model)) return { ok: false, message: `Model not found: ${model}` }
      try {
        accessSync(bin, fsConstants.X_OK)
      } catch {
        return { ok: false, message: `Binary not executable: ${bin}` }
      }
      return { ok: true, message: 'Piper binary and model found' }
    }
    default:
      return { ok: false, message: `Unknown provider: ${provider}` }
  }
}
