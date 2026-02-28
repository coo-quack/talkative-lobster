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

type Tab = 'general' | 'keys'

interface Props {
  onComplete: () => void
}

export function SetupModal({ onComplete }: Props) {
  const { keys, loading, refresh } = useKeys()
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [autoLoaded, setAutoLoaded] = useState(false)
  const [tab, setTab] = useState<Tab>('general')

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

  useEffect(() => {
    window.budgie.getTtsVoice().then(setSelectedVoice)
    window.budgie.getTtsModel().then(setSelectedModel)
    window.budgie.getSttProvider().then(setSttProvider)
    window.budgie.getTtsProvider().then(setTtsProvider)
    window.budgie.getLocalWhisperPath().then(setLocalWhisperPath)
    window.budgie.getVoicevoxUrl().then(setVoicevoxUrl)
    window.budgie.getKokoroUrl().then(setKokoroUrl)
    window.budgie.getPiperPath().then(setPiperPath)
    window.budgie.getPiperModelPath().then(setPiperModelPath)
    window.budgie.getVoicevoxSpeaker().then(setVoicevoxSpeakerId)
    window.budgie.getKokoroVoice().then(setKokoroVoice)
  }, [])

  // Auto-load keys from OpenClaw on first render
  if (!loading && !autoLoaded) {
    setAutoLoaded(true)
    for (const key of keys) {
      if (!key.isSet) {
        window.budgie.readKeyFromOpenclaw(key.name).then((value) => {
          if (value) {
            setInputs((prev) => ({ ...prev, [key.name]: value }))
          }
        }).catch(() => {})
      }
    }
  }

  if (loading) return <div className="setup-modal">Loading...</div>

  const allRequired = keys.filter((k) => k.name !== 'OPENAI_API_KEY')
  const allSet = allRequired.every((k) => k.isSet || inputs[k.name])

  const readFrom = async (name: string, source: 'openclaw' | 'env') => {
    const value =
      source === 'openclaw'
        ? await window.budgie.readKeyFromOpenclaw(name)
        : await window.budgie.readKeyFromEnv(name)
    if (value) {
      setInputs((prev) => ({ ...prev, [name]: value }))
    }
  }

  const save = async () => {
    try {
      // Save keys
      for (const [name, value] of Object.entries(inputs)) {
        if (value) await window.budgie.setKey(name, value)
      }
      // Save provider selections
      await window.budgie.setSttProvider(sttProvider)
      await window.budgie.setTtsProvider(ttsProvider)
      await window.budgie.setTtsVoice(selectedVoice)
      await window.budgie.setTtsModel(selectedModel)
      await window.budgie.setLocalWhisperPath(localWhisperPath)
      await window.budgie.setVoicevoxUrl(voicevoxUrl)
      await window.budgie.setVoicevoxSpeaker(voicevoxSpeakerId)
      await window.budgie.setKokoroUrl(kokoroUrl)
      await window.budgie.setKokoroVoice(kokoroVoice)
      await window.budgie.setPiperPath(piperPath)
      await window.budgie.setPiperModelPath(piperModelPath)
      await refresh()
      onComplete()
    } catch (err) {
      alert(`Failed to save settings: ${err instanceof Error ? err.message : err}`)
    }
  }

  const isOptional = (name: string) => name === 'OPENAI_API_KEY'

  return (
    <div className="setup-modal">
      <h2>Welcome to Budgie</h2>
      <p>Configure your settings to get started.</p>

      <div className="tab-bar">
        <button
          className={`tab-btn ${tab === 'general' ? 'active' : ''}`}
          onClick={() => setTab('general')}
        >
          General
        </button>
        <button
          className={`tab-btn ${tab === 'keys' ? 'active' : ''}`}
          onClick={() => setTab('keys')}
        >
          Keys
        </button>
      </div>

      <div className="tab-content">
        {tab === 'general' && (
          <>
            <div className="key-field">
              <label>STT Provider</label>
              <select value={sttProvider} onChange={(e) => setSttProvider(e.target.value as SttProvider)}>
                {STT_PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

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

            <div className="key-field">
              <label>TTS Provider</label>
              <select value={ttsProvider} onChange={(e) => setTtsProvider(e.target.value as TtsProviderType)}>
                {TTS_PROVIDER_OPTIONS.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {ttsProvider === 'elevenlabs' && (
              <>
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
          </>
        )}

        {tab === 'keys' && (
          <>
            {keys.map((key) => (
              <div key={key.name} className={`key-field ${isOptional(key.name) ? 'optional' : ''}`}>
                <label>
                  {key.name}
                  {isOptional(key.name) && <span className="optional-badge">Optional</span>}
                </label>
                <div className="key-sources">
                  <button onClick={() => readFrom(key.name, 'openclaw')}>OpenClaw</button>
                  <button onClick={() => readFrom(key.name, 'env')}>Env</button>
                </div>
                <input
                  type="password"
                  placeholder={key.isSet ? '••••••••' : isOptional(key.name) ? 'Optional — Whisper fallback' : 'Enter key...'}
                  value={inputs[key.name] ?? ''}
                  onChange={(e) => setInputs((prev) => ({ ...prev, [key.name]: e.target.value }))}
                />
                {(key.isSet || inputs[key.name]) && <span className="key-ok">Set</span>}
              </div>
            ))}
          </>
        )}
      </div>

      <button disabled={!allSet} onClick={save}>
        Start Budgie
      </button>
    </div>
  )
}
