import { type BrowserWindow, ipcMain } from 'electron'
import crypto from 'node:crypto'

import { IPC } from '../shared/ipc-channels'
import type { ChatMessage } from '../shared/types'
import { KeyManager } from './keys'
import { SettingsStore } from './settings-store'
import { VoiceStateController } from './voice-state-controller'
import type { IGatewayClient } from './gateway-client'
import { OpenClawClient } from './openclaw-client'
import { SttEngine } from './stt-engine'
import type { ITtsProvider } from './tts/tts-provider'
import { splitTextForTts } from './tts/text-splitter'
import { AizuchiManager } from './aizuchi'
import { isNonSpeech } from './speech-filter'
import { ElevenLabsTts } from './tts/elevenlabs-tts'
import { VoicevoxTts } from './tts/voicevox-tts'
import { KokoroTts } from './tts/kokoro-tts'
import { PiperTts } from './tts/piper-tts'
import { checkGateway, checkSttProvider, checkTtsProvider } from './health-checks'
import { registerSettingsHandlers } from './ipc-settings-handlers'

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}

function errCause(
  err: unknown
): { code?: string; address?: string; port?: string | number } | undefined {
  if (err instanceof Error && err.cause && typeof err.cause === 'object') {
    return err.cause as { code?: string; address?: string; port?: string | number }
  }
  return undefined
}

const SESSION_KEY = 'agent:main:lobster'

const TTS_SYSTEM_PROMPT = `[TTS Output Rules]
Your response will be read aloud by a text-to-speech engine. You MUST follow these rules:
- Keep responses short and conversational. Avoid long paragraphs.
- Do not use abbreviations or shorthand. Write out all words fully.
- Write all numbers as spoken words (e.g. "3" → "three", "100" → "one hundred"). For Japanese, use reading form (e.g. "3つ" → "みっつ", "100人" → "ひゃくにん").
- Do not use symbols or emoticons (exclamation and question marks are OK).
- Do NOT output your internal reasoning or thinking process. Only output the final answer.
- You MUST always finalize your response and send it as a complete reply. Never leave a response unfinished.
`

export class Orchestrator {
  private win: BrowserWindow
  private keyManager: KeyManager
  private settings: SettingsStore
  private actor: VoiceStateController
  private wsClient: IGatewayClient | null = null
  private sttEngine: SttEngine | null = null
  private ttsProvider: ITtsProvider | null = null
  private messages: ChatMessage[] = []
  private sttInProgress = false
  private ttsPlaying = false
  private ttsGeneration = 0
  private isFirstMessage = true
  private aizuchi: AizuchiManager
  private ipcCleanup: (() => void)[] = []

  constructor(win: BrowserWindow) {
    this.win = win
    this.keyManager = new KeyManager()
    this.settings = new SettingsStore()
    this.actor = new VoiceStateController({
      onStuckRecovery: (state, elapsed) => {
        console.log(`[orchestrator] Stuck in ${state} for ${elapsed}ms, auto-cancelling`)
      }
    })

    this.aizuchi = new AizuchiManager(win)

    this.actor.subscribe((state) => {
      console.log(`[orchestrator] State: ${state}`)
      this.send(IPC.VOICE_STATE_CHANGED, state)

      // Start aizuchi when entering thinking state
      if (state === 'thinking') {
        this.aizuchi.start()
      } else {
        this.aizuchi.stop()
      }
    })

    // Forward renderer console to main process for debugging
    win.webContents.on('console-message', (_event, _level, message) => {
      if (message.startsWith('[tts]') || message.startsWith('[voice]')) {
        console.log(`[renderer] ${message}`)
      }
    })

    this.registerIpcHandlers()
  }

  async start(): Promise<void> {
    this.actor.start()
    this.initEngines()
    await this.connectGateway()
  }

  stop(): void {
    this.aizuchi.stop()
    this.actor.stop()
    this.wsClient?.disconnect()
    this.wsClient = null

    for (const cleanup of this.ipcCleanup) cleanup()
    this.ipcCleanup = []
  }

  private initEngines(): void {
    this.ttsProvider?.stop()
    const elevenlabsKey = this.keyManager.get('ELEVENLABS_API_KEY')
    const openaiKey = this.keyManager.get('OPENAI_API_KEY')
    const sttProv = this.settings.get('sttProvider')
    const localWhisperPath = this.settings.get('localWhisperPath')

    // STT setup based on selected provider
    const sttProviders = {
      elevenlabs: sttProv === 'elevenlabs' && !!elevenlabsKey,
      openaiWhisper: sttProv === 'openaiWhisper' && !!openaiKey,
      localWhisper: sttProv === 'localWhisper' && !!localWhisperPath
    }

    if (sttProviders.elevenlabs || sttProviders.openaiWhisper || sttProviders.localWhisper) {
      this.sttEngine = new SttEngine({
        elevenlabsApiKey: elevenlabsKey,
        openaiApiKey: openaiKey,
        localWhisperPath: localWhisperPath || null,
        providers: sttProviders
      })
    }

    // TTS setup based on selected provider
    this.ttsProvider = this.createTtsProvider(elevenlabsKey)
  }

  private createTtsProvider(elevenlabsKey: string | null): ITtsProvider | null {
    const ttsProv = this.settings.get('ttsProvider')
    switch (ttsProv) {
      case 'elevenlabs':
        if (!elevenlabsKey) return null
        return new ElevenLabsTts({
          apiKey: elevenlabsKey,
          voiceId: this.settings.get('ttsVoiceId'),
          modelId: this.settings.get('ttsModelId')
        })
      case 'voicevox': {
        const vUrl = this.settings.get('voicevoxUrl')
        const vSpeaker = this.settings.get('voicevoxSpeakerId')
        console.log(`[orchestrator] Creating VoicevoxTts: url=${vUrl}, speaker=${vSpeaker}`)
        return new VoicevoxTts(vUrl, vSpeaker)
      }
      case 'kokoro':
        return new KokoroTts(this.settings.get('kokoroUrl'), this.settings.get('kokoroVoice'))
      case 'piper': {
        const piperPath = this.settings.get('piperPath')?.trim()
        const piperModelPath = this.settings.get('piperModelPath')?.trim()
        if (!piperPath || !piperModelPath) return null
        return new PiperTts(piperPath, piperModelPath)
      }
      default:
        return null
    }
  }

  private async connectGateway(): Promise<void> {
    const token = this.keyManager.get('GATEWAY_TOKEN')
    if (!token) {
      console.log('[orchestrator] No GATEWAY_TOKEN, skipping connection')
      this.send(IPC.CONNECTION_STATUS, 'no-token')
      return
    }
    console.log('[orchestrator] Connecting to gateway...')

    const gatewayUrl = this.settings.get('gatewayUrl')
    this.wsClient = new OpenClawClient(gatewayUrl, token, SESSION_KEY)

    this.wsClient.on('connected', () => {
      this.send(IPC.CONNECTION_STATUS, 'connected')
    })

    this.wsClient.on('disconnected', () => {
      this.send(IPC.CONNECTION_STATUS, 'disconnected')
    })

    this.wsClient.on('error', () => {
      this.send(IPC.CONNECTION_STATUS, 'error')
    })

    this.wsClient.on('stream', (_text: string) => {
      // Stream delta received — no state transition needed here.
      // The state machine transitions on STT_DONE (→ thinking) and TTS_PLAYING (→ speaking).
    })

    this.wsClient.on('done', (text: string) => {
      console.log(`[orchestrator] LLM done: "${text.slice(0, 100)}..."`)
      // Strip reasoning blocks and <final> tags from the response
      const cleaned = text
        .replace(/<think>[\s\S]*?<\/think>\s*/g, '')
        .replace(/<thinking>[\s\S]*?<\/thinking>\s*/g, '')
        .replace(/<\/?final>/g, '')
        .trim()
      const ttsText = cleaned || text.trim()

      // Empty response (e.g. after interruption) — just recover state machine
      if (!ttsText) {
        console.log('[orchestrator] Empty LLM response, skipping TTS')
        this.actor.send({ type: 'TTS_DONE' })
        return
      }

      const msg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        text: ttsText,
        timestamp: Date.now()
      }
      this.pushMessage(msg)
      this.send(IPC.CHAT_MESSAGE, msg)

      this.handleTts(ttsText)
    })

    this.wsClient.on('chatError', (message: string) => {
      this.send(IPC.ERROR, `LLM error: ${message}`)
      this.actor.send({ type: 'CANCEL' })
    })

    try {
      await this.wsClient.connect()
    } catch (err: unknown) {
      this.send(IPC.CONNECTION_STATUS, 'error')
      this.send(IPC.ERROR, `Gateway connection failed: ${errMsg(err)}`)
    }
  }

  // --- TTS: split text and stream chunks sequentially ---

  private async handleTts(text: string): Promise<void> {
    if (!this.ttsProvider) {
      this.actor.send({ type: 'TTS_DONE' })
      return
    }

    // Stop aizuchi before starting actual TTS
    this.aizuchi.stop()

    // Stop any currently playing TTS before starting new one
    if (this.ttsPlaying) {
      this.ttsProvider.stop()
      this.send(IPC.TTS_CANCEL, null)
      console.log('[orchestrator] Stopped previous TTS for new playback')
    }
    this.ttsPlaying = true

    // Track this TTS invocation so stale callbacks from a previous
    // (interrupted) handleTts call cannot mutate state.
    const gen = ++this.ttsGeneration
    const chunks = splitTextForTts(text)
    let audioSent = false

    try {
      this.send(IPC.TTS_FORMAT, this.ttsProvider.audioFormat)
      for (const chunk of chunks) {
        if (gen !== this.ttsGeneration) break
        for await (const audio of this.ttsProvider.stream(chunk)) {
          if (gen !== this.ttsGeneration) break
          this.send(IPC.TTS_AUDIO, new Uint8Array(audio).buffer)
          audioSent = true
        }
      }
    } catch (err: unknown) {
      // If this TTS invocation was superseded, silently discard the error
      if (gen !== this.ttsGeneration) return
      const cause = errCause(err)
      const msg =
        cause?.code === 'ECONNREFUSED'
          ? `TTS connection refused: ${cause?.address ?? 'unknown'}:${cause?.port ?? ''}`
          : `TTS error: ${errMsg(err)}`
      console.error(`[orchestrator] ${msg}`)
      this.send(IPC.ERROR, msg)
    }

    // Stale invocation — a newer handleTts is now in control
    if (gen !== this.ttsGeneration) return

    this.ttsPlaying = false
    this.send(IPC.TTS_STOP, null)
    // Only transition to idle if no audio was sent to renderer.
    // If audio was sent, the renderer will send TTS_PLAYBACK_DONE when done.
    if (!audioSent) {
      const endState = this.actor.getSnapshot().value
      if (endState === 'thinking') {
        this.actor.send({ type: 'TTS_DONE' })
      }
    }
  }

  // --- STT handling ---

  private handleSttResult(text: string): void {
    console.log(`[orchestrator] STT result: "${text}"`)
    if (!text || isNonSpeech(text)) {
      console.log(`[orchestrator] ${text ? `Filtered non-speech: "${text}"` : 'STT: empty result'}`)
      this.actor.send({ type: 'STT_FAIL' })
      return
    }

    this.actor.send({ type: 'STT_DONE', text })
    const msg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text,
      timestamp: Date.now()
    }
    this.pushMessage(msg)
    this.send(IPC.CHAT_MESSAGE, msg)

    if (!this.wsClient) {
      console.log('[orchestrator] No gateway connection — cannot send message')
      this.send(IPC.ERROR, 'Gateway not connected. Please set GATEWAY_TOKEN in settings.')
      this.actor.send({ type: 'CANCEL' })
      return
    }
    this.sendToGateway(text)
  }

  private sendToGateway(text: string): void {
    if (!this.wsClient) return
    if (this.isFirstMessage) {
      this.isFirstMessage = false
      const withPrompt = `${TTS_SYSTEM_PROMPT}\n${text}`
      this.wsClient.sendMessage(withPrompt)
    } else {
      this.wsClient.sendMessage(text)
    }
  }

  private async handleBatchStt(audio: Float32Array): Promise<void> {
    if (!this.sttEngine) {
      console.log('[orchestrator] No STT engine configured')
      return
    }
    if (this.sttInProgress) {
      console.log('[orchestrator] STT already in progress, dropping audio chunk')
      return
    }

    // Only accept audio when state machine is ready (listening or idle)
    const currentState = this.actor.getSnapshot().value
    if (currentState !== 'listening' && currentState !== 'idle') {
      console.log(`[orchestrator] Ignoring audio chunk in state: ${currentState}`)
      return
    }

    this.sttInProgress = true
    try {
      console.log(`[orchestrator] Batch STT: received ${audio.length} samples`)
      // Ensure state is 'listening' before transitioning to 'processing'
      if (currentState === 'idle') {
        this.actor.send({ type: 'SPEECH_START' })
      }
      this.actor.send({ type: 'SPEECH_END' })
      const text = await this.sttEngine.transcribe(audio, 16000)
      this.handleSttResult(text ?? '')
    } catch (err: unknown) {
      const msg = `STT error: ${errMsg(err)}`
      console.error(`[orchestrator] ${msg}`)
      this.send(IPC.ERROR, msg)
      this.actor.send({ type: 'STT_FAIL' })
    } finally {
      this.sttInProgress = false
    }
  }

  private onIpc(channel: string, handler: Parameters<typeof ipcMain.on>[1]): void {
    ipcMain.on(channel, handler)
    this.ipcCleanup.push(() => ipcMain.removeListener(channel, handler))
  }

  private handleIpc(channel: string, handler: Parameters<typeof ipcMain.handle>[1]): void {
    ipcMain.handle(channel, handler)
    this.ipcCleanup.push(() => ipcMain.removeHandler(channel))
  }

  private registerIpcHandlers(): void {
    this.onIpc(IPC.VOICE_START, () => {
      const currentState = this.actor.getSnapshot().value
      console.log(`[orchestrator] VOICE_START received, state=${currentState}`)
      if (
        currentState === 'processing' ||
        currentState === 'thinking' ||
        currentState === 'speaking'
      ) {
        // Cancel all in-progress processing and invalidate any running handleTts
        this.ttsProvider?.stop()
        this.wsClient?.cancelActiveRuns()
        this.ttsPlaying = false
        this.ttsGeneration++
        console.log(`[orchestrator] User interrupted in ${currentState}`)
      }
      this.actor.send({ type: 'SPEECH_START' })
    })

    this.onIpc(IPC.VOICE_STOP, () => {
      const currentState = this.actor.getSnapshot().value
      if (currentState !== 'idle') {
        this.ttsProvider?.stop()
        this.wsClient?.cancelActiveRuns()
        this.ttsPlaying = false
        this.ttsGeneration++
        this.sttInProgress = false
        console.log(`[orchestrator] Stop requested in ${currentState}`)
      }
      this.actor.send({ type: 'CANCEL' })
    })

    this.onIpc(IPC.VOICE_INTERRUPT, () => {
      this.ttsProvider?.stop()
      this.ttsPlaying = false
      this.ttsGeneration++
      this.actor.send({ type: 'SPEECH_START' })
    })

    this.onIpc(IPC.AUDIO_CHUNK, (_event: unknown, audio: ArrayBuffer) => {
      this.handleBatchStt(new Float32Array(audio))
    })

    this.onIpc(IPC.TTS_PLAYBACK_STARTED, () => {
      const currentState = this.actor.getSnapshot().value
      console.log(`[orchestrator] TTS playback started (state=${currentState})`)
      if (currentState === 'thinking') {
        this.actor.send({ type: 'TTS_PLAYING' })
      }
    })

    this.onIpc(IPC.TTS_PLAYBACK_DONE, () => {
      const currentState = this.actor.getSnapshot().value
      console.log(`[orchestrator] TTS playback complete (state=${currentState})`)
      this.ttsPlaying = false
      if (currentState === 'speaking' || currentState === 'thinking') {
        this.actor.send({ type: 'TTS_DONE' })
      }
    })

    this.onIpc(IPC.CHAT_SEND, (_event: unknown, text: string) => {
      const msg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        text,
        timestamp: Date.now()
      }
      this.pushMessage(msg)
      this.send(IPC.CHAT_MESSAGE, msg)
      // Transition idle → listening → processing → thinking
      const currentState = this.actor.getSnapshot().value
      if (currentState === 'idle') {
        this.actor.send({ type: 'SPEECH_START' })
      }
      this.actor.send({ type: 'SPEECH_END' })
      this.actor.send({ type: 'STT_DONE', text })

      if (!this.wsClient) {
        this.send(IPC.ERROR, 'Gateway not connected. Please set GATEWAY_TOKEN in settings.')
        this.actor.send({ type: 'CANCEL' })
        return
      }
      this.sendToGateway(text)
    })

    registerSettingsHandlers({
      keyManager: this.keyManager,
      settings: this.settings,
      ttsProvider: () => this.ttsProvider,
      initEngines: () => this.initEngines(),
      onIpc: (channel, handler) => this.onIpc(channel, handler),
      handleIpc: (channel, handler) => this.handleIpc(channel, handler)
    })

    // Connectivity checks
    this.handleIpc(IPC.GATEWAY_CHECK, async () => {
      const gatewayUrl = this.settings.get('gatewayUrl')
      try {
        return await checkGateway(this.keyManager, gatewayUrl)
      } catch (err: unknown) {
        const cause = errCause(err)
        const message =
          cause?.code === 'ECONNREFUSED' ? `Connection refused: ${gatewayUrl}` : errMsg(err)
        return { ok: false, message }
      }
    })

    this.handleIpc(IPC.STT_CHECK, async (_event, provider: string) => {
      try {
        return await checkSttProvider(this.keyManager, this.settings, provider)
      } catch (err: unknown) {
        const cause = errCause(err)
        const message =
          cause?.code === 'ECONNREFUSED'
            ? `Connection refused: ${cause?.address ?? 'unknown'}:${cause?.port ?? ''}`
            : errMsg(err)
        return { ok: false, message }
      }
    })

    this.handleIpc(IPC.TTS_CHECK, async (_event, provider: string) => {
      try {
        return await checkTtsProvider(this.keyManager, this.settings, provider)
      } catch (err: unknown) {
        const cause = errCause(err)
        const message =
          cause?.code === 'ECONNREFUSED'
            ? `Connection refused: ${cause?.address ?? 'unknown'}:${cause?.port ?? ''}`
            : errMsg(err)
        return { ok: false, message }
      }
    })

    // Session start: re-init engines + reconnect gateway after setup modal
    this.handleIpc(IPC.SESSION_START, async () => {
      console.log('[orchestrator] Session start — reinitializing engines and gateway')
      this.isFirstMessage = true
      this.initEngines()
      // Reconnect gateway if not already connected
      if (!this.wsClient) {
        try {
          await this.connectGateway()
        } catch {
          // connectGateway handles errors internally
        }
      }
    })
  }

  private pushMessage(msg: ChatMessage): void {
    this.messages.push(msg)
    if (this.messages.length > 500) {
      this.messages.splice(0, this.messages.length - 500)
    }
  }

  private send(channel: string, data: unknown): void {
    if (!this.win.isDestroyed()) {
      this.win.webContents.send(channel, data)
    }
  }
}
