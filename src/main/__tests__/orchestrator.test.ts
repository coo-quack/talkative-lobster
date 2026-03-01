import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ITtsProvider } from '../tts/tts-provider'

// ── Electron mocks ──────────────────────────────────────────────────

const ipcOnHandlers = new Map<string, Function>()
const ipcHandleHandlers = new Map<string, Function>()
const webContentsSend = vi.fn()

vi.mock('electron', () => ({
  BrowserWindow: vi.fn(),
  ipcMain: {
    on: vi.fn((channel: string, handler: Function) => {
      ipcOnHandlers.set(channel, handler)
    }),
    handle: vi.fn((channel: string, handler: Function) => {
      ipcHandleHandlers.set(channel, handler)
    }),
    removeHandler: vi.fn(),
    removeAllListeners: vi.fn(),
  },
  safeStorage: {
    isEncryptionAvailable: () => false,
    encryptString: vi.fn(),
    decryptString: vi.fn(),
  },
}))

// ── FS mock (prevent real disk access) ──────────────────────────────

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  accessSync: vi.fn(),
  constants: { X_OK: 1 },
}))

// ── OpenClaw mock ───────────────────────────────────────────────────

const mockWsClient = {
  on: vi.fn(),
  connect: vi.fn().mockResolvedValue(undefined),
  disconnect: vi.fn(),
  sendMessage: vi.fn(),
  cancelActiveRuns: vi.fn(),
}

vi.mock('../openclaw-client', () => ({
  OpenClawClient: vi.fn().mockImplementation(() => mockWsClient),
}))

// ── STT mock ────────────────────────────────────────────────────────

const mockSttTranscribe = vi.fn()

vi.mock('../stt-engine', () => ({
  SttEngine: vi.fn().mockImplementation(() => ({
    transcribe: mockSttTranscribe,
  })),
}))

// ── TTS mocks ───────────────────────────────────────────────────────

function createMockTtsProvider(chunks: Buffer[] = [Buffer.from([1, 2, 3])]): ITtsProvider {
  let stopped = false
  return {
    get isStopped() { return stopped },
    stop() { stopped = true },
    async *stream(_text: string) {
      for (const chunk of chunks) {
        if (stopped) return
        yield chunk
      }
    },
  }
}

vi.mock('../tts/elevenlabs-tts', () => ({
  ElevenLabsTts: vi.fn().mockImplementation(() => createMockTtsProvider()),
}))

vi.mock('../tts/voicevox-tts', () => ({
  VoicevoxTts: vi.fn().mockImplementation(() => createMockTtsProvider()),
}))

vi.mock('../tts/kokoro-tts', () => ({
  KokoroTts: vi.fn().mockImplementation(() => createMockTtsProvider()),
}))

vi.mock('../tts/piper-tts', () => ({
  PiperTts: vi.fn().mockImplementation(() => createMockTtsProvider()),
}))

// ── Import after mocks ─────────────────────────────────────────────

import { Orchestrator } from '../orchestrator'
import { IPC } from '../../shared/ipc-channels'

function createMockWindow() {
  return {
    isDestroyed: vi.fn().mockReturnValue(false),
    webContents: {
      send: webContentsSend,
      on: vi.fn(),
    },
  } as any
}

describe('Orchestrator', () => {
  let orchestrator: Orchestrator
  let win: any

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

  function getIpcOn(channel: string): Function {
    const handler = ipcOnHandlers.get(channel)
    if (!handler) throw new Error(`No ipc.on handler for ${channel}`)
    return handler
  }

  function getIpcHandle(channel: string): Function {
    const handler = ipcHandleHandlers.get(channel)
    if (!handler) throw new Error(`No ipc.handle handler for ${channel}`)
    return handler
  }

  function getState(): string {
    return (orchestrator as any).actor.getSnapshot().value
  }

  function sendEvent(type: string, data?: any) {
    (orchestrator as any).actor.send(data ? { type, ...data } : { type })
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
      ;(orchestrator as any).ttsProvider = mockTts
      ;(orchestrator as any).wsClient = mockWsClient

      getIpcOn(IPC.VOICE_START)()
      expect(getState()).toBe('listening')
      expect(mockTts.isStopped).toBe(true)
      expect(mockWsClient.cancelActiveRuns).toHaveBeenCalled()
    })

    it('interrupts during thinking: cancels TTS and LLM', () => {
      sendEvent('SPEECH_START')
      sendEvent('SPEECH_END')
      sendEvent('STT_DONE', { text: 'hello' })
      expect(getState()).toBe('thinking')

      const mockTts = createMockTtsProvider()
      ;(orchestrator as any).ttsProvider = mockTts

      getIpcOn(IPC.VOICE_START)()
      expect(getState()).toBe('listening')
      expect(mockTts.isStopped).toBe(true)
    })

    it('interrupts during speaking: cancels TTS and LLM, resets flags', () => {
      sendEvent('SPEECH_START')
      sendEvent('SPEECH_END')
      sendEvent('STT_DONE', { text: 'hello' })
      sendEvent('TTS_PLAYING')
      expect(getState()).toBe('speaking')

      const mockTts = createMockTtsProvider()
      ;(orchestrator as any).ttsProvider = mockTts
      ;(orchestrator as any).ttsPlaying = true

      getIpcOn(IPC.VOICE_START)()
      expect(getState()).toBe('listening')
      expect((orchestrator as any).ttsPlaying).toBe(false)
    })

    it('does not cancel in idle state', () => {
      const mockTts = createMockTtsProvider()
      ;(orchestrator as any).ttsProvider = mockTts

      getIpcOn(IPC.VOICE_START)()
      expect(getState()).toBe('listening')
      expect(mockTts.isStopped).toBe(false)
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
      ;(orchestrator as any).ttsProvider = mockTts
      ;(orchestrator as any).wsClient = mockWsClient
      ;(orchestrator as any).ttsPlaying = true
      ;(orchestrator as any).sttInProgress = true

      getIpcOn(IPC.VOICE_STOP)()
      expect(getState()).toBe('idle')
      expect(mockTts.isStopped).toBe(true)
      expect(mockWsClient.cancelActiveRuns).toHaveBeenCalled()
      expect((orchestrator as any).ttsPlaying).toBe(false)
      expect((orchestrator as any).sttInProgress).toBe(false)
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
      expect((orchestrator as any).ttsPlaying).toBe(false)
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
      ;(orchestrator as any).ttsProvider = mockTts

      getIpcOn(IPC.VOICE_INTERRUPT)()
      expect(getState()).toBe('listening')
      expect(mockTts.isStopped).toBe(true)
      expect((orchestrator as any).ttsPlaying).toBe(false)
    })
  })

  // ── handleTts ───────────────────────────────────────────────────

  describe('handleTts', () => {
    beforeEach(async () => {
      await orchestrator.start()
    })

    it('sends TTS_DONE immediately when no TTS provider', async () => {
      ;(orchestrator as any).ttsProvider = null
      sendEvent('SPEECH_START')
      sendEvent('SPEECH_END')
      sendEvent('STT_DONE', { text: 'hello' })
      expect(getState()).toBe('thinking')

      await (orchestrator as any).handleTts('hello')
      expect(getState()).toBe('idle')
    })

    it('sends TTS_AUDIO and TTS_STOP when audio is produced', async () => {
      const mockTts = createMockTtsProvider([Buffer.from([1, 2, 3])])
      ;(orchestrator as any).ttsProvider = mockTts

      sendEvent('SPEECH_START')
      sendEvent('SPEECH_END')
      sendEvent('STT_DONE', { text: 'hello' })

      await (orchestrator as any).handleTts('hello')

      const audioCall = webContentsSend.mock.calls.find((c: any[]) => c[0] === IPC.TTS_AUDIO)
      expect(audioCall).toBeDefined()

      const stopCall = webContentsSend.mock.calls.find((c: any[]) => c[0] === IPC.TTS_STOP)
      expect(stopCall).toBeDefined()
    })

    it('does NOT send TTS_DONE when audio was sent (renderer controls lifecycle)', async () => {
      const mockTts = createMockTtsProvider([Buffer.from([1, 2, 3])])
      ;(orchestrator as any).ttsProvider = mockTts

      sendEvent('SPEECH_START')
      sendEvent('SPEECH_END')
      sendEvent('STT_DONE', { text: 'hello' })
      expect(getState()).toBe('thinking')

      await (orchestrator as any).handleTts('hello')

      // State should still be thinking — renderer sends TTS_PLAYBACK_DONE
      expect(getState()).toBe('thinking')
    })

    it('sends TTS_DONE when no audio was sent and still in thinking', async () => {
      const mockTts = createMockTtsProvider([]) // No chunks
      ;(orchestrator as any).ttsProvider = mockTts

      sendEvent('SPEECH_START')
      sendEvent('SPEECH_END')
      sendEvent('STT_DONE', { text: 'hello' })
      expect(getState()).toBe('thinking')

      await (orchestrator as any).handleTts('hello')
      expect(getState()).toBe('idle')
    })

    it('does not send audio when TTS was stopped mid-stream', async () => {
      let streamCalled = false
      const mockTts: ITtsProvider = {
        get isStopped() { return streamCalled },
        stop() { streamCalled = true },
        async *stream(_text: string) {
          streamCalled = true
          yield Buffer.from([1, 2, 3])
        },
      }
      ;(orchestrator as any).ttsProvider = mockTts

      await (orchestrator as any).handleTts('hello')

      const audioCall = webContentsSend.mock.calls.find((c: any[]) => c[0] === IPC.TTS_AUDIO)
      expect(audioCall).toBeUndefined()
    })

    it('handles TTS error gracefully', async () => {
      const mockTts: ITtsProvider = {
        get isStopped() { return false },
        stop() {},
        async *stream(_text: string) {
          throw new Error('TTS connection failed')
        },
      }
      ;(orchestrator as any).ttsProvider = mockTts

      await (orchestrator as any).handleTts('hello')

      const errorCall = webContentsSend.mock.calls.find((c: any[]) => c[0] === IPC.ERROR)
      expect(errorCall).toBeDefined()
      expect(errorCall[1]).toContain('TTS error')
    })

    it('handles ECONNREFUSED error with descriptive message', async () => {
      const mockTts: ITtsProvider = {
        get isStopped() { return false },
        stop() {},
        async *stream(_text: string) {
          const err = new Error('fetch failed') as any
          err.cause = { code: 'ECONNREFUSED', address: '127.0.0.1', port: 50021 }
          throw err
        },
      }
      ;(orchestrator as any).ttsProvider = mockTts

      await (orchestrator as any).handleTts('hello')

      const errorCall = webContentsSend.mock.calls.find((c: any[]) => c[0] === IPC.ERROR)
      expect(errorCall).toBeDefined()
      expect(errorCall[1]).toContain('TTS connection refused')
      expect(errorCall[1]).toContain('127.0.0.1')
    })

    it('stops previous TTS when new TTS starts while playing', async () => {
      const mockTts = createMockTtsProvider([Buffer.from([1, 2])])
      ;(orchestrator as any).ttsProvider = mockTts
      ;(orchestrator as any).ttsPlaying = true

      await (orchestrator as any).handleTts('hello')

      expect(mockTts.isStopped).toBe(true)
      const cancelCall = webContentsSend.mock.calls.find((c: any[]) => c[0] === IPC.TTS_CANCEL)
      expect(cancelCall).toBeDefined()
    })
  })

  // ── handleBatchStt ──────────────────────────────────────────────

  describe('handleBatchStt', () => {
    beforeEach(async () => {
      await orchestrator.start()
      ;(orchestrator as any).sttEngine = { transcribe: mockSttTranscribe }
    })

    it('processes audio when in idle state', async () => {
      mockSttTranscribe.mockResolvedValue('こんにちは')
      const audio = new Float32Array(16000)
      await (orchestrator as any).handleBatchStt(audio)

      expect(mockSttTranscribe).toHaveBeenCalled()
      expect(getState()).toBe('thinking')
    })

    it('processes audio when in listening state', async () => {
      sendEvent('SPEECH_START')
      expect(getState()).toBe('listening')

      mockSttTranscribe.mockResolvedValue('こんにちは')
      const audio = new Float32Array(16000)
      await (orchestrator as any).handleBatchStt(audio)

      expect(getState()).toBe('thinking')
    })

    it('ignores audio when in processing state', async () => {
      sendEvent('SPEECH_START')
      sendEvent('SPEECH_END')
      expect(getState()).toBe('processing')

      const audio = new Float32Array(16000)
      await (orchestrator as any).handleBatchStt(audio)

      expect(mockSttTranscribe).not.toHaveBeenCalled()
    })

    it('ignores audio when in thinking state', async () => {
      sendEvent('SPEECH_START')
      sendEvent('SPEECH_END')
      sendEvent('STT_DONE', { text: 'hello' })
      expect(getState()).toBe('thinking')

      const audio = new Float32Array(16000)
      await (orchestrator as any).handleBatchStt(audio)

      expect(mockSttTranscribe).not.toHaveBeenCalled()
    })

    it('ignores audio when in speaking state', async () => {
      sendEvent('SPEECH_START')
      sendEvent('SPEECH_END')
      sendEvent('STT_DONE', { text: 'hello' })
      sendEvent('TTS_PLAYING')
      expect(getState()).toBe('speaking')

      const audio = new Float32Array(16000)
      await (orchestrator as any).handleBatchStt(audio)

      expect(mockSttTranscribe).not.toHaveBeenCalled()
    })

    it('prevents concurrent STT processing', async () => {
      ;(orchestrator as any).sttInProgress = true

      const audio = new Float32Array(16000)
      await (orchestrator as any).handleBatchStt(audio)

      expect(mockSttTranscribe).not.toHaveBeenCalled()
    })

    it('resets sttInProgress after processing', async () => {
      mockSttTranscribe.mockResolvedValue('hello')
      const audio = new Float32Array(16000)
      await (orchestrator as any).handleBatchStt(audio)

      expect((orchestrator as any).sttInProgress).toBe(false)
    })

    it('does nothing when no STT engine configured', async () => {
      ;(orchestrator as any).sttEngine = null

      const audio = new Float32Array(16000)
      await (orchestrator as any).handleBatchStt(audio)

      expect(mockSttTranscribe).not.toHaveBeenCalled()
    })

    it('handles STT error and sends STT_FAIL', async () => {
      mockSttTranscribe.mockRejectedValue(new Error('STT failed'))
      const audio = new Float32Array(16000)
      await (orchestrator as any).handleBatchStt(audio)

      expect(getState()).toBe('idle')
      const errorCall = webContentsSend.mock.calls.find((c: any[]) => c[0] === IPC.ERROR)
      expect(errorCall).toBeDefined()
    })

    it('transitions idle → listening → processing for audio in idle', async () => {
      mockSttTranscribe.mockResolvedValue('hello')
      expect(getState()).toBe('idle')

      const audio = new Float32Array(16000)
      await (orchestrator as any).handleBatchStt(audio)

      // Should have gone through idle → listening → processing → thinking
      expect(getState()).toBe('thinking')
    })
  })

  // ── handleSttResult ─────────────────────────────────────────────

  describe('handleSttResult', () => {
    beforeEach(async () => {
      await orchestrator.start()
      sendEvent('SPEECH_START')
      sendEvent('SPEECH_END')
      expect(getState()).toBe('processing')
    })

    it('sends STT_DONE and chat message for valid text', () => {
      ;(orchestrator as any).handleSttResult('こんにちは')

      expect(getState()).toBe('thinking')
      const chatMsg = webContentsSend.mock.calls.find((c: any[]) => c[0] === IPC.CHAT_MESSAGE)
      expect(chatMsg).toBeDefined()
      expect(chatMsg[1].text).toBe('こんにちは')
      expect(chatMsg[1].role).toBe('user')
    })

    it('filters non-speech and sends STT_FAIL', () => {
      ;(orchestrator as any).handleSttResult('ご視聴ありがとうございました')

      expect(getState()).toBe('idle')
    })

    it('sends STT_FAIL for empty text', () => {
      ;(orchestrator as any).handleSttResult('')

      expect(getState()).toBe('idle')
    })

    it('filters whisper artifacts like [music]', () => {
      ;(orchestrator as any).handleSttResult('[music]')

      expect(getState()).toBe('idle')
    })

    it('sends message to WebSocket client', () => {
      ;(orchestrator as any).wsClient = mockWsClient
      ;(orchestrator as any).handleSttResult('hello world')

      expect(mockWsClient.sendMessage).toHaveBeenCalledWith('hello world')
    })

    it('adds message to chat history', () => {
      ;(orchestrator as any).handleSttResult('test message')

      const messages = (orchestrator as any).messages
      expect(messages.length).toBe(1)
      expect(messages[0].text).toBe('test message')
      expect(messages[0].role).toBe('user')
    })
  })

  // ── CHAT_SEND handler ──────────────────────────────────────────

  describe('CHAT_SEND', () => {
    beforeEach(async () => {
      await orchestrator.start()
      ;(orchestrator as any).wsClient = mockWsClient
    })

    it('sends message via WS and transitions idle → thinking', () => {
      getIpcOn(IPC.CHAT_SEND)({}, 'hello from text')

      expect(mockWsClient.sendMessage).toHaveBeenCalledWith('hello from text')
      // idle → listening → processing → thinking
      expect(getState()).toBe('thinking')
    })

    it('sends message via WS and transitions when in listening state', () => {
      sendEvent('SPEECH_START')
      expect(getState()).toBe('listening')

      getIpcOn(IPC.CHAT_SEND)({}, 'hello from text')

      expect(mockWsClient.sendMessage).toHaveBeenCalledWith('hello from text')
      // listening → SPEECH_END → processing → STT_DONE → thinking
      expect(getState()).toBe('thinking')
    })

    it('adds message to history', () => {
      getIpcOn(IPC.CHAT_SEND)({}, 'test text')

      const messages = (orchestrator as any).messages
      expect(messages.length).toBe(1)
      expect(messages[0].role).toBe('user')
      expect(messages[0].text).toBe('test text')
    })
  })

  // ── State broadcast ─────────────────────────────────────────────

  describe('state broadcast', () => {
    it('sends VOICE_STATE_CHANGED on state transitions', async () => {
      await orchestrator.start()

      sendEvent('SPEECH_START')
      const stateCall = webContentsSend.mock.calls.find(
        (c: any[]) => c[0] === IPC.VOICE_STATE_CHANGED && c[1] === 'listening'
      )
      expect(stateCall).toBeDefined()
    })

    it('does not send to destroyed window', async () => {
      win.isDestroyed.mockReturnValue(true)
      await orchestrator.start()

      sendEvent('SPEECH_START')
      // webContentsSend should not be called since window is destroyed
      const calls = webContentsSend.mock.calls.filter(
        (c: any[]) => c[0] === IPC.VOICE_STATE_CHANGED && c[1] === 'listening'
      )
      expect(calls.length).toBe(0)
    })
  })
})
