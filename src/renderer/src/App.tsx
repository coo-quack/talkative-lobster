import { useState, useEffect } from 'react'
import { VoiceView } from './components/VoiceView'
import { ChatView } from './components/ChatView'
import { SetupModal } from './components/SetupModal'
import { useTtsPlayback } from './hooks/useTtsPlayback'
import './App.css'

export default function App() {
  const { stop: _stopTts } = useTtsPlayback()
  const [chatOpen, setChatOpen] = useState(false)
  const [_settingsOpen, setSettingsOpen] = useState(false)
  const [needsSetup, setNeedsSetup] = useState(true)
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'error'>(
    'connecting'
  )

  useEffect(() => {
    window.budgie.getKeys().then((keys: any[]) => {
      const required = keys.filter((k: any) => k.name !== 'OPENAI_API_KEY')
      setNeedsSetup(!required.every((k: any) => k.isSet))
    })
    return window.budgie.onConnectionStatus((connected: boolean) => {
      setConnectionStatus(connected ? 'connected' : 'error')
    })
  }, [])

  if (needsSetup) {
    return <SetupModal onComplete={() => setNeedsSetup(false)} />
  }

  return (
    <div className="app">
      <div className="titlebar">
        <span>Budgie</span>
        <span className={`status-dot ${connectionStatus}`} />
      </div>
      {chatOpen && <ChatView />}
      <VoiceView
        compact={chatOpen}
        onToggleChat={() => setChatOpen((c) => !c)}
        onOpenSettings={() => setSettingsOpen(true)}
      />
    </div>
  )
}
