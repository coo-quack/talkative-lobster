import { BrowserWindow, ipcMain } from 'electron'
import { createActor, type AnyActorRef } from 'xstate'
import crypto from 'node:crypto'

import { IPC } from '../shared/ipc-channels'
import type { ChatMessage, VoiceState } from '../shared/types'
import { KeyManager } from './keys'
import { voiceMachine } from './voice-machine'
import { OpenClawClient } from './openclaw-client'
import { SttEngine } from './stt-engine'
import { TtsEngine } from './tts-engine'

const DEFAULT_GATEWAY_URL = 'ws://127.0.0.1:18789'
const SESSION_KEY = 'agent:main:budgie'

export class Orchestrator {
  private win: BrowserWindow
  private keyManager: KeyManager
  private actor: AnyActorRef
  private wsClient: OpenClawClient | null = null
  private sttEngine: SttEngine | null = null
  private ttsEngine: TtsEngine | null = null
  private messages: ChatMessage[] = []

  constructor(win: BrowserWindow) {
    this.win = win
    this.keyManager = new KeyManager()
    this.actor = createActor(voiceMachine)

    this.actor.subscribe((snapshot) => {
      const state = snapshot.value as VoiceState
      this.send(IPC.VOICE_STATE_CHANGED, state)
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
  }

  private initEngines(): void {
    const elevenlabsKey = this.keyManager.get('ELEVENLABS_API_KEY')
    const openaiKey = this.keyManager.get('OPENAI_API_KEY')

    if (elevenlabsKey) {
      this.sttEngine = new SttEngine({
        elevenlabsApiKey: elevenlabsKey,
        openaiApiKey: openaiKey,
        localWhisperPath: null,
        providers: {
          elevenlabs: !!elevenlabsKey,
          openaiWhisper: !!openaiKey,
          localWhisper: false,
          webSpeech: false,
        },
      })

      this.ttsEngine = new TtsEngine({
        apiKey: elevenlabsKey,
        voiceId: 'EXAVITQu4vr4xnSDxMaL', // default voice
      })
    } else if (openaiKey) {
      this.sttEngine = new SttEngine({
        elevenlabsApiKey: null,
        openaiApiKey: openaiKey,
        localWhisperPath: null,
        providers: {
          elevenlabs: false,
          openaiWhisper: true,
          localWhisper: false,
          webSpeech: false,
        },
      })
    }
  }

  private async connectGateway(): Promise<void> {
    const token = this.keyManager.get('GATEWAY_TOKEN')
    if (!token) {
      this.send(IPC.CONNECTION_STATUS, 'no-token')
      return
    }

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
      this.send(IPC.CHAT_STREAM, text)
      this.actor.send({ type: 'LLM_STREAM_START' })
    })

    this.wsClient.on('done', (text: string) => {
      const msg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        text,
        timestamp: Date.now(),
      }
      this.messages.push(msg)
      this.send(IPC.CHAT_MESSAGE, msg)
      this.handleTts(text)
    })

    try {
      await this.wsClient.connect()
    } catch {
      this.send(IPC.CONNECTION_STATUS, 'error')
    }
  }

  private async handleStt(audio: Float32Array): Promise<void> {
    if (!this.sttEngine) return

    const text = await this.sttEngine.transcribe(audio, 16000)
    if (text) {
      this.actor.send({ type: 'SPEECH_END' })
      this.actor.send({ type: 'STT_DONE', text })

      const msg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        text,
        timestamp: Date.now(),
      }
      this.messages.push(msg)
      this.send(IPC.CHAT_MESSAGE, msg)
      this.wsClient?.sendMessage(text)
    } else {
      this.actor.send({ type: 'STT_FAIL' })
    }
  }

  private async handleTts(text: string): Promise<void> {
    if (!this.ttsEngine) {
      this.actor.send({ type: 'TTS_DONE' })
      return
    }

    try {
      for await (const chunk of this.ttsEngine.stream(text)) {
        if (this.ttsEngine.isStopped) break
        this.send(IPC.TTS_AUDIO, chunk)
      }
    } catch {
      // TTS failure, still transition state
    }

    this.actor.send({ type: 'TTS_DONE' })
  }

  private registerIpcHandlers(): void {
    ipcMain.on(IPC.VOICE_START, () => {
      this.actor.send({ type: 'SPEECH_START' })
    })

    ipcMain.on(IPC.VOICE_STOP, () => {
      this.actor.send({ type: 'CANCEL' })
    })

    ipcMain.on(IPC.VOICE_INTERRUPT, () => {
      this.ttsEngine?.stop()
      this.send(IPC.TTS_STOP, null)
      this.actor.send({ type: 'INTERRUPT' })
    })

    ipcMain.on(IPC.AUDIO_CHUNK, (_event, audio: Float32Array) => {
      this.handleStt(audio)
    })

    ipcMain.on(IPC.CHAT_SEND, (_event, text: string) => {
      const msg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        text,
        timestamp: Date.now(),
      }
      this.messages.push(msg)
      this.send(IPC.CHAT_MESSAGE, msg)
      this.actor.send({ type: 'SPEECH_END' })
      this.actor.send({ type: 'STT_DONE', text })
      this.wsClient?.sendMessage(text)
    })

    ipcMain.handle(IPC.CHAT_HISTORY, () => {
      return this.messages
    })

    ipcMain.handle(IPC.KEYS_GET, () => {
      return this.keyManager.getAll()
    })

    ipcMain.handle(IPC.KEYS_SET, (_event, name: string, value: string, source: string) => {
      this.keyManager.set(name, value, source as 'manual')
    })

    ipcMain.handle(IPC.KEYS_READ_OPENCLAW, (_event, name: string) => {
      return this.keyManager.readFromOpenclaw(name)
    })

    ipcMain.handle(IPC.KEYS_READ_ENV, (_event, name: string) => {
      return this.keyManager.readFromEnv(name)
    })
  }

  private send(channel: string, data: unknown): void {
    if (!this.win.isDestroyed()) {
      this.win.webContents.send(channel, data)
    }
  }
}
