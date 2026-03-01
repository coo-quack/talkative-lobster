import { useState, useEffect } from 'react'
import { useKeys } from '../hooks/useKeys'
import {
  DEFAULT_TTS_VOICE_ID,
  TTS_MODELS, DEFAULT_TTS_MODEL_ID,
  STT_PROVIDERS, DEFAULT_STT_PROVIDER,
  TTS_PROVIDER_OPTIONS, DEFAULT_TTS_PROVIDER,
  KOKORO_VOICES, DEFAULT_KOKORO_VOICE,
  type SttProvider, type TtsProviderType,
} from '../../../shared/types'

interface Props {
  onComplete: () => void
}

export function SetupModal({ onComplete }: Props) {
  const { keys, loading, refresh } = useKeys()
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [autoLoaded, setAutoLoaded] = useState(false)

  // TTS settings (ElevenLabs)
  const [selectedVoice, setSelectedVoice] = useState(DEFAULT_TTS_VOICE_ID)
  const [selectedModel, setSelectedModel] = useState(DEFAULT_TTS_MODEL_ID)

  // Provider selections
  const [sttProvider, setSttProvider] = useState<SttProvider>(DEFAULT_STT_PROVIDER)
  const [ttsProvider, setTtsProvider] = useState<TtsProviderType>(DEFAULT_TTS_PROVIDER)

  // Provider-specific settings
  const [localWhisperPath, setLocalWhisperPath] = useState('')
  const [voicevoxUrl, setVoicevoxUrl] = useState('http://localhost:50021')
  const [kokoroUrl, setKokoroUrl] = useState('http://localhost:8880')
  const [piperPath, setPiperPath] = useState('')
  const [piperModelPath, setPiperModelPath] = useState('')
  const [voicevoxSpeakerId, setVoicevoxSpeakerId] = useState(1)
  const [kokoroVoice, setKokoroVoice] = useState(DEFAULT_KOKORO_VOICE)

  // Connectivity checks
  const [gatewayCheckStatus, setGatewayCheckStatus] = useState<{ ok: boolean; message: string } | null>(null)
  const [gatewayChecking, setGatewayChecking] = useState(false)
  const [ttsCheckStatus, setTtsCheckStatus] = useState<{ ok: boolean; message: string } | null>(null)
  const [ttsChecking, setTtsChecking] = useState(false)
  const [sttCheckStatus, setSttCheckStatus] = useState<{ ok: boolean; message: string } | null>(null)
  const [sttChecking, setSttChecking] = useState(false)
  const [autoChecked, setAutoChecked] = useState(false)

  const [settingsLoaded, setSettingsLoaded] = useState(false)

  useEffect(() => {
    Promise.all([
      window.lobster.getTtsVoice().then(setSelectedVoice),
      window.lobster.getTtsModel().then(setSelectedModel),
      window.lobster.getSttProvider().then((v) => { setSttProvider(v); return v }),
      window.lobster.getTtsProvider().then((v) => { setTtsProvider(v); return v }),
      window.lobster.getLocalWhisperPath().then(setLocalWhisperPath),
      window.lobster.getVoicevoxUrl().then(setVoicevoxUrl),
      window.lobster.getKokoroUrl().then(setKokoroUrl),
      window.lobster.getPiperPath().then(setPiperPath),
      window.lobster.getPiperModelPath().then(setPiperModelPath),
      window.lobster.getVoicevoxSpeaker().then(setVoicevoxSpeakerId),
      window.lobster.getKokoroVoice().then(setKokoroVoice),
    ]).then(() => setSettingsLoaded(true))
  }, [])

  // Auto-load keys from OpenClaw on first render
  useEffect(() => {
    if (!loading && !autoLoaded) {
      setAutoLoaded(true)
      for (const key of keys) {
        if (!key.isSet) {
          window.lobster.readKeyFromOpenclaw(key.name).then((value) => {
            if (value) {
              setInputs((prev) => ({ ...prev, [key.name]: value }))
            }
          }).catch(() => {})
        }
      }
    }
  }, [loading, autoLoaded, keys])

  // Auto-run connectivity checks once settings are loaded
  useEffect(() => {
    if (settingsLoaded && !loading && !autoChecked) {
      setAutoChecked(true)
      const gatewaySet = keys.find((k) => k.name === 'GATEWAY_TOKEN')?.isSet
      if (gatewaySet) {
        window.lobster.checkGateway().then(setGatewayCheckStatus).catch(() => {})
      }
      window.lobster.checkSttProvider(sttProvider).then(setSttCheckStatus).catch(() => {})
      window.lobster.checkTtsProvider(ttsProvider).then(setTtsCheckStatus).catch(() => {})
    }
  }, [settingsLoaded, loading, autoChecked, keys, sttProvider, ttsProvider])

  if (loading) return <div className="setup-modal">Loading...</div>

  const keyIsSet = (name: string) => {
    const k = keys.find((k) => k.name === name)
    return !!(k?.isSet || inputs[name])
  }

  // STT requires ElevenLabs key or OpenAI key depending on provider
  const sttKeyOk =
    sttProvider === 'elevenlabs' ? keyIsSet('ELEVENLABS_API_KEY') :
    sttProvider === 'openaiWhisper' ? keyIsSet('OPENAI_API_KEY') :
    true

  // TTS requires ElevenLabs key only for elevenlabs provider
  const ttsKeyOk = ttsProvider === 'elevenlabs' ? keyIsSet('ELEVENLABS_API_KEY') : true

  const canStart = keyIsSet('GATEWAY_TOKEN') && sttKeyOk && ttsKeyOk
    && gatewayCheckStatus?.ok && sttCheckStatus?.ok && ttsCheckStatus?.ok

  const readFrom = async (name: string, source: 'openclaw' | 'env') => {
    const value =
      source === 'openclaw'
        ? await window.lobster.readKeyFromOpenclaw(name)
        : await window.lobster.readKeyFromEnv(name)
    if (value) {
      setInputs((prev) => ({ ...prev, [name]: value }))
    }
  }

  const save = async () => {
    try {
      for (const [name, value] of Object.entries(inputs)) {
        if (value) await window.lobster.setKey(name, value)
      }
      await window.lobster.setSttProvider(sttProvider)
      await window.lobster.setTtsProvider(ttsProvider)
      await window.lobster.setTtsVoice(selectedVoice)
      await window.lobster.setTtsModel(selectedModel)
      await window.lobster.setLocalWhisperPath(localWhisperPath)
      await window.lobster.setVoicevoxUrl(voicevoxUrl)
      await window.lobster.setVoicevoxSpeaker(voicevoxSpeakerId)
      await window.lobster.setKokoroUrl(kokoroUrl)
      await window.lobster.setKokoroVoice(kokoroVoice)
      await window.lobster.setPiperPath(piperPath)
      await window.lobster.setPiperModelPath(piperModelPath)
      await refresh()
      onComplete()
    } catch (err) {
      alert(`Failed to save settings: ${err instanceof Error ? err.message : err}`)
    }
  }

  const checkGateway = async () => {
    setGatewayChecking(true)
    setGatewayCheckStatus(null)
    try {
      // Save token first if entered
      if (inputs['GATEWAY_TOKEN']) {
        await window.lobster.setKey('GATEWAY_TOKEN', inputs['GATEWAY_TOKEN'])
        await refresh()
      }
      const result = await window.lobster.checkGateway()
      setGatewayCheckStatus(result)
    } catch {
      setGatewayCheckStatus({ ok: false, message: 'Check failed' })
    } finally {
      setGatewayChecking(false)
    }
  }

  const checkStt = async () => {
    setSttChecking(true)
    setSttCheckStatus(null)
    try {
      // Save key if needed
      if (sttProvider === 'elevenlabs' && inputs['ELEVENLABS_API_KEY']) {
        await window.lobster.setKey('ELEVENLABS_API_KEY', inputs['ELEVENLABS_API_KEY'])
        await refresh()
      }
      if (sttProvider === 'openaiWhisper' && inputs['OPENAI_API_KEY']) {
        await window.lobster.setKey('OPENAI_API_KEY', inputs['OPENAI_API_KEY'])
        await refresh()
      }
      await window.lobster.setSttProvider(sttProvider)
      if (sttProvider === 'localWhisper') await window.lobster.setLocalWhisperPath(localWhisperPath)
      const result = await window.lobster.checkSttProvider(sttProvider)
      setSttCheckStatus(result)
    } catch {
      setSttCheckStatus({ ok: false, message: 'Check failed' })
    } finally {
      setSttChecking(false)
    }
  }

  const checkTts = async () => {
    setTtsChecking(true)
    setTtsCheckStatus(null)
    try {
      // Save key if needed
      if (ttsProvider === 'elevenlabs' && inputs['ELEVENLABS_API_KEY']) {
        await window.lobster.setKey('ELEVENLABS_API_KEY', inputs['ELEVENLABS_API_KEY'])
        await refresh()
      }
      await window.lobster.setTtsProvider(ttsProvider)
      if (ttsProvider === 'voicevox') await window.lobster.setVoicevoxUrl(voicevoxUrl)
      if (ttsProvider === 'kokoro') await window.lobster.setKokoroUrl(kokoroUrl)
      if (ttsProvider === 'piper') {
        await window.lobster.setPiperPath(piperPath)
        await window.lobster.setPiperModelPath(piperModelPath)
      }
      const result = await window.lobster.checkTtsProvider(ttsProvider)
      setTtsCheckStatus(result)
    } catch {
      setTtsCheckStatus({ ok: false, message: 'Check failed' })
    } finally {
      setTtsChecking(false)
    }
  }

  const keyInput = (name: string, placeholder: string) => (
    <div className="key-field">
      <label>{name}</label>
      <div className="key-sources">
        <button onClick={() => readFrom(name, 'openclaw')}>OpenClaw</button>
        <button onClick={() => readFrom(name, 'env')}>Env</button>
      </div>
      <input
        type="password"
        placeholder={keyIsSet(name) ? '••••••••' : placeholder}
        value={inputs[name] ?? ''}
        onChange={(e) => setInputs((prev) => ({ ...prev, [name]: e.target.value }))}
      />
      {keyIsSet(name) && <span className="key-ok">Set</span>}
    </div>
  )

  return (
    <div className="setup-modal">
      <h2>Settings</h2>
      <p>All connection tests must pass to start.</p>

      {/* Gateway */}
      <h3>Gateway Settings</h3>
      {keyInput('GATEWAY_TOKEN', 'Enter gateway token...')}
      <div className="connectivity-check">
        <button className="check-btn" onClick={checkGateway} disabled={gatewayChecking}>
          {gatewayChecking ? 'Testing...' : 'Test'}
        </button>
        {gatewayCheckStatus && (
          <span className={`check-result ${gatewayCheckStatus.ok ? 'ok' : 'fail'}`}>
            {gatewayCheckStatus.message}
          </span>
        )}
      </div>

      {/* STT */}
      <h3>STT Settings</h3>
      <div className="key-field">
        <label>STT Provider</label>
        <select value={sttProvider} onChange={(e) => { setSttProvider(e.target.value as SttProvider); setSttCheckStatus(null) }}>
          {STT_PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {sttProvider === 'elevenlabs' && keyInput('ELEVENLABS_API_KEY', 'Enter ElevenLabs API key...')}

      {sttProvider === 'openaiWhisper' && keyInput('OPENAI_API_KEY', 'Enter OpenAI API key...')}

      {sttProvider === 'localWhisper' && (
        <div className="key-field">
          <label>whisper.cpp Binary Path</label>
          <input
            type="text"
            placeholder="/usr/local/bin/whisper-cpp"
            value={localWhisperPath}
            onChange={(e) => setLocalWhisperPath(e.target.value)}
          />
        </div>
      )}

      <div className="connectivity-check">
        <button className="check-btn" onClick={checkStt} disabled={sttChecking}>
          {sttChecking ? 'Testing...' : 'Test'}
        </button>
        {sttCheckStatus && (
          <span className={`check-result ${sttCheckStatus.ok ? 'ok' : 'fail'}`}>
            {sttCheckStatus.message}
          </span>
        )}
      </div>

      {/* TTS */}
      <h3>TTS Settings</h3>
      <div className="key-field">
        <label>TTS Provider</label>
        <select value={ttsProvider} onChange={(e) => { setTtsProvider(e.target.value as TtsProviderType); setTtsCheckStatus(null) }}>
          {TTS_PROVIDER_OPTIONS.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {ttsProvider === 'elevenlabs' && (
        <>
          {keyInput('ELEVENLABS_API_KEY', 'Enter ElevenLabs API key...')}
          <div className="key-field">
            <label>TTS Voice ID</label>
            <input
              type="text"
              placeholder="pFZP5JQG7iQjIQuC4Bku"
              value={selectedVoice}
              onChange={(e) => setSelectedVoice(e.target.value)}
            />
          </div>
          <div className="key-field">
            <label>TTS Model</label>
            <select value={selectedModel} onChange={(e) => setSelectedModel(e.target.value)}>
              {TTS_MODELS.map((m) => (
                <option key={m.id} value={m.id}>{m.name} — {m.description}</option>
              ))}
            </select>
          </div>
        </>
      )}

      {ttsProvider === 'voicevox' && (
        <>
          <div className="key-field">
            <label>VOICEVOX URL</label>
            <input
              type="text"
              placeholder="http://localhost:50021"
              value={voicevoxUrl}
              onChange={(e) => setVoicevoxUrl(e.target.value)}
            />
          </div>
          <div className="key-field">
            <label>VOICEVOX Speaker ID</label>
            <input
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
            <label>Kokoro URL</label>
            <input
              type="text"
              placeholder="http://localhost:8880"
              value={kokoroUrl}
              onChange={(e) => setKokoroUrl(e.target.value)}
            />
          </div>
          <div className="key-field">
            <label>Kokoro Voice</label>
            <select value={kokoroVoice} onChange={(e) => setKokoroVoice(e.target.value)}>
              {KOKORO_VOICES.map((v) => (
                <option key={v.id} value={v.id}>{v.name} ({v.lang})</option>
              ))}
            </select>
          </div>
        </>
      )}

      {ttsProvider === 'piper' && (
        <>
          <div className="key-field">
            <label>Piper Binary Path</label>
            <input
              type="text"
              placeholder="/usr/local/bin/piper"
              value={piperPath}
              onChange={(e) => setPiperPath(e.target.value)}
            />
          </div>
          <div className="key-field">
            <label>Piper Model Path</label>
            <input
              type="text"
              placeholder="/path/to/ja.onnx"
              value={piperModelPath}
              onChange={(e) => setPiperModelPath(e.target.value)}
            />
          </div>
        </>
      )}

      <div className="connectivity-check">
        <button className="check-btn" onClick={checkTts} disabled={ttsChecking}>
          {ttsChecking ? 'Testing...' : 'Test'}
        </button>
        {ttsCheckStatus && (
          <span className={`check-result ${ttsCheckStatus.ok ? 'ok' : 'fail'}`}>
            {ttsCheckStatus.message}
          </span>
        )}
      </div>

      <button disabled={!canStart} onClick={save}>
        Start Lobster
      </button>
    </div>
  )
}
