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

// ── FS mock (prevent real disk access) ──────────────────────────────

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  accessSync: vi.fn(),
  constants: { X_OK: 1 }
}))

// ── OpenClaw mock ───────────────────────────────────────────────────

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

// ── STT mock ────────────────────────────────────────────────────────

const mockSttTranscribe = vi.fn()

vi.mock('../stt-engine', () => ({
  SttEngine: vi.fn().mockImplementation(() => ({
    transcribe: mockSttTranscribe
  }))
}))

// ── TTS mocks ───────────────────────────────────────────────────────

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

// ── Import after mocks ─────────────────────────────────────────────

import { Orchestrator } from '../orchestrator'
import { IPC } from '../../shared/ipc-channels'

// ── Type alias for accessing Orchestrator private members in tests ──

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

describe('Orchestrator', () => {
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

  // ── Constructor & lifecycle ─────────────────────────────────────

  describe('constructor', () => {
    it('registers IPC handlers on construction', () => {
      expect(ipcOnHandlers.has(IPC.VOICE_START)).toBe(true)
      expect(ipcOnHandlers.has(IPC.VOICE_STOP)).toBe(true)
      expect(ipcOnHandlers.has(IPC.VOICE_INTERRUPT)).toBe(true)
      expect(ipcOnHandlers.has(IPC.AUDIO_CHUNK)).toBe(true)
      expect(ipcOnHandlers.has(IPC.TTS_PLAYBACK_STARTED)).toBe(true)
      expect(ipcOnHandlers.has(IPC.TTS_PLAYBACK_DONE)).toBe(true)
      expect(ipcOnHandlers.has(IPC.CHAT_SEND)).toBe(true)
    })

    it('registers ipc handle handlers for settings', () => {
      expect(ipcHandleHandlers.has(IPC.KEYS_GET)).toBe(true)
      expect(ipcHandleHandlers.has(IPC.TTS_VOICE_GET)).toBe(true)
      expect(ipcHandleHandlers.has(IPC.TTS_PROVIDER_GET)).toBe(true)
      expect(ipcHandleHandlers.has(IPC.STT_PROVIDER_GET)).toBe(true)
      expect(ipcHandleHandlers.has(IPC.GATEWAY_CHECK)).toBe(true)
    })
  })

  describe('start/stop', () => {
    it('starts actor and initializes', async () => {
      await orchestrator.start()
      expect(getState()).toBe('idle')
    })

    it('stop disconnects wsClient', async () => {
      await orchestrator.start()
      orchestrator.stop()
    })
  })

  // ── VOICE_START handler ─────────────────────────────────────────

  describe('VOICE_START', () => {
    beforeEach(async () => {
      await orchestrator.start()
    })

    it('transitions idle → listening', () => {
      getIpcOn(IPC.VOICE_START)()
      expect(getState()).toBe('listening')
    })

    it('interrupts during processing: cancels TTS and LLM', () => {
      // Move to processing
      sendEvent('SPEECH_START')
      sendEvent('SPEECH_END')
      expect(getState()).toBe('processing')

      // Set up a TTS provider and wsClient
      const mockTts = createMockTtsProvider()
      internals(orchestrator).ttsProvider = mockTts
      internals(orchestrator).wsClient = mockWsClient

      getIpcOn(IPC.VOICE_START)()
      expect(getState()).toBe('listening')
      expect(mockWsClient.cancelActiveRuns).toHaveBeenCalled()
    })

    it('interrupts during thinking: cancels TTS and LLM', () => {
      sendEvent('SPEECH_START')
      sendEvent('SPEECH_END')
      sendEvent('STT_DONE', { text: 'hello' })
      expect(getState()).toBe('thinking')

      const mockTts = createMockTtsProvider()
      internals(orchestrator).ttsProvider = mockTts

      getIpcOn(IPC.VOICE_START)()
      expect(getState()).toBe('listening')
    })

    it('interrupts during speaking: cancels TTS and LLM, resets flags', () => {
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
      expect(internals(orchestrator).ttsPlaying).toBe(false)
    })

    it('does not cancel in idle state', () => {
      const mockTts = createMockTtsProvider()
      internals(orchestrator).ttsProvider = mockTts

      getIpcOn(IPC.VOICE_START)()
      expect(getState()).toBe('listening')
    })
  })

  // ── VOICE_STOP handler ──────────────────────────────────────────

  describe('VOICE_STOP', () => {
    beforeEach(async () => {
      await orchestrator.start()
    })

    it('transitions listening → idle via CANCEL', () => {
      sendEvent('SPEECH_START')
      expect(getState()).toBe('listening')

      getIpcOn(IPC.VOICE_STOP)()
      expect(getState()).toBe('idle')
    })

    it('cancels all processing in speaking state', () => {
      sendEvent('SPEECH_START')
      sendEvent('SPEECH_END')
      sendEvent('STT_DONE', { text: 'hello' })
      sendEvent('TTS_PLAYING')
      expect(getState()).toBe('speaking')

      const mockTts = createMockTtsProvider()
      internals(orchestrator).ttsProvider = mockTts
      internals(orchestrator).wsClient = mockWsClient
      internals(orchestrator).ttsPlaying = true
      internals(orchestrator).sttInProgress = true

      getIpcOn(IPC.VOICE_STOP)()
      expect(getState()).toBe('idle')
      expect(mockWsClient.cancelActiveRuns).toHaveBeenCalled()
      expect(internals(orchestrator).ttsPlaying).toBe(false)
      expect(internals(orchestrator).sttInProgress).toBe(false)
    })

    it('cancels processing state', () => {
      sendEvent('SPEECH_START')
      sendEvent('SPEECH_END')
      expect(getState()).toBe('processing')

      getIpcOn(IPC.VOICE_STOP)()
      expect(getState()).toBe('idle')
    })

    it('cancels thinking state', () => {
      sendEvent('SPEECH_START')
      sendEvent('SPEECH_END')
      sendEvent('STT_DONE', { text: 'hello' })
      expect(getState()).toBe('thinking')

      getIpcOn(IPC.VOICE_STOP)()
      expect(getState()).toBe('idle')
    })

    it('sends CANCEL even in idle (no-op for state machine)', () => {
      expect(getState()).toBe('idle')
      getIpcOn(IPC.VOICE_STOP)()
      expect(getState()).toBe('idle')
    })
  })

  // ── TTS_PLAYBACK_STARTED handler ────────────────────────────────

  describe('TTS_PLAYBACK_STARTED', () => {
    beforeEach(async () => {
      await orchestrator.start()
    })

    it('transitions thinking → speaking', () => {
      sendEvent('SPEECH_START')
      sendEvent('SPEECH_END')
      sendEvent('STT_DONE', { text: 'hello' })
      expect(getState()).toBe('thinking')

      getIpcOn(IPC.TTS_PLAYBACK_STARTED)()
      expect(getState()).toBe('speaking')
    })

    it('does NOT transition if not in thinking state', () => {
      expect(getState()).toBe('idle')
      getIpcOn(IPC.TTS_PLAYBACK_STARTED)()
      expect(getState()).toBe('idle')
    })

    it('does NOT transition if in speaking state', () => {
      sendEvent('SPEECH_START')
      sendEvent('SPEECH_END')
      sendEvent('STT_DONE', { text: 'hello' })
      sendEvent('TTS_PLAYING')
      expect(getState()).toBe('speaking')

      getIpcOn(IPC.TTS_PLAYBACK_STARTED)()
      expect(getState()).toBe('speaking')
    })
  })

  // ── TTS_PLAYBACK_DONE handler ───────────────────────────────────

  describe('TTS_PLAYBACK_DONE', () => {
    beforeEach(async () => {
      await orchestrator.start()
    })

    it('transitions speaking → idle', () => {
      sendEvent('SPEECH_START')
      sendEvent('SPEECH_END')
      sendEvent('STT_DONE', { text: 'hello' })
      sendEvent('TTS_PLAYING')
      expect(getState()).toBe('speaking')

      getIpcOn(IPC.TTS_PLAYBACK_DONE)()
      expect(getState()).toBe('idle')
      expect(internals(orchestrator).ttsPlaying).toBe(false)
    })

    it('transitions thinking → idle (audio finished before TTS_PLAYING)', () => {
      sendEvent('SPEECH_START')
      sendEvent('SPEECH_END')
      sendEvent('STT_DONE', { text: 'hello' })
      expect(getState()).toBe('thinking')

      getIpcOn(IPC.TTS_PLAYBACK_DONE)()
      expect(getState()).toBe('idle')
    })

    it('does NOT transition if in idle state', () => {
      expect(getState()).toBe('idle')
      getIpcOn(IPC.TTS_PLAYBACK_DONE)()
      expect(getState()).toBe('idle')
    })

    it('does NOT transition if in listening state', () => {
      sendEvent('SPEECH_START')
      expect(getState()).toBe('listening')

      getIpcOn(IPC.TTS_PLAYBACK_DONE)()
      expect(getState()).toBe('listening')
    })
  })

  // ── VOICE_INTERRUPT handler ─────────────────────────────────────

  describe('VOICE_INTERRUPT', () => {
    beforeEach(async () => {
      await orchestrator.start()
    })

    it('stops TTS and transitions to listening', () => {
      sendEvent('SPEECH_START')
      sendEvent('SPEECH_END')
      sendEvent('STT_DONE', { text: 'hello' })
      sendEvent('TTS_PLAYING')
      expect(getState()).toBe('speaking')

      const mockTts = createMockTtsProvider()
      internals(orchestrator).ttsProvider = mockTts

      getIpcOn(IPC.VOICE_INTERRUPT)()
      expect(getState()).toBe('listening')
      expect(internals(orchestrator).ttsPlaying).toBe(false)
    })
  })

  // ── handleTts ───────────────────────────────────────────────────

  describe('handleTts', () => {
    beforeEach(async () => {
      await orchestrator.start()
    })

    it('sends TTS_DONE immediately when no TTS provider', async () => {
      internals(orchestrator).ttsProvider = null
      sendEvent('SPEECH_START')
      sendEvent('SPEECH_END')
      sendEvent('STT_DONE', { text: 'hello' })
      expect(getState()).toBe('thinking')

      await internals(orchestrator).handleTts('hello')
      expect(getState()).toBe('idle')
    })

    it('sends TTS_FORMAT before TTS_AUDIO', async () => {
      const mockTts = createMockTtsProvider([Buffer.from([1, 2, 3])])
      internals(orchestrator).ttsProvider = mockTts

      sendEvent('SPEECH_START')
      sendEvent('SPEECH_END')
      sendEvent('STT_DONE', { text: 'hello' })

      await internals(orchestrator).handleTts('hello')

      const calls = webContentsSend.mock.calls.map((c: unknown[]) => c[0])
      const formatIdx = calls.indexOf(IPC.TTS_FORMAT)
      const audioIdx = calls.indexOf(IPC.TTS_AUDIO)
      expect(formatIdx).toBeGreaterThanOrEqual(0)
      expect(audioIdx).toBeGreaterThan(formatIdx)
    })

    it('sends audio format info matching the provider', async () => {
      const mockTts = createMockTtsProvider([Buffer.from([1, 2, 3])])
      internals(orchestrator).ttsProvider = mockTts

      await internals(orchestrator).handleTts('hello')

      const formatCall = webContentsSend.mock.calls.find((c: unknown[]) => c[0] === IPC.TTS_FORMAT)
      expect(formatCall).toBeDefined()
      expect(formatCall?.[1]).toEqual({ type: 'encoded' })
    })

    it('sends TTS_AUDIO and TTS_STOP when audio is produced', async () => {
      const mockTts = createMockTtsProvider([Buffer.from([1, 2, 3])])
      internals(orchestrator).ttsProvider = mockTts

      sendEvent('SPEECH_START')
      sendEvent('SPEECH_END')
      sendEvent('STT_DONE', { text: 'hello' })

      await internals(orchestrator).handleTts('hello')

      const audioCall = webContentsSend.mock.calls.find((c: unknown[]) => c[0] === IPC.TTS_AUDIO)
      expect(audioCall).toBeDefined()

      const stopCall = webContentsSend.mock.calls.find((c: unknown[]) => c[0] === IPC.TTS_STOP)
      expect(stopCall).toBeDefined()
    })

    it('does NOT send TTS_DONE when audio was sent (renderer controls lifecycle)', async () => {
      const mockTts = createMockTtsProvider([Buffer.from([1, 2, 3])])
      internals(orchestrator).ttsProvider = mockTts

      sendEvent('SPEECH_START')
      sendEvent('SPEECH_END')
      sendEvent('STT_DONE', { text: 'hello' })
      expect(getState()).toBe('thinking')

      await internals(orchestrator).handleTts('hello')

      // State should still be thinking — renderer sends TTS_PLAYBACK_DONE
      expect(getState()).toBe('thinking')
    })

    it('sends TTS_DONE when no audio was sent and still in thinking', async () => {
      const mockTts = createMockTtsProvider([]) // No chunks
      internals(orchestrator).ttsProvider = mockTts

      sendEvent('SPEECH_START')
      sendEvent('SPEECH_END')
      sendEvent('STT_DONE', { text: 'hello' })
      expect(getState()).toBe('thinking')

      await internals(orchestrator).handleTts('hello')
      expect(getState()).toBe('idle')
    })

    it('does not send audio when TTS was stopped mid-stream', async () => {
      let generation = 0
      const mockTts: ITtsProvider = {
        audioFormat: { type: 'encoded' },
        stop() {
          generation++
        },
        async *stream(_text: string) {
          const gen = ++generation
          // Simulate stop happening during stream
          mockTts.stop()
          if (gen !== generation) return
          yield Buffer.from([1, 2, 3])
        }
      }
      internals(orchestrator).ttsProvider = mockTts

      await internals(orchestrator).handleTts('hello')

      const audioCall = webContentsSend.mock.calls.find((c: unknown[]) => c[0] === IPC.TTS_AUDIO)
      expect(audioCall).toBeUndefined()
    })

    it('handles TTS error gracefully', async () => {
      const mockTts: ITtsProvider = {
        audioFormat: { type: 'encoded' },
        stop() {},
        // biome-ignore lint/correctness/useYield: throw-only generator for error testing
        stream: async function* (_text: string): AsyncGenerator<Buffer> {
          throw new Error('TTS connection failed')
        }
      }
      internals(orchestrator).ttsProvider = mockTts

      await internals(orchestrator).handleTts('hello')

      const errorCall = webContentsSend.mock.calls.find((c: unknown[]) => c[0] === IPC.ERROR)
      expect(errorCall).toBeDefined()
      expect(errorCall?.[1]).toContain('TTS error')
    })

    it('handles ECONNREFUSED error with descriptive message', async () => {
      const mockTts: ITtsProvider = {
        audioFormat: { type: 'encoded' },
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

      await internals(orchestrator).handleTts('hello')

      const errorCall = webContentsSend.mock.calls.find((c: unknown[]) => c[0] === IPC.ERROR)
      expect(errorCall).toBeDefined()
      expect(errorCall?.[1]).toContain('TTS connection refused')
      expect(errorCall?.[1]).toContain('127.0.0.1')
    })

    it('stops previous TTS when new TTS starts while playing', async () => {
      const mockTts = createMockTtsProvider([Buffer.from([1, 2])])
      internals(orchestrator).ttsProvider = mockTts
      internals(orchestrator).ttsPlaying = true

      await internals(orchestrator).handleTts('hello')

      // Previous TTS was cancelled (TTS_CANCEL sent to renderer)
      const cancelCall = webContentsSend.mock.calls.find((c: unknown[]) => c[0] === IPC.TTS_CANCEL)
      expect(cancelCall).toBeDefined()
    })
  })

  // ── handleBatchStt ──────────────────────────────────────────────

  describe('handleBatchStt', () => {
    beforeEach(async () => {
      await orchestrator.start()
      internals(orchestrator).sttEngine = { transcribe: mockSttTranscribe }
      internals(orchestrator).wsClient = mockWsClient
    })

    it('processes audio when in idle state', async () => {
      mockSttTranscribe.mockResolvedValue('こんにちは')
      const audio = new Float32Array(16000)
      await internals(orchestrator).handleBatchStt(audio)

      expect(mockSttTranscribe).toHaveBeenCalled()
      expect(getState()).toBe('thinking')
    })

    it('processes audio when in listening state', async () => {
      sendEvent('SPEECH_START')
      expect(getState()).toBe('listening')

      mockSttTranscribe.mockResolvedValue('こんにちは')
      const audio = new Float32Array(16000)
      await internals(orchestrator).handleBatchStt(audio)

      expect(getState()).toBe('thinking')
    })

    it('ignores audio when in processing state', async () => {
      sendEvent('SPEECH_START')
      sendEvent('SPEECH_END')
      expect(getState()).toBe('processing')

      const audio = new Float32Array(16000)
      await internals(orchestrator).handleBatchStt(audio)

      expect(mockSttTranscribe).not.toHaveBeenCalled()
    })

    it('ignores audio when in thinking state', async () => {
      sendEvent('SPEECH_START')
      sendEvent('SPEECH_END')
      sendEvent('STT_DONE', { text: 'hello' })
      expect(getState()).toBe('thinking')

      const audio = new Float32Array(16000)
      await internals(orchestrator).handleBatchStt(audio)

      expect(mockSttTranscribe).not.toHaveBeenCalled()
    })

    it('ignores audio when in speaking state', async () => {
      sendEvent('SPEECH_START')
      sendEvent('SPEECH_END')
      sendEvent('STT_DONE', { text: 'hello' })
      sendEvent('TTS_PLAYING')
      expect(getState()).toBe('speaking')

      const audio = new Float32Array(16000)
      await internals(orchestrator).handleBatchStt(audio)

      expect(mockSttTranscribe).not.toHaveBeenCalled()
    })

    it('prevents concurrent STT processing', async () => {
      internals(orchestrator).sttInProgress = true

      const audio = new Float32Array(16000)
      await internals(orchestrator).handleBatchStt(audio)

      expect(mockSttTranscribe).not.toHaveBeenCalled()
    })

    it('resets sttInProgress after processing', async () => {
      mockSttTranscribe.mockResolvedValue('hello')
      const audio = new Float32Array(16000)
      await internals(orchestrator).handleBatchStt(audio)

      expect(internals(orchestrator).sttInProgress).toBe(false)
    })

    it('does nothing when no STT engine configured', async () => {
      internals(orchestrator).sttEngine = null

      const audio = new Float32Array(16000)
      await internals(orchestrator).handleBatchStt(audio)

      expect(mockSttTranscribe).not.toHaveBeenCalled()
    })

    it('handles STT error and sends STT_FAIL', async () => {
      mockSttTranscribe.mockRejectedValue(new Error('STT failed'))
      const audio = new Float32Array(16000)
      await internals(orchestrator).handleBatchStt(audio)

      expect(getState()).toBe('idle')
      const errorCall = webContentsSend.mock.calls.find((c: unknown[]) => c[0] === IPC.ERROR)
      expect(errorCall).toBeDefined()
    })

    it('transitions idle → listening → processing for audio in idle', async () => {
      mockSttTranscribe.mockResolvedValue('hello')
      expect(getState()).toBe('idle')

      const audio = new Float32Array(16000)
      await internals(orchestrator).handleBatchStt(audio)

      // Should have gone through idle → listening → processing → thinking
      expect(getState()).toBe('thinking')
    })
  })

  // ── handleSttResult ─────────────────────────────────────────────

  describe('handleSttResult', () => {
    beforeEach(async () => {
      await orchestrator.start()
      internals(orchestrator).wsClient = mockWsClient
      sendEvent('SPEECH_START')
      sendEvent('SPEECH_END')
      expect(getState()).toBe('processing')
    })

    it('sends STT_DONE and chat message for valid text', () => {
      internals(orchestrator).handleSttResult('こんにちは')

      expect(getState()).toBe('thinking')
      const chatMsg = webContentsSend.mock.calls.find((c: unknown[]) => c[0] === IPC.CHAT_MESSAGE)
      expect(chatMsg).toBeDefined()
      expect(chatMsg?.[1].text).toBe('こんにちは')
      expect(chatMsg?.[1].role).toBe('user')
    })

    it('filters non-speech and sends STT_FAIL', () => {
      internals(orchestrator).handleSttResult('ご視聴ありがとうございました')

      expect(getState()).toBe('idle')
    })

    it('sends STT_FAIL for empty text', () => {
      internals(orchestrator).handleSttResult('')

      expect(getState()).toBe('idle')
    })

    it('filters whisper artifacts like [music]', () => {
      internals(orchestrator).handleSttResult('[music]')

      expect(getState()).toBe('idle')
    })

    it('sends message to WebSocket client', () => {
      internals(orchestrator).wsClient = mockWsClient
      internals(orchestrator).handleSttResult('hello world')

      const sentText = mockWsClient.sendMessage.mock.calls[0][0] as string
      expect(sentText).toContain('hello world')
    })

    it('adds message to chat history', () => {
      internals(orchestrator).handleSttResult('test message')

      const messages = internals(orchestrator).messages
      expect(messages.length).toBe(1)
      expect(messages[0].text).toBe('test message')
      expect(messages[0].role).toBe('user')
    })

    it('cancels and sends error when gateway is not connected', () => {
      internals(orchestrator).wsClient = null as unknown as typeof mockWsClient
      internals(orchestrator).handleSttResult('hello')

      expect(getState()).toBe('idle')
      const errorCall = webContentsSend.mock.calls.find((c: unknown[]) => c[0] === IPC.ERROR)
      expect(errorCall).toBeDefined()
      expect(errorCall?.[1]).toContain('Gateway not connected')
    })
  })

  // ── CHAT_SEND handler ──────────────────────────────────────────

  describe('CHAT_SEND', () => {
    beforeEach(async () => {
      await orchestrator.start()
      internals(orchestrator).wsClient = mockWsClient
    })

    it('sends message via WS and transitions idle → thinking', () => {
      getIpcOn(IPC.CHAT_SEND)({}, 'hello from text')

      const sentText = mockWsClient.sendMessage.mock.calls[0][0] as string
      expect(sentText).toContain('hello from text')
      // idle → listening → processing → thinking
      expect(getState()).toBe('thinking')
    })

    it('sends message via WS and transitions when in listening state', () => {
      sendEvent('SPEECH_START')
      expect(getState()).toBe('listening')

      getIpcOn(IPC.CHAT_SEND)({}, 'hello from text')

      const sentText = mockWsClient.sendMessage.mock.calls[0][0] as string
      expect(sentText).toContain('hello from text')
      // listening → SPEECH_END → processing → STT_DONE → thinking
      expect(getState()).toBe('thinking')
    })

    it('adds message to history', () => {
      getIpcOn(IPC.CHAT_SEND)({}, 'test text')

      const messages = internals(orchestrator).messages
      expect(messages.length).toBe(1)
      expect(messages[0].role).toBe('user')
      expect(messages[0].text).toBe('test text')
    })

    it('cancels and sends error when gateway is not connected', () => {
      internals(orchestrator).wsClient = null as unknown as typeof mockWsClient

      getIpcOn(IPC.CHAT_SEND)({}, 'hello')

      expect(getState()).toBe('idle')
      const errorCall = webContentsSend.mock.calls.find((c: unknown[]) => c[0] === IPC.ERROR)
      expect(errorCall).toBeDefined()
      expect(errorCall?.[1]).toContain('Gateway not connected')
    })
  })

  // ── State broadcast ─────────────────────────────────────────────

  describe('state broadcast', () => {
    it('sends VOICE_STATE_CHANGED on state transitions', async () => {
      await orchestrator.start()

      sendEvent('SPEECH_START')
      const stateCall = webContentsSend.mock.calls.find(
        (c: unknown[]) => c[0] === IPC.VOICE_STATE_CHANGED && c[1] === 'listening'
      )
      expect(stateCall).toBeDefined()
    })

    it('does not send to destroyed window', async () => {
      vi.mocked(win.isDestroyed).mockReturnValue(true)
      await orchestrator.start()

      sendEvent('SPEECH_START')
      // webContentsSend should not be called since window is destroyed
      const calls = webContentsSend.mock.calls.filter(
        (c: unknown[]) => c[0] === IPC.VOICE_STATE_CHANGED && c[1] === 'listening'
      )
      expect(calls.length).toBe(0)
    })
  })
})
