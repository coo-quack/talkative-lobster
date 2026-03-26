// @vitest-environment jsdom

import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import type { VoiceState } from '../../../shared/types'
import App from '../App'

// ── Mock lobster API ─────────────────────────────────────────────────

type Callback = (...args: unknown[]) => void

let voiceStateCallback: ((state: VoiceState) => void) | null = null
let _connectionStatusCallback: Callback | null = null
let _errorCallback: Callback | null = null

const noop = () => () => {}

const mockStopPlayback = vi.fn()
let mockTtsPlaying = false

const mockLobster = {
  getKeys: vi.fn().mockResolvedValue([
    { name: 'ELEVENLABS_API_KEY', isSet: true },
    { name: 'OPENCLAW_TOKEN', isSet: true }
  ]),
  onConnectionStatus: vi.fn((cb: Callback) => {
    _connectionStatusCallback = cb
    return () => {
      _connectionStatusCallback = null
    }
  }),
  onError: vi.fn((cb: Callback) => {
    _errorCallback = cb
    return () => {
      _errorCallback = null
    }
  }),
  onVoiceStateChanged: vi.fn((cb: (state: VoiceState) => void) => {
    voiceStateCallback = cb
    return () => {
      voiceStateCallback = null
    }
  }),
  voiceStart: vi.fn(),
  voiceStop: vi.fn(),
  voiceInterrupt: vi.fn(),
  sendAudioChunk: vi.fn(),
  ttsPlaybackStarted: vi.fn(),
  ttsPlaybackDone: vi.fn(),
  onTtsFormat: vi.fn(noop),
  onTtsAudio: vi.fn(noop),
  onTtsStop: vi.fn(noop),
  onTtsCancel: vi.fn(noop),
  // Settings APIs
  getTtsVoice: vi.fn().mockResolvedValue('default'),
  setTtsVoice: vi.fn().mockResolvedValue(undefined),
  getTtsModel: vi.fn().mockResolvedValue('default'),
  setTtsModel: vi.fn().mockResolvedValue(undefined),
  getSttProvider: vi.fn().mockResolvedValue('elevenlabs'),
  setSttProvider: vi.fn().mockResolvedValue(undefined),
  getLocalWhisperPath: vi.fn().mockResolvedValue(''),
  setLocalWhisperPath: vi.fn().mockResolvedValue(undefined),
  getTtsProvider: vi.fn().mockResolvedValue('elevenlabs'),
  setTtsProvider: vi.fn().mockResolvedValue(undefined),
  getVoicevoxUrl: vi.fn().mockResolvedValue(''),
  setVoicevoxUrl: vi.fn().mockResolvedValue(undefined),
  getKokoroUrl: vi.fn().mockResolvedValue(''),
  setKokoroUrl: vi.fn().mockResolvedValue(undefined),
  getKokoroVoice: vi.fn().mockResolvedValue(''),
  setKokoroVoice: vi.fn().mockResolvedValue(undefined),
  getPiperPath: vi.fn().mockResolvedValue(''),
  setPiperPath: vi.fn().mockResolvedValue(undefined),
  getPiperModelPath: vi.fn().mockResolvedValue(''),
  setPiperModelPath: vi.fn().mockResolvedValue(undefined),
  getVoicevoxSpeaker: vi.fn().mockResolvedValue(0),
  setVoicevoxSpeaker: vi.fn().mockResolvedValue(undefined),
  checkGateway: vi.fn().mockResolvedValue({ ok: true, message: 'ok' }),
  checkTtsProvider: vi.fn().mockResolvedValue({ ok: true, message: 'ok' }),
  checkSttProvider: vi.fn().mockResolvedValue({ ok: true, message: 'ok' }),
  readKeyFromOpenclaw: vi.fn().mockResolvedValue(null),
  readKeyFromEnv: vi.fn().mockResolvedValue(null),
  setKey: vi.fn().mockResolvedValue(undefined),
  // Aizuchi audio
  onAizuchiFormat: vi.fn(noop),
  onAizuchiAudio: vi.fn(noop),
  onAizuchiStop: vi.fn(noop),
  onAizuchiCancel: vi.fn(noop),
  // VAD & Gateway
  getVadSensitivity: vi.fn().mockResolvedValue('auto'),
  setVadSensitivity: vi.fn().mockResolvedValue(undefined),
  getGatewayUrl: vi.fn().mockResolvedValue('ws://127.0.0.1:18789'),
  setGatewayUrl: vi.fn().mockResolvedValue(undefined),
  sessionStart: vi.fn().mockResolvedValue(undefined),
  // App version & update
  getAppVersion: vi.fn().mockResolvedValue('1.0.5'),
  checkForUpdate: vi.fn().mockResolvedValue({
    currentVersion: '1.0.5',
    latestVersion: '1.0.5',
    updateAvailable: false,
    releaseUrl: null
  })
}

// ── Mock hooks ────────────────────────────────────────────────────────

vi.mock('../hooks/useTtsPlayback', () => ({
  useTtsPlayback: () => ({ stopPlayback: mockStopPlayback, playing: mockTtsPlaying })
}))

vi.mock('../hooks/useAizuchiPlayback', () => ({
  useAizuchiPlayback: () => ({ stopAizuchi: vi.fn() })
}))

vi.mock('../hooks/useVAD', () => ({
  useVAD: () => ({ listening: false, loading: false, getMicRms: () => 0 })
}))

vi.mock('../hooks/useSpeakerMonitor', () => ({
  useSpeakerMonitor: () => ({ speakerActive: false })
}))

// ── Canvas mock ──────────────────────────────────────────────────────

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    scale: vi.fn(),
    setTransform: vi.fn(),
    set strokeStyle(_v: string) {},
    set fillStyle(_v: string) {},
    set lineWidth(_v: number) {},
    set globalAlpha(_v: number) {}
  })
})

// ── Setup ────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  voiceStateCallback = null
  // Read before reset to satisfy noUnusedLocals
  void _connectionStatusCallback
  void _errorCallback
  _connectionStatusCallback = null
  _errorCallback = null
  ;(window as unknown as { lobster: typeof mockLobster }).lobster = mockLobster
})

afterEach(() => {
  cleanup()
  mockTtsPlaying = false
})

// ── Helper ───────────────────────────────────────────────────────────

async function renderApp() {
  await act(async () => {
    render(<App />)
  })
  await act(async () => {
    await Promise.resolve()
  })
}

function transitionTo(state: VoiceState) {
  act(() => {
    voiceStateCallback?.(state)
  })
}

// ── Tests ────────────────────────────────────────────────────────────

describe('Voice state transitions', () => {
  describe('status label transitions', () => {
    it('idle → listening: shows "Listening..."', async () => {
      await renderApp()
      expect(screen.getByText('Ready')).toBeInTheDocument()

      transitionTo('listening')
      expect(screen.getByText('Listening...')).toBeInTheDocument()
      expect(screen.queryByText('Ready')).not.toBeInTheDocument()
    })

    it('listening → processing: shows "Recognizing..."', async () => {
      await renderApp()
      transitionTo('listening')
      expect(screen.getByText('Listening...')).toBeInTheDocument()

      transitionTo('processing')
      expect(screen.getByText('Recognizing...')).toBeInTheDocument()
      expect(screen.queryByText('Listening...')).not.toBeInTheDocument()
    })

    it('processing → thinking: shows "Thinking..."', async () => {
      await renderApp()
      transitionTo('processing')

      transitionTo('thinking')
      expect(screen.getByText('Thinking...')).toBeInTheDocument()
      expect(screen.queryByText('Recognizing...')).not.toBeInTheDocument()
    })

    it('thinking → speaking: shows "Speaking..."', async () => {
      await renderApp()
      transitionTo('thinking')

      transitionTo('speaking')
      expect(screen.getByText('Speaking...')).toBeInTheDocument()
      expect(screen.queryByText('Thinking...')).not.toBeInTheDocument()
    })

    it('speaking → idle: shows "Ready"', async () => {
      await renderApp()
      transitionTo('speaking')

      transitionTo('idle')
      expect(screen.getByText('Ready')).toBeInTheDocument()
      expect(screen.queryByText('Speaking...')).not.toBeInTheDocument()
    })
  })

  describe('full cycle transition', () => {
    it('idle → listening → processing → thinking → speaking → idle', async () => {
      await renderApp()
      expect(screen.getByText('Ready')).toBeInTheDocument()

      transitionTo('listening')
      expect(screen.getByText('Listening...')).toBeInTheDocument()

      transitionTo('processing')
      expect(screen.getByText('Recognizing...')).toBeInTheDocument()

      transitionTo('thinking')
      expect(screen.getByText('Thinking...')).toBeInTheDocument()

      transitionTo('speaking')
      expect(screen.getByText('Speaking...')).toBeInTheDocument()

      transitionTo('idle')
      expect(screen.getByText('Ready')).toBeInTheDocument()
    })

    it('two full cycles show correct labels', async () => {
      await renderApp()

      // Cycle 1
      transitionTo('listening')
      transitionTo('processing')
      transitionTo('thinking')
      transitionTo('speaking')
      transitionTo('idle')
      expect(screen.getByText('Ready')).toBeInTheDocument()

      // Cycle 2
      transitionTo('listening')
      expect(screen.getByText('Listening...')).toBeInTheDocument()
      transitionTo('processing')
      transitionTo('thinking')
      transitionTo('speaking')
      transitionTo('idle')
      expect(screen.getByText('Ready')).toBeInTheDocument()
    })
  })

  describe('interrupt transitions', () => {
    it('speaking → listening (user interrupts)', async () => {
      await renderApp()
      transitionTo('speaking')
      expect(screen.getByText('Speaking...')).toBeInTheDocument()

      transitionTo('listening')
      expect(screen.getByText('Listening...')).toBeInTheDocument()
    })

    it('thinking → listening (user interrupts)', async () => {
      await renderApp()
      transitionTo('thinking')
      expect(screen.getByText('Thinking...')).toBeInTheDocument()

      transitionTo('listening')
      expect(screen.getByText('Listening...')).toBeInTheDocument()
    })

    it('processing → idle (cancel/STT fail)', async () => {
      await renderApp()
      transitionTo('processing')
      expect(screen.getByText('Recognizing...')).toBeInTheDocument()

      transitionTo('idle')
      expect(screen.getByText('Ready')).toBeInTheDocument()
    })

    it('thinking → idle (cancel)', async () => {
      await renderApp()
      transitionTo('thinking')

      transitionTo('idle')
      expect(screen.getByText('Ready')).toBeInTheDocument()
    })
  })

  describe('STOP button state during transitions', () => {
    it('STOP button disabled in idle, enabled in other states', async () => {
      await renderApp()

      // Idle: STOP disabled
      const buttons = document.querySelectorAll('button')
      const stopBtn = Array.from(buttons).find((b) => b.textContent?.includes('STOP'))
      expect(stopBtn).toBeDefined()
      expect(stopBtn?.hasAttribute('disabled')).toBe(true)

      // Listening: STOP enabled
      transitionTo('listening')
      expect(stopBtn?.hasAttribute('disabled')).toBe(false)

      // Processing: STOP enabled
      transitionTo('processing')
      expect(stopBtn?.hasAttribute('disabled')).toBe(false)

      // Thinking: STOP enabled
      transitionTo('thinking')
      expect(stopBtn?.hasAttribute('disabled')).toBe(false)

      // Speaking: STOP enabled
      transitionTo('speaking')
      expect(stopBtn?.hasAttribute('disabled')).toBe(false)

      // Back to idle: STOP disabled
      transitionTo('idle')
      expect(stopBtn?.hasAttribute('disabled')).toBe(true)
    })
  })

  describe('status dot color during transitions', () => {
    function getStatusDot(): HTMLElement | null {
      const pill = document.querySelector('.bg-border')
      return pill?.querySelector('.h-2.w-2') as HTMLElement | null
    }

    it('dot color changes through full cycle', async () => {
      await renderApp()

      const dot = getStatusDot()
      expect(dot).not.toBeNull()

      // idle: --color-muted
      expect(dot?.style.backgroundColor).toBe('var(--color-muted)')

      // listening: --color-accent
      transitionTo('listening')
      expect(dot?.style.backgroundColor).toBe('var(--color-accent)')

      // processing: --color-warning
      transitionTo('processing')
      expect(dot?.style.backgroundColor).toBe('var(--color-warning)')

      // thinking: --color-info
      transitionTo('thinking')
      expect(dot?.style.backgroundColor).toBe('var(--color-info)')

      // speaking: --color-speaking
      transitionTo('speaking')
      expect(dot?.style.backgroundColor).toBe('var(--color-speaking)')

      // back to idle: --color-muted
      transitionTo('idle')
      expect(dot?.style.backgroundColor).toBe('var(--color-muted)')
    })
  })

  describe('TTS playback stops on state transition from speaking', () => {
    it('stopPlayback called when leaving speaking state while TTS playing', async () => {
      mockTtsPlaying = true
      await renderApp()
      transitionTo('speaking')
      mockStopPlayback.mockClear()

      transitionTo('idle')
      expect(mockStopPlayback).toHaveBeenCalled()
    })

    it('stopPlayback called when interrupted from speaking to listening', async () => {
      mockTtsPlaying = true
      await renderApp()
      transitionTo('speaking')
      mockStopPlayback.mockClear()

      transitionTo('listening')
      expect(mockStopPlayback).toHaveBeenCalled()
    })

    it('stopPlayback called when leaving thinking state while TTS playing', async () => {
      mockTtsPlaying = true
      await renderApp()
      transitionTo('thinking')
      mockStopPlayback.mockClear()

      transitionTo('idle')
      expect(mockStopPlayback).toHaveBeenCalled()
    })

    it('ttsPlaybackDone called when transition speaking/thinking → listening', async () => {
      mockTtsPlaying = true
      await renderApp()
      transitionTo('speaking')
      mockStopPlayback.mockClear()

      transitionTo('listening')
      expect(mockStopPlayback).toHaveBeenCalled()
      expect(mockLobster.ttsPlaybackDone).toHaveBeenCalled()
    })

    it('ttsPlaybackDone NOT called when transition speaking → idle', async () => {
      mockTtsPlaying = true
      await renderApp()
      transitionTo('speaking')
      mockLobster.ttsPlaybackDone.mockClear()

      transitionTo('idle')
      // idle does not trigger ttsPlaybackDone (only listening does)
      expect(mockLobster.ttsPlaybackDone).not.toHaveBeenCalled()
    })

    it('stopPlayback NOT called when TTS already completed', async () => {
      mockTtsPlaying = false
      await renderApp()
      transitionTo('speaking')
      mockStopPlayback.mockClear()

      transitionTo('idle')
      expect(mockStopPlayback).not.toHaveBeenCalled()
    })
  })

  describe('onVoiceStateChanged subscription', () => {
    it('registers callback on mount', async () => {
      await renderApp()
      expect(mockLobster.onVoiceStateChanged).toHaveBeenCalled()
      expect(voiceStateCallback).not.toBeNull()
    })

    it('state updates from callback update the UI', async () => {
      await renderApp()
      expect(screen.getByText('Ready')).toBeInTheDocument()

      transitionTo('thinking')
      expect(screen.getByText('Thinking...')).toBeInTheDocument()
    })
  })
})
