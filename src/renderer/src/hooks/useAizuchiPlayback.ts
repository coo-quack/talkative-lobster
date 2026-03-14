import { useEffect, useRef } from 'react'

interface PcmFormat {
  type: 'pcm'
  sampleRate: number
  channels: number
  bitDepth: number
}

type AudioFormat = PcmFormat | { type: 'encoded' }

/**
 * Lightweight audio playback for aizuchi (backchanneling) phrases.
 * Uses a separate AudioContext and IPC channels from main TTS so that
 * playback events do NOT trigger voice state machine transitions.
 */
export function useAizuchiPlayback() {
  const ctxRef = useRef<AudioContext | null>(null)
  const formatRef = useRef<AudioFormat>({ type: 'encoded' })

  const resetState = () => {
    const ctx = ctxRef.current
    if (ctx) {
      ctx.close().catch(() => {})
      ctxRef.current = new AudioContext()
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-only effect — resetState only references stable refs
  useEffect(() => {
    ctxRef.current = new AudioContext()

    const unsubFormat = window.lobster.onAizuchiFormat((format) => {
      formatRef.current = format as AudioFormat
    })

    const unsubAudio = window.lobster.onAizuchiAudio(async (audioData: ArrayBuffer) => {
      const ctx = ctxRef.current
      if (!ctx) return
      if (ctx.state === 'suspended') await ctx.resume()

      const format = formatRef.current

      try {
        let buffer: AudioBuffer | null = null

        if (format.type === 'pcm') {
          const byteLength = audioData.byteLength - (audioData.byteLength % 2)
          if (byteLength === 0) return
          const int16 = new Int16Array(audioData, 0, byteLength / 2)
          const float32 = new Float32Array(int16.length)
          for (let i = 0; i < int16.length; i++) {
            float32[i] = int16[i] / 32768.0
          }
          buffer = ctx.createBuffer(format.channels, float32.length, format.sampleRate)
          buffer.getChannelData(0).set(float32)
        } else {
          buffer = await ctx.decodeAudioData(audioData.slice(0))
        }

        if (buffer) {
          const source = ctx.createBufferSource()
          source.buffer = buffer
          source.connect(ctx.destination)
          source.start()
        }
      } catch (err) {
        console.error('[aizuchi] Failed to play audio:', err)
      }
    })

    const unsubStop = window.lobster.onAizuchiStop(() => {
      // Stream done — audio already scheduled, let it finish
    })

    const unsubCancel = window.lobster.onAizuchiCancel(() => {
      resetState()
    })

    return () => {
      unsubFormat()
      unsubAudio()
      unsubStop()
      unsubCancel()
      ctxRef.current?.close().catch(() => {})
    }
  }, [])

  return { stopAizuchi: resetState }
}
