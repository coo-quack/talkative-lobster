import { useEffect, useRef, useState, useCallback } from 'react'
import { MicVAD } from '@ricky0123/vad-web'

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

  const onSpeechStartRef = useRef(onSpeechStart)
  const onSpeechEndRef = useRef(onSpeechEnd)
  onSpeechStartRef.current = onSpeechStart
  onSpeechEndRef.current = onSpeechEnd

  const cleanup = useCallback(async () => {
    // Set null synchronously so startVAD() sees it immediately,
    // even though destroy() is async.
    const vad = vadRef.current
    vadRef.current = null
    versionRef.current++
    if (vad) {
      await vad.destroy()
    }
    setListening(false)
  }, [])

  const startVAD = useCallback(async () => {
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
        getStream: () =>
          navigator.mediaDevices.getUserMedia({
            audio: {
              sampleRate: SAMPLE_RATE,
              channelCount: 1,
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            }
          }),

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
  }, [cleanup, thresholds?.positiveSpeechThreshold, thresholds?.negativeSpeechThreshold])

  useEffect(() => {
    if (enabled) {
      startVAD()
    } else {
      cleanup()
    }
    return () => {
      cleanup()
    }
  }, [enabled, startVAD, cleanup])

  return { listening, loading }
}
