import { useEffect, useRef, useCallback } from 'react'

export function useTtsPlayback() {
  const ctxRef = useRef<AudioContext | null>(null)
  const sourceRef = useRef<AudioBufferSourceNode | null>(null)

  useEffect(() => {
    ctxRef.current = new AudioContext()

    const unsubAudio = window.budgie.onTtsAudio(async (audioData: ArrayBuffer) => {
      const ctx = ctxRef.current!
      const buffer = await ctx.decodeAudioData(audioData.slice(0))
      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.connect(ctx.destination)
      source.onended = () => {
        sourceRef.current = null
      }
      sourceRef.current = source
      source.start()
    })

    const unsubStop = window.budgie.onTtsStop(() => {
      sourceRef.current?.stop()
      sourceRef.current = null
    })

    return () => {
      unsubAudio()
      unsubStop()
      ctxRef.current?.close()
    }
  }, [])

  const stop = useCallback(() => {
    sourceRef.current?.stop()
    sourceRef.current = null
  }, [])

  return { stop }
}
