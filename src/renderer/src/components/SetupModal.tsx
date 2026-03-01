import { useState, useEffect } from 'react'
import { useKeys } from '../hooks/useKeys'
import { useSettings } from '../hooks/useSettings'
import { GatewaySettings } from './GatewaySettings'
import { SttSettings } from './SttSettings'
import { TtsSettings } from './TtsSettings'

interface Props {
  onComplete: () => void
}

export function SetupModal({ onComplete }: Props) {
  const { keys, loading, refresh } = useKeys()
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [autoLoaded, setAutoLoaded] = useState(false)

  const settings = useSettings()

  // Connectivity checks
  const [gatewayCheckStatus, setGatewayCheckStatus] = useState<{
    ok: boolean
    message: string
  } | null>(null)
  const [ttsCheckStatus, setTtsCheckStatus] = useState<{ ok: boolean; message: string } | null>(
    null
  )
  const [sttCheckStatus, setSttCheckStatus] = useState<{ ok: boolean; message: string } | null>(
    null
  )
  const [autoChecked, setAutoChecked] = useState(false)

  // Auto-load keys from OpenClaw on first render
  useEffect(() => {
    if (!loading && !autoLoaded) {
      setAutoLoaded(true)
      for (const key of keys) {
        if (!key.isSet) {
          window.lobster
            .readKeyFromOpenclaw(key.name)
            .then((value) => {
              if (value) {
                setInputs((prev) => ({ ...prev, [key.name]: value }))
              }
            })
            .catch(() => {})
        }
      }
    }
  }, [loading, autoLoaded, keys])

  // Auto-run connectivity checks once settings are loaded
  useEffect(() => {
    if (settings.settingsLoaded && !loading && !autoChecked) {
      setAutoChecked(true)
      const gatewaySet = keys.find((k) => k.name === 'GATEWAY_TOKEN')?.isSet
      if (gatewaySet) {
        window.lobster
          .checkGateway()
          .then(setGatewayCheckStatus)
          .catch(() => {})
      }
      window.lobster
        .checkSttProvider(settings.sttProvider)
        .then(setSttCheckStatus)
        .catch(() => {})
      window.lobster
        .checkTtsProvider(settings.ttsProvider)
        .then(setTtsCheckStatus)
        .catch(() => {})
    }
  }, [
    settings.settingsLoaded,
    loading,
    autoChecked,
    keys,
    settings.sttProvider,
    settings.ttsProvider
  ])

  if (loading) return <div className="setup-modal">Loading...</div>

  const keyIsSet = (name: string) => {
    const k = keys.find((k) => k.name === name)
    return !!(k?.isSet || inputs[name])
  }

  const sttKeyOk =
    settings.sttProvider === 'elevenlabs'
      ? keyIsSet('ELEVENLABS_API_KEY')
      : settings.sttProvider === 'openaiWhisper'
        ? keyIsSet('OPENAI_API_KEY')
        : true

  const ttsKeyOk = settings.ttsProvider === 'elevenlabs' ? keyIsSet('ELEVENLABS_API_KEY') : true

  const canStart =
    keyIsSet('GATEWAY_TOKEN') &&
    sttKeyOk &&
    ttsKeyOk &&
    gatewayCheckStatus?.ok &&
    sttCheckStatus?.ok &&
    ttsCheckStatus?.ok

  const save = async () => {
    try {
      for (const [name, value] of Object.entries(inputs)) {
        if (value) await window.lobster.setKey(name, value)
      }
      await window.lobster.setSttProvider(settings.sttProvider)
      await window.lobster.setTtsProvider(settings.ttsProvider)
      await window.lobster.setTtsVoice(settings.selectedVoice)
      await window.lobster.setTtsModel(settings.selectedModel)
      await window.lobster.setLocalWhisperPath(settings.localWhisperPath)
      await window.lobster.setVoicevoxUrl(settings.voicevoxUrl)
      await window.lobster.setVoicevoxSpeaker(settings.voicevoxSpeakerId)
      await window.lobster.setKokoroUrl(settings.kokoroUrl)
      await window.lobster.setKokoroVoice(settings.kokoroVoice)
      await window.lobster.setPiperPath(settings.piperPath)
      await window.lobster.setPiperModelPath(settings.piperModelPath)
      await refresh()
      onComplete()
    } catch (err) {
      console.error('Failed to save settings:', err)
    }
  }

  return (
    <div className="setup-modal">
      <h2 className="mb-2 font-bold">Settings</h2>
      <p className="mb-2 text-[#f0c040] text-xs">All connection tests must pass to start.</p>

      <GatewaySettings
        keys={keys}
        inputs={inputs}
        setInputs={setInputs}
        refresh={refresh}
        checkStatus={gatewayCheckStatus}
        setCheckStatus={setGatewayCheckStatus}
      />

      <SttSettings
        keys={keys}
        inputs={inputs}
        setInputs={setInputs}
        refresh={refresh}
        sttProvider={settings.sttProvider}
        setSttProvider={settings.setSttProvider}
        localWhisperPath={settings.localWhisperPath}
        setLocalWhisperPath={settings.setLocalWhisperPath}
        checkStatus={sttCheckStatus}
        setCheckStatus={setSttCheckStatus}
      />

      <TtsSettings
        keys={keys}
        inputs={inputs}
        setInputs={setInputs}
        refresh={refresh}
        ttsProvider={settings.ttsProvider}
        setTtsProvider={settings.setTtsProvider}
        selectedVoice={settings.selectedVoice}
        setSelectedVoice={settings.setSelectedVoice}
        selectedModel={settings.selectedModel}
        setSelectedModel={settings.setSelectedModel}
        voicevoxUrl={settings.voicevoxUrl}
        setVoicevoxUrl={settings.setVoicevoxUrl}
        voicevoxSpeakerId={settings.voicevoxSpeakerId}
        setVoicevoxSpeakerId={settings.setVoicevoxSpeakerId}
        kokoroUrl={settings.kokoroUrl}
        setKokoroUrl={settings.setKokoroUrl}
        kokoroVoice={settings.kokoroVoice}
        setKokoroVoice={settings.setKokoroVoice}
        piperPath={settings.piperPath}
        setPiperPath={settings.setPiperPath}
        piperModelPath={settings.piperModelPath}
        setPiperModelPath={settings.setPiperModelPath}
        checkStatus={ttsCheckStatus}
        setCheckStatus={setTtsCheckStatus}
      />

      <button
        type="button"
        className="relative mt-9 w-full max-w-[400px] border-border border-t px-8 py-3 text-lg"
        disabled={!canStart}
        onClick={save}
      >
        Start Lobster
      </button>
    </div>
  )
}
