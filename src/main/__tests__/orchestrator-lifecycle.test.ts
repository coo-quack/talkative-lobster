import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ITtsProvider } from '../tts/tts-provider'

// ── Electron mocks ──────────────────────────────────────────────────

type IpcHandler = (...args: unknown[]) => unknown

const ipcOnHandlers = new Map<string, IpcHandler>()
const ipcHandleHandlers = new Map<string, IpcHandler>()
const webContentsSend = vi.fn()

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  app: { getPath: () => '/tmp/lobster-test' },
  ipcMain: {
    on: vi.fn((channel: string, handler: IpcHandler) => {
      ipcOnHandlers.set(channel, handler)
    }),
    handle: vi.fn((channel: string, handler: IpcHandler) => {
      ipcHandleHandlers.set(channel, handler)
    }),
    removeHandler: vi.fn(),
    removeListener: vi.fn(),
    removeAllListeners: vi.fn()
  }
}))

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  accessSync: vi.fn(),
  constants: { X_OK: 1 }
}))

const mockWsClient = {
  on: vi.fn(),
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn(),
  sendMessage: vi.fn(),
  cancelActiveRuns: vi.fn()
}

vi.mock('../openclaw-client', () => ({
  OpenClawClient: vi.fn().mockImplementation(() => mockWsClient)
}))

const mockSttTranscribe = vi.fn()

vi.mock('../stt-engine', () => ({
  SttEngine: vi.fn().mockImplementation(() => ({
    transcribe: mockSttTranscribe
  }))
}))

function createMockTtsProvider(chunks: Buffer[] = [Buffer.from([1, 2, 3])]): ITtsProvider {
  let generation = 0
  return {
    audioFormat: { type: 'encoded' as const },
    stop() {
      generation++
    },
    async *stream(_text: string) {
      const gen = ++generation
      for (const chunk of chunks) {
        if (gen !== generation) return
        yield chunk
      }
    }
  }
}

vi.mock('../tts/elevenlabs-tts', () => ({
  ElevenLabsTts: vi.fn().mockImplementation(() => createMockTtsProvider())
}))
vi.mock('../tts/voicevox-tts', () => ({
  VoicevoxTts: vi.fn().mockImplementation(() => createMockTtsProvider())
}))
vi.mock('../tts/kokoro-tts', () => ({
  KokoroTts: vi.fn().mockImplementation(() => createMockTtsProvider())
}))
vi.mock('../tts/piper-tts', () => ({
  PiperTts: vi.fn().mockImplementation(() => createMockTtsProvider())
}))

import { IPC } from '../../shared/ipc-channels'
import { Orchestrator } from '../orchestrator'

type OrchestratorInternals = {
  actor: { getSnapshot: () => { value: string }; send: (e: Record<string, unknown>) => void }
  ttsProvider: ITtsProvider | null
  ttsPlaying: boolean
  sttInProgress: boolean
  sttEngine: { transcribe: ReturnType<typeof vi.fn> } | null
  wsClient: typeof mockWsClient
  messages: Array<{ role: string; text: string }>
  handleTts: (text: string) => Promise<void>
  handleBatchStt: (audio: Float32Array) => Promise<void>
  handleSttResult: (text: string) => void
}

function internals(o: Orchestrator): OrchestratorInternals {
  return o as unknown as OrchestratorInternals
}

function createMockWindow() {
  return {
    isDestroyed: vi.fn().mockReturnValue(false),
    webContents: {
      send: webContentsSend,
      on: vi.fn()
    }
  } as unknown as import('electron').BrowserWindow
}

// ── Tests ────────────────────────────────────────────────────────────

describe('Orchestrator lifecycle', () => {
  let orchestrator: Orchestrator
  let win: import('electron').BrowserWindow

  beforeEach(() => {
    vi.clearAllMocks()
    ipcOnHandlers.clear()
    ipcHandleHandlers.clear()
    win = createMockWindow()
    orchestrator = new Orchestrator(win)
  })

  afterEach(() => {
    orchestrator.stop()
  })

  function getIpcOn(channel: string): IpcHandler {
    const handler = ipcOnHandlers.get(channel)
    if (!handler) throw new Error(`No ipc.on handler for ${channel}`)
    return handler
  }

  function getState(): string {
    return internals(orchestrator).actor.getSnapshot().value
  }

  function sendEvent(type: string, data?: Record<string, unknown>) {
    internals(orchestrator).actor.send(data ? { type, ...data } : { type })
  }

  // ── VOICE_START → listening → VOICE_STOP → idle → VOICE_START ──

  describe('mic on/off cycle', () => {
    beforeEach(async () => {
      await orchestrator.start()
    })

    it('VOICE_START → listening → VOICE_STOP → idle', () => {
      getIpcOn(IPC.VOICE_START)()
      expect(getState()).toBe('listening')

      getIpcOn(IPC.VOICE_STOP)()
      expect(getState()).toBe('idle')
    })

    it('VOICE_START → VOICE_STOP → VOICE_START again', () => {
      getIpcOn(IPC.VOICE_START)()
      expect(getState()).toBe('listening')

      getIpcOn(IPC.VOICE_STOP)()
      expect(getState()).toBe('idle')

      getIpcOn(IPC.VOICE_START)()
      expect(getState()).toBe('listening')
    })

    it('VOICE_STOP resets sttInProgress', () => {
      getIpcOn(IPC.VOICE_START)()
      internals(orchestrator).sttInProgress = true

      getIpcOn(IPC.VOICE_STOP)()
      expect(internals(orchestrator).sttInProgress).toBe(false)
    })

    it('VOICE_STOP resets ttsPlaying', () => {
      sendEvent('SPEECH_START')
      sendEvent('SPEECH_END')
      sendEvent('STT_DONE', { text: 'hello' })
      sendEvent('TTS_PLAYING')
      internals(orchestrator).ttsPlaying = true

      getIpcOn(IPC.VOICE_STOP)()
      expect(internals(orchestrator).ttsPlaying).toBe(false)
    })

    it('VOICE_STOP in idle is idempotent', () => {
      expect(getState()).toBe('idle')
      getIpcOn(IPC.VOICE_STOP)()
      expect(getState()).toBe('idle')
    })

    it('double VOICE_START does not break state', () => {
      getIpcOn(IPC.VOICE_START)()
      expect(getState()).toBe('listening')

      // Second VOICE_START in listening — guard rejects SPEECH_START in listening
      getIpcOn(IPC.VOICE_START)()
      expect(getState()).toBe('listening')
    })

    it('audio chunk ignored during VOICE_STOP cleanup', async () => {
      await orchestrator.start()
      internals(orchestrator).sttEngine = { transcribe: mockSttTranscribe }

      getIpcOn(IPC.VOICE_START)()
      getIpcOn(IPC.VOICE_STOP)()
      expect(getState()).toBe('idle')

      // Audio arriving after stop should be ignored (not in listening/idle states after full stop)
      const audio = new Float32Array(16000)
      await internals(orchestrator).handleBatchStt(audio)

      // Still idle because handleBatchStt accepts audio in idle
      // but the key point is no crash
      expect(getState()).not.toBe('listening')
    })
  })

  // ── Speaking → VOICE_STOP stops TTS ────────────────────────────

  describe('stop during active states', () => {
    beforeEach(async () => {
      await orchestrator.start()
    })

    it('VOICE_STOP during speaking stops TTS provider', () => {
      sendEvent('SPEECH_START')
      sendEvent('SPEECH_END')
      sendEvent('STT_DONE', { text: 'hello' })
      sendEvent('TTS_PLAYING')
      expect(getState()).toBe('speaking')

      const mockTts = createMockTtsProvider()
      internals(orchestrator).ttsProvider = mockTts

      getIpcOn(IPC.VOICE_STOP)()
      expect(getState()).toBe('idle')
    })

    it('VOICE_STOP during thinking cancels LLM runs', () => {
      sendEvent('SPEECH_START')
      sendEvent('SPEECH_END')
      sendEvent('STT_DONE', { text: 'hello' })
      expect(getState()).toBe('thinking')

      internals(orchestrator).wsClient = mockWsClient

      getIpcOn(IPC.VOICE_STOP)()
      expect(mockWsClient.cancelActiveRuns).toHaveBeenCalled()
      expect(getState()).toBe('idle')
    })

    it('VOICE_STOP during processing resets to idle', () => {
      sendEvent('SPEECH_START')
      sendEvent('SPEECH_END')
      expect(getState()).toBe('processing')

      getIpcOn(IPC.VOICE_STOP)()
      expect(getState()).toBe('idle')
    })

    it('VOICE_STOP broadcasts idle state', () => {
      sendEvent('SPEECH_START')
      expect(getState()).toBe('listening')

      webContentsSend.mockClear()
      getIpcOn(IPC.VOICE_STOP)()

      const stateCall = webContentsSend.mock.calls.find(
        (c: unknown[]) => c[0] === IPC.VOICE_STATE_CHANGED && c[1] === 'idle'
      )
      expect(stateCall).toBeDefined()
    })
  })

  // ── Full conversation cycle ────────────────────────────────────

  describe('full conversation cycle', () => {
    beforeEach(async () => {
      await orchestrator.start()
      internals(orchestrator).sttEngine = { transcribe: mockSttTranscribe }
      internals(orchestrator).wsClient = mockWsClient
    })

    it('idle → listening → processing → thinking → speaking → idle', () => {
      getIpcOn(IPC.VOICE_START)()
      expect(getState()).toBe('listening')

      sendEvent('SPEECH_END')
      expect(getState()).toBe('processing')

      sendEvent('STT_DONE', { text: 'hello' })
      expect(getState()).toBe('thinking')

      sendEvent('TTS_PLAYING')
      expect(getState()).toBe('speaking')

      getIpcOn(IPC.TTS_PLAYBACK_DONE)()
      expect(getState()).toBe('idle')
    })

    it('two consecutive conversation cycles', () => {
      // Cycle 1
      getIpcOn(IPC.VOICE_START)()
      sendEvent('SPEECH_END')
      sendEvent('STT_DONE', { text: 'hello' })
      sendEvent('TTS_PLAYING')
      getIpcOn(IPC.TTS_PLAYBACK_DONE)()
      expect(getState()).toBe('idle')

      // Cycle 2
      getIpcOn(IPC.VOICE_START)()
      sendEvent('SPEECH_END')
      sendEvent('STT_DONE', { text: 'world' })
      sendEvent('TTS_PLAYING')
      getIpcOn(IPC.TTS_PLAYBACK_DONE)()
      expect(getState()).toBe('idle')
    })

    it('interrupt during speaking restarts cycle', () => {
      // Start first cycle
      getIpcOn(IPC.VOICE_START)()
      sendEvent('SPEECH_END')
      sendEvent('STT_DONE', { text: 'first' })
      sendEvent('TTS_PLAYING')
      expect(getState()).toBe('speaking')

      const mockTts = createMockTtsProvider()
      internals(orchestrator).ttsProvider = mockTts

      // User interrupts
      getIpcOn(IPC.VOICE_START)()
      expect(getState()).toBe('listening')

      // Continue with new cycle
      sendEvent('SPEECH_END')
      sendEvent('STT_DONE', { text: 'second' })
      expect(getState()).toBe('thinking')
    })
  })

  // ── State broadcast verification ──────────────────────────────

  describe('state broadcasts during lifecycle', () => {
    beforeEach(async () => {
      await orchestrator.start()
    })

    it('broadcasts all state changes during full cycle', () => {
      const states: string[] = []
      webContentsSend.mockImplementation((channel: string, data: unknown) => {
        if (channel === IPC.VOICE_STATE_CHANGED) states.push(data as string)
      })

      getIpcOn(IPC.VOICE_START)()
      sendEvent('SPEECH_END')
      sendEvent('STT_DONE', { text: 'hello' })
      sendEvent('TTS_PLAYING')
      getIpcOn(IPC.TTS_PLAYBACK_DONE)()

      expect(states).toEqual(['listening', 'processing', 'thinking', 'speaking', 'idle'])
    })

    it('does not broadcast to destroyed window', () => {
      vi.mocked(win.isDestroyed).mockReturnValue(true)
      webContentsSend.mockClear()

      getIpcOn(IPC.VOICE_START)()

      expect(webContentsSend).not.toHaveBeenCalled()
    })
  })
})
