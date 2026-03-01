interface Props {
  status: { ok: boolean; message: string } | null
  checking: boolean
  onCheck: () => void
}

export function ConnectivityCheck({ status, checking, onCheck }: Props) {
  return (
    <div className="connectivity-check">
      <button type="button" className="check-btn" onClick={onCheck} disabled={checking}>
        {checking ? 'Testing...' : 'Test'}
      </button>
      {status && (
        <span className={`check-result ${status.ok ? 'ok' : 'fail'}`}>{status.message}</span>
      )}
    </div>
  )
}
