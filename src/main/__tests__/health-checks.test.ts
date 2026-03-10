import { describe, it, expect, vi, beforeEach } from 'vitest'
import { http, HttpResponse } from 'msw'
import { server } from './msw/server'

// ── FS mock ──────────────────────────────────────────────────────
const mockExistsSync = vi.fn()
const mockAccessSync = vi.fn()

vi.mock('node:fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  accessSync: (...args: unknown[]) => mockAccessSync(...args),
  constants: { X_OK: 1 }
}))

import {
  checkGateway,
  checkElevenLabsApi,
  checkSttProvider,
  checkTtsProvider
} from '../health-checks'
import type { KeyManager } from '../keys'
import type { SettingsStore } from '../settings-store'

function createMockKeyManager(keys: Record<string, string | null> = {}): KeyManager {
  return {
    get: vi.fn((name: string) => keys[name] ?? null)
  } as unknown as KeyManager
}

function createMockSettings(values: Record<string, unknown> = {}): SettingsStore {
  return {
    get: vi.fn((key: string) => values[key] ?? null)
  } as unknown as SettingsStore
}

describe('health-checks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    server.resetHandlers()
  })

  // ── checkGateway ──────────────────────────────────────────────

  describe('checkGateway', () => {
    it('returns not-set when GATEWAY_TOKEN is missing', async () => {
      const km = createMockKeyManager({})
      const result = await checkGateway(km)
      expect(result).toEqual({ ok: false, message: 'GATEWAY_TOKEN is not set' })
    })

    it('returns connected on successful fetch', async () => {
      server.use(http.get('http://127.0.0.1:18789', () => HttpResponse.text('ok')))
      const km = createMockKeyManager({ GATEWAY_TOKEN: 'tok' })
      const result = await checkGateway(km)
      expect(result).toEqual({ ok: true, message: 'Gateway connected' })
    })

    it('returns error on non-ok response', async () => {
      server.use(http.get('http://127.0.0.1:18789', () => new HttpResponse(null, { status: 500 })))
      const km = createMockKeyManager({ GATEWAY_TOKEN: 'tok' })
      const result = await checkGateway(km)
      expect(result).toEqual({ ok: false, message: 'Gateway error: 500' })
    })

    it('uses custom gateway URL', async () => {
      server.use(http.get('http://localhost:9999', () => HttpResponse.text('ok')))
      const km = createMockKeyManager({ GATEWAY_TOKEN: 'tok' })
      const result = await checkGateway(km, 'ws://localhost:9999')
      expect(result).toEqual({ ok: true, message: 'Gateway connected' })
    })
  })

  // ── checkElevenLabsApi ────────────────────────────────────────

  describe('checkElevenLabsApi', () => {
    it('returns not-set when key is missing', async () => {
      const km = createMockKeyManager({})
      const result = await checkElevenLabsApi(km)
      expect(result).toEqual({ ok: false, message: 'ELEVENLABS_API_KEY is not set' })
    })

    it('returns connected on success', async () => {
      server.use(
        http.get('https://api.elevenlabs.io/v1/user', () => HttpResponse.json({ user: 'test' }))
      )
      const km = createMockKeyManager({ ELEVENLABS_API_KEY: 'key123' })
      const result = await checkElevenLabsApi(km)
      expect(result).toEqual({ ok: true, message: 'ElevenLabs API connected' })
    })

    it('returns error on non-ok response', async () => {
      server.use(
        http.get('https://api.elevenlabs.io/v1/user', () => new HttpResponse(null, { status: 401 }))
      )
      const km = createMockKeyManager({ ELEVENLABS_API_KEY: 'key' })
      const result = await checkElevenLabsApi(km)
      expect(result).toEqual({ ok: false, message: 'ElevenLabs API error: 401' })
    })
  })

  // ── checkSttProvider ──────────────────────────────────────────

  describe('checkSttProvider', () => {
    it('elevenlabs: delegates to checkElevenLabsApi', async () => {
      server.use(
        http.get('https://api.elevenlabs.io/v1/user', () => HttpResponse.json({ ok: true }))
      )
      const km = createMockKeyManager({ ELEVENLABS_API_KEY: 'key' })
      const settings = createMockSettings()
      const result = await checkSttProvider(km, settings, 'elevenlabs')
      expect(result.ok).toBe(true)
    })

    it('openaiWhisper: returns not-set when key missing', async () => {
      const km = createMockKeyManager({})
      const settings = createMockSettings()
      const result = await checkSttProvider(km, settings, 'openaiWhisper')
      expect(result).toEqual({ ok: false, message: 'OPENAI_API_KEY is not set' })
    })

    it('openaiWhisper: returns connected on success', async () => {
      server.use(
        http.get('https://api.openai.com/v1/models', () => HttpResponse.json({ data: [] }))
      )
      const km = createMockKeyManager({ OPENAI_API_KEY: 'sk-test' })
      const settings = createMockSettings()
      const result = await checkSttProvider(km, settings, 'openaiWhisper')
      expect(result).toEqual({ ok: true, message: 'OpenAI API connected' })
    })

    it('localWhisper: returns not-set when path empty', async () => {
      const km = createMockKeyManager({})
      const settings = createMockSettings({ localWhisperPath: '' })
      const result = await checkSttProvider(km, settings, 'localWhisper')
      expect(result).toEqual({ ok: false, message: 'whisper.cpp path is not set' })
    })

    it('localWhisper: returns not-found when binary missing', async () => {
      const km = createMockKeyManager({})
      const settings = createMockSettings({ localWhisperPath: '/usr/bin/whisper' })
      mockExistsSync.mockReturnValue(false)
      const result = await checkSttProvider(km, settings, 'localWhisper')
      expect(result).toEqual({ ok: false, message: 'Binary not found: /usr/bin/whisper' })
    })

    it('localWhisper: returns not-executable when access fails', async () => {
      const km = createMockKeyManager({})
      const settings = createMockSettings({ localWhisperPath: '/usr/bin/whisper' })
      mockExistsSync.mockImplementation((p: string) => p === '/usr/bin/whisper')
      mockAccessSync.mockImplementation(() => {
        throw new Error('EACCES')
      })
      const result = await checkSttProvider(km, settings, 'localWhisper')
      expect(result.message).toContain('not executable')
    })

    it('unknown provider returns error', async () => {
      const km = createMockKeyManager({})
      const settings = createMockSettings()
      const result = await checkSttProvider(km, settings, 'unknown')
      expect(result).toEqual({ ok: false, message: 'Unknown provider: unknown' })
    })
  })

  // ── checkTtsProvider ──────────────────────────────────────────

  describe('checkTtsProvider', () => {
    it('elevenlabs: delegates to checkElevenLabsApi', async () => {
      server.use(
        http.get('https://api.elevenlabs.io/v1/user', () => HttpResponse.json({ ok: true }))
      )
      const km = createMockKeyManager({ ELEVENLABS_API_KEY: 'key' })
      const settings = createMockSettings()
      const result = await checkTtsProvider(km, settings, 'elevenlabs')
      expect(result.ok).toBe(true)
    })

    it('voicevox: returns version on success', async () => {
      server.use(http.get('http://localhost:50021/version', () => HttpResponse.text('"0.14.0"')))
      const km = createMockKeyManager({})
      const settings = createMockSettings({ voicevoxUrl: 'http://localhost:50021' })
      const result = await checkTtsProvider(km, settings, 'voicevox')
      expect(result).toEqual({ ok: true, message: 'VOICEVOX v0.14.0' })
    })

    it('voicevox: uses default URL when not configured', async () => {
      server.use(http.get('http://localhost:50021/version', () => HttpResponse.text('"1.0"')))
      const km = createMockKeyManager({})
      const settings = createMockSettings({})
      const result = await checkTtsProvider(km, settings, 'voicevox')
      expect(result.ok).toBe(true)
    })

    it('kokoro: returns connected on success', async () => {
      server.use(http.get('http://localhost:8880/v1/models', () => HttpResponse.json({ data: [] })))
      const km = createMockKeyManager({})
      const settings = createMockSettings({ kokoroUrl: 'http://localhost:8880' })
      const result = await checkTtsProvider(km, settings, 'kokoro')
      expect(result).toEqual({ ok: true, message: 'Kokoro API connected' })
    })

    it('piper: returns not-set when binary path empty', async () => {
      const km = createMockKeyManager({})
      const settings = createMockSettings({ piperPath: '', piperModelPath: '/model' })
      const result = await checkTtsProvider(km, settings, 'piper')
      expect(result).toEqual({ ok: false, message: 'Piper binary path is not set' })
    })

    it('piper: returns not-set when model path empty', async () => {
      const km = createMockKeyManager({})
      const settings = createMockSettings({ piperPath: '/bin/piper', piperModelPath: '' })
      const result = await checkTtsProvider(km, settings, 'piper')
      expect(result).toEqual({ ok: false, message: 'Piper model path is not set' })
    })

    it('piper: returns not-found when binary missing', async () => {
      const km = createMockKeyManager({})
      const settings = createMockSettings({
        piperPath: '/bin/piper',
        piperModelPath: '/model.onnx'
      })
      mockExistsSync.mockReturnValue(false)
      const result = await checkTtsProvider(km, settings, 'piper')
      expect(result).toEqual({ ok: false, message: 'Binary not found: /bin/piper' })
    })

    it('piper: returns model not-found when model missing', async () => {
      const km = createMockKeyManager({})
      const settings = createMockSettings({
        piperPath: '/bin/piper',
        piperModelPath: '/model.onnx'
      })
      mockExistsSync.mockImplementation((p: string) => p === '/bin/piper')
      mockAccessSync.mockImplementation(() => {})
      const result = await checkTtsProvider(km, settings, 'piper')
      expect(result).toEqual({ ok: false, message: 'Model not found: /model.onnx' })
    })

    it('piper: returns success when binary and model exist', async () => {
      const km = createMockKeyManager({})
      const settings = createMockSettings({
        piperPath: '/bin/piper',
        piperModelPath: '/model.onnx'
      })
      mockExistsSync.mockReturnValue(true)
      mockAccessSync.mockImplementation(() => {})
      const result = await checkTtsProvider(km, settings, 'piper')
      expect(result).toEqual({ ok: true, message: 'Piper binary and model found' })
    })

    it('unknown provider returns error', async () => {
      const km = createMockKeyManager({})
      const settings = createMockSettings()
      const result = await checkTtsProvider(km, settings, 'unknown')
      expect(result).toEqual({ ok: false, message: 'Unknown provider: unknown' })
    })
  })
})
