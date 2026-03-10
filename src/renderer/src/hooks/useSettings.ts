import { useState, useEffect } from 'react'
import {
  DEFAULT_TTS_VOICE_ID,
  DEFAULT_TTS_MODEL_ID,
  DEFAULT_STT_PROVIDER,
  DEFAULT_TTS_PROVIDER,
  DEFAULT_KOKORO_VOICE,
  type SttProvider,
  type TtsProviderType
} from '../../../shared/types'

export interface SettingsState {
  selectedVoice: string
  selectedModel: string
  sttProvider: SttProvider
  ttsProvider: TtsProviderType
  localWhisperPath: string
  voicevoxUrl: string
  kokoroUrl: string
  piperPath: string
  piperModelPath: string
  voicevoxSpeakerId: number
  kokoroVoice: string
  vadSensitivity: 'auto' | number
  settingsLoaded: boolean
}

export interface SettingsActions {
  setSelectedVoice: (v: string) => void
  setSelectedModel: (v: string) => void
  setSttProvider: (v: SttProvider) => void
  setTtsProvider: (v: TtsProviderType) => void
  setLocalWhisperPath: (v: string) => void
  setVoicevoxUrl: (v: string) => void
  setKokoroUrl: (v: string) => void
  setPiperPath: (v: string) => void
  setPiperModelPath: (v: string) => void
  setVoicevoxSpeakerId: (v: number) => void
  setKokoroVoice: (v: string) => void
  setVadSensitivity: (v: 'auto' | number) => void
}

export function useSettings(): SettingsState & SettingsActions {
  const [selectedVoice, setSelectedVoice] = useState(DEFAULT_TTS_VOICE_ID)
  const [selectedModel, setSelectedModel] = useState(DEFAULT_TTS_MODEL_ID)
  const [sttProvider, setSttProvider] = useState<SttProvider>(DEFAULT_STT_PROVIDER)
  const [ttsProvider, setTtsProvider] = useState<TtsProviderType>(DEFAULT_TTS_PROVIDER)
  const [localWhisperPath, setLocalWhisperPath] = useState('')
  const [voicevoxUrl, setVoicevoxUrl] = useState('http://localhost:50021')
  const [kokoroUrl, setKokoroUrl] = useState('http://localhost:8880')
  const [piperPath, setPiperPath] = useState('')
  const [piperModelPath, setPiperModelPath] = useState('')
  const [voicevoxSpeakerId, setVoicevoxSpeakerId] = useState(1)
  const [kokoroVoice, setKokoroVoice] = useState(DEFAULT_KOKORO_VOICE)
  const [vadSensitivity, setVadSensitivity] = useState<'auto' | number>('auto')
  const [settingsLoaded, setSettingsLoaded] = useState(false)

  useEffect(() => {
    Promise.all([
      window.lobster.getTtsVoice().then(setSelectedVoice),
      window.lobster.getTtsModel().then(setSelectedModel),
      window.lobster.getSttProvider().then(setSttProvider),
      window.lobster.getTtsProvider().then(setTtsProvider),
      window.lobster.getLocalWhisperPath().then(setLocalWhisperPath),
      window.lobster.getVoicevoxUrl().then(setVoicevoxUrl),
      window.lobster.getKokoroUrl().then(setKokoroUrl),
      window.lobster.getPiperPath().then(setPiperPath),
      window.lobster.getPiperModelPath().then(setPiperModelPath),
      window.lobster.getVoicevoxSpeaker().then(setVoicevoxSpeakerId),
      window.lobster.getKokoroVoice().then(setKokoroVoice),
      window.lobster.getVadSensitivity?.()?.then(setVadSensitivity) ?? Promise.resolve()
    ]).then(() => setSettingsLoaded(true))
  }, [])

  return {
    selectedVoice,
    setSelectedVoice,
    selectedModel,
    setSelectedModel,
    sttProvider,
    setSttProvider,
    ttsProvider,
    setTtsProvider,
    localWhisperPath,
    setLocalWhisperPath,
    voicevoxUrl,
    setVoicevoxUrl,
    kokoroUrl,
    setKokoroUrl,
    piperPath,
    setPiperPath,
    piperModelPath,
    setPiperModelPath,
    voicevoxSpeakerId,
    setVoicevoxSpeakerId,
    kokoroVoice,
    setKokoroVoice,
    vadSensitivity,
    setVadSensitivity,
    settingsLoaded
  }
}
