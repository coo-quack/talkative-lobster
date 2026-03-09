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
  const [micOn, setMicOn] = useState(true)
  const [needsSetup, setNeedsSetup] = useState(true)
  const [hasError, setHasError] = useState(false)
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
      if (status === 'connected') setHasError(false)
      else if (status === 'error') setHasError(true)
    })
    const unsubError = window.lobster.onError((message: string) => {
      setHasError(true)
      setErrorMessage(message)
      setTimeout(() => setErrorMessage(null), 8000)
    })
    return () => {
      unsubConnection()
      unsubError()
    }
  }, [])

  const openSettings = () => {
    stopPlayback()
    window.lobster.voiceStop()
    setMicOn(false)
    setSettingsOpen(true)
  }

  if (needsSetup || settingsOpen) {
    return (
      <SetupModal
        onComplete={() => {
          setNeedsSetup(false)
          setSettingsOpen(false)
          setHasError(false)
          setMicOn(true)
        }}
      />
    )
  }

  const statusDotClass = hasError
    ? 'bg-[#f44336] shadow-[0_0_6px_#f44336] cursor-pointer [-webkit-app-region:no-drag]'
    : 'bg-accent shadow-[0_0_6px_var(--color-accent)]'

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <div className="relative flex shrink-0 items-center justify-center border-border border-b bg-bg-secondary py-3 pl-20 pr-20 [-webkit-app-region:drag]">
        <span className="text-[#f5f5f4] text-xl font-normal tracking-tight">Talkative Lobster</span>
        <span
          className={`absolute right-4 h-2 w-2 rounded-full transition-colors duration-300 ${statusDotClass}`}
          onClick={hasError ? openSettings : undefined}
          role={hasError ? 'button' : undefined}
          title={hasError ? 'Connection error — open settings' : 'Connected'}
        />
      </div>
      {errorMessage && (
        <div className="shrink-0 border-[#f44336]/30 border-b bg-[#f44336]/20 px-4 py-2 text-[#ef5350] text-sm">
          {errorMessage}
        </div>
      )}
      <VoiceView
        state={voiceState}
        micOn={micOn}
        onMicToggle={setMicOn}
        onOpenSettings={openSettings}
        stopPlayback={stopPlayback}
      />
    </div>
  )
}
