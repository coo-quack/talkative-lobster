import { useState, useEffect } from 'react'

export function useAudioLevel() {
  const [level, setLevel] = useState(0)

  useEffect(() => {
    return window.budgie.onAudioLevel(setLevel)
  }, [])

  return level
}
