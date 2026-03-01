import { BrowserWindow, ipcMain } from 'electron'
import { createActor, type AnyActorRef } from 'xstate'
import crypto from 'node:crypto'
import { existsSync, accessSync, constants as fsConstants } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

import { IPC } from '../shared/ipc-channels'
import {
  type ChatMessage, type VoiceState, type SttProvider, type TtsProviderType,
} from '../shared/types'
import { KeyManager } from './keys'
import { SettingsStore } from './settings-store'
import { voiceMachine } from './voice-machine'
import { OpenClawClient } from './openclaw-client'
import { SttEngine, WHISPER_MODEL_SUBPATH } from './stt-engine'
import type { ITtsProvider } from './tts/tts-provider'
import { isNonSpeech } from './speech-filter'
import { ElevenLabsTts } from './tts/elevenlabs-tts'
import { VoicevoxTts } from './tts/voicevox-tts'
import { KokoroTts } from './tts/kokoro-tts'
import { PiperTts } from './tts/piper-tts'

const DEFAULT_GATEWAY_URL = 'ws://127.0.0.1:18789'
const SESSION_KEY = 'agent:main:lobster'

export class Orchestrator {
  private win: BrowserWindow
  private keyManager: KeyManager
  private settings: SettingsStore
  private actor: AnyActorRef
  private wsClient: OpenClawClient | null = null
  private sttEngine: SttEngine | null = null
  private ttsProvider: ITtsProvider | null = null
  private messages: ChatMessage[] = []
  private sttInProgress = false
  private ttsPlaying = false

  constructor(win: BrowserWindow) {
    this.win = win
    this.keyManager = new KeyManager()
    this.settings = new SettingsStore()
    this.actor = createActor(voiceMachine)

    this.actor.subscribe((snapshot) => {
      const state = snapshot.value as VoiceState
      console.log(`[orchestrator] State: ${state}`)
      this.send(IPC.VOICE_STATE_CHANGED, state)
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
    this.actor.stop()
    this.wsClient?.disconnect()
    this.wsClient = null

    // Remove all IPC handlers
    ipcMain.removeAllListeners(IPC.VOICE_START)
    ipcMain.removeAllListeners(IPC.VOICE_STOP)
    ipcMain.removeAllListeners(IPC.VOICE_INTERRUPT)
    ipcMain.removeAllListeners(IPC.AUDIO_CHUNK)
    ipcMain.removeAllListeners(IPC.TTS_PLAYBACK_STARTED)
    ipcMain.removeAllListeners(IPC.TTS_PLAYBACK_DONE)
    ipcMain.removeAllListeners(IPC.CHAT_SEND)

    ipcMain.removeHandler(IPC.KEYS_GET)
    ipcMain.removeHandler(IPC.KEYS_SET)
    ipcMain.removeHandler(IPC.KEYS_READ_OPENCLAW)
    ipcMain.removeHandler(IPC.KEYS_READ_ENV)
    ipcMain.removeHandler(IPC.TTS_VOICE_GET)
    ipcMain.removeHandler(IPC.TTS_VOICE_SET)
    ipcMain.removeHandler(IPC.TTS_MODEL_GET)
    ipcMain.removeHandler(IPC.TTS_MODEL_SET)
    ipcMain.removeHandler(IPC.STT_PROVIDER_GET)
    ipcMain.removeHandler(IPC.STT_PROVIDER_SET)
    ipcMain.removeHandler(IPC.LOCAL_WHISPER_PATH_GET)
    ipcMain.removeHandler(IPC.LOCAL_WHISPER_PATH_SET)
    ipcMain.removeHandler(IPC.TTS_PROVIDER_GET)
    ipcMain.removeHandler(IPC.TTS_PROVIDER_SET)
    ipcMain.removeHandler(IPC.VOICEVOX_URL_GET)
    ipcMain.removeHandler(IPC.VOICEVOX_URL_SET)
    ipcMain.removeHandler(IPC.VOICEVOX_SPEAKER_GET)
    ipcMain.removeHandler(IPC.VOICEVOX_SPEAKER_SET)
    ipcMain.removeHandler(IPC.KOKORO_URL_GET)
    ipcMain.removeHandler(IPC.KOKORO_URL_SET)
    ipcMain.removeHandler(IPC.KOKORO_VOICE_GET)
    ipcMain.removeHandler(IPC.KOKORO_VOICE_SET)
    ipcMain.removeHandler(IPC.PIPER_PATH_GET)
    ipcMain.removeHandler(IPC.PIPER_PATH_SET)
    ipcMain.removeHandler(IPC.PIPER_MODEL_PATH_GET)
    ipcMain.removeHandler(IPC.PIPER_MODEL_PATH_SET)
    ipcMain.removeHandler(IPC.GATEWAY_CHECK)
    ipcMain.removeHandler(IPC.STT_CHECK)
    ipcMain.removeHandler(IPC.TTS_CHECK)
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
      localWhisper: sttProv === 'localWhisper' && !!localWhisperPath,
    }

    if (sttProviders.elevenlabs || sttProviders.openaiWhisper || sttProviders.localWhisper) {
      this.sttEngine = new SttEngine({
        elevenlabsApiKey: elevenlabsKey,
        openaiApiKey: openaiKey,
        localWhisperPath: localWhisperPath || null,
        providers: sttProviders,
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
          modelId: this.settings.get('ttsModelId'),
        })
      case 'voicevox':
        return new VoicevoxTts(
          this.settings.get('voicevoxUrl'),
          this.settings.get('voicevoxSpeakerId'),
        )
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

    this.wsClient = new OpenClawClient(DEFAULT_GATEWAY_URL, token, SESSION_KEY)

    this.wsClient.on('connected', () => {
      this.send(IPC.CONNECTION_STATUS, 'connected')
    })

    this.wsClient.on('disconnected', () => {
      this.send(IPC.CONNECTION_STATUS, 'disconnected')
    })

    this.wsClient.on('error', () => {
      this.send(IPC.CONNECTION_STATUS, 'error')
    })

    this.wsClient.on('stream', (text: string) => {
      this.actor.send({ type: 'LLM_STREAM_START' })
    })

    this.wsClient.on('done', (text: string) => {
      console.log(`[orchestrator] LLM done: "${text.slice(0, 100)}..."`)
      const msg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        text,
        timestamp: Date.now(),
      }
      this.pushMessage(msg)
      this.send(IPC.CHAT_MESSAGE, msg)

      this.handleTts(text)
    })

    this.wsClient.on('chatError', (message: string) => {
      this.send(IPC.ERROR, `LLM error: ${message}`)
      this.actor.send({ type: 'CANCEL' })
    })

    try {
      await this.wsClient.connect()
    } catch (err: any) {
      this.send(IPC.CONNECTION_STATUS, 'error')
      this.send(IPC.ERROR, `Gateway connection failed: ${err?.message ?? err}`)
    }
  }

  // --- TTS: single call with streaming ---

  private async handleTts(text: string): Promise<void> {
    if (!this.ttsProvider) {
      this.actor.send({ type: 'TTS_DONE' })
      return
    }

    // Stop any currently playing TTS before starting new one
    if (this.ttsPlaying) {
      this.ttsProvider.stop()
      this.send(IPC.TTS_CANCEL, null)
      console.log('[orchestrator] Stopped previous TTS for new playback')
    }
    this.ttsPlaying = true

    let audioSent = false
    try {
      for await (const chunk of this.ttsProvider.stream(text)) {
        if (this.ttsProvider.isStopped) break
        this.send(IPC.TTS_AUDIO, new Uint8Array(chunk).buffer)
        audioSent = true
      }
    } catch (err: any) {
      const msg = err?.cause?.code === 'ECONNREFUSED'
        ? `TTS connection refused: ${err?.cause?.address ?? 'unknown'}:${err?.cause?.port ?? ''}`
        : `TTS error: ${err?.message ?? err}`
      console.error(`[orchestrator] ${msg}`)
      this.send(IPC.ERROR, msg)
    }

    this.ttsPlaying = false
    if (!this.ttsProvider.isStopped) {
      this.send(IPC.TTS_STOP, null)
    }
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
    if (text && !isNonSpeech(text)) {
      this.actor.send({ type: 'STT_DONE', text })

      const msg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        text,
        timestamp: Date.now(),
      }
      this.pushMessage(msg)
      this.send(IPC.CHAT_MESSAGE, msg)
      this.wsClient?.sendMessage(text)
    } else if (text && isNonSpeech(text)) {
      console.log(`[orchestrator] Filtered non-speech: "${text}"`)
      this.actor.send({ type: 'STT_FAIL' })
    } else {
      console.log('[orchestrator] STT: empty result')
      this.actor.send({ type: 'STT_FAIL' })
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
    } catch (err: any) {
      const msg = `STT error: ${err?.message ?? err}`
      console.error(`[orchestrator] ${msg}`)
      this.send(IPC.ERROR, msg)
      this.actor.send({ type: 'STT_FAIL' })
    } finally {
      this.sttInProgress = false
    }
  }

  private registerIpcHandlers(): void {
    ipcMain.on(IPC.VOICE_START, () => {
      const currentState = this.actor.getSnapshot().value
      console.log(`[orchestrator] VOICE_START received, state=${currentState}`)
      if (currentState === 'processing' || currentState === 'thinking' || currentState === 'speaking') {
        // Cancel all in-progress processing
        this.ttsProvider?.stop()
        this.wsClient?.cancelActiveRuns()
        this.ttsPlaying = false
        console.log(`[orchestrator] User interrupted in ${currentState}`)
      }
      this.actor.send({ type: 'SPEECH_START' })
    })

    ipcMain.on(IPC.VOICE_STOP, () => {
      const currentState = this.actor.getSnapshot().value
      if (currentState !== 'idle') {
        this.ttsProvider?.stop()
        this.wsClient?.cancelActiveRuns()
        this.ttsPlaying = false
        this.sttInProgress = false
        console.log(`[orchestrator] Stop requested in ${currentState}`)
      }
      this.actor.send({ type: 'CANCEL' })
    })

    ipcMain.on(IPC.VOICE_INTERRUPT, () => {
      this.ttsProvider?.stop()
      this.ttsPlaying = false
      this.actor.send({ type: 'SPEECH_START' })
    })

    ipcMain.on(IPC.AUDIO_CHUNK, (_event, audio: ArrayBuffer) => {
      this.handleBatchStt(new Float32Array(audio))
    })

    ipcMain.on(IPC.TTS_PLAYBACK_STARTED, () => {
      const currentState = this.actor.getSnapshot().value
      console.log(`[orchestrator] TTS playback started (state=${currentState})`)
      if (currentState === 'thinking') {
        this.actor.send({ type: 'TTS_PLAYING' })
      }
    })

    ipcMain.on(IPC.TTS_PLAYBACK_DONE, () => {
      const currentState = this.actor.getSnapshot().value
      console.log(`[orchestrator] TTS playback complete (state=${currentState})`)
      this.ttsPlaying = false
      if (currentState === 'speaking' || currentState === 'thinking') {
        this.actor.send({ type: 'TTS_DONE' })
      }
    })

    ipcMain.on(IPC.CHAT_SEND, (_event, text: string) => {
      const msg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        text,
        timestamp: Date.now(),
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
      this.wsClient?.sendMessage(text)
    })

    ipcMain.handle(IPC.KEYS_GET, () => {
      return this.keyManager.getAll()
    })

    ipcMain.handle(IPC.KEYS_SET, (_event, name: string, value: string, source?: string) => {
      this.keyManager.set(name, value, (source ?? 'manual') as 'manual')
    })

    ipcMain.handle(IPC.KEYS_READ_OPENCLAW, (_event, name: string) => {
      return this.keyManager.readFromOpenclaw(name)
    })

    ipcMain.handle(IPC.KEYS_READ_ENV, (_event, name: string) => {
      return this.keyManager.readFromEnv(name)
    })

    // TTS voice & model (ElevenLabs specific)
    ipcMain.handle(IPC.TTS_VOICE_GET, () => this.settings.get('ttsVoiceId'))
    ipcMain.handle(IPC.TTS_VOICE_SET, (_event, voiceId: string) => {
      this.settings.set('ttsVoiceId', voiceId)
      if (this.ttsProvider && 'setVoiceId' in this.ttsProvider) {
        (this.ttsProvider as ElevenLabsTts).setVoiceId(voiceId)
      }
      console.log(`[orchestrator] TTS voice changed to: ${voiceId}`)
    })
    ipcMain.handle(IPC.TTS_MODEL_GET, () => this.settings.get('ttsModelId'))
    ipcMain.handle(IPC.TTS_MODEL_SET, (_event, modelId: string) => {
      this.settings.set('ttsModelId', modelId)
      if (this.ttsProvider && 'setModelId' in this.ttsProvider) {
        (this.ttsProvider as ElevenLabsTts).setModelId(modelId)
      }
      console.log(`[orchestrator] TTS model changed to: ${modelId}`)
    })

    // STT provider settings
    ipcMain.handle(IPC.STT_PROVIDER_GET, () => this.settings.get('sttProvider'))
    ipcMain.handle(IPC.STT_PROVIDER_SET, (_event, provider: SttProvider) => {
      this.settings.set('sttProvider', provider)
      this.initEngines()
      console.log(`[orchestrator] STT provider changed to: ${provider}`)
    })
    ipcMain.handle(IPC.LOCAL_WHISPER_PATH_GET, () => this.settings.get('localWhisperPath'))
    ipcMain.handle(IPC.LOCAL_WHISPER_PATH_SET, (_event, path: string) => {
      this.settings.set('localWhisperPath', path)
      if (this.settings.get('sttProvider') === 'localWhisper') this.initEngines()
      console.log(`[orchestrator] Local whisper path: ${path}`)
    })

    // TTS provider settings
    ipcMain.handle(IPC.TTS_PROVIDER_GET, () => this.settings.get('ttsProvider'))
    ipcMain.handle(IPC.TTS_PROVIDER_SET, (_event, provider: TtsProviderType) => {
      this.settings.set('ttsProvider', provider)
      this.initEngines()
      console.log(`[orchestrator] TTS provider changed to: ${provider}`)
    })
    ipcMain.handle(IPC.VOICEVOX_URL_GET, () => this.settings.get('voicevoxUrl'))
    ipcMain.handle(IPC.VOICEVOX_URL_SET, (_event, url: string) => {
      this.settings.set('voicevoxUrl', url)
      if (this.ttsProvider instanceof VoicevoxTts) {
        this.ttsProvider.setUrl(url)
      }
      console.log(`[orchestrator] VOICEVOX URL: ${url}`)
    })
    ipcMain.handle(IPC.VOICEVOX_SPEAKER_GET, () => this.settings.get('voicevoxSpeakerId'))
    ipcMain.handle(IPC.VOICEVOX_SPEAKER_SET, (_event, id: number) => {
      this.settings.set('voicevoxSpeakerId', id)
      if (this.settings.get('ttsProvider') === 'voicevox') this.initEngines()
      console.log(`[orchestrator] VOICEVOX speaker: ${id}`)
    })
    ipcMain.handle(IPC.KOKORO_URL_GET, () => this.settings.get('kokoroUrl'))
    ipcMain.handle(IPC.KOKORO_URL_SET, (_event, url: string) => {
      this.settings.set('kokoroUrl', url)
      if (this.ttsProvider instanceof KokoroTts) {
        this.ttsProvider.setUrl(url)
      }
      console.log(`[orchestrator] Kokoro URL: ${url}`)
    })
    ipcMain.handle(IPC.KOKORO_VOICE_GET, () => this.settings.get('kokoroVoice'))
    ipcMain.handle(IPC.KOKORO_VOICE_SET, (_event, voice: string) => {
      this.settings.set('kokoroVoice', voice)
      if (this.ttsProvider instanceof KokoroTts) {
        this.ttsProvider.setVoice(voice)
      }
      console.log(`[orchestrator] Kokoro voice: ${voice}`)
    })
    ipcMain.handle(IPC.PIPER_PATH_GET, () => this.settings.get('piperPath'))
    ipcMain.handle(IPC.PIPER_PATH_SET, (_event, path: string) => {
      this.settings.set('piperPath', path)
      if (this.settings.get('ttsProvider') === 'piper') this.initEngines()
      console.log(`[orchestrator] Piper path: ${path}`)
    })
    ipcMain.handle(IPC.PIPER_MODEL_PATH_GET, () => this.settings.get('piperModelPath'))
    ipcMain.handle(IPC.PIPER_MODEL_PATH_SET, (_event, path: string) => {
      this.settings.set('piperModelPath', path)
      if (this.settings.get('ttsProvider') === 'piper') this.initEngines()
      console.log(`[orchestrator] Piper model path: ${path}`)
    })

    // Connectivity checks
    ipcMain.handle(IPC.GATEWAY_CHECK, async () => {
      try {
        return await this.checkGateway()
      } catch (err: any) {
        const message = err?.cause?.code === 'ECONNREFUSED'
          ? `Connection refused: ${DEFAULT_GATEWAY_URL}`
          : err?.message ?? String(err)
        return { ok: false, message }
      }
    })

    ipcMain.handle(IPC.STT_CHECK, async (_event, provider: string) => {
      try {
        return await this.checkSttProvider(provider)
      } catch (err: any) {
        const message = err?.cause?.code === 'ECONNREFUSED'
          ? `Connection refused: ${err?.cause?.address ?? 'unknown'}:${err?.cause?.port ?? ''}`
          : err?.message ?? String(err)
        return { ok: false, message }
      }
    })

    ipcMain.handle(IPC.TTS_CHECK, async (_event, provider: string) => {
      try {
        return await this.checkTtsProvider(provider)
      } catch (err: any) {
        const message = err?.cause?.code === 'ECONNREFUSED'
          ? `Connection refused: ${err?.cause?.address ?? 'unknown'}:${err?.cause?.port ?? ''}`
          : err?.message ?? String(err)
        return { ok: false, message }
      }
    })
  }

  private async checkGateway(): Promise<{ ok: boolean; message: string }> {
    const token = this.keyManager.get('GATEWAY_TOKEN')
    if (!token) return { ok: false, message: 'GATEWAY_TOKEN is not set' }
    // Convert ws:// to http:// for a simple health check
    const httpUrl = DEFAULT_GATEWAY_URL.replace(/^ws/, 'http')
    const res = await fetch(httpUrl)
    if (!res.ok) return { ok: false, message: `Gateway error: ${res.status}` }
    return { ok: true, message: 'Gateway connected' }
  }

  private async checkSttProvider(provider: string): Promise<{ ok: boolean; message: string }> {
    switch (provider) {
      case 'elevenlabs': {
        const key = this.keyManager.get('ELEVENLABS_API_KEY')
        if (!key) return { ok: false, message: 'ELEVENLABS_API_KEY is not set' }
        const res = await fetch('https://api.elevenlabs.io/v1/user', {
          headers: { 'xi-api-key': key },
        })
        if (!res.ok) return { ok: false, message: `ElevenLabs API error: ${res.status}` }
        return { ok: true, message: 'ElevenLabs API connected' }
      }
      case 'openaiWhisper': {
        const key = this.keyManager.get('OPENAI_API_KEY')
        if (!key) return { ok: false, message: 'OPENAI_API_KEY is not set' }
        const res = await fetch('https://api.openai.com/v1/models', {
          headers: { Authorization: `Bearer ${key}` },
        })
        if (!res.ok) return { ok: false, message: `OpenAI API error: ${res.status}` }
        return { ok: true, message: 'OpenAI API connected' }
      }
      case 'localWhisper': {
        const bin = this.settings.get('localWhisperPath')?.trim()
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

  private async checkTtsProvider(provider: string): Promise<{ ok: boolean; message: string }> {
    switch (provider) {
      case 'elevenlabs': {
        const key = this.keyManager.get('ELEVENLABS_API_KEY')
        if (!key) return { ok: false, message: 'ELEVENLABS_API_KEY is not set' }
        const res = await fetch('https://api.elevenlabs.io/v1/user', {
          headers: { 'xi-api-key': key },
        })
        if (!res.ok) return { ok: false, message: `ElevenLabs API error: ${res.status}` }
        return { ok: true, message: 'ElevenLabs API connected' }
      }
      case 'voicevox': {
        const url = this.settings.get('voicevoxUrl') || 'http://localhost:50021'
        const res = await fetch(`${url}/version`)
        if (!res.ok) return { ok: false, message: `VOICEVOX error: ${res.status}` }
        const version = await res.text()
        return { ok: true, message: `VOICEVOX v${version.replace(/"/g, '')}` }
      }
      case 'kokoro': {
        const url = this.settings.get('kokoroUrl') || 'http://localhost:8880'
        const res = await fetch(`${url}/v1/models`)
        if (!res.ok) return { ok: false, message: `Kokoro error: ${res.status}` }
        return { ok: true, message: 'Kokoro API connected' }
      }
      case 'piper': {
        const bin = this.settings.get('piperPath')?.trim()
        const model = this.settings.get('piperModelPath')?.trim()
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
