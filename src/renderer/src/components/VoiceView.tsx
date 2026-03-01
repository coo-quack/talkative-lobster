import { useState, useCallback, useRef } from 'react'
import { Waveform } from './Waveform'
import { useVAD } from '../hooks/useVAD'
import { useSpeakerMonitor } from '../hooks/useSpeakerMonitor'
import type { VoiceState } from '../../../shared/types'

interface Props {
  state: VoiceState
  onOpenSettings: () => void
  stopPlayback: () => void
}

const STATUS_LABELS: Record<string, string> = {
  idle: 'Ready',
  listening: 'Listening...',
  processing: 'Recognizing...',
  thinking: 'Thinking...',
  speaking: 'Speaking...'
}

export function VoiceView({ state, onOpenSettings, stopPlayback }: Props) {
  const [micOn, setMicOn] = useState(true)

  // Monitor system audio output — discard speech detected while speakers are playing
  const { speakerActive } = useSpeakerMonitor(micOn)
  const speakerActiveRef = useRef(speakerActive)
  speakerActiveRef.current = speakerActive
  const stateRef = useRef(state)
  stateRef.current = state

  const vadEnabled = micOn && (state === 'idle' || state === 'listening' || state === 'speaking')

  const stopPlaybackRef = useRef(stopPlayback)
  stopPlaybackRef.current = stopPlayback

  const handleSpeechStart = useCallback(() => {
    const s = stateRef.current
    if (speakerActiveRef.current) {
      console.log('[voice] Ignoring speech start — speaker active')
      return
    }
    if (s === 'speaking') {
      stopPlaybackRef.current()
    }
    window.lobster.voiceStart()
  }, [])

  const handleSpeechEnd = useCallback((audio: Float32Array) => {
    if (speakerActiveRef.current) {
      console.log('[voice] Discarding speech — speaker active')
      window.lobster.voiceStop()
      return
    }
    // Filter out very short audio (< 0.5s at 16kHz)
    if (audio.length < 16000 * 0.5) {
      window.lobster.voiceStop()
      return
    }
    window.lobster.sendAudioChunk(audio)
  }, [])

  const { listening: vadListening } = useVAD({
    enabled: vadEnabled,
    onSpeechStart: handleSpeechStart,
    onSpeechEnd: handleSpeechEnd,
  })

  const toggleMic = () => {
    if (micOn) {
      window.lobster.voiceStop()
    }
    setMicOn(!micOn)
  }


  const statusLabel = !micOn
    ? 'Offline'
    : vadListening && state === 'idle'
      ? 'Listening...'
      : STATUS_LABELS[state]

  return (
    <div className="voice-view">
      <Waveform state={micOn ? state : 'idle'} offline={!micOn} />
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
