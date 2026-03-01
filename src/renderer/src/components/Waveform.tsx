import { useRef, useEffect } from 'react'
import type { VoiceState } from '../../../shared/types'

interface Props {
  state: VoiceState
  compact?: boolean
  offline?: boolean
}

export function Waveform({ state, compact, offline }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    const w = canvas.width
    const h = canvas.height

    if (offline) {
      // Static flat line in dark color
      cancelAnimationFrame(animRef.current)
      ctx.clearRect(0, 0, w, h)
      ctx.strokeStyle = '#333'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(0, h / 2)
      ctx.lineTo(w, h / 2)
      ctx.stroke()
      return
    }

    const draw = () => {
      ctx.clearRect(0, 0, w, h)
      ctx.strokeStyle = stateColor(state)
      ctx.lineWidth = 2

      const amplitude = state === 'idle' ? 0.1 : state === 'thinking' ? 0.15 : state === 'listening' ? 0.3 : state === 'speaking' ? 0.4 : 0.2
      const freq = state === 'speaking' ? 3 : state === 'listening' ? 2 : 1

      ctx.beginPath()
      for (let x = 0; x < w; x++) {
        const t = Date.now() / 1000
        const y = h / 2 + Math.sin((x / w) * Math.PI * freq * 2 + t * 3) * amplitude * h * 0.4
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
      }
      ctx.stroke()
      animRef.current = requestAnimationFrame(draw)
    }
    draw()
    return () => cancelAnimationFrame(animRef.current)
  }, [state, offline])

  const size = compact ? { width: 120, height: 40 } : { width: 300, height: 120 }
  return <canvas ref={canvasRef} {...size} className="waveform" />
}

function stateColor(state: VoiceState): string {
  switch (state) {
    case 'listening':
      return '#4CAF50'
    case 'processing':
      return '#FF9800'
    case 'thinking':
      return '#2196F3'
    case 'speaking':
      return '#9C27B0'
    default:
      return '#666'
  }
}
