import { useRef, useEffect } from 'react'
import type { VoiceState } from '../../../shared/types'

interface Props {
  state: VoiceState
  compact?: boolean
  offline?: boolean
}

interface StateConfig {
  color: string
  amplitude: number
  speed: number
}

const STATE_CONFIGS: Record<string, StateConfig> = {
  idle: { color: '#44403c', amplitude: 2, speed: 1.5 },
  listening: { color: '#00bc7d', amplitude: 8, speed: 2 },
  processing: { color: '#f59e0b', amplitude: 5, speed: 2.5 },
  thinking: { color: '#60a5fa', amplitude: 8, speed: 2 },
  speaking: { color: '#a78bfa', amplitude: 12, speed: 3 }
}

const OFFLINE_CONFIG: StateConfig = { color: '#44403c', amplitude: 0, speed: 0 }

export function Waveform({ state, compact, offline }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const w = canvas.width
    const h = canvas.height
    const cx = w / 2
    const cy = h / 2
    const ringCount = 3
    const margin = 10
    const maxRadius = Math.min(cx, cy) - margin

    const draw = () => {
      ctx.clearRect(0, 0, w, h)
      const config = offline ? OFFLINE_CONFIG : STATE_CONFIGS[state] || STATE_CONFIGS.idle
      const t = Date.now() / 1000

      for (let i = 0; i < ringCount; i++) {
        const ratio = (i + 1) / ringCount
        const baseRadius = ratio * maxRadius
        const phase = i * 0.8
        const pulse = Math.sin(t * config.speed + phase) * config.amplitude * ratio
        const radius = Math.max(0, Math.min(baseRadius + pulse, maxRadius))

        ctx.beginPath()
        ctx.arc(cx, cy, radius, 0, Math.PI * 2)
        ctx.strokeStyle = config.color
        ctx.lineWidth = 1.5
        ctx.globalAlpha = 0.85 - i * 0.2
        ctx.stroke()
      }

      // Center dot
      ctx.globalAlpha = 1
      ctx.beginPath()
      ctx.arc(cx, cy, 2.5, 0, Math.PI * 2)
      ctx.fillStyle = '#fafaf9'
      ctx.fill()

      animRef.current = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(animRef.current)
  }, [state, offline])

  const size = compact ? { width: 120, height: 120 } : { width: 320, height: 192 }
  return <canvas ref={canvasRef} {...size} className="flex items-center justify-center" />
}
