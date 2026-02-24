import { useState } from 'react'
import { Waveform } from './Waveform'
import { useVoiceState } from '../hooks/useVoiceState'
import { useAudioLevel } from '../hooks/useAudioLevel'

type InputMode = 'hands-free' | 'push-to-talk'

interface Props {
  compact?: boolean
  onToggleChat: () => void
  onOpenSettings: () => void
}

const STATUS_LABELS: Record<string, string> = {
  idle: 'Ready',
  listening: 'Listening...',
  processing: 'Recognizing...',
  thinking: 'Thinking...',
  speaking: 'Speaking...'
}

export function VoiceView({ compact, onToggleChat, onOpenSettings }: Props) {
  const state = useVoiceState()
  const level = useAudioLevel()
  const [micOn, setMicOn] = useState(true)
  const [mode, setMode] = useState<InputMode>('hands-free')

  const toggleMic = () => {
    if (micOn) {
      window.budgie.voiceStop()
    } else {
      window.budgie.voiceStart()
    }
    setMicOn(!micOn)
  }

  return (
    <div className={`voice-view ${compact ? 'compact' : ''}`}>
      <Waveform state={state} level={level} compact={compact} />
      <div className="status-label">{STATUS_LABELS[state]}</div>
      <div className="controls">
        <button className={`mic-btn ${micOn ? 'active' : ''}`} onClick={toggleMic}>
          {micOn ? 'Mic ON' : 'Mic OFF'}
        </button>
        <button onClick={onToggleChat}>Chat</button>
        <button onClick={onOpenSettings}>Settings</button>
      </div>
      {!compact && (
        <div className="mode-switch">
          <label>
            <input
              type="radio"
              checked={mode === 'hands-free'}
              onChange={() => setMode('hands-free')}
            />
            Hands-free
          </label>
          <label>
            <input
              type="radio"
              checked={mode === 'push-to-talk'}
              onChange={() => setMode('push-to-talk')}
            />
            Push-to-talk
          </label>
        </div>
      )}
    </div>
  )
}
