import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export function getApiKey(name: string): string | null {
  // 1. Environment variable
  if (process.env[name]) return process.env[name]!

  // 2. OpenClaw config
  const configPath = join(homedir(), '.openclaw', 'openclaw.json')
  if (existsSync(configPath)) {
    try {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'))
      if (name === 'GATEWAY_TOKEN') return config?.gateway?.auth?.token ?? null
      return config?.env?.[name] ?? null
    } catch { /* ignore */ }
  }

  return null
}

export function requireApiKey(name: string): string {
  const key = getApiKey(name)
  if (!key) throw new Error(`${name} not found in env or openclaw config. Skipping integration test.`)
  return key
}

/**
 * Generate a sine wave as Float32Array (for testing STT with known audio).
 * This won't produce meaningful speech, but tests the pipeline.
 */
export function generateSineWave(durationSec: number, sampleRate: number, freq = 440): Float32Array {
  const samples = new Float32Array(durationSec * sampleRate)
  for (let i = 0; i < samples.length; i++) {
    samples[i] = Math.sin(2 * Math.PI * freq * (i / sampleRate)) * 0.5
  }
  return samples
}

/**
 * Generate a simple Japanese speech test WAV using float32 silence
 * (real STT testing needs actual speech audio)
 */
export function generateSilence(durationSec: number, sampleRate: number): Float32Array {
  return new Float32Array(durationSec * sampleRate)
}

export function float32ToWav(samples: Float32Array, sampleRate: number): Buffer {
  const numChannels = 1
  const bitsPerSample = 16
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8
  const blockAlign = (numChannels * bitsPerSample) / 8
  const dataSize = samples.length * 2
  const buffer = Buffer.alloc(44 + dataSize)

  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(numChannels, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(byteRate, 28)
  buffer.writeUInt16LE(blockAlign, 32)
  buffer.writeUInt16LE(bitsPerSample, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]))
    buffer.writeInt16LE(clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, 44 + i * 2)
  }

  return buffer
}
