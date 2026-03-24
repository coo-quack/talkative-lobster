// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import type { VoiceState } from '../../../shared/types'
import { VoiceView } from '../components/VoiceView'

// ── Controllable useVAD mock ─────────────────────────────────────────
// Captures the callbacks VoiceView passes to useVAD so tests can
// invoke onSpeechStart / onSpeechEnd directly.

let capturedOnSpeechStart: (() => void) | null = null
let capturedOnSpeechEnd: ((audio: Float32Array) => void) | null = null
let mockGetMicRms = vi.fn(() => 0)

vi.mock('../hooks/useVAD', () => ({
  useVAD: (opts: { onSpeechStart: () => void; onSpeechEnd: (audio: Float32Array) => void }) => {
    capturedOnSpeechStart = opts.onSpeechStart
    capturedOnSpeechEnd = opts.onSpeechEnd
    return { listening: true, loading: false, getMicRms: mockGetMicRms }
  }
}))

vi.mock('../hooks/useSpeakerMonitor', () => ({
  useSpeakerMonitor: () => ({ speakerActive: false })
}))

// ── Mock lobster API ─────────────────────────────────────────────────

const mockLobster = {
  voiceStart: vi.fn(),
  voiceStop: vi.fn(),
  voiceInterrupt: vi.fn(),
  sendAudioChunk: vi.fn(),
  getVadSensitivity: vi.fn().mockResolvedValue('auto'),
  getAppVersion: vi.fn().mockResolvedValue('1.0.0'),
  checkForUpdate: vi.fn().mockResolvedValue({
    currentVersion: '1.0.0',
    latestVersion: '1.0.0',
    updateAvailable: false,
    releaseUrl: null
  })
}

// ── Canvas mock ──────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  capturedOnSpeechStart = null
  capturedOnSpeechEnd = null
  mockGetMicRms = vi.fn(() => 0)
  ;(window as unknown as { lobster: typeof mockLobster }).lobster = mockLobster
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

afterEach(() => {
  cleanup()
})

// ── Helpers ──────────────────────────────────────────────────────────

function renderVoiceView(overrides: Partial<{ state: VoiceState; ttsPlaying: boolean }> = {}) {
  const props = {
    state: 'idle' as VoiceState,
    micOn: true,
    onMicToggle: vi.fn(),
    onOpenSettings: vi.fn(),
    stopPlayback: vi.fn(),
    ttsPlaying: false,
    ...overrides
  }
  const result = render(<VoiceView {...props} />)
  return { ...result, props }
}

/** Create a Float32Array with a specific RMS value */
function audioWithRms(rms: number, samples = 16000): Float32Array {
  // All samples at constant amplitude gives RMS = |amplitude|
  const amplitude = rms
  const audio = new Float32Array(samples)
  audio.fill(amplitude)
  return audio
}

// ── Tests ────────────────────────────────────────────────────────────

describe('Echo suppression during TTS playback', () => {
  describe('when TTS is playing and state is speaking', () => {
    it('ignores speech start when mic RMS is below echo threshold', () => {
      mockGetMicRms.mockReturnValue(0.01) // below 0.03 threshold
      renderVoiceView({ state: 'speaking', ttsPlaying: true })

      capturedOnSpeechStart?.()

      expect(mockLobster.voiceStart).not.toHaveBeenCalled()
    })

    it('ignores speech start when mic RMS is at echo threshold boundary', () => {
      mockGetMicRms.mockReturnValue(0.029) // just below 0.03
      renderVoiceView({ state: 'speaking', ttsPlaying: true })

      capturedOnSpeechStart?.()

      expect(mockLobster.voiceStart).not.toHaveBeenCalled()
    })

    it('allows interrupt when mic RMS is above echo threshold (user speech)', () => {
      mockGetMicRms.mockReturnValue(0.05) // above 0.03 threshold
      const { props } = renderVoiceView({ state: 'speaking', ttsPlaying: true })

      capturedOnSpeechStart?.()

      expect(props.stopPlayback).toHaveBeenCalled()
      expect(mockLobster.voiceStart).toHaveBeenCalled()
    })

    it('allows interrupt when mic RMS is exactly at echo threshold', () => {
      mockGetMicRms.mockReturnValue(0.03) // exactly at threshold
      const { props } = renderVoiceView({ state: 'speaking', ttsPlaying: true })

      capturedOnSpeechStart?.()

      expect(props.stopPlayback).toHaveBeenCalled()
      expect(mockLobster.voiceStart).toHaveBeenCalled()
    })

    it('allows interrupt with loud user speech', () => {
      mockGetMicRms.mockReturnValue(0.15) // loud speech
      const { props } = renderVoiceView({ state: 'speaking', ttsPlaying: true })

      capturedOnSpeechStart?.()

      expect(props.stopPlayback).toHaveBeenCalled()
      expect(mockLobster.voiceStart).toHaveBeenCalled()
    })

    it('allows interrupt when mic RMS is unavailable (NaN)', () => {
      mockGetMicRms.mockReturnValue(NaN) // e.g. AudioContext suspended
      const { props } = renderVoiceView({ state: 'speaking', ttsPlaying: true })

      capturedOnSpeechStart?.()

      // NaN = RMS unavailable — do not suppress, let interrupt through
      expect(props.stopPlayback).toHaveBeenCalled()
      expect(mockLobster.voiceStart).toHaveBeenCalled()
    })
  })

  describe('when TTS is NOT playing and state is speaking', () => {
    it('allows interrupt regardless of mic RMS', () => {
      mockGetMicRms.mockReturnValue(0.005) // very low RMS
      const { props } = renderVoiceView({ state: 'speaking', ttsPlaying: false })

      capturedOnSpeechStart?.()

      // No echo check when TTS is not playing — interrupt proceeds
      expect(props.stopPlayback).toHaveBeenCalled()
      expect(mockLobster.voiceStart).toHaveBeenCalled()
    })
  })

  describe('when state is not speaking', () => {
    it('does not check RMS in idle state', () => {
      mockGetMicRms.mockReturnValue(0.001)
      renderVoiceView({ state: 'idle', ttsPlaying: false })

      capturedOnSpeechStart?.()

      // Normal speech start — no RMS check, voiceStart called
      expect(mockLobster.voiceStart).toHaveBeenCalled()
      expect(mockGetMicRms).not.toHaveBeenCalled()
    })

    it('does not check RMS in listening state', () => {
      mockGetMicRms.mockReturnValue(0.001)
      renderVoiceView({ state: 'listening', ttsPlaying: false })

      capturedOnSpeechStart?.()

      expect(mockLobster.voiceStart).toHaveBeenCalled()
      expect(mockGetMicRms).not.toHaveBeenCalled()
    })
  })

  describe('speech end during normal operation', () => {
    it('sends audio chunk for valid speech in idle/listening state', () => {
      renderVoiceView({ state: 'idle', ttsPlaying: false })
      const audio = audioWithRms(0.08, 16000) // 1 second, well above min length

      capturedOnSpeechEnd?.(audio)

      expect(mockLobster.sendAudioChunk).toHaveBeenCalledWith(audio)
    })

    it('discards audio shorter than 300ms', () => {
      renderVoiceView({ state: 'idle', ttsPlaying: false })
      const shortAudio = audioWithRms(0.08, 16000 * 0.2) // 200ms — too short

      capturedOnSpeechEnd?.(shortAudio)

      expect(mockLobster.sendAudioChunk).not.toHaveBeenCalled()
      expect(mockLobster.voiceStop).toHaveBeenCalled()
    })

    it('discards audio during processing state', () => {
      renderVoiceView({ state: 'processing', ttsPlaying: false })
      const audio = audioWithRms(0.08, 16000)

      capturedOnSpeechEnd?.(audio)

      expect(mockLobster.sendAudioChunk).not.toHaveBeenCalled()
    })

    it('discards audio during thinking state', () => {
      renderVoiceView({ state: 'thinking', ttsPlaying: false })
      const audio = audioWithRms(0.08, 16000)

      capturedOnSpeechEnd?.(audio)

      expect(mockLobster.sendAudioChunk).not.toHaveBeenCalled()
    })
  })
})
