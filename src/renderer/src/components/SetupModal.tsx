import { useState } from 'react'
import { useKeys } from '../hooks/useKeys'

interface Props {
  onComplete: () => void
}

export function SetupModal({ onComplete }: Props) {
  const { keys, loading, refresh } = useKeys()
  const [inputs, setInputs] = useState<Record<string, string>>({})

  if (loading) return <div className="setup-modal">Loading...</div>

  const allRequired = keys.filter((k) => k.name !== 'OPENAI_API_KEY')
  const allSet = allRequired.every((k) => k.isSet || inputs[k.name])

  const readFrom = async (name: string, source: 'openclaw' | 'env') => {
    const value =
      source === 'openclaw'
        ? await window.budgie.readKeyFromOpenclaw(name)
        : await window.budgie.readKeyFromEnv(name)
    if (value) {
      setInputs((prev) => ({ ...prev, [name]: value as unknown as string }))
    }
  }

  const save = async () => {
    for (const [name, value] of Object.entries(inputs)) {
      if (value) await window.budgie.setKey(name, value)
    }
    await refresh()
    onComplete()
  }

  return (
    <div className="setup-modal">
      <h2>Welcome to Budgie</h2>
      <p>Configure your API keys to get started.</p>
      {keys.map((key) => (
        <div key={key.name} className="key-field">
          <label>{key.name}</label>
          <div className="key-sources">
            <button onClick={() => readFrom(key.name, 'openclaw')}>OpenClaw</button>
            <button onClick={() => readFrom(key.name, 'env')}>Env</button>
          </div>
          <input
            type="password"
            placeholder={key.isSet ? '••••••••' : 'Enter key...'}
            value={inputs[key.name] ?? ''}
            onChange={(e) => setInputs((prev) => ({ ...prev, [key.name]: e.target.value }))}
          />
          {(key.isSet || inputs[key.name]) && <span className="key-ok">Set</span>}
        </div>
      ))}
      <button disabled={!allSet} onClick={save}>
        Start Budgie
      </button>
    </div>
  )
}
