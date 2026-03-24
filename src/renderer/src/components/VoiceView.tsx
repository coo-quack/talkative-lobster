import { Mic, MicOff, Settings, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { VoiceState } from '../../../shared/types'
import {
  type CalibrationResult,
  calibrateNoise,
  mapRmsToThreshold
} from '../hooks/useNoiseCalibration'
import { useSpeakerMonitor } from '../hooks/useSpeakerMonitor'
import { useVAD } from '../hooks/useVAD'
import { Waveform } from './Waveform'

interface Props {
  state: VoiceState
  micOn: boolean
  onMicToggle: (on: boolean) => void
  onOpenSettings: () => void
  stopPlayback: () => void
  ttsPlaying: boolean
}

// RMS threshold to distinguish direct user speech from TTS echo.
// Echo-cancelled TTS residual is typically < 0.02 RMS;
// conversational speech at mic distance is typically > 0.04 RMS.
const ECHO_RMS_THRESHOLD = 0.03

const STATUS_LABELS: Record<VoiceState, string> = {
  idle: 'Ready',
  listening: 'Listening...',
  processing: 'Recognizing...',
  thinking: 'Thinking...',
  speaking: 'Speaking...'
}

const STATE_DOT_COLORS: Record<VoiceState, string> = {
  idle: 'var(--color-muted)',
  listening: 'var(--color-accent)',
  processing: 'var(--color-warning)',
  thinking: 'var(--color-info)',
  speaking: 'var(--color-speaking)'
}

export function VoiceView({
  state,
  micOn,
  onMicToggle,
  onOpenSettings,
  stopPlayback,
  ttsPlaying
}: Props) {
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const [vadSensitivity, setVadSensitivity] = useState<'auto' | number>('auto')
  const [calibrating, setCalibrating] = useState(false)
  const [calibratedThresholds, setCalibratedThresholds] = useState<CalibrationResult | null>(null)

  useEffect(() => {
    window.lobster
      ?.getVadSensitivity?.()
      .then(setVadSensitivity)
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!micOn) {
      setCalibratedThresholds(null)
      return
    }

    // Manual sensitivity — skip calibration, use fixed thresholds
    if (vadSensitivity !== 'auto') {
      setCalibratedThresholds(mapRmsToThreshold(vadSensitivity))
      return
    }

    if (!navigator.mediaDevices?.getUserMedia) {
      return
    }

    let aborted = false
    const controller = new AbortController()
    setCalibrating(true)

    calibrateNoise(1500, controller.signal)
      .then((result) => {
        if (!aborted) {
          setCalibratedThresholds(result)
          console.log(
            `[voice] Calibrated: positive=${result.positiveSpeechThreshold}, negative=${result.negativeSpeechThreshold}`
          )
        }
      })
      .catch((err) => {
        if (!aborted && err instanceof Error && err.name !== 'AbortError') {
          console.warn('[voice] Calibration failed, using defaults:', err.message)
        }
      })
      .finally(() => {
        if (!aborted) setCalibrating(false)
      })

    return () => {
      aborted = true
      controller.abort()
    }
  }, [micOn, vadSensitivity])

  const { speakerActive } = useSpeakerMonitor(micOn)

  // Keep VAD running at all times when mic is on to avoid
  // repeated destroy/re-init cycles that exhaust mic resources.
  // State filtering happens in the callbacks and orchestrator.
  const vadEnabled = micOn && !calibrating

  const handleSpeechStart = () => {
    if (!mountedRef.current || !micOn) {
      console.log('[voice] Ignoring speech start — mic off or unmounted')
      return
    }
    // During TTS playback, use mic RMS to distinguish real user speech
    // from TTS echo. This check runs before the speakerActive guard
    // because speakerActive may also be true during TTS (loopback capture)
    // and would otherwise block legitimate user interrupts.
    if (state === 'speaking' && ttsPlaying) {
      const rms = getMicRms()
      if (rms < ECHO_RMS_THRESHOLD) {
        console.log(`[voice] Ignoring echo during TTS (RMS=${rms.toFixed(4)})`)
        return
      }
      console.log(`[voice] User interrupt during TTS (RMS=${rms.toFixed(4)})`)
    } else if (speakerActive) {
      console.log('[voice] Ignoring speech start — speaker active')
      return
    }
    if (state === 'speaking') {
      stopPlayback()
    }
    window.lobster.voiceStart()
  }

  const handleSpeechEnd = (audio: Float32Array) => {
    if (!mountedRef.current || !micOn) {
      console.log('[voice] Discarding speech — mic off or unmounted')
      return
    }
    if (speakerActive) {
      console.log('[voice] Discarding speech — speaker active')
      window.lobster.voiceStop()
      return
    }
    // During processing/thinking, the user speaking is an interruption.
    // voiceStart already handled the interrupt — just discard the audio.
    if (state === 'processing' || state === 'thinking') {
      console.log(`[voice] Discarding audio in ${state} state`)
      return
    }
    if (audio.length < 16000 * 0.3) {
      window.lobster.voiceStop()
      return
    }
    window.lobster.sendAudioChunk(audio)
  }

  // These callbacks capture props/state and change identity each render.
  // useVAD handles this via the "ref for latest callback" pattern because
  // MicVAD stores callbacks at init time (see CLAUDE.md Exception).
  const { listening: vadListening, getMicRms } = useVAD({
    enabled: vadEnabled,
    thresholds: calibratedThresholds ?? undefined,
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
      : calibrating
        ? 'Calibrating...'
        : vadListening && state === 'idle'
          ? 'Listening...'
          : STATUS_LABELS[state]

  const isOffline = !micOn && (state === 'idle' || state === 'listening')
  const waveformState = isOffline ? 'idle' : state
  const dotColor = isOffline
    ? 'var(--color-muted)'
    : STATE_DOT_COLORS[effectiveState] || 'var(--color-muted)'

  return (
    <div className="flex flex-1 flex-col">
      {/* Main area - waveform + status */}
      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <Waveform state={waveformState} offline={isOffline} />
        <div className="flex items-center gap-2.5 rounded-full bg-border px-6 py-3">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: dotColor, boxShadow: `0 0 6px ${dotColor}` }}
          />
          <span className="text-sm text-text">{statusLabel}</span>
        </div>
      </div>

      {/* Footer - mic button + stop button left, settings button right */}
      <div className="flex shrink-0 items-center justify-between border-border border-t px-6 py-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleMic}
            className={
              micOn
                ? 'flex h-10 items-center gap-2 rounded-full border-none bg-accent px-4 text-white shadow-[0_0_20px_rgba(0,188,125,0.3)] transition-all hover:bg-accent-hover'
                : 'flex h-10 items-center gap-2 rounded-full border border-muted bg-transparent px-4 text-text transition-all hover:border-[#57534e]'
            }
          >
            {micOn ? <Mic size={16} /> : <MicOff size={16} />}
            <span className="font-medium text-sm">{micOn ? 'ON' : 'OFF'}</span>
          </button>
          <button
            type="button"
            onClick={handleStop}
            disabled={state === 'idle'}
            className="flex h-10 items-center gap-2 rounded-full border border-muted bg-transparent px-4 text-text transition-all hover:border-[#57534e] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-muted"
          >
            <Square size={14} fill="currentColor" />
            <span className="font-medium text-sm">STOP</span>
          </button>
        </div>
        <button
          type="button"
          onClick={onOpenSettings}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-muted bg-transparent p-0 transition-all hover:border-[#57534e]"
        >
          <Settings size={18} className="text-text" />
        </button>
      </div>
    </div>
  )
}
