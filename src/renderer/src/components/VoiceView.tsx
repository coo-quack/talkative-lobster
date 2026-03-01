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
    if (audio.length < 16000 * 0.5) {
      window.lobster.voiceStop()
      return
    }
    window.lobster.sendAudioChunk(audio)
  }, [])

  const { listening: vadListening } = useVAD({
    enabled: vadEnabled,
    onSpeechStart: handleSpeechStart,
    onSpeechEnd: handleSpeechEnd
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
    <div className="flex shrink-0 flex-col items-center justify-center px-4 py-8">
      <Waveform state={micOn ? state : 'idle'} offline={!micOn} />
      <div className="my-3 text-[#aaa] text-sm">{statusLabel}</div>
      <div className="mt-2 flex gap-2.5">
        <button
          type="button"
          className={`${micOn ? 'border-accent text-accent' : ''}`}
          onClick={toggleMic}
        >
          {micOn ? 'Mic ON' : 'Mic OFF'}
        </button>
        <button type="button" onClick={onOpenSettings}>
          Settings
        </button>
      </div>
    </div>
  )
}
