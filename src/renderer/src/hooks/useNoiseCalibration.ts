export interface CalibrationResult {
  noiseFloorRms: number
  positiveSpeechThreshold: number
  negativeSpeechThreshold: number
}

// RMS range boundaries
const RMS_MIN = 0.001
const RMS_MAX = 0.05

// Threshold range boundaries
const THRESHOLD_MIN = 0.70
const THRESHOLD_MAX = 0.92

// Negative threshold ratio
const NEGATIVE_RATIO = 0.6

/**
 * Pure function: maps an RMS noise floor value to VAD thresholds.
 *
 * Higher ambient noise → higher threshold (less sensitive, avoids false positives).
 * Lower ambient noise → lower threshold (more sensitive, catches quiet speech).
 *
 * RMS ∈ [0.001, 0.05] → positiveSpeechThreshold ∈ [0.70, 0.92]
 * Values outside the range are clamped.
 */
export function mapRmsToThreshold(rms: number): CalibrationResult {
  const clamped = Math.max(RMS_MIN, Math.min(RMS_MAX, rms))
  const t = (clamped - RMS_MIN) / (RMS_MAX - RMS_MIN)
  const positiveSpeechThreshold =
    Math.round((THRESHOLD_MIN + t * (THRESHOLD_MAX - THRESHOLD_MIN)) * 100) / 100
  const negativeSpeechThreshold = Math.round(positiveSpeechThreshold * NEGATIVE_RATIO * 100) / 100

  return {
    noiseFloorRms: rms,
    positiveSpeechThreshold,
    negativeSpeechThreshold
  }
}

/**
 * Measures ambient noise level via microphone and returns calibrated VAD thresholds.
 *
 * Opens a mic stream with WebRTC filters, collects RMS samples over `durationMs`,
 * then uses the median RMS to compute thresholds via `mapRmsToThreshold`.
 */
export async function calibrateNoise(
  durationMs = 1500,
  signal?: AbortSignal
): Promise<CalibrationResult> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      sampleRate: 16000,
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
  })

  try {
    const ctx = new AudioContext()
    const source = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    source.connect(analyser)

    const dataArray = new Float32Array(analyser.fftSize)
    const samples: number[] = []
    const intervalMs = 50

    const result = await new Promise<CalibrationResult>((resolve, reject) => {
      if (signal?.aborted) {
        reject(new DOMException('Calibration aborted', 'AbortError'))
        return
      }

      const onAbort = (): void => {
        clearInterval(timer)
        clearTimeout(timeout)
        reject(new DOMException('Calibration aborted', 'AbortError'))
      }
      signal?.addEventListener('abort', onAbort, { once: true })

      const timer = setInterval(() => {
        analyser.getFloatTimeDomainData(dataArray)
        let sum = 0
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i] * dataArray[i]
        }
        samples.push(Math.sqrt(sum / dataArray.length))
      }, intervalMs)

      const timeout = setTimeout(() => {
        clearInterval(timer)
        signal?.removeEventListener('abort', onAbort)

        if (samples.length === 0) {
          resolve(mapRmsToThreshold(RMS_MIN))
          return
        }

        // Use median to be robust against transient sounds
        const sorted = [...samples].sort((a, b) => a - b)
        const medianRms = sorted[Math.floor(sorted.length / 2)]
        console.log(
          `[calibration] ${samples.length} samples, median RMS: ${medianRms.toFixed(5)}`
        )
        resolve(mapRmsToThreshold(medianRms))
      }, durationMs)
    })

    ctx.close()
    return result
  } finally {
    for (const t of stream.getTracks()) t.stop()
  }
}
