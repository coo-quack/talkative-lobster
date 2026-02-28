import { useState, useEffect } from 'react'
import type { VoiceState } from '../../../shared/types'

export function useVoiceState() {
  const [state, setState] = useState<VoiceState>('idle')

  useEffect(() => {
    return window.budgie.onVoiceStateChanged((s: string) => setState(s as VoiceState))
  }, [])

  return state
}
