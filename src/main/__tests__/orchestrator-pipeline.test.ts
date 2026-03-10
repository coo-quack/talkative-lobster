import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
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
  let stopped = false
  return {
    audioFormat: { type: 'encoded' as const },
    get isStopped() {
      return stopped
    },
    stop() {
      stopped = true
    },
    async *stream(_text: string) {
      for (const chunk of chunks) {
        if (stopped) return
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

import { Orchestrator } from '../orchestrator'
import { IPC } from '../../shared/ipc-channels'

type OrchestratorInternals = {
  actor: { getSnapshot: () => { value: string }; send: (e: Record<string, unknown>) => void }
  ttsProvider: ITtsProvider | null
  ttsPlaying: boolean
  sttInProgress: boolean
  sttEngine: { transcribe: ReturnType<typeof vi.fn> } | null
  wsClient: typeof mockWsClient | null
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

describe('Orchestrator pipeline', () => {
  let orchestrator: Orchestrator

  beforeEach(async () => {
    vi.clearAllMocks()
    ipcOnHandlers.clear()
    ipcHandleHandlers.clear()
    const win = createMockWindow()
    orchestrator = new Orchestrator(win)
    await orchestrator.start()
    internals(orchestrator).sttEngine = { transcribe: mockSttTranscribe }
    internals(orchestrator).wsClient = mockWsClient
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

  // ── Full pipeline: audio → STT → LLM → TTS → playback → idle ──

  describe('complete STT → LLM → TTS pipeline', () => {
    it('audio chunk → STT → thinking state with user message', async () => {
      mockSttTranscribe.mockResolvedValue('こんにちは')
      const audio = new Float32Array(16000)

      await internals(orchestrator).handleBatchStt(audio)

      expect(getState()).toBe('thinking')
      const sentText = mockWsClient.sendMessage.mock.calls[0][0] as string
      expect(sentText).toContain('こんにちは')

      const chatMsg = webContentsSend.mock.calls.find((c: unknown[]) => c[0] === IPC.CHAT_MESSAGE)
      expect(chatMsg).toBeDefined()
      expect(chatMsg?.[1].text).toBe('こんにちは')
      expect(chatMsg?.[1].role).toBe('user')
    })

    it('full pipeline with TTS streaming', async () => {
      mockSttTranscribe.mockResolvedValue('hello')
      const mockTts = createMockTtsProvider([Buffer.from([1, 2, 3])])
      internals(orchestrator).ttsProvider = mockTts

      // STT phase
      const audio = new Float32Array(16000)
      await internals(orchestrator).handleBatchStt(audio)
      expect(getState()).toBe('thinking')

      // TTS phase
      await internals(orchestrator).handleTts('response text')

      const formatCall = webContentsSend.mock.calls.find((c: unknown[]) => c[0] === IPC.TTS_FORMAT)
      expect(formatCall).toBeDefined()

      const audioCall = webContentsSend.mock.calls.find((c: unknown[]) => c[0] === IPC.TTS_AUDIO)
      expect(audioCall).toBeDefined()

      // Simulate renderer reporting playback done
      getIpcOn(IPC.TTS_PLAYBACK_STARTED)()
      expect(getState()).toBe('speaking')

      getIpcOn(IPC.TTS_PLAYBACK_DONE)()
      expect(getState()).toBe('idle')
    })
  })

  // ── STT failure paths ─────────────────────────────────────────

  describe('STT failure handling', () => {
    it('STT transcription error → idle + error IPC', async () => {
      mockSttTranscribe.mockRejectedValue(new Error('STT network error'))
      const audio = new Float32Array(16000)

      await internals(orchestrator).handleBatchStt(audio)

      expect(getState()).toBe('idle')
      const errorCall = webContentsSend.mock.calls.find((c: unknown[]) => c[0] === IPC.ERROR)
      expect(errorCall).toBeDefined()
      expect(errorCall?.[1]).toContain('STT error')
    })

    it('STT returns non-speech → idle (STT_FAIL)', async () => {
      mockSttTranscribe.mockResolvedValue('ご視聴ありがとうございました')
      const audio = new Float32Array(16000)

      await internals(orchestrator).handleBatchStt(audio)

      expect(getState()).toBe('idle')
    })

    it('STT returns empty → idle (STT_FAIL)', async () => {
      mockSttTranscribe.mockResolvedValue('')
      const audio = new Float32Array(16000)

      await internals(orchestrator).handleBatchStt(audio)

      expect(getState()).toBe('idle')
    })

    it('STT returns [music] artifact → idle (STT_FAIL)', async () => {
      mockSttTranscribe.mockResolvedValue('[music]')
      const audio = new Float32Array(16000)

      await internals(orchestrator).handleBatchStt(audio)

      expect(getState()).toBe('idle')
    })

    it('sttInProgress resets after failed STT', async () => {
      mockSttTranscribe.mockRejectedValue(new Error('STT error'))
      const audio = new Float32Array(16000)

      await internals(orchestrator).handleBatchStt(audio)

      expect(internals(orchestrator).sttInProgress).toBe(false)
    })
  })

  // ── TTS-less path ─────────────────────────────────────────────

  describe('TTS provider null', () => {
    it('no TTS provider → thinking to idle directly', async () => {
      internals(orchestrator).ttsProvider = null
      sendEvent('SPEECH_START')
      sendEvent('SPEECH_END')
      sendEvent('STT_DONE', { text: 'hello' })
      expect(getState()).toBe('thinking')

      await internals(orchestrator).handleTts('response')

      expect(getState()).toBe('idle')
    })
  })

  // ── TTS error paths ───────────────────────────────────────────

  describe('TTS error handling', () => {
    it('TTS connection error → error IPC + state stays consistent', async () => {
      const mockTts: ITtsProvider = {
        audioFormat: { type: 'encoded' },
        get isStopped() {
          return false
        },
        stop() {},
        // biome-ignore lint/correctness/useYield: throw-only generator for error testing
        stream: async function* (_text: string): AsyncGenerator<Buffer> {
          throw new Error('Connection failed')
        }
      }
      internals(orchestrator).ttsProvider = mockTts

      sendEvent('SPEECH_START')
      sendEvent('SPEECH_END')
      sendEvent('STT_DONE', { text: 'hello' })

      await internals(orchestrator).handleTts('response')

      const errorCall = webContentsSend.mock.calls.find((c: unknown[]) => c[0] === IPC.ERROR)
      expect(errorCall).toBeDefined()
      expect(errorCall?.[1]).toContain('TTS error')
    })

    it('TTS ECONNREFUSED → descriptive error with address', async () => {
      const mockTts: ITtsProvider = {
        audioFormat: { type: 'encoded' },
        get isStopped() {
          return false
        },
        stop() {},
        // biome-ignore lint/correctness/useYield: throw-only generator for error testing
        stream: async function* (_text: string): AsyncGenerator<Buffer> {
          const err = Object.assign(new Error('fetch failed'), {
            cause: { code: 'ECONNREFUSED', address: '127.0.0.1', port: 50021 }
          })
          throw err
        }
      }
      internals(orchestrator).ttsProvider = mockTts

      await internals(orchestrator).handleTts('response')

      const errorCall = webContentsSend.mock.calls.find((c: unknown[]) => c[0] === IPC.ERROR)
      expect(errorCall?.[1]).toContain('TTS connection refused')
      expect(errorCall?.[1]).toContain('127.0.0.1')
    })
  })

  // ── User interrupt during pipeline ────────────────────────────

  describe('user interrupts', () => {
    it('interrupt during speaking → TTS stopped + listening', () => {
      sendEvent('SPEECH_START')
      sendEvent('SPEECH_END')
      sendEvent('STT_DONE', { text: 'hello' })
      sendEvent('TTS_PLAYING')
      expect(getState()).toBe('speaking')

      const mockTts = createMockTtsProvider()
      internals(orchestrator).ttsProvider = mockTts
      internals(orchestrator).ttsPlaying = true

      getIpcOn(IPC.VOICE_START)()
      expect(getState()).toBe('listening')
      expect(mockTts.isStopped).toBe(true)
      expect(internals(orchestrator).ttsPlaying).toBe(false)
    })

    it('interrupt during thinking → LLM cancelled + listening', () => {
      sendEvent('SPEECH_START')
      sendEvent('SPEECH_END')
      sendEvent('STT_DONE', { text: 'hello' })
      expect(getState()).toBe('thinking')

      const mockTts = createMockTtsProvider()
      internals(orchestrator).ttsProvider = mockTts

      getIpcOn(IPC.VOICE_START)()
      expect(getState()).toBe('listening')
      expect(mockWsClient.cancelActiveRuns).toHaveBeenCalled()
    })

    it('VOICE_INTERRUPT during speaking → listening', () => {
      sendEvent('SPEECH_START')
      sendEvent('SPEECH_END')
      sendEvent('STT_DONE', { text: 'hello' })
      sendEvent('TTS_PLAYING')
      expect(getState()).toBe('speaking')

      const mockTts = createMockTtsProvider()
      internals(orchestrator).ttsProvider = mockTts

      getIpcOn(IPC.VOICE_INTERRUPT)()
      expect(getState()).toBe('listening')
      expect(mockTts.isStopped).toBe(true)
    })
  })

  // ── Gateway not connected ────────────────────────────────────

  describe('gateway disconnected', () => {
    it('STT success but no gateway → error + CANCEL', () => {
      internals(orchestrator).wsClient = null

      sendEvent('SPEECH_START')
      sendEvent('SPEECH_END')
      expect(getState()).toBe('processing')

      internals(orchestrator).handleSttResult('hello')

      expect(getState()).toBe('idle')
      const errorCall = webContentsSend.mock.calls.find((c: unknown[]) => c[0] === IPC.ERROR)
      expect(errorCall).toBeDefined()
      expect(errorCall?.[1]).toContain('Gateway not connected')
    })

    it('CHAT_SEND with no gateway → error + idle', () => {
      internals(orchestrator).wsClient = null

      getIpcOn(IPC.CHAT_SEND)({}, 'hello')

      expect(getState()).toBe('idle')
      const errorCall = webContentsSend.mock.calls.find((c: unknown[]) => c[0] === IPC.ERROR)
      expect(errorCall?.[1]).toContain('Gateway not connected')
    })
  })

  // ── Concurrent STT prevention ─────────────────────────────────

  describe('concurrent STT prevention', () => {
    it('drops audio chunk when STT is already in progress', async () => {
      internals(orchestrator).sttInProgress = true

      const audio = new Float32Array(16000)
      await internals(orchestrator).handleBatchStt(audio)

      expect(mockSttTranscribe).not.toHaveBeenCalled()
    })

    it('drops audio chunk when in thinking state', async () => {
      sendEvent('SPEECH_START')
      sendEvent('SPEECH_END')
      sendEvent('STT_DONE', { text: 'hello' })
      expect(getState()).toBe('thinking')

      const audio = new Float32Array(16000)
      await internals(orchestrator).handleBatchStt(audio)

      expect(mockSttTranscribe).not.toHaveBeenCalled()
    })

    it('drops audio chunk when in speaking state', async () => {
      sendEvent('SPEECH_START')
      sendEvent('SPEECH_END')
      sendEvent('STT_DONE', { text: 'hello' })
      sendEvent('TTS_PLAYING')
      expect(getState()).toBe('speaking')

      const audio = new Float32Array(16000)
      await internals(orchestrator).handleBatchStt(audio)

      expect(mockSttTranscribe).not.toHaveBeenCalled()
    })
  })

  // ── Chat history ──────────────────────────────────────────────

  describe('chat history', () => {
    it('accumulates messages across multiple STT results', () => {
      sendEvent('SPEECH_START')
      sendEvent('SPEECH_END')
      internals(orchestrator).handleSttResult('first message')

      // Reset to idle for next cycle
      sendEvent('TTS_PLAYING')
      sendEvent('TTS_DONE')
      expect(getState()).toBe('idle')

      sendEvent('SPEECH_START')
      sendEvent('SPEECH_END')
      internals(orchestrator).handleSttResult('second message')

      const messages = internals(orchestrator).messages
      expect(messages.length).toBe(2)
      expect(messages[0].text).toBe('first message')
      expect(messages[1].text).toBe('second message')
    })

    it('CHAT_SEND adds to history', () => {
      getIpcOn(IPC.CHAT_SEND)({}, 'text input')

      const messages = internals(orchestrator).messages
      expect(messages.length).toBe(1)
      expect(messages[0].role).toBe('user')
      expect(messages[0].text).toBe('text input')
    })
  })

  // ── Two consecutive conversation cycles ────────────────────────

  describe('consecutive cycles', () => {
    it('two full STT cycles: idle → ... → idle → ... → idle', async () => {
      // Cycle 1
      mockSttTranscribe.mockResolvedValue('hello')
      await internals(orchestrator).handleBatchStt(new Float32Array(16000))
      expect(getState()).toBe('thinking')

      sendEvent('TTS_PLAYING')
      expect(getState()).toBe('speaking')
      sendEvent('TTS_DONE')
      expect(getState()).toBe('idle')

      // Cycle 2
      mockSttTranscribe.mockResolvedValue('world')
      await internals(orchestrator).handleBatchStt(new Float32Array(16000))
      expect(getState()).toBe('thinking')

      sendEvent('TTS_PLAYING')
      expect(getState()).toBe('speaking')
      sendEvent('TTS_DONE')
      expect(getState()).toBe('idle')
    })
  })
})
