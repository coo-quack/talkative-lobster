import { useEffect, useState } from 'react'
import type { KeyInfo } from '../../../shared/types'

export function useKeys() {
  const [keys, setKeys] = useState<KeyInfo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.lobster
      .getKeys()
      .then((k: KeyInfo[]) => {
        setKeys(k)
        setLoading(false)
      })
      .catch(() => {
        setLoading(false)
      })
  }, [])

  const refresh = async () => {
    const k = await window.lobster.getKeys()
    setKeys(k)
  }

  return { keys, loading, refresh }
}
