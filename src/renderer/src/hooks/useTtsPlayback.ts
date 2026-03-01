import { useEffect, useRef, useCallback } from 'react'

interface PcmFormat {
  type: 'pcm'
  sampleRate: number
  channels: number
  bitDepth: number
}

type AudioFormat = PcmFormat | { type: 'encoded' }

function pcmToAudioBuffer(
  ctx: AudioContext,
  data: ArrayBuffer,
  format: PcmFormat
): AudioBuffer | null {
  // Ensure byte length is a multiple of 2 for Int16Array
  const byteLength = data.byteLength - (data.byteLength % 2)
  if (byteLength === 0) return null
  const int16 = new Int16Array(data, 0, byteLength / 2)
  const float32 = new Float32Array(int16.length)
  for (let i = 0; i < int16.length; i++) {
    float32[i] = int16[i] / 32768.0
  }
  const buffer = ctx.createBuffer(format.channels, float32.length, format.sampleRate)
  buffer.getChannelData(0).set(float32)
  return buffer
}

export function useTtsPlayback() {
  const ctxRef = useRef<AudioContext | null>(null)
  const nextStartTimeRef = useRef(0)
  const scheduledCountRef = useRef(0)
  const finishedCountRef = useRef(0)
  const pendingDecodesRef = useRef(0)
  const streamDoneRef = useRef(false)
  const playbackStartedRef = useRef(false)
  const formatRef = useRef<AudioFormat>({ type: 'encoded' })
  const pcmRemainderRef = useRef<Uint8Array | null>(null)

  const checkPlaybackComplete = useCallback(() => {
    if (
      streamDoneRef.current &&
      pendingDecodesRef.current === 0 &&
      finishedCountRef.current >= scheduledCountRef.current &&
      scheduledCountRef.current > 0
    ) {
      streamDoneRef.current = false
      playbackStartedRef.current = false
      console.log('[tts] Playback fully complete')
      window.lobster.ttsPlaybackDone()
    }
  }, [])

  const resetState = useCallback(() => {
    const ctx = ctxRef.current
    streamDoneRef.current = false
    playbackStartedRef.current = false
    scheduledCountRef.current = 0
    finishedCountRef.current = 0
    pendingDecodesRef.current = 0
    nextStartTimeRef.current = 0
    formatRef.current = { type: 'encoded' }
    pcmRemainderRef.current = null
    if (ctx) {
      ctx.close().catch(() => {})
      ctxRef.current = new AudioContext()
    }
  }, [])

  const scheduleBuffer = useCallback(
    (ctx: AudioContext, buffer: AudioBuffer) => {
      if (!playbackStartedRef.current) {
        playbackStartedRef.current = true
        console.log('[tts] Playback started — notifying main process')
        window.lobster.ttsPlaybackStarted()
      }

      const now = ctx.currentTime
      const startAt = Math.max(nextStartTimeRef.current, now)

      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(ctx.destination)

      scheduledCountRef.current++
      source.onended = () => {
        finishedCountRef.current++
        checkPlaybackComplete()
      }

      source.start(startAt)
      nextStartTimeRef.current = startAt + buffer.duration
    },
    [checkPlaybackComplete]
  )

  const stopPlayback = useCallback(() => {
    resetState()
  }, [resetState])

  useEffect(() => {
    ctxRef.current = new AudioContext()

    const unsubFormat = window.lobster.onTtsFormat((format) => {
      formatRef.current = format as AudioFormat
    })

    const unsubAudio = window.lobster.onTtsAudio(async (audioData: ArrayBuffer) => {
      const ctx = ctxRef.current
      if (!ctx) return
      if (ctx.state === 'suspended') await ctx.resume()

      const format = formatRef.current

      if (format.type === 'pcm') {
        // PCM S16LE: directly convert to AudioBuffer (no async decode needed)
        // Handle odd-byte chunks by carrying remainder to next chunk
        try {
          let data: ArrayBuffer
          const remainder = pcmRemainderRef.current
          if (remainder) {
            const combined = new Uint8Array(remainder.length + audioData.byteLength)
            combined.set(remainder)
            combined.set(new Uint8Array(audioData), remainder.length)
            data = combined.buffer
            pcmRemainderRef.current = null
          } else {
            data = audioData
          }

          // Save odd trailing byte for next chunk
          if (data.byteLength % 2 !== 0) {
            pcmRemainderRef.current = new Uint8Array(data.slice(data.byteLength - 1))
            data = data.slice(0, data.byteLength - 1)
          }

          const buffer = pcmToAudioBuffer(ctx, data, format)
          if (buffer) {
            scheduleBuffer(ctx, buffer)
          }
        } catch (err) {
          console.error('[tts] Failed to process PCM audio:', err)
        }
      } else {
        // Encoded (WAV/MP3): use decodeAudioData
        pendingDecodesRef.current++
        try {
          const buffer = await ctx.decodeAudioData(audioData.slice(0))
          scheduleBuffer(ctx, buffer)
        } catch (err) {
          console.error('[tts] Failed to decode audio:', err)
        } finally {
          pendingDecodesRef.current--
          checkPlaybackComplete()
        }
      }
    })

    const unsubStop = window.lobster.onTtsStop(() => {
      streamDoneRef.current = true
      checkPlaybackComplete()
    })

    const unsubCancel = window.lobster.onTtsCancel(() => {
      resetState()
    })

    return () => {
      unsubFormat()
      unsubAudio()
      unsubStop()
      unsubCancel()
      ctxRef.current?.close()
    }
  }, [checkPlaybackComplete, resetState, scheduleBuffer])

  return { stopPlayback }
}
