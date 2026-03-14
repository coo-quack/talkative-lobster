import { IPC } from '../shared/ipc-channels'
import type { KeyInfo, SttProvider, TtsProviderType } from '../shared/types'
import type { KeyManager } from './keys'
import type { SettingsStore } from './settings-store'
import type { ElevenLabsTts } from './tts/elevenlabs-tts'
import type { KokoroTts } from './tts/kokoro-tts'
import type { ITtsProvider } from './tts/tts-provider'
import type { VoicevoxTts } from './tts/voicevox-tts'
import { checkForUpdate, getAppVersion } from './update-checker'

const VALID_KEY_SOURCES: ReadonlySet<KeyInfo['source']> = new Set([
  'keychain',
  'openclaw',
  'env',
  'manual'
])

// biome-ignore lint/suspicious/noExplicitAny: IPC handlers have dynamic signatures
type IpcHandler = (...args: any[]) => any

export function registerSettingsHandlers(deps: {
  keyManager: KeyManager
  settings: SettingsStore
  ttsProvider: () => ITtsProvider | null
  initEngines: () => void
  onIpc: (channel: string, handler: IpcHandler) => void
  handleIpc: (channel: string, handler: IpcHandler) => void
}): void {
  const { keyManager, settings, ttsProvider, initEngines, handleIpc } = deps

  // Key management
  handleIpc(IPC.KEYS_GET, () => {
    return keyManager.getAll()
  })

  handleIpc(IPC.KEYS_SET, (_event: unknown, name: string, value: string, source?: string) => {
    const resolvedSource =
      source && VALID_KEY_SOURCES.has(source as KeyInfo['source'])
        ? (source as KeyInfo['source'])
        : 'manual'
    keyManager.set(name, value, resolvedSource)
  })

  handleIpc(IPC.KEYS_READ_OPENCLAW, (_event: unknown, name: string) => {
    return keyManager.readFromOpenclaw(name)
  })

  handleIpc(IPC.KEYS_READ_ENV, (_event: unknown, name: string) => {
    return keyManager.readFromEnv(name)
  })

  // TTS voice & model (ElevenLabs specific)
  handleIpc(IPC.TTS_VOICE_GET, () => settings.get('ttsVoiceId'))
  handleIpc(IPC.TTS_VOICE_SET, (_event: unknown, voiceId: string) => {
    settings.set('ttsVoiceId', voiceId)
    const provider = ttsProvider()
    if (provider && 'setVoiceId' in provider) {
      ;(provider as ElevenLabsTts).setVoiceId(voiceId)
    }
    console.log(`[orchestrator] TTS voice changed to: ${voiceId}`)
  })
  handleIpc(IPC.TTS_MODEL_GET, () => settings.get('ttsModelId'))
  handleIpc(IPC.TTS_MODEL_SET, (_event: unknown, modelId: string) => {
    settings.set('ttsModelId', modelId)
    const provider = ttsProvider()
    if (provider && 'setModelId' in provider) {
      ;(provider as ElevenLabsTts).setModelId(modelId)
    }
    console.log(`[orchestrator] TTS model changed to: ${modelId}`)
  })

  // STT provider settings
  handleIpc(IPC.STT_PROVIDER_GET, () => settings.get('sttProvider'))
  handleIpc(IPC.STT_PROVIDER_SET, (_event: unknown, provider: SttProvider) => {
    settings.set('sttProvider', provider)
    initEngines()
    console.log(`[orchestrator] STT provider changed to: ${provider}`)
  })
  handleIpc(IPC.LOCAL_WHISPER_PATH_GET, () => settings.get('localWhisperPath'))
  handleIpc(IPC.LOCAL_WHISPER_PATH_SET, (_event: unknown, path: string) => {
    settings.set('localWhisperPath', path)
    if (settings.get('sttProvider') === 'localWhisper') initEngines()
    console.log(`[orchestrator] Local whisper path: ${path}`)
  })

  // TTS provider settings
  handleIpc(IPC.TTS_PROVIDER_GET, () => settings.get('ttsProvider'))
  handleIpc(IPC.TTS_PROVIDER_SET, (_event: unknown, provider: TtsProviderType) => {
    settings.set('ttsProvider', provider)
    initEngines()
    console.log(`[orchestrator] TTS provider changed to: ${provider}`)
  })
  handleIpc(IPC.VOICEVOX_URL_GET, () => settings.get('voicevoxUrl'))
  handleIpc(IPC.VOICEVOX_URL_SET, (_event: unknown, url: string) => {
    settings.set('voicevoxUrl', url)
    const provider = ttsProvider()
    if (provider && 'setUrl' in provider) {
      ;(provider as VoicevoxTts).setUrl(url)
    }
    console.log(`[orchestrator] VOICEVOX URL: ${url}`)
  })
  handleIpc(IPC.VOICEVOX_SPEAKER_GET, () => settings.get('voicevoxSpeakerId'))
  handleIpc(IPC.VOICEVOX_SPEAKER_SET, (_event: unknown, id: number) => {
    settings.set('voicevoxSpeakerId', id)
    if (settings.get('ttsProvider') === 'voicevox') initEngines()
    console.log(`[orchestrator] VOICEVOX speaker: ${id}`)
  })
  handleIpc(IPC.KOKORO_URL_GET, () => settings.get('kokoroUrl'))
  handleIpc(IPC.KOKORO_URL_SET, (_event: unknown, url: string) => {
    settings.set('kokoroUrl', url)
    const provider = ttsProvider()
    if (provider && 'setUrl' in provider) {
      ;(provider as KokoroTts).setUrl(url)
    }
    console.log(`[orchestrator] Kokoro URL: ${url}`)
  })
  handleIpc(IPC.KOKORO_VOICE_GET, () => settings.get('kokoroVoice'))
  handleIpc(IPC.KOKORO_VOICE_SET, (_event: unknown, voice: string) => {
    settings.set('kokoroVoice', voice)
    const provider = ttsProvider()
    if (provider && 'setVoice' in provider) {
      ;(provider as KokoroTts).setVoice(voice)
    }
    console.log(`[orchestrator] Kokoro voice: ${voice}`)
  })
  handleIpc(IPC.PIPER_PATH_GET, () => settings.get('piperPath'))
  handleIpc(IPC.PIPER_PATH_SET, (_event: unknown, path: string) => {
    settings.set('piperPath', path)
    if (settings.get('ttsProvider') === 'piper') initEngines()
    console.log(`[orchestrator] Piper path: ${path}`)
  })
  handleIpc(IPC.PIPER_MODEL_PATH_GET, () => settings.get('piperModelPath'))
  handleIpc(IPC.PIPER_MODEL_PATH_SET, (_event: unknown, path: string) => {
    settings.set('piperModelPath', path)
    if (settings.get('ttsProvider') === 'piper') initEngines()
    console.log(`[orchestrator] Piper model path: ${path}`)
  })

  // VAD sensitivity
  handleIpc(IPC.VAD_SENSITIVITY_GET, () => settings.get('vadSensitivity'))
  handleIpc(IPC.VAD_SENSITIVITY_SET, (_event: unknown, value: 'auto' | number) => {
    settings.set('vadSensitivity', value)
    console.log(`[orchestrator] VAD sensitivity: ${value}`)
  })

  // Gateway URL
  handleIpc(IPC.GATEWAY_URL_GET, () => settings.get('gatewayUrl'))
  handleIpc(IPC.GATEWAY_URL_SET, (_event: unknown, url: string) => {
    settings.set('gatewayUrl', url)
    console.log(`[orchestrator] Gateway URL: ${url}`)
  })

  // App version & update check
  handleIpc(IPC.APP_VERSION_GET, () => getAppVersion())
  handleIpc(IPC.UPDATE_CHECK, () => checkForUpdate())
}
