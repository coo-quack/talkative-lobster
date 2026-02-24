import { useEffect, useRef, useState, useCallback } from 'react'

interface UseVADOptions {
  enabled: boolean
  onSpeechStart: () => void
  onSpeechEnd: (audio: Float32Array) => void
}

/**
 * Energy-based Voice Activity Detection using Web Audio API.
 *
 * Uses an AnalyserNode to detect speech based on RMS energy thresholds.
 * When energy exceeds the threshold for a sustained period, speech is detected.
 * When energy drops below the threshold, speech end is triggered after a
 * configurable silence duration, and the recorded audio is provided.
 */
export function useVAD({ enabled, onSpeechStart, onSpeechEnd }: UseVADOptions) {
  const [listening, setListening] = useState(false)
  const [loading, setLoading] = useState(false)

  const ctxRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const workletRef = useRef<AudioWorkletNode | ScriptProcessorNode | null>(null)
  const rafRef = useRef<number>(0)

  // VAD state refs (avoid stale closures)
  const isSpeakingRef = useRef(false)
  const silenceStartRef = useRef(0)
  const speechStartRef = useRef(0)
  const audioChunksRef = useRef<Float32Array[]>([])

  // Callbacks refs
  const onSpeechStartRef = useRef(onSpeechStart)
  const onSpeechEndRef = useRef(onSpeechEnd)
  onSpeechStartRef.current = onSpeechStart
  onSpeechEndRef.current = onSpeechEnd

  // Tunable parameters
  const ENERGY_THRESHOLD = 0.015 // RMS threshold for speech detection
  const SPEECH_CONFIRM_MS = 150 // ms of energy above threshold to confirm speech
  const SILENCE_DURATION_MS = 800 // ms of silence to trigger speech end
  const SAMPLE_RATE = 16000

  const cleanup = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
    if (workletRef.current) {
      workletRef.current.disconnect()
      workletRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    if (ctxRef.current && ctxRef.current.state !== 'closed') {
      ctxRef.current.close()
      ctxRef.current = null
    }
    analyserRef.current = null
    isSpeakingRef.current = false
    audioChunksRef.current = []
    setListening(false)
  }, [])

  const startVAD = useCallback(async () => {
    if (ctxRef.current) return // already running

    setLoading(true)

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: SAMPLE_RATE,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })

      streamRef.current = stream

      const ctx = new AudioContext({ sampleRate: SAMPLE_RATE })
      ctxRef.current = ctx

      const source = ctx.createMediaStreamSource(stream)

      // Analyser for energy detection
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0.3
      analyserRef.current = analyser
      source.connect(analyser)

      // ScriptProcessor to capture raw audio data (for recording)
      // Using createScriptProcessor as fallback since AudioWorklet
      // requires serving a separate file
      const bufferSize = 4096
      const processor = ctx.createScriptProcessor(bufferSize, 1, 1)
      processor.onaudioprocess = (e: AudioProcessingEvent) => {
        if (isSpeakingRef.current) {
          const inputData = e.inputBuffer.getChannelData(0)
          audioChunksRef.current.push(new Float32Array(inputData))
        }
      }
      source.connect(processor)
      processor.connect(ctx.destination) // required for onaudioprocess to fire
      workletRef.current = processor

      // Energy detection loop
      const dataArray = new Float32Array(analyser.fftSize)

      const detect = (): void => {
        if (!analyserRef.current) return

        analyserRef.current.getFloatTimeDomainData(dataArray)

        // Calculate RMS energy
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i] * dataArray[i]
        }
        const rms = Math.sqrt(sum / dataArray.length)

        const now = performance.now()

        if (rms > ENERGY_THRESHOLD) {
          silenceStartRef.current = 0

          if (!isSpeakingRef.current) {
            if (!speechStartRef.current) {
              speechStartRef.current = now
            } else if (now - speechStartRef.current > SPEECH_CONFIRM_MS) {
              // Confirmed speech start
              isSpeakingRef.current = true
              audioChunksRef.current = []
              onSpeechStartRef.current()
            }
          }
        } else {
          speechStartRef.current = 0

          if (isSpeakingRef.current) {
            if (!silenceStartRef.current) {
              silenceStartRef.current = now
            } else if (now - silenceStartRef.current > SILENCE_DURATION_MS) {
              // Confirmed speech end
              isSpeakingRef.current = false
              silenceStartRef.current = 0

              // Merge audio chunks into a single Float32Array
              const totalLength = audioChunksRef.current.reduce((acc, c) => acc + c.length, 0)
              const merged = new Float32Array(totalLength)
              let offset = 0
              for (const chunk of audioChunksRef.current) {
                merged.set(chunk, offset)
                offset += chunk.length
              }
              audioChunksRef.current = []

              if (merged.length > 0) {
                onSpeechEndRef.current(merged)
              }
            }
          }
        }

        rafRef.current = requestAnimationFrame(detect)
      }

      rafRef.current = requestAnimationFrame(detect)
      setListening(true)
    } catch (err) {
      console.error('[useVAD] Failed to start:', err)
      cleanup()
    } finally {
      setLoading(false)
    }
  }, [cleanup])

  useEffect(() => {
    if (enabled) {
      startVAD()
    } else {
      cleanup()
    }
    return cleanup
  }, [enabled, startVAD, cleanup])

  return { listening, loading }
}
