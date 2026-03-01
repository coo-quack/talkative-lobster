import { useEffect, useRef, useCallback } from 'react'

export function useTtsPlayback() {
  const ctxRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<AudioBufferSourceNode | null>(null)
  const queueRef = useRef<AudioBuffer[]>([])
  const playingRef = useRef(false)
  const streamDoneRef = useRef(false)
  const playbackStartedRef = useRef(false)

  const stopPlayback = useCallback(() => {
    streamDoneRef.current = false
    playbackStartedRef.current = false
    queueRef.current = []
    const src = sourceRef.current
    sourceRef.current = null
    playingRef.current = false
    if (src) {
      src.onended = null
      try { src.stop() } catch { /* already stopped */ }
    }
  }, [])

  const playNext = useCallback(() => {
    const ctx = ctxRef.current
    if (!ctx || queueRef.current.length === 0) {
      playingRef.current = false
      // All chunks received and queue empty = playback fully done
      if (streamDoneRef.current) {
        streamDoneRef.current = false
        console.log('[tts] Playback fully complete')
        window.lobster.ttsPlaybackDone()
      }
      return
    }

    playingRef.current = true
    // Notify main process when first audio chunk starts playing
    if (!playbackStartedRef.current) {
      playbackStartedRef.current = true
      console.log('[tts] Playback started — notifying main process')
      window.lobster.ttsPlaybackStarted()
    }
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

    const unsubAudio = window.lobster.onTtsAudio(async (audioData: ArrayBuffer) => {
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

    // TTS_STOP: all chunks sent — mark stream as done.
    // playNext will send ttsPlaybackDone when queue empties after playback.
    const unsubStop = window.lobster.onTtsStop(() => {
      streamDoneRef.current = true
    })

    return () => {
      unsubAudio()
      unsubStop()
      ctxRef.current?.close()
    }
  }, [playNext])

  return { stopPlayback }
}
