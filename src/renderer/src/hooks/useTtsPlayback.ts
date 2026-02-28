import { useEffect, useRef, useCallback } from 'react'

export function useTtsPlayback() {
  const ctxRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<AudioBufferSourceNode | null>(null)
  const queueRef = useRef<AudioBuffer[]>([])
  const playingRef = useRef(false)
  const streamDoneRef = useRef(false)

  const playNext = useCallback(() => {
    const ctx = ctxRef.current
    if (!ctx || queueRef.current.length === 0) {
      playingRef.current = false
      // All chunks received and queue empty = playback fully done
      if (streamDoneRef.current) {
        streamDoneRef.current = false
        console.log('[tts] Playback fully complete')
        window.budgie.ttsPlaybackDone()
      }
      return
    }

    playingRef.current = true
    const buffer = queueRef.current.shift()!
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)
    source.onended = () => {
      sourceRef.current = null
      playNext()
    }
    sourceRef.current = source
    source.start()
  }, [])

  useEffect(() => {
    ctxRef.current = new AudioContext()

    const unsubAudio = window.budgie.onTtsAudio(async (audioData: ArrayBuffer) => {
      const ctx = ctxRef.current!
      if (ctx.state === 'suspended') await ctx.resume()

      try {
        const buffer = await ctx.decodeAudioData(audioData.slice(0))
        queueRef.current.push(buffer)
        if (!playingRef.current) playNext()
      } catch (err) {
        console.error('[tts] Failed to decode audio:', err)
      }
    })

    // TTS_STOP signals all chunks have been sent from main process
    const unsubStop = window.budgie.onTtsStop(() => {
      streamDoneRef.current = true
      // If nothing playing or queued, notify immediately
      if (!playingRef.current && queueRef.current.length === 0) {
        streamDoneRef.current = false
        window.budgie.ttsPlaybackDone()
      }
    })

    return () => {
      unsubAudio()
      unsubStop()
      ctxRef.current?.close()
    }
  }, [playNext])

  const stop = useCallback(() => {
    streamDoneRef.current = false
    queueRef.current = []
    const src = sourceRef.current
    sourceRef.current = null
    playingRef.current = false
    if (src) {
      src.onended = null
      src.stop()
    }
    window.budgie.ttsPlaybackDone()
  }, [])

  return { stop }
}
