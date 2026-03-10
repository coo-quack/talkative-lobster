import { useEffect, useRef, useState, useCallback } from 'react'

/**
 * Monitors system audio output via Electron's desktopCapturer.
 * Returns `speakerActive` — true when system audio is playing above threshold.
 * Used to suppress VAD while speakers are active (echo reduction).
 */
export function useSpeakerMonitor(enabled: boolean) {
  const [speakerActive, setSpeakerActive] = useState(false)

  const ctxRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const rafRef = useRef<number>(0)
  const activeRef = useRef(false)

  // Debounce: keep speakerActive true for a short period after audio stops
  // to avoid rapid toggling
  const cooldownRef = useRef(0)
  const COOLDOWN_MS = 800
  const RMS_THRESHOLD = 0.01

  const cleanup = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        t.stop()
      })
      streamRef.current = null
    }
    if (ctxRef.current && ctxRef.current.state !== 'closed') {
      ctxRef.current.close()
      ctxRef.current = null
    }
    analyserRef.current = null
    activeRef.current = false
    setSpeakerActive(false)
  }, [])

  const start = useCallback(async () => {
    if (ctxRef.current) return

    try {
      // Use Electron's desktopCapturer to get system audio
      // navigator.mediaDevices.getDisplayMedia with audio captures system sound
      const stream = await navigator.mediaDevices.getDisplayMedia({
        audio: true,
        video: { width: 1, height: 1, frameRate: 1 } // minimal video (required by API)
      })

      // Stop the video track immediately — we only need audio
      stream.getVideoTracks().forEach((t) => {
        t.stop()
      })

      const audioTracks = stream.getAudioTracks()
      if (audioTracks.length === 0) {
        console.log('[speaker-monitor] No audio track from system capture')
        stream.getTracks().forEach((t) => {
          t.stop()
        })
        return
      }

      streamRef.current = stream

      const ctx = new AudioContext()
      ctxRef.current = ctx

      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0.5
      analyserRef.current = analyser
      source.connect(analyser)

      const dataArray = new Float32Array(analyser.fftSize)

      const detect = (): void => {
        if (!analyserRef.current) return

        analyserRef.current.getFloatTimeDomainData(dataArray)

        let sum = 0
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i] * dataArray[i]
        }
        const rms = Math.sqrt(sum / dataArray.length)

        const now = performance.now()

        if (rms > RMS_THRESHOLD) {
          cooldownRef.current = now
          if (!activeRef.current) {
            activeRef.current = true
            setSpeakerActive(true)
            console.log('[speaker-monitor] Speaker active')
          }
        } else if (activeRef.current && now - cooldownRef.current > COOLDOWN_MS) {
          activeRef.current = false
          setSpeakerActive(false)
          console.log('[speaker-monitor] Speaker silent')
        }

        rafRef.current = requestAnimationFrame(detect)
      }

      rafRef.current = requestAnimationFrame(detect)
      console.log('[speaker-monitor] System audio monitoring started')
    } catch (err: unknown) {
      console.log(
        '[speaker-monitor] System audio capture not available:',
        err instanceof Error ? err.message : err
      )
      // Not critical — if capture fails, VAD runs without speaker gating
    }
  }, [])

  useEffect(() => {
    if (enabled) {
      start()
    } else {
      cleanup()
    }
    return cleanup
  }, [enabled, start, cleanup])

  return { speakerActive }
}
