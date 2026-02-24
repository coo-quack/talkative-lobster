export type VoiceState = 'idle' | 'listening' | 'processing' | 'thinking' | 'speaking'

export type InputMode = 'hands-free' | 'push-to-talk'

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
