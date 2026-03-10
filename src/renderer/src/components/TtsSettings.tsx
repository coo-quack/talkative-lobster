import { useState } from 'react'
import { KeyInput } from './KeyInput'
import { ConnectivityCheck } from './ConnectivityCheck'
import {
  TTS_PROVIDER_OPTIONS,
  TTS_MODELS,
  TTS_VOICES,
  KOKORO_VOICES,
  type TtsProviderType,
  type KeyInfo
} from '../../../shared/types'

interface Props {
  keys: KeyInfo[]
  inputs: Record<string, string>
  setInputs: React.Dispatch<React.SetStateAction<Record<string, string>>>
  refresh: () => Promise<void>
  ttsProvider: TtsProviderType
  setTtsProvider: (p: TtsProviderType) => void
  selectedVoice: string
  setSelectedVoice: (v: string) => void
  selectedModel: string
  setSelectedModel: (v: string) => void
  voicevoxUrl: string
  setVoicevoxUrl: (v: string) => void
  voicevoxSpeakerId: number
  setVoicevoxSpeakerId: (v: number) => void
  kokoroUrl: string
  setKokoroUrl: (v: string) => void
  kokoroVoice: string
  setKokoroVoice: (v: string) => void
  piperPath: string
  setPiperPath: (v: string) => void
  piperModelPath: string
  setPiperModelPath: (v: string) => void
  checkStatus: { ok: boolean; message: string } | null
  setCheckStatus: (s: { ok: boolean; message: string } | null) => void
}

export function TtsSettings({
  keys,
  inputs,
  setInputs,
  refresh,
  ttsProvider,
  setTtsProvider,
  selectedVoice,
  setSelectedVoice,
  selectedModel,
  setSelectedModel,
  voicevoxUrl,
  setVoicevoxUrl,
  voicevoxSpeakerId,
  setVoicevoxSpeakerId,
  kokoroUrl,
  setKokoroUrl,
  kokoroVoice,
  setKokoroVoice,
  piperPath,
  setPiperPath,
  piperModelPath,
  setPiperModelPath,
  checkStatus,
  setCheckStatus
}: Props) {
  const [checking, setChecking] = useState(false)

  const keyIsSet = (name: string) => {
    const k = keys.find((k) => k.name === name)
    return !!(k?.isSet || inputs[name])
  }

  const readFrom = async (name: string, source: 'openclaw' | 'env') => {
    const value =
      source === 'openclaw'
        ? await window.lobster.readKeyFromOpenclaw(name)
        : await window.lobster.readKeyFromEnv(name)
    if (value) {
      setInputs((prev) => ({ ...prev, [name]: value }))
    }
  }

  const check = async () => {
    setChecking(true)
    setCheckStatus(null)
    try {
      if (ttsProvider === 'elevenlabs' && inputs.ELEVENLABS_API_KEY) {
        await window.lobster.setKey('ELEVENLABS_API_KEY', inputs.ELEVENLABS_API_KEY)
      }
      await refresh()
      await window.lobster.setTtsProvider(ttsProvider)
      if (ttsProvider === 'voicevox') await window.lobster.setVoicevoxUrl(voicevoxUrl)
      if (ttsProvider === 'kokoro') await window.lobster.setKokoroUrl(kokoroUrl)
      if (ttsProvider === 'piper') {
        await window.lobster.setPiperPath(piperPath)
        await window.lobster.setPiperModelPath(piperModelPath)
      }
      const result = await window.lobster.checkTtsProvider(ttsProvider)
      setCheckStatus(result)
    } catch {
      setCheckStatus({ ok: false, message: 'Check failed' })
    } finally {
      setChecking(false)
    }
  }

  return (
    <>
      <h3 className="mt-5 mb-1 w-full max-w-[400px] border-border border-t pt-4 text-left font-bold text-base text-text tracking-wide">
        TTS Settings
      </h3>
      <div className="key-field">
        <label htmlFor="tts-provider">TTS Provider</label>
        <select
          id="tts-provider"
          value={ttsProvider}
          onChange={(e) => {
            setTtsProvider(e.target.value as TtsProviderType)
            setCheckStatus(null)
          }}
        >
          {TTS_PROVIDER_OPTIONS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {ttsProvider === 'elevenlabs' && (
        <>
          <KeyInput
            name="ELEVENLABS_API_KEY"
            placeholder="Enter ElevenLabs API key..."
            isSet={keyIsSet('ELEVENLABS_API_KEY')}
            value={inputs.ELEVENLABS_API_KEY ?? ''}
            onChange={(v) => setInputs((prev) => ({ ...prev, ELEVENLABS_API_KEY: v }))}
            onReadFrom={(source) => readFrom('ELEVENLABS_API_KEY', source)}
          />
          <div className="key-field">
            <label htmlFor="tts-voice-id">TTS Voice ID</label>
            <input
              id="tts-voice-id"
              type="text"
              placeholder="pFZP5JQG7iQjIQuC4Bku"
              value={selectedVoice}
              onChange={(e) => setSelectedVoice(e.target.value)}
              list="tts-voice-options"
            />
            <datalist id="tts-voice-options">
              {TTS_VOICES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </datalist>
          </div>
          <div className="key-field">
            <label htmlFor="tts-model">TTS Model</label>
            <select
              id="tts-model"
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
            >
              {TTS_MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} — {m.description}
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      {ttsProvider === 'voicevox' && (
        <>
          <div className="key-field">
            <label htmlFor="voicevox-url">VOICEVOX URL</label>
            <input
              id="voicevox-url"
              type="text"
              placeholder="http://localhost:50021"
              value={voicevoxUrl}
              onChange={(e) => setVoicevoxUrl(e.target.value)}
            />
          </div>
          <div className="key-field">
            <label htmlFor="voicevox-speaker-id">VOICEVOX Speaker ID</label>
            <input
              id="voicevox-speaker-id"
              type="number"
              min={0}
              placeholder="1"
              value={voicevoxSpeakerId}
              onChange={(e) => setVoicevoxSpeakerId(Number(e.target.value))}
            />
          </div>
        </>
      )}

      {ttsProvider === 'kokoro' && (
        <>
          <div className="key-field">
            <label htmlFor="kokoro-url">Kokoro URL</label>
            <input
              id="kokoro-url"
              type="text"
              placeholder="http://localhost:8880"
              value={kokoroUrl}
              onChange={(e) => setKokoroUrl(e.target.value)}
            />
          </div>
          <div className="key-field">
            <label htmlFor="kokoro-voice">Kokoro Voice</label>
            <select
              id="kokoro-voice"
              value={kokoroVoice}
              onChange={(e) => setKokoroVoice(e.target.value)}
            >
              {KOKORO_VOICES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} ({v.lang})
                </option>
              ))}
            </select>
          </div>
        </>
      )}

      {ttsProvider === 'piper' && (
        <>
          <div className="key-field">
            <label htmlFor="piper-binary-path">Piper Binary Path</label>
            <input
              id="piper-binary-path"
              type="text"
              placeholder="/usr/local/bin/piper"
              value={piperPath}
              onChange={(e) => setPiperPath(e.target.value)}
            />
          </div>
          <div className="key-field">
            <label htmlFor="piper-model-path">Piper Model Path</label>
            <input
              id="piper-model-path"
              type="text"
              placeholder="/path/to/ja.onnx"
              value={piperModelPath}
              onChange={(e) => setPiperModelPath(e.target.value)}
            />
          </div>
        </>
      )}

      <ConnectivityCheck status={checkStatus} checking={checking} onCheck={check} />
    </>
  )
}
