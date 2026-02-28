import { useEffect, useRef, useState, useCallback } from 'react'
import { MicVAD } from '@ricky0123/vad-web'

interface UseVADOptions {
  enabled: boolean
  onSpeechStart: () => void
  onSpeechEnd: (audio: Float32Array) => void
}

const SAMPLE_RATE = 16000

/**
 * Silero VAD — neural network-based Voice Activity Detection.
 *
 * Uses @ricky0123/vad-web (Silero model) to detect human speech.
 * Echo cancellation and noise suppression are enabled to filter out
 * audio from speakers (e.g. video playback, music).
 */
export function useVAD({ enabled, onSpeechStart, onSpeechEnd }: UseVADOptions) {
  const [listening, setListening] = useState(false)
  const [loading, setLoading] = useState(false)

  const vadRef = useRef<MicVAD | null>(null)

  const onSpeechStartRef = useRef(onSpeechStart)
  const onSpeechEndRef = useRef(onSpeechEnd)
  onSpeechStartRef.current = onSpeechStart
  onSpeechEndRef.current = onSpeechEnd

  const cleanup = useCallback(async () => {
    if (vadRef.current) {
      await vadRef.current.destroy()
      vadRef.current = null
    }
    setListening(false)
  }, [])

  const startVAD = useCallback(async () => {
    if (vadRef.current) return

    setLoading(true)
    try {
      console.log('[vad] Initializing Silero VAD...')

      const vad = await MicVAD.new({
        model: 'v5',
        baseAssetPath: '/',
        onnxWASMBasePath: '/',

        // Provide mic stream with echo cancellation + noise suppression
        // to filter out speaker output (videos, music, TTS playback)
        getStream: () =>
          navigator.mediaDevices.getUserMedia({
            audio: {
              sampleRate: SAMPLE_RATE,
              channelCount: 1,
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          }),

        // Higher threshold to reduce false positives from residual speaker audio
        positiveSpeechThreshold: 0.7,
        negativeSpeechThreshold: 0.5,
        minSpeechMs: 500,
        redemptionMs: 600,

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
        },
      })

      vadRef.current = vad
      await vad.start()
      setListening(true)
      console.log('[vad] Silero VAD started')
    } catch (err: any) {
      console.error('[vad] Failed to start Silero VAD:', err?.message ?? err)
      await cleanup()
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
    return () => {
      cleanup()
    }
  }, [enabled, startVAD, cleanup])

  return { listening, loading }
}
