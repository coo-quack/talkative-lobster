import { useState, useEffect } from 'react'

interface KeyInfo {
  name: string
  isSet: boolean
  source: string | null
}

export function useKeys() {
  const [keys, setKeys] = useState<KeyInfo[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    window.budgie.getKeys().then((k: KeyInfo[]) => {
      setKeys(k)
      setLoading(false)
    })
  }, [])

  const refresh = async () => {
    const k = await window.budgie.getKeys()
    setKeys(k)
  }

  return { keys, loading, refresh }
}
