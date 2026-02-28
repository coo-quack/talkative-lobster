import { useState, useEffect } from 'react'
import { VoiceView } from './components/VoiceView'
import { SetupModal } from './components/SetupModal'
import { useTtsPlayback } from './hooks/useTtsPlayback'
import type { KeyInfo } from '../../shared/types'
import './App.css'

export default function App() {
  useTtsPlayback()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [needsSetup, setNeedsSetup] = useState(true)
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'error'>(
    'connecting'
  )

  useEffect(() => {
    window.budgie.getKeys().then((keys: KeyInfo[]) => {
      const required = keys.filter((k) => k.name !== 'OPENAI_API_KEY')
      setNeedsSetup(!required.every((k) => k.isSet))
    })
    const unsubConnection = window.budgie.onConnectionStatus((status: string) => {
      if (status === 'connected') setConnectionStatus('connected')
      else if (status === 'disconnected' || status === 'no-token') setConnectionStatus('connecting')
      else setConnectionStatus('error')
    })
    const unsubError = window.budgie.onError((message: string) => {
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
        <span>Talking Budgie</span>
        <span className={`status-dot ${connectionStatus}`} />
      </div>
      <VoiceView onOpenSettings={() => setSettingsOpen(true)} />
    </div>
  )
}
