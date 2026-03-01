import { contextBridge, ipcRenderer } from 'electron'
import { IPC } from '../shared/ipc-channels'
import type { VoiceState, KeyInfo, SttProvider, TtsProviderType } from '../shared/types'

type UnsubscribeFn = () => void

const api = {
  // Voice control
  voiceStart: (): void => ipcRenderer.send(IPC.VOICE_START),
  voiceStop: (): void => ipcRenderer.send(IPC.VOICE_STOP),
  voiceInterrupt: (): void => ipcRenderer.send(IPC.VOICE_INTERRUPT),
  onVoiceStateChanged: (callback: (state: VoiceState) => void): UnsubscribeFn => {
    const handler = (_event: Electron.IpcRendererEvent, state: VoiceState): void => callback(state)
    ipcRenderer.on(IPC.VOICE_STATE_CHANGED, handler)
    return () => ipcRenderer.removeListener(IPC.VOICE_STATE_CHANGED, handler)
  },

  // Audio data (legacy batch mode)
  sendAudioChunk: (audio: Float32Array): void => {
    ipcRenderer.send(IPC.AUDIO_CHUNK, audio.buffer)
  },
  // TTS audio
  onTtsFormat: (
    callback: (format: { type: string; sampleRate?: number; channels?: number; bitDepth?: number }) => void
  ): UnsubscribeFn => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      format: { type: string; sampleRate?: number; channels?: number; bitDepth?: number }
    ): void => callback(format)
    ipcRenderer.on(IPC.TTS_FORMAT, handler)
    return () => ipcRenderer.removeListener(IPC.TTS_FORMAT, handler)
  },
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
  onTtsCancel: (callback: () => void): UnsubscribeFn => {
    const handler = (): void => callback()
    ipcRenderer.on(IPC.TTS_CANCEL, handler)
    return () => ipcRenderer.removeListener(IPC.TTS_CANCEL, handler)
  },
  ttsPlaybackStarted: (): void => ipcRenderer.send(IPC.TTS_PLAYBACK_STARTED),
  ttsPlaybackDone: (): void => ipcRenderer.send(IPC.TTS_PLAYBACK_DONE),

  // Keys management
  getKeys: (): Promise<KeyInfo[]> => ipcRenderer.invoke(IPC.KEYS_GET),
  setKey: (name: string, value: string): Promise<void> =>
    ipcRenderer.invoke(IPC.KEYS_SET, name, value),
  readKeyFromOpenclaw: (name: string): Promise<string | null> =>
    ipcRenderer.invoke(IPC.KEYS_READ_OPENCLAW, name),
  readKeyFromEnv: (name: string): Promise<string | null> =>
    ipcRenderer.invoke(IPC.KEYS_READ_ENV, name),
  // TTS Voice & Model
  getTtsVoice: (): Promise<string> => ipcRenderer.invoke(IPC.TTS_VOICE_GET),
  setTtsVoice: (voiceId: string): Promise<void> => ipcRenderer.invoke(IPC.TTS_VOICE_SET, voiceId),
  getTtsModel: (): Promise<string> => ipcRenderer.invoke(IPC.TTS_MODEL_GET),
  setTtsModel: (modelId: string): Promise<void> => ipcRenderer.invoke(IPC.TTS_MODEL_SET, modelId),

  // STT provider settings
  getSttProvider: (): Promise<SttProvider> => ipcRenderer.invoke(IPC.STT_PROVIDER_GET),
  setSttProvider: (provider: SttProvider): Promise<void> =>
    ipcRenderer.invoke(IPC.STT_PROVIDER_SET, provider),
  getLocalWhisperPath: (): Promise<string> => ipcRenderer.invoke(IPC.LOCAL_WHISPER_PATH_GET),
  setLocalWhisperPath: (path: string): Promise<void> =>
    ipcRenderer.invoke(IPC.LOCAL_WHISPER_PATH_SET, path),

  // TTS provider settings
  getTtsProvider: (): Promise<TtsProviderType> => ipcRenderer.invoke(IPC.TTS_PROVIDER_GET),
  setTtsProvider: (provider: TtsProviderType): Promise<void> =>
    ipcRenderer.invoke(IPC.TTS_PROVIDER_SET, provider),
  getVoicevoxUrl: (): Promise<string> => ipcRenderer.invoke(IPC.VOICEVOX_URL_GET),
  setVoicevoxUrl: (url: string): Promise<void> => ipcRenderer.invoke(IPC.VOICEVOX_URL_SET, url),
  getKokoroUrl: (): Promise<string> => ipcRenderer.invoke(IPC.KOKORO_URL_GET),
  setKokoroUrl: (url: string): Promise<void> => ipcRenderer.invoke(IPC.KOKORO_URL_SET, url),
  getKokoroVoice: (): Promise<string> => ipcRenderer.invoke(IPC.KOKORO_VOICE_GET),
  setKokoroVoice: (voice: string): Promise<void> => ipcRenderer.invoke(IPC.KOKORO_VOICE_SET, voice),
  getPiperPath: (): Promise<string> => ipcRenderer.invoke(IPC.PIPER_PATH_GET),
  setPiperPath: (path: string): Promise<void> => ipcRenderer.invoke(IPC.PIPER_PATH_SET, path),
  getPiperModelPath: (): Promise<string> => ipcRenderer.invoke(IPC.PIPER_MODEL_PATH_GET),
  setPiperModelPath: (path: string): Promise<void> =>
    ipcRenderer.invoke(IPC.PIPER_MODEL_PATH_SET, path),
  getVoicevoxSpeaker: (): Promise<number> => ipcRenderer.invoke(IPC.VOICEVOX_SPEAKER_GET),
  setVoicevoxSpeaker: (id: number): Promise<void> =>
    ipcRenderer.invoke(IPC.VOICEVOX_SPEAKER_SET, id),

  // Connectivity checks
  checkGateway: (): Promise<{ ok: boolean; message: string }> =>
    ipcRenderer.invoke(IPC.GATEWAY_CHECK),
  checkTtsProvider: (provider: string): Promise<{ ok: boolean; message: string }> =>
    ipcRenderer.invoke(IPC.TTS_CHECK, provider),
  checkSttProvider: (provider: string): Promise<{ ok: boolean; message: string }> =>
    ipcRenderer.invoke(IPC.STT_CHECK, provider),

  // Error notification
  onError: (callback: (message: string) => void): UnsubscribeFn => {
    const handler = (_event: Electron.IpcRendererEvent, message: string): void => callback(message)
    ipcRenderer.on(IPC.ERROR, handler)
    return () => ipcRenderer.removeListener(IPC.ERROR, handler)
  },

  // Connection status
  onConnectionStatus: (callback: (status: string) => void): UnsubscribeFn => {
    const handler = (_event: Electron.IpcRendererEvent, status: string): void => callback(status)
    ipcRenderer.on(IPC.CONNECTION_STATUS, handler)
    return () => ipcRenderer.removeListener(IPC.CONNECTION_STATUS, handler)
  }
}

export type LobsterAPI = typeof api

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('lobster', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // biome-ignore lint/suspicious/noTsIgnore: window.lobster defined in index.d.ts but not visible in all tsconfigs
  // @ts-ignore
  window.lobster = api
}
