import { MicVAD } from '@ricky0123/vad-web'
import { useEffect, useRef, useState } from 'react'

interface UseVADOptions {
  enabled: boolean
  thresholds?: { positiveSpeechThreshold: number; negativeSpeechThreshold: number }
  onSpeechStart: () => void
  onSpeechEnd: (audio: Float32Array) => void
}

const SAMPLE_RATE = 16000

// Resolve asset base path from the HTML document location.
// In file:// mode (production), the JS bundle is in assets/ subdirectory
// so relative paths from the bundle would resolve incorrectly.
// Using document.baseURI gives us the HTML file's directory.
const ASSET_BASE = new URL('./', document.baseURI).href

/**
 * Silero VAD — neural network-based Voice Activity Detection.
 *
 * Uses @ricky0123/vad-web (Silero model) to detect human speech.
 * Echo cancellation and noise suppression are enabled to filter out
 * audio from speakers (e.g. video playback, music).
 */
export function useVAD({ enabled, thresholds, onSpeechStart, onSpeechEnd }: UseVADOptions) {
  const [listening, setListening] = useState(false)
  const [loading, setLoading] = useState(false)

  const vadRef = useRef<MicVAD | null>(null)
  const versionRef = useRef(0)

  // AnalyserNode on the mic stream for real-time RMS measurement.
  // Used to distinguish direct user speech from TTS echo at the
  // instant VAD fires onSpeechStart (no latency added).
  const analyserCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const analyserDataRef = useRef<Float32Array<ArrayBuffer> | null>(null)

  const getMicRms = (): number => {
    const analyser = analyserRef.current
    const data = analyserDataRef.current
    if (!analyser || !data) return 0
    analyser.getFloatTimeDomainData(data)
    let sum = 0
    for (let i = 0; i < data.length; i++) {
      sum += data[i] * data[i]
    }
    return Math.sqrt(sum / data.length)
  }

  // Refs for latest callbacks — MicVAD stores callbacks at init time,
  // so we need refs to always invoke the latest version.
  const onSpeechStartRef = useRef(onSpeechStart)
  const onSpeechEndRef = useRef(onSpeechEnd)
  onSpeechStartRef.current = onSpeechStart
  onSpeechEndRef.current = onSpeechEnd

  const cleanupAnalyser = () => {
    if (analyserCtxRef.current && analyserCtxRef.current.state !== 'closed') {
      analyserCtxRef.current.close().catch(() => {})
    }
    analyserCtxRef.current = null
    analyserRef.current = null
    analyserDataRef.current = null
  }

  const cleanup = async () => {
    // Set null synchronously so startVAD() sees it immediately,
    // even though destroy() is async.
    const vad = vadRef.current
    vadRef.current = null
    versionRef.current++
    cleanupAnalyser()
    if (vad) {
      await vad.destroy()
    }
    setListening(false)
  }

  const startVAD = async () => {
    if (vadRef.current) return

    const version = ++versionRef.current
    setLoading(true)
    try {
      console.log('[vad] Initializing Silero VAD...')

      const vad = await MicVAD.new({
        model: 'v5',
        baseAssetPath: ASSET_BASE,
        onnxWASMBasePath: ASSET_BASE,

        // Provide mic stream with echo cancellation + noise suppression
        // to filter out speaker output (videos, music, TTS playback)
        getStream: async () => {
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              sampleRate: SAMPLE_RATE,
              channelCount: 1,
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            }
          })
          // Tap into the mic stream for real-time RMS monitoring
          cleanupAnalyser()
          const ctx = new AudioContext({ sampleRate: SAMPLE_RATE })
          const source = ctx.createMediaStreamSource(stream)
          const analyser = ctx.createAnalyser()
          analyser.fftSize = 2048
          source.connect(analyser)
          analyserCtxRef.current = ctx
          analyserRef.current = analyser
          analyserDataRef.current = new Float32Array(analyser.fftSize)
          return stream
        },

        // High thresholds to reduce false positives from ambient noise
        positiveSpeechThreshold: thresholds?.positiveSpeechThreshold ?? 0.85,
        negativeSpeechThreshold: thresholds?.negativeSpeechThreshold ?? 0.5,
        minSpeechMs: 300,
        redemptionMs: 1000,

        onSpeechStart: () => {
          console.log('[vad] Speech start (Silero)')
          onSpeechStartRef.current()
        },
        onSpeechEnd: (audio: Float32Array) => {
          console.log(`[vad] Speech end (Silero), ${audio.length} samples`)
          onSpeechEndRef.current(audio)
        },
        onVADMisfire: () => {
          console.log('[vad] Misfire — too short')
        }
      })

      // Stale check: if cleanup or another startVAD ran while we awaited,
      // discard this instance (handles React StrictMode double-mount).
      if (version !== versionRef.current) {
        await vad.destroy()
        return
      }

      vadRef.current = vad
      await vad.start()
      setListening(true)
      console.log('[vad] Silero VAD started')
    } catch (err: unknown) {
      console.error('[vad] Failed to start Silero VAD:', err instanceof Error ? err.message : err)
      await cleanup()
    } finally {
      setLoading(false)
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: startVAD/cleanup only reference stable refs; thresholds trigger VAD re-init
  useEffect(() => {
    let cancelled = false
    if (enabled) {
      // Destroy existing VAD first so startVAD() re-creates it with current thresholds
      cleanup()
        .then(() => {
          if (cancelled) return
          return startVAD()
        })
        .catch((err) => {
          console.error('[vad] Failed during cleanup/start cycle:', err)
        })
    } else {
      cleanup().catch((err) => {
        console.error('[vad] Failed during cleanup:', err)
      })
    }
    return () => {
      cancelled = true
      cleanup().catch((err) => {
        console.error('[vad] Failed during effect cleanup:', err)
      })
    }
  }, [enabled, thresholds?.positiveSpeechThreshold, thresholds?.negativeSpeechThreshold])

  return { listening, loading, getMicRms }
}
