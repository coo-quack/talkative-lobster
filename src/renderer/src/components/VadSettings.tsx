interface Props {
  vadSensitivity: 'auto' | number
  setVadSensitivity: (v: 'auto' | number) => void
}

export function VadSettings({ vadSensitivity, setVadSensitivity }: Props) {
  const isAuto = vadSensitivity === 'auto'
  const sliderValue = isAuto ? 0.02 : vadSensitivity

  return (
    <>
      <h3 className="mt-5 mb-1 w-full max-w-[400px] border-border border-t pt-4 text-left font-bold text-base text-text tracking-wide">
        VAD Settings
      </h3>
      <div className="flex w-full max-w-[400px] flex-col">
        <label className="flex items-center font-semibold text-[13px] text-label">
          <span>Sensitivity</span>
          <span className="ml-auto flex items-center gap-1.5">
            <span className="text-text-dim">Auto</span>
            <input
              type="checkbox"
              checked={isAuto}
              onChange={(e) => setVadSensitivity(e.target.checked ? 'auto' : 0.02)}
            />
          </span>
        </label>
        {!isAuto && (
          <div className="mt-1 flex items-center gap-2">
            <span className="text-[10px] text-text-dim">Quiet</span>
            <input
              type="range"
              min={0.001}
              max={0.05}
              step={0.001}
              value={sliderValue}
              onChange={(e) => setVadSensitivity(Number.parseFloat(e.target.value))}
              className="flex-1"
            />
            <span className="text-[10px] text-text-dim">Noisy</span>
          </div>
        )}
        {isAuto && (
          <span className="mt-1 block text-[10px] text-text-muted">
            Automatically calibrates when mic turns on.
          </span>
        )}
      </div>
    </>
  )
}
