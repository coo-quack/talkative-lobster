import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc-channels'
import type { VoiceState, ChatMessage, KeyInfo, AppConfig } from '../shared/types'

type UnsubscribeFn = () => void

const api = {
  // Voice control
  voiceStart: (): Promise<void> => ipcRenderer.invoke(IPC.VOICE_START),
  voiceStop: (): Promise<void> => ipcRenderer.invoke(IPC.VOICE_STOP),
  voiceInterrupt: (): Promise<void> => ipcRenderer.invoke(IPC.VOICE_INTERRUPT),
  onVoiceStateChanged: (callback: (state: VoiceState) => void): UnsubscribeFn => {
    const handler = (_event: Electron.IpcRendererEvent, state: VoiceState): void => callback(state)
    ipcRenderer.on(IPC.VOICE_STATE_CHANGED, handler)
    return () => ipcRenderer.removeListener(IPC.VOICE_STATE_CHANGED, handler)
  },

  // Audio level
  onAudioLevel: (callback: (level: number) => void): UnsubscribeFn => {
    const handler = (_event: Electron.IpcRendererEvent, level: number): void => callback(level)
    ipcRenderer.on(IPC.AUDIO_LEVEL, handler)
    return () => ipcRenderer.removeListener(IPC.AUDIO_LEVEL, handler)
  },

  // Chat
  chatSend: (text: string): Promise<void> => ipcRenderer.invoke(IPC.CHAT_SEND, text),
  onChatMessage: (callback: (message: ChatMessage) => void): UnsubscribeFn => {
    const handler = (_event: Electron.IpcRendererEvent, message: ChatMessage): void =>
      callback(message)
    ipcRenderer.on(IPC.CHAT_MESSAGE, handler)
    return () => ipcRenderer.removeListener(IPC.CHAT_MESSAGE, handler)
  },
  onChatStream: (callback: (chunk: string) => void): UnsubscribeFn => {
    const handler = (_event: Electron.IpcRendererEvent, chunk: string): void => callback(chunk)
    ipcRenderer.on(IPC.CHAT_STREAM, handler)
    return () => ipcRenderer.removeListener(IPC.CHAT_STREAM, handler)
  },
  getChatHistory: (): Promise<ChatMessage[]> => ipcRenderer.invoke(IPC.CHAT_HISTORY),

  // TTS audio
  onTtsAudio: (callback: (audioData: ArrayBuffer) => void): UnsubscribeFn => {
    const handler = (_event: Electron.IpcRendererEvent, audioData: ArrayBuffer): void =>
      callback(audioData)
    ipcRenderer.on(IPC.TTS_AUDIO, handler)
    return () => ipcRenderer.removeListener(IPC.TTS_AUDIO, handler)
  },
  onTtsStop: (callback: () => void): UnsubscribeFn => {
    const handler = (): void => callback()
    ipcRenderer.on(IPC.TTS_STOP, handler)
    return () => ipcRenderer.removeListener(IPC.TTS_STOP, handler)
  },

  // Keys management
  getKeys: (): Promise<KeyInfo[]> => ipcRenderer.invoke(IPC.KEYS_GET),
  setKey: (name: string, value: string): Promise<void> =>
    ipcRenderer.invoke(IPC.KEYS_SET, name, value),
  readKeyFromOpenclaw: (name: string): Promise<KeyInfo> =>
    ipcRenderer.invoke(IPC.KEYS_READ_OPENCLAW, name),
  readKeyFromEnv: (name: string): Promise<KeyInfo> =>
    ipcRenderer.invoke(IPC.KEYS_READ_ENV, name),
  validateKey: (name: string): Promise<boolean> => ipcRenderer.invoke(IPC.KEYS_VALIDATE, name),

  // Config
  getConfig: (): Promise<AppConfig> => ipcRenderer.invoke(IPC.CONFIG_GET),
  setConfig: (config: Partial<AppConfig>): Promise<void> =>
    ipcRenderer.invoke(IPC.CONFIG_SET, config),

  // Connection status
  onConnectionStatus: (callback: (connected: boolean) => void): UnsubscribeFn => {
    const handler = (_event: Electron.IpcRendererEvent, connected: boolean): void =>
      callback(connected)
    ipcRenderer.on(IPC.CONNECTION_STATUS, handler)
    return () => ipcRenderer.removeListener(IPC.CONNECTION_STATUS, handler)
  },
}

export type BudgieAPI = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('budgie', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.budgie = api
}
