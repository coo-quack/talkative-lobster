import { useState, useEffect, useRef } from 'react'
import { VoiceView } from './components/VoiceView'
import { SetupModal } from './components/SetupModal'
import { useTtsPlayback } from './hooks/useTtsPlayback'
import { useVoiceState } from './hooks/useVoiceState'
import type { KeyInfo } from '../../shared/types'
import './App.css'

export default function App() {
  const { stopPlayback } = useTtsPlayback()
  const voiceState = useVoiceState()
  const prevStateRef = useRef(voiceState)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [needsSetup, setNeedsSetup] = useState(true)
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'error'>(
    'connecting'
  )

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
      alert(message)
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

  return (
    <div className="app">
      <div className="titlebar">
        <span>Talkative Lobster</span>
        <span className={`status-dot ${connectionStatus}`} />
      </div>
      <VoiceView state={voiceState} onOpenSettings={() => setSettingsOpen(true)} stopPlayback={stopPlayback} />
    </div>
  )
}
