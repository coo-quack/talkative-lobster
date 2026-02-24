import { useState, useCallback } from 'react'
import { Waveform } from './Waveform'
import { useVoiceState } from '../hooks/useVoiceState'
import { useAudioLevel } from '../hooks/useAudioLevel'
import { useVAD } from '../hooks/useVAD'

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

  const vadEnabled = micOn && mode === 'hands-free' && (state === 'idle' || state === 'listening')

  const handleSpeechStart = useCallback(() => {
    window.budgie.voiceStart()
  }, [])

  const handleSpeechEnd = useCallback((audio: Float32Array) => {
    window.budgie.sendAudioChunk(audio)
  }, [])

  const { listening: vadListening } = useVAD({
    enabled: vadEnabled,
    onSpeechStart: handleSpeechStart,
    onSpeechEnd: handleSpeechEnd,
  })

  const toggleMic = () => {
    if (micOn) {
      window.budgie.voiceStop()
    } else {
      window.budgie.voiceStart()
    }
    setMicOn(!micOn)
  }

  const statusLabel = vadListening && state === 'idle' ? 'Listening (hands-free)' : STATUS_LABELS[state]

  return (
    <div className={`voice-view ${compact ? 'compact' : ''}`}>
      <Waveform state={state} level={level} compact={compact} />
      <div className="status-label">{statusLabel}</div>
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
