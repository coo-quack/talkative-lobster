import { describe, it, expect } from 'vitest'
import { mapRmsToThreshold } from '../hooks/useNoiseCalibration'

describe('mapRmsToThreshold', () => {
  it('returns minimum threshold for very quiet environment (RMS = 0.001)', () => {
    const result = mapRmsToThreshold(0.001)
    expect(result.positiveSpeechThreshold).toBe(0.7)
    expect(result.negativeSpeechThreshold).toBe(0.42)
    expect(result.noiseFloorRms).toBe(0.001)
  })

  it('returns maximum threshold for noisy environment (RMS = 0.05)', () => {
    const result = mapRmsToThreshold(0.05)
    expect(result.positiveSpeechThreshold).toBe(0.92)
    expect(result.negativeSpeechThreshold).toBe(0.55)
    expect(result.noiseFloorRms).toBe(0.05)
  })

  it('returns interpolated threshold for mid-range RMS', () => {
    const midRms = (0.001 + 0.05) / 2 // 0.0255
    const result = mapRmsToThreshold(midRms)
    expect(result.positiveSpeechThreshold).toBe(0.81)
    expect(result.negativeSpeechThreshold).toBe(0.49)
  })

  it('clamps RMS below minimum to minimum threshold', () => {
    const result = mapRmsToThreshold(0)
    expect(result.positiveSpeechThreshold).toBe(0.7)
    expect(result.noiseFloorRms).toBe(0)
  })

  it('clamps RMS above maximum to maximum threshold', () => {
    const result = mapRmsToThreshold(0.1)
    expect(result.positiveSpeechThreshold).toBe(0.92)
    expect(result.noiseFloorRms).toBe(0.1)
  })

  it('preserves original RMS in noiseFloorRms even when clamped', () => {
    const belowMin = mapRmsToThreshold(-0.5)
    expect(belowMin.noiseFloorRms).toBe(-0.5)

    const aboveMax = mapRmsToThreshold(1.0)
    expect(aboveMax.noiseFloorRms).toBe(1.0)
  })

  it('negativeSpeechThreshold is always 60% of positiveSpeechThreshold', () => {
    const testValues = [0.001, 0.01, 0.025, 0.04, 0.05]
    for (const rms of testValues) {
      const result = mapRmsToThreshold(rms)
      const expected = Math.round(result.positiveSpeechThreshold * 0.6 * 100) / 100
      expect(result.negativeSpeechThreshold).toBe(expected)
    }
  })

  it('positiveSpeechThreshold increases monotonically with RMS', () => {
    const rmsValues = [0.001, 0.005, 0.01, 0.02, 0.03, 0.04, 0.05]
    const thresholds = rmsValues.map((rms) => mapRmsToThreshold(rms).positiveSpeechThreshold)
    for (let i = 1; i < thresholds.length; i++) {
      expect(thresholds[i]).toBeGreaterThanOrEqual(thresholds[i - 1])
    }
  })

  it('returns consistent results for same input', () => {
    const a = mapRmsToThreshold(0.02)
    const b = mapRmsToThreshold(0.02)
    expect(a).toEqual(b)
  })

  it('rounds to 2 decimal places', () => {
    const result = mapRmsToThreshold(0.0123)
    const posStr = result.positiveSpeechThreshold.toString()
    const negStr = result.negativeSpeechThreshold.toString()
    const decimals = (s: string): number => (s.includes('.') ? s.split('.')[1].length : 0)
    expect(decimals(posStr)).toBeLessThanOrEqual(2)
    expect(decimals(negStr)).toBeLessThanOrEqual(2)
  })

  it('handles boundary value RMS_MIN exactly', () => {
    const result = mapRmsToThreshold(0.001)
    expect(result.positiveSpeechThreshold).toBe(0.7)
  })

  it('handles boundary value RMS_MAX exactly', () => {
    const result = mapRmsToThreshold(0.05)
    expect(result.positiveSpeechThreshold).toBe(0.92)
  })

  it('handles very small positive RMS near zero', () => {
    const result = mapRmsToThreshold(0.0001)
    // Should clamp to minimum
    expect(result.positiveSpeechThreshold).toBe(0.7)
  })

  it('threshold range covers expected spread', () => {
    const min = mapRmsToThreshold(0.001).positiveSpeechThreshold
    const max = mapRmsToThreshold(0.05).positiveSpeechThreshold
    expect(max - min).toBeCloseTo(0.22, 2)
  })
})
