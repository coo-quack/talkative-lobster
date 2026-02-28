export type VoiceState = 'idle' | 'listening' | 'processing' | 'thinking' | 'speaking'

export type InputMode = 'hands-free' | 'push-to-talk'

// STT Provider
export type SttProvider = 'elevenlabs' | 'openaiWhisper' | 'localWhisper'

export const STT_PROVIDERS: { id: SttProvider; name: string }[] = [
  { id: 'elevenlabs', name: 'ElevenLabs Scribe' },
  { id: 'openaiWhisper', name: 'OpenAI Whisper' },
  { id: 'localWhisper', name: 'whisper.cpp (Local)' },
]

export const DEFAULT_STT_PROVIDER: SttProvider = 'elevenlabs'

// TTS Provider
export type TtsProviderType = 'elevenlabs' | 'voicevox' | 'kokoro' | 'piper'

export const TTS_PROVIDER_OPTIONS: { id: TtsProviderType; name: string }[] = [
  { id: 'elevenlabs', name: 'ElevenLabs' },
  { id: 'voicevox', name: 'VOICEVOX' },
  { id: 'kokoro', name: 'Kokoro' },
  { id: 'piper', name: 'Piper' },
]

export const DEFAULT_TTS_PROVIDER: TtsProviderType = 'elevenlabs'

// Kokoro voice options
export interface KokoroVoiceOption {
  id: string
  name: string
  lang: string
}

export const KOKORO_VOICES: KokoroVoiceOption[] = [
  { id: 'jf_alpha', name: 'Alpha (Female)', lang: 'ja' },
  { id: 'jf_gongitsune', name: 'Gongitsune (Female)', lang: 'ja' },
  { id: 'jf_nezumi', name: 'Nezumi (Female)', lang: 'ja' },
  { id: 'jf_tebukuro', name: 'Tebukuro (Female)', lang: 'ja' },
  { id: 'jm_kumo', name: 'Kumo (Male)', lang: 'ja' },
  { id: 'af_heart', name: 'Heart (Female)', lang: 'en' },
  { id: 'af_jadzia', name: 'Jadzia (Female)', lang: 'en' },
  { id: 'af_jessica', name: 'Jessica (Female)', lang: 'en' },
]

export const DEFAULT_KOKORO_VOICE = 'jf_alpha'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  timestamp: number
}

export interface AppConfig {
  gatewayUrl: string
  sessionKey: string
  inputMode: InputMode
  sttProviders: SttProviderConfig
  ttsVoiceId?: string
}

export interface SttProviderConfig {
  elevenlabs: boolean
  openaiWhisper: boolean
  localWhisper: boolean
  webSpeech: boolean
}

export interface KeyInfo {
  name: string
  isSet: boolean
  source: 'keychain' | 'openclaw' | 'env' | 'manual' | null
}

export interface TtsVoiceOption {
  id: string
  name: string
  lang: string
}

export const TTS_VOICES: TtsVoiceOption[] = [
  { id: '8EkOjt4xTPGMclNlh1pk', name: 'Morioki', lang: 'ja' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily', lang: 'multilingual' },
  { id: 'Xb7hH8MSUJpSbSDYk0k2', name: 'Alice', lang: 'multilingual' },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', lang: 'multilingual' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', lang: 'multilingual' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', lang: 'multilingual' },
  { id: 'nPczCjzI2devNBz1zQrb', name: 'Brian', lang: 'multilingual' },
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', lang: 'multilingual' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', lang: 'multilingual' },
]

export const DEFAULT_TTS_VOICE_ID = 'pFZP5JQG7iQjIQuC4Bku'

export interface TtsModelOption {
  id: string
  name: string
  description: string
}

export const TTS_MODELS: TtsModelOption[] = [
  { id: 'eleven_multilingual_v2', name: 'Multilingual v2', description: 'Highest quality' },
  { id: 'eleven_turbo_v2_5', name: 'Turbo v2.5', description: 'Balanced' },
  { id: 'eleven_flash_v2_5', name: 'Flash v2.5', description: 'Fastest' },
]

export const DEFAULT_TTS_MODEL_ID = 'eleven_multilingual_v2'
