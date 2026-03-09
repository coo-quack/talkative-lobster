import { useCallback, useRef } from 'react'
import { Mic, MicOff, Square, Settings } from 'lucide-react'
import { Waveform } from './Waveform'
import { useVAD } from '../hooks/useVAD'
import { useSpeakerMonitor } from '../hooks/useSpeakerMonitor'
import type { VoiceState } from '../../../shared/types'

interface Props {
  state: VoiceState
  micOn: boolean
  onMicToggle: (on: boolean) => void
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

export function VoiceView({ state, micOn, onMicToggle, onOpenSettings, stopPlayback }: Props) {
  const { speakerActive } = useSpeakerMonitor(micOn)
  const speakerActiveRef = useRef(speakerActive)
  speakerActiveRef.current = speakerActive
  const stateRef = useRef(state)
  stateRef.current = state
  const micOnRef = useRef(micOn)
  micOnRef.current = micOn

  const vadEnabled = micOn && (state === 'idle' || state === 'listening' || state === 'speaking')

  const stopPlaybackRef = useRef(stopPlayback)
  stopPlaybackRef.current = stopPlayback

  const handleSpeechStart = useCallback(() => {
    if (!micOnRef.current) {
      console.log('[voice] Ignoring speech start — mic off')
      return
    }
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
    if (!micOnRef.current) {
      console.log('[voice] Discarding speech — mic off')
      return
    }
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

  const handleStop = () => {
    stopPlayback()
    window.lobster.voiceStop()
  }

  const toggleMic = () => {
    if (micOn && (state === 'idle' || state === 'listening')) {
      window.lobster.voiceStop()
    }
    onMicToggle(!micOn)
  }

  const effectiveState = vadListening && state === 'idle' ? 'listening' : state

  const statusLabel =
    !micOn && (state === 'idle' || state === 'listening')
      ? 'Offline'
      : vadListening && state === 'idle'
        ? 'Listening...'
        : STATUS_LABELS[state]

  const STATE_DOT_COLORS: Record<string, string> = {
    idle: '#44403c',
    listening: '#00bc7d',
    processing: '#f59e0b',
    thinking: '#60a5fa',
    speaking: '#a78bfa',
  }

  const isOffline = !micOn && (state === 'idle' || state === 'listening')
  const waveformState = isOffline ? 'idle' : state
  const dotColor = isOffline ? '#44403c' : (STATE_DOT_COLORS[effectiveState] || '#44403c')

  return (
    <div className="flex flex-1 flex-col">
      {/* Main area - waveform + status */}
      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <Waveform state={waveformState} offline={isOffline} />
        <div className="flex items-center gap-2.5 rounded-full bg-[#292524] px-6 py-3">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: dotColor, boxShadow: `0 0 6px ${dotColor}` }}
          />
          <span className="text-[#d6d3d1] text-sm">{statusLabel}</span>
        </div>
      </div>

      {/* Footer - mic button + stop button left, settings button right */}
      <div className="flex shrink-0 items-center justify-between border-[#292524] border-t px-6 py-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleMic}
            className={
              micOn
                ? 'flex h-10 items-center gap-2 rounded-full border-none bg-[#00bc7d] px-4 text-white shadow-[0_0_20px_rgba(0,188,125,0.3)] transition-all hover:bg-[#00d48e]'
                : 'flex h-10 items-center gap-2 rounded-full border border-[#44403b] bg-transparent px-4 text-[#d6d3d1] transition-all hover:border-[#57534e]'
            }
          >
            {micOn ? <Mic size={16} /> : <MicOff size={16} />}
            <span className="text-sm font-medium">{micOn ? 'ON' : 'OFF'}</span>
          </button>
          <button
            type="button"
            onClick={handleStop}
            disabled={state === 'idle'}
            className="flex h-10 items-center gap-2 rounded-full border border-[#44403b] bg-transparent px-4 text-[#d6d3d1] transition-all hover:border-[#57534e] disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:border-[#44403b]"
          >
            <Square size={14} fill="currentColor" />
            <span className="text-sm font-medium">STOP</span>
          </button>
        </div>
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-[#44403b] bg-transparent p-0 transition-all hover:border-[#57534e]"
        >
          <Settings size={18} className="text-[#d6d3d1]" />
        </button>
      </div>
    </div>
  )
}
