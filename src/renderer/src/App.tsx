import { useState, useEffect, useRef } from 'react'
import { VoiceView } from './components/VoiceView'
import { SetupModal } from './components/SetupModal'
import { useTtsPlayback } from './hooks/useTtsPlayback'
import { useVoiceState } from './hooks/useVoiceState'
import type { KeyInfo } from '../../shared/types'

export default function App() {
  const { stopPlayback } = useTtsPlayback()
  const voiceState = useVoiceState()
  const prevStateRef = useRef(voiceState)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [needsSetup, setNeedsSetup] = useState(true)
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'error'>(
    'connecting'
  )
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Stop TTS playback when leaving speaking/thinking state
  useEffect(() => {
    const prev = prevStateRef.current
    prevStateRef.current = voiceState
    if (prev === 'speaking' || prev === 'thinking') {
      if (voiceState !== 'speaking' && voiceState !== 'thinking') {
        console.log(`[tts] Interrupted: ${prev} → ${voiceState}, stopping playback`)
        stopPlayback()
        if (voiceState === 'listening') {
          window.lobster.ttsPlaybackDone()
        }
      }
    }
  }, [voiceState, stopPlayback])

  useEffect(() => {
    window.lobster.getKeys().then((keys: KeyInfo[]) => {
      const required = keys.filter((k) => k.name !== 'OPENAI_API_KEY')
      setNeedsSetup(!required.every((k) => k.isSet))
    })
    const unsubConnection = window.lobster.onConnectionStatus((status: string) => {
      if (status === 'connected') setConnectionStatus('connected')
      else if (status === 'disconnected' || status === 'no-token') setConnectionStatus('connecting')
      else setConnectionStatus('error')
    })
    const unsubError = window.lobster.onError((message: string) => {
      setErrorMessage(message)
      setTimeout(() => setErrorMessage(null), 8000)
    })
    return () => {
      unsubConnection()
      unsubError()
    }
  }, [])

  if (needsSetup || settingsOpen) {
    return (
      <SetupModal
        onComplete={() => {
          setNeedsSetup(false)
          setSettingsOpen(false)
        }}
      />
    )
  }

  const statusDotClass =
    connectionStatus === 'connected'
      ? 'bg-accent shadow-[0_0_6px_var(--color-accent)]'
      : connectionStatus === 'connecting'
        ? 'bg-[#ffc107] shadow-[0_0_6px_#ffc107]'
        : 'bg-[#f44336] shadow-[0_0_6px_#f44336]'

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-border border-b bg-bg-secondary px-4 py-2 pl-20 font-semibold text-sm [-webkit-app-region:drag]">
        <span>Talkative Lobster</span>
        <span className={`h-2 w-2 rounded-full transition-colors duration-300 ${statusDotClass}`} />
      </div>
      {errorMessage && (
        <div className="shrink-0 border-[#f44336]/30 border-b bg-[#f44336]/20 px-4 py-2 text-[#ef5350] text-sm">
          {errorMessage}
        </div>
      )}
      <VoiceView
        state={voiceState}
        onOpenSettings={() => setSettingsOpen(true)}
        stopPlayback={stopPlayback}
      />
    </div>
  )
}
