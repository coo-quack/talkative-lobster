import { useState } from 'react'
import { KeyInput } from './KeyInput'
import { ConnectivityCheck } from './ConnectivityCheck'
import type { KeyInfo } from '../../../shared/types'

interface Props {
  keys: KeyInfo[]
  inputs: Record<string, string>
  setInputs: React.Dispatch<React.SetStateAction<Record<string, string>>>
  refresh: () => Promise<void>
  checkStatus: { ok: boolean; message: string } | null
  setCheckStatus: (s: { ok: boolean; message: string } | null) => void
  gatewayUrl: string
  setGatewayUrl: (url: string) => void
}

export function GatewaySettings({
  keys,
  inputs,
  setInputs,
  refresh,
  checkStatus,
  setCheckStatus,
  gatewayUrl,
  setGatewayUrl
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
      await window.lobster.setGatewayUrl?.(gatewayUrl)
      if (inputs.GATEWAY_TOKEN) {
        await window.lobster.setKey('GATEWAY_TOKEN', inputs.GATEWAY_TOKEN)
      }
      await refresh()
      const result = await window.lobster.checkGateway()
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
        Gateway Settings
      </h3>
      <label className="mt-2 block w-full max-w-[400px] text-left text-xs text-dim">
        Gateway URL
        <input
          type="text"
          className="mt-1 w-full rounded border border-border bg-surface px-2 py-1 text-sm text-text"
          value={gatewayUrl}
          onChange={(e) => setGatewayUrl(e.target.value)}
          placeholder="ws://127.0.0.1:18789"
        />
      </label>
      <KeyInput
        name="GATEWAY_TOKEN"
        placeholder="Enter gateway token..."
        isSet={keyIsSet('GATEWAY_TOKEN')}
        value={inputs.GATEWAY_TOKEN ?? ''}
        onChange={(v) => setInputs((prev) => ({ ...prev, GATEWAY_TOKEN: v }))}
        onReadFrom={(source) => readFrom('GATEWAY_TOKEN', source)}
      />
      <ConnectivityCheck status={checkStatus} checking={checking} onCheck={check} />
    </>
  )
}
