import { describe, expect, it } from 'vitest'

// getMicRms lives inside useVAD and reads from an AnalyserNode.
// The core RMS computation is: sqrt(sum(sample^2) / N).
// We test the math directly to verify correctness and boundary behavior.

function computeRms(data: Float32Array): number {
  if (data.length === 0) return 0
  let sum = 0
  for (let i = 0; i < data.length; i++) {
    sum += data[i] * data[i]
  }
  return Math.sqrt(sum / data.length)
}

describe('RMS computation (getMicRms core logic)', () => {
  it('returns 0 for silence (all zeros)', () => {
    const silence = new Float32Array(2048)
    expect(computeRms(silence)).toBe(0)
  })

  it('returns correct RMS for constant amplitude signal', () => {
    // Constant amplitude of 0.5 → RMS = 0.5
    const data = new Float32Array(1024).fill(0.5)
    expect(computeRms(data)).toBeCloseTo(0.5, 6)
  })

  it('returns correct RMS for low-level echo signal', () => {
    // Typical echo-cancelled TTS residual: ~0.01 RMS
    const data = new Float32Array(2048).fill(0.01)
    expect(computeRms(data)).toBeCloseTo(0.01, 6)
  })

  it('returns correct RMS for conversational speech level', () => {
    // Conversational speech at mic distance: ~0.05–0.15 RMS
    const data = new Float32Array(2048).fill(0.08)
    expect(computeRms(data)).toBeCloseTo(0.08, 6)
  })

  it('correctly distinguishes echo from speech against threshold', () => {
    const ECHO_RMS_THRESHOLD = 0.03

    const echoSignal = new Float32Array(2048).fill(0.015)
    const speechSignal = new Float32Array(2048).fill(0.06)

    expect(computeRms(echoSignal)).toBeLessThan(ECHO_RMS_THRESHOLD)
    expect(computeRms(speechSignal)).toBeGreaterThanOrEqual(ECHO_RMS_THRESHOLD)
  })

  it('handles mixed positive and negative samples', () => {
    // Alternating +0.1 and -0.1 → RMS = 0.1
    const data = new Float32Array(1024)
    for (let i = 0; i < data.length; i++) {
      data[i] = i % 2 === 0 ? 0.1 : -0.1
    }
    expect(computeRms(data)).toBeCloseTo(0.1, 6)
  })

  it('returns correct RMS for a sine wave', () => {
    // Sine wave with amplitude A → RMS = A / sqrt(2)
    const amplitude = 0.5
    const samples = 4096
    const data = new Float32Array(samples)
    for (let i = 0; i < samples; i++) {
      data[i] = amplitude * Math.sin((2 * Math.PI * i) / samples)
    }
    const expectedRms = amplitude / Math.sqrt(2)
    expect(computeRms(data)).toBeCloseTo(expectedRms, 2)
  })

  it('returns 0 for empty array', () => {
    expect(computeRms(new Float32Array(0))).toBe(0)
  })

  it('handles single sample', () => {
    const data = new Float32Array([0.5])
    expect(computeRms(data)).toBeCloseTo(0.5, 6)
  })
})
