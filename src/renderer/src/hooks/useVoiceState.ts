import { useEffect, useState } from 'react'
import type { VoiceState } from '../../../shared/types'

export function useVoiceState() {
  const [state, setState] = useState<VoiceState>('idle')

  useEffect(() => {
    return window.lobster.onVoiceStateChanged((s: VoiceState) => setState(s))
  }, [])

  return state
}
