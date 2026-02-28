import { useState, useCallback, useRef } from 'react'
import { Waveform } from './Waveform'
import { useVoiceState } from '../hooks/useVoiceState'
import { useAudioLevel } from '../hooks/useAudioLevel'
import { useVAD } from '../hooks/useVAD'
import { useSpeakerMonitor } from '../hooks/useSpeakerMonitor'

interface Props {
  onOpenSettings: () => void
}

const STATUS_LABELS: Record<string, string> = {
  idle: 'Ready',
  listening: 'Listening...',
  processing: 'Recognizing...',
  thinking: 'Thinking...',
  speaking: 'Speaking...'
}

export function VoiceView({ onOpenSettings }: Props) {
  const state = useVoiceState()
  const level = useAudioLevel()
  const [micOn, setMicOn] = useState(true)

  // Monitor system audio output — discard speech detected while speakers are playing
  const { speakerActive } = useSpeakerMonitor(micOn)
  const speakerActiveRef = useRef(speakerActive)
  speakerActiveRef.current = speakerActive
  const stateRef = useRef(state)
  stateRef.current = state

  const vadEnabled = micOn && (state === 'idle' || state === 'listening' || state === 'speaking')

  const handleSpeechStart = useCallback(() => {
    // During 'speaking', always allow interruption (ignore speaker monitor
    // since TTS output itself triggers speakerActive)
    if (stateRef.current !== 'speaking' && speakerActiveRef.current) {
      console.log('[voice] Ignoring speech start — speaker active')
      return
    }
    window.budgie.voiceStart()
  }, [])

  const handleSpeechEnd = useCallback((audio: Float32Array) => {
    // During 'speaking', allow interruption regardless of speaker monitor
    if (stateRef.current !== 'speaking' && speakerActiveRef.current) {
      console.log('[voice] Discarding speech — speaker active')
      window.budgie.voiceStop()
      return
    }
    // Filter out very short audio (< 0.5s at 16kHz)
    if (audio.length < 16000 * 0.5) {
      window.budgie.voiceStop()
      return
    }
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
    }
    setMicOn(!micOn)
  }

  const statusLabel = !micOn
    ? 'Standby'
    : vadListening && state === 'idle'
      ? 'Listening...'
      : STATUS_LABELS[state]

  return (
    <div className="voice-view">
      <Waveform state={micOn ? state : 'idle'} level={micOn ? level : 0} />
      <div className="status-label">{statusLabel}</div>
      <div className="controls">
        <button className={`mic-btn ${micOn ? 'active' : ''}`} onClick={toggleMic}>
          {micOn ? 'Mic ON' : 'Mic OFF'}
        </button>
        <button onClick={onOpenSettings}>Settings</button>
      </div>
    </div>
  )
}
