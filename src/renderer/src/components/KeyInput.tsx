interface Props {
  name: string
  placeholder: string
  isSet: boolean
  value: string
  onChange: (value: string) => void
  onReadFrom: (source: 'openclaw' | 'env') => void
}

export function KeyInput({ name, placeholder, isSet, value, onChange, onReadFrom }: Props) {
  const inputId = name.toLowerCase().replace(/_/g, '-')
  return (
    <div className="key-field">
      <label htmlFor={inputId}>{name}</label>
      <div className="key-sources">
        <button type="button" onClick={() => onReadFrom('openclaw')}>
          OpenClaw
        </button>
        <button type="button" onClick={() => onReadFrom('env')}>
          Env
        </button>
      </div>
      <input
        id={inputId}
        type="password"
        placeholder={isSet ? '••••••••' : placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {isSet && <span className="key-ok">Set</span>}
    </div>
  )
}
