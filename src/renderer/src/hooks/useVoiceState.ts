import { useState, useEffect } from 'react'

type VoiceState = 'idle' | 'listening' | 'processing' | 'thinking' | 'speaking'

export function useVoiceState() {
  const [state, setState] = useState<VoiceState>('idle')

  useEffect(() => {
    return window.budgie.onVoiceStateChanged((s: string) => setState(s as VoiceState))
  }, [])

  return state
}
