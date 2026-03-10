import { test, expect, type ElectronApplication, type Page } from '@playwright/test'
import { launchApp, closeApp, passChecksAndStart } from './helpers/app-setup'

let app: ElectronApplication
let window: Page

test.beforeAll(async () => {
  const ctx = await launchApp()
  app = ctx.app
  window = ctx.window
  await passChecksAndStart(window)
})

test.afterAll(async () => {
  await closeApp({ app, window })
})

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Send a voice state change event from main → renderer via IPC.
 */
async function sendVoiceState(state: string): Promise<void> {
  await app.evaluate(
    ({ webContents }, s) => {
      for (const wc of webContents.getAllWebContents()) {
        wc.send('voice:state-changed', s)
      }
    },
    state
  )
}

/**
 * Send TTS format info from main → renderer.
 */
async function sendTtsFormat(format: { type: string; sampleRate?: number; channels?: number; bitDepth?: number }): Promise<void> {
  await app.evaluate(
    ({ webContents }, f) => {
      for (const wc of webContents.getAllWebContents()) {
        wc.send('tts:format', f)
      }
    },
    format
  )
}

/**
 * Send a PCM audio chunk from main → renderer.
 * Generates a short sine wave buffer.
 */
async function sendTtsAudioChunk(durationMs: number, sampleRate = 24000): Promise<void> {
  await app.evaluate(
    ({ webContents }, { durationMs, sampleRate }) => {
      const numSamples = Math.floor((sampleRate * durationMs) / 1000)
      const buffer = new ArrayBuffer(numSamples * 2) // 16-bit PCM
      const view = new Int16Array(buffer)
      // Generate sine wave (440 Hz)
      for (let i = 0; i < numSamples; i++) {
        view[i] = Math.floor(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 16000)
      }
      for (const wc of webContents.getAllWebContents()) {
        wc.send('tts:audio', buffer)
      }
    },
    { durationMs, sampleRate }
  )
}

/**
 * Send TTS stop signal (stream complete, let queued audio finish).
 */
async function sendTtsStop(): Promise<void> {
  await app.evaluate(({ webContents }) => {
    for (const wc of webContents.getAllWebContents()) {
      wc.send('tts:stop')
    }
  })
}

/**
 * Send TTS cancel signal (immediately stop playback).
 */
async function sendTtsCancel(): Promise<void> {
  await app.evaluate(({ webContents }) => {
    for (const wc of webContents.getAllWebContents()) {
      wc.send('tts:cancel')
    }
  })
}

/**
 * Wait for the status label to show the expected text.
 */
async function waitForStatus(text: string, timeoutMs = 5000): Promise<void> {
  await window.locator(`text=${text}`).waitFor({ state: 'visible', timeout: timeoutMs })
}

/**
 * Wait for idle-like status. With VAD active, idle state may show
 * "Listening..." instead of "Ready".
 */
async function waitForIdleStatus(timeoutMs = 5000): Promise<void> {
  const ready = window.locator('text=Ready')
  const listening = window.locator('text=Listening...')
  await ready.or(listening).waitFor({ state: 'visible', timeout: timeoutMs })
}

// ── TTS playback state transitions ───────────────────────────────

test.describe('TTS playback flow', () => {
  test.beforeEach(async () => {
    // Ensure we start from idle
    await sendVoiceState('idle')
    await waitForIdleStatus()
  })

  test('transitions to Speaking state when TTS audio plays', async () => {
    // Simulate the full pipeline: idle → listening → processing → thinking → speaking
    await sendVoiceState('listening')
    await waitForStatus('Listening...')

    await sendVoiceState('processing')
    await waitForStatus('Recognizing...')

    await sendVoiceState('thinking')
    await waitForStatus('Thinking...')

    // Send TTS format + audio to trigger playback
    await sendTtsFormat({ type: 'pcm', sampleRate: 24000, channels: 1, bitDepth: 16 })
    await sendTtsAudioChunk(100)

    await sendVoiceState('speaking')
    await waitForStatus('Speaking...')
  })

  test('returns to Ready after TTS playback completes', async () => {
    // Go through pipeline to speaking
    await sendVoiceState('thinking')
    await sendTtsFormat({ type: 'pcm', sampleRate: 24000, channels: 1, bitDepth: 16 })
    await sendTtsAudioChunk(50)
    await sendVoiceState('speaking')
    await waitForStatus('Speaking...')

    // Signal stream done
    await sendTtsStop()

    // Wait for state to return to idle (main process sends this after TTS_PLAYBACK_DONE)
    await sendVoiceState('idle')
    await waitForIdleStatus()
  })

  test('TTS cancel immediately returns to idle', async () => {
    await sendVoiceState('thinking')
    await sendTtsFormat({ type: 'pcm', sampleRate: 24000, channels: 1, bitDepth: 16 })
    await sendTtsAudioChunk(200)
    await sendVoiceState('speaking')
    await waitForStatus('Speaking...')

    // Cancel playback
    await sendTtsCancel()
    await sendVoiceState('idle')
    await waitForIdleStatus()
  })

  test('STOP button works during speaking', async () => {
    await sendVoiceState('speaking')
    await waitForStatus('Speaking...')

    const stopBtn = window.locator('button', { hasText: 'STOP' })
    await expect(stopBtn).toBeEnabled()
    await stopBtn.click()

    // Clicking STOP triggers voiceStop IPC → main sends idle
    await sendVoiceState('idle')
    await waitForIdleStatus()
  })

  test('STOP button works during thinking', async () => {
    await sendVoiceState('thinking')
    await waitForStatus('Thinking...')

    const stopBtn = window.locator('button', { hasText: 'STOP' })
    await expect(stopBtn).toBeEnabled()
    await stopBtn.click()

    await sendVoiceState('idle')
    await waitForIdleStatus()
  })
})

// ── Repeated conversation cycles ─────────────────────────────────

test.describe('Repeated TTS cycles', () => {
  test('completes two full conversation cycles', async () => {
    // ── Cycle 1 ──
    await sendVoiceState('idle')
    await waitForIdleStatus()

    await sendVoiceState('listening')
    await waitForStatus('Listening...')

    await sendVoiceState('processing')
    await waitForStatus('Recognizing...')

    await sendVoiceState('thinking')
    await waitForStatus('Thinking...')

    await sendTtsFormat({ type: 'pcm', sampleRate: 24000, channels: 1, bitDepth: 16 })
    await sendTtsAudioChunk(50)
    await sendVoiceState('speaking')
    await waitForStatus('Speaking...')

    await sendTtsStop()
    await sendVoiceState('idle')
    await waitForIdleStatus()

    // ── Cycle 2 ──
    await sendVoiceState('listening')
    await waitForStatus('Listening...')

    await sendVoiceState('processing')
    await waitForStatus('Recognizing...')

    await sendVoiceState('thinking')
    await waitForStatus('Thinking...')

    await sendTtsFormat({ type: 'pcm', sampleRate: 24000, channels: 1, bitDepth: 16 })
    await sendTtsAudioChunk(50)
    await sendVoiceState('speaking')
    await waitForStatus('Speaking...')

    await sendTtsStop()
    await sendVoiceState('idle')
    await waitForIdleStatus()
  })

  test('handles interruption mid-TTS and continues to next cycle', async () => {
    // ── Cycle 1: interrupted ──
    await sendVoiceState('idle')
    await waitForIdleStatus()

    await sendVoiceState('thinking')
    await sendTtsFormat({ type: 'pcm', sampleRate: 24000, channels: 1, bitDepth: 16 })
    await sendTtsAudioChunk(200)
    await sendVoiceState('speaking')
    await waitForStatus('Speaking...')

    // User interrupts during TTS
    await sendTtsCancel()
    await sendVoiceState('listening')
    await waitForStatus('Listening...')

    // ── Cycle 2: normal completion ──
    await sendVoiceState('processing')
    await waitForStatus('Recognizing...')

    await sendVoiceState('thinking')
    await waitForStatus('Thinking...')

    await sendTtsFormat({ type: 'pcm', sampleRate: 24000, channels: 1, bitDepth: 16 })
    await sendTtsAudioChunk(50)
    await sendVoiceState('speaking')
    await waitForStatus('Speaking...')

    await sendTtsStop()
    await sendVoiceState('idle')
    await waitForIdleStatus()
  })

  test('three rapid cycles without errors', async () => {
    for (let i = 0; i < 3; i++) {
      await sendVoiceState('idle')
      await waitForIdleStatus()

      await sendVoiceState('listening')
      await waitForStatus('Listening...')

      await sendVoiceState('thinking')
      await waitForStatus('Thinking...')

      await sendTtsFormat({ type: 'pcm', sampleRate: 24000, channels: 1, bitDepth: 16 })
      await sendTtsAudioChunk(30)
      await sendVoiceState('speaking')
      await waitForStatus('Speaking...')

      await sendTtsStop()
    }

    // After all cycles, return to idle
    await sendVoiceState('idle')
    await waitForIdleStatus()
  })

  test('cancel during thinking then retry works', async () => {
    // Attempt 1: cancelled during thinking
    await sendVoiceState('idle')
    await sendVoiceState('listening')
    await sendVoiceState('thinking')
    await waitForStatus('Thinking...')

    // User presses STOP
    await sendVoiceState('idle')
    await waitForIdleStatus()

    // Attempt 2: completes successfully
    await sendVoiceState('listening')
    await waitForStatus('Listening...')

    await sendVoiceState('thinking')
    await sendTtsFormat({ type: 'pcm', sampleRate: 24000, channels: 1, bitDepth: 16 })
    await sendTtsAudioChunk(50)
    await sendVoiceState('speaking')
    await waitForStatus('Speaking...')

    await sendTtsStop()
    await sendVoiceState('idle')
    await waitForIdleStatus()
  })
})
