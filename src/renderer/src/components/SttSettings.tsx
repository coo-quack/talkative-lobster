import { useState } from 'react'
import { KeyInput } from './KeyInput'
import { ConnectivityCheck } from './ConnectivityCheck'
import { STT_PROVIDERS, type SttProvider, type KeyInfo } from '../../../shared/types'

interface Props {
  keys: KeyInfo[]
  inputs: Record<string, string>
  setInputs: React.Dispatch<React.SetStateAction<Record<string, string>>>
  refresh: () => Promise<void>
  sttProvider: SttProvider
  setSttProvider: (p: SttProvider) => void
  localWhisperPath: string
  setLocalWhisperPath: (p: string) => void
  checkStatus: { ok: boolean; message: string } | null
  setCheckStatus: (s: { ok: boolean; message: string } | null) => void
}

export function SttSettings({
  keys,
  inputs,
  setInputs,
  refresh,
  sttProvider,
  setSttProvider,
  localWhisperPath,
  setLocalWhisperPath,
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
      if (sttProvider === 'elevenlabs' && inputs.ELEVENLABS_API_KEY) {
        await window.lobster.setKey('ELEVENLABS_API_KEY', inputs.ELEVENLABS_API_KEY)
      }
      if (sttProvider === 'openaiWhisper' && inputs.OPENAI_API_KEY) {
        await window.lobster.setKey('OPENAI_API_KEY', inputs.OPENAI_API_KEY)
      }
      await refresh()
      await window.lobster.setSttProvider(sttProvider)
      if (sttProvider === 'localWhisper') await window.lobster.setLocalWhisperPath(localWhisperPath)
      const result = await window.lobster.checkSttProvider(sttProvider)
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
        STT Settings
      </h3>
      <div className="key-field">
        <label htmlFor="stt-provider">STT Provider</label>
        <select
          id="stt-provider"
          value={sttProvider}
          onChange={(e) => {
            setSttProvider(e.target.value as SttProvider)
            setCheckStatus(null)
          }}
        >
          {STT_PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {sttProvider === 'elevenlabs' && (
        <KeyInput
          name="ELEVENLABS_API_KEY"
          placeholder="Enter ElevenLabs API key..."
          isSet={keyIsSet('ELEVENLABS_API_KEY')}
          value={inputs.ELEVENLABS_API_KEY ?? ''}
          onChange={(v) => setInputs((prev) => ({ ...prev, ELEVENLABS_API_KEY: v }))}
          onReadFrom={(source) => readFrom('ELEVENLABS_API_KEY', source)}
        />
      )}

      {sttProvider === 'openaiWhisper' && (
        <KeyInput
          name="OPENAI_API_KEY"
          placeholder="Enter OpenAI API key..."
          isSet={keyIsSet('OPENAI_API_KEY')}
          value={inputs.OPENAI_API_KEY ?? ''}
          onChange={(v) => setInputs((prev) => ({ ...prev, OPENAI_API_KEY: v }))}
          onReadFrom={(source) => readFrom('OPENAI_API_KEY', source)}
        />
      )}

      {sttProvider === 'localWhisper' && (
        <div className="key-field">
          <label htmlFor="local-whisper-path">whisper.cpp Binary Path</label>
          <input
            id="local-whisper-path"
            type="text"
            placeholder="/usr/local/bin/whisper-cpp"
            value={localWhisperPath}
            onChange={(e) => setLocalWhisperPath(e.target.value)}
          />
        </div>
      )}

      <ConnectivityCheck status={checkStatus} checking={checking} onCheck={check} />
    </>
  )
}
