// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import App from '../App'

// ── Mock lobster API ─────────────────────────────────────────────────

type Callback = (...args: unknown[]) => void

let connectionStatusCallback: Callback | null = null
let errorCallback: Callback | null = null

const noop = () => () => {}

const mockStopPlayback = vi.fn()

const mockLobster = {
  getKeys: vi.fn().mockResolvedValue([
    { name: 'ELEVENLABS_API_KEY', isSet: true },
    { name: 'OPENCLAW_TOKEN', isSet: true },
  ]),
  onConnectionStatus: vi.fn((cb: Callback) => {
    connectionStatusCallback = cb
    return () => { connectionStatusCallback = null }
  }),
  onError: vi.fn((cb: Callback) => {
    errorCallback = cb
    return () => { errorCallback = null }
  }),
  onVoiceStateChanged: vi.fn(() => () => {}),
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
  // Settings APIs used by SetupModal/useSettings
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
}

// ── Mock hooks that need browser APIs ────────────────────────────────

vi.mock('../hooks/useTtsPlayback', () => ({
  useTtsPlayback: () => ({ stopPlayback: mockStopPlayback }),
}))

vi.mock('../hooks/useVAD', () => ({
  useVAD: () => ({ listening: false }),
}))

vi.mock('../hooks/useSpeakerMonitor', () => ({
  useSpeakerMonitor: () => ({ speakerActive: false }),
}))

// ── Canvas mock ──────────────────────────────────────────────────────

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
    clearRect: vi.fn(),
    beginPath: vi.fn(),
    arc: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    set strokeStyle(_v: string) {},
    set fillStyle(_v: string) {},
    set lineWidth(_v: number) {},
    set globalAlpha(_v: number) {},
  })
})

// ── Setup ────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  connectionStatusCallback = null
  errorCallback = null
  ;(window as unknown as { lobster: typeof mockLobster }).lobster = mockLobster
})

afterEach(() => {
  cleanup()
})

// ── Tests ────────────────────────────────────────────────────────────

describe('App', () => {
  async function renderApp() {
    await act(async () => {
      render(<App />)
    })
    // Wait for getKeys promise
    await act(async () => {
      await Promise.resolve()
    })
  }

  // ── Header ─────────────────────────────────────────────────────

  describe('header', () => {
    it('renders app title', async () => {
      await renderApp()
      expect(screen.getByText('Talkative Lobster')).toBeInTheDocument()
    })

    it('title has correct styling', async () => {
      await renderApp()
      const title = screen.getByText('Talkative Lobster')
      expect(title.className).toContain('text-xl')
      expect(title.className).toContain('font-normal')
      expect(title.className).toContain('tracking-tight')
    })

    it('header is draggable for macOS window control', async () => {
      await renderApp()
      const header = screen.getByText('Talkative Lobster').parentElement
      expect(header?.className).toContain('-webkit-app-region:drag')
    })

    it('header has symmetric padding for centered title', async () => {
      await renderApp()
      const header = screen.getByText('Talkative Lobster').parentElement
      expect(header?.className).toContain('pl-20')
      expect(header?.className).toContain('pr-20')
    })
  })

  // ── Connection status dot ──────────────────────────────────────

  describe('connection status dot', () => {
    it('shows green dot when no errors', async () => {
      await renderApp()
      const dot = screen.getByTitle('Connected')
      expect(dot).toBeInTheDocument()
      expect(dot.className).toContain('bg-accent')
    })

    it('turns red on connection error status', async () => {
      await renderApp()
      act(() => {
        connectionStatusCallback?.('error')
      })
      const dot = screen.getByTitle('Connection error — open settings')
      expect(dot).toBeInTheDocument()
      expect(dot.className).toContain('bg-[#f44336]')
    })

    it('turns red on error event', async () => {
      vi.useFakeTimers()
      await renderApp()
      act(() => {
        errorCallback?.('LLM error: timeout')
      })
      const dot = screen.getByTitle('Connection error — open settings')
      expect(dot.className).toContain('bg-[#f44336]')
      vi.useRealTimers()
    })

    it('returns to green when connected status received after error', async () => {
      await renderApp()
      act(() => {
        connectionStatusCallback?.('error')
      })
      expect(screen.getByTitle('Connection error — open settings')).toBeInTheDocument()

      act(() => {
        connectionStatusCallback?.('connected')
      })
      expect(screen.getByTitle('Connected')).toBeInTheDocument()
      expect(screen.getByTitle('Connected').className).toContain('bg-accent')
    })

    it('opens settings when red dot is clicked', async () => {
      await renderApp()
      act(() => {
        connectionStatusCallback?.('error')
      })
      const dot = screen.getByTitle('Connection error — open settings')
      fireEvent.click(dot)
      // SetupModal should be rendered — header dot is no longer in the DOM
      expect(screen.queryByTitle('Connected')).not.toBeInTheDocument()
      expect(screen.queryByTitle('Connection error — open settings')).not.toBeInTheDocument()
    })

    it('red dot has no-drag class for click handling', async () => {
      await renderApp()
      act(() => {
        connectionStatusCallback?.('error')
      })
      const dot = screen.getByTitle('Connection error — open settings')
      expect(dot.className).toContain('no-drag')
    })

    it('red dot has cursor-pointer', async () => {
      await renderApp()
      act(() => {
        connectionStatusCallback?.('error')
      })
      const dot = screen.getByTitle('Connection error — open settings')
      expect(dot.className).toContain('cursor-pointer')
    })

    it('red dot has button role', async () => {
      await renderApp()
      act(() => {
        connectionStatusCallback?.('error')
      })
      const dot = screen.getByTitle('Connection error — open settings')
      expect(dot.getAttribute('role')).toBe('button')
    })

    it('green dot has no button role', async () => {
      await renderApp()
      const dot = screen.getByTitle('Connected')
      expect(dot.getAttribute('role')).toBeNull()
    })

    it('green dot is not clickable (no onClick)', async () => {
      await renderApp()
      const dot = screen.getByTitle('Connected')
      expect(dot.className).not.toContain('cursor-pointer')
    })

    it('ignores non-error connection statuses', async () => {
      await renderApp()
      act(() => {
        connectionStatusCallback?.('disconnected')
      })
      // Should stay green — only 'error' turns red
      expect(screen.getByTitle('Connected')).toBeInTheDocument()
    })
  })

  // ── Error banner ───────────────────────────────────────────────

  describe('error banner', () => {
    it('shows error message when error event received', async () => {
      vi.useFakeTimers()
      await renderApp()
      act(() => {
        errorCallback?.('LLM error: rate limited')
      })
      expect(screen.getByText('LLM error: rate limited')).toBeInTheDocument()
      vi.useRealTimers()
    })

    it('hides error message after 8 seconds', async () => {
      vi.useFakeTimers()
      await renderApp()
      act(() => {
        errorCallback?.('LLM error: timeout')
      })
      expect(screen.getByText('LLM error: timeout')).toBeInTheDocument()
      act(() => {
        vi.advanceTimersByTime(8000)
      })
      expect(screen.queryByText('LLM error: timeout')).not.toBeInTheDocument()
      vi.useRealTimers()
    })

    it('error banner is not shown when no error', async () => {
      await renderApp()
      const banner = document.querySelector('.bg-\\[\\#f44336\\]\\/20')
      expect(banner).not.toBeInTheDocument()
    })

    it('error event also sets hasError (red dot)', async () => {
      vi.useFakeTimers()
      await renderApp()
      act(() => {
        errorCallback?.('Connection lost')
      })
      // Both banner and red dot should show
      expect(screen.getByText('Connection lost')).toBeInTheDocument()
      expect(screen.getByTitle('Connection error — open settings')).toBeInTheDocument()
      vi.useRealTimers()
    })

    it('error banner disappears but red dot stays after 8 seconds', async () => {
      vi.useFakeTimers()
      await renderApp()
      act(() => {
        errorCallback?.('Connection lost')
      })
      act(() => {
        vi.advanceTimersByTime(8000)
      })
      // Banner gone, red dot stays
      expect(screen.queryByText('Connection lost')).not.toBeInTheDocument()
      expect(screen.getByTitle('Connection error — open settings')).toBeInTheDocument()
      vi.useRealTimers()
    })
  })

  // ── openSettings behavior ──────────────────────────────────────

  describe('openSettings', () => {
    it('calls stopPlayback when opening settings', async () => {
      await renderApp()
      // Click the settings button in VoiceView footer
      const buttons = document.querySelectorAll('button')
      const settingsBtn = buttons[buttons.length - 1]
      fireEvent.click(settingsBtn)
      expect(mockStopPlayback).toHaveBeenCalled()
    })

    it('calls voiceStop when opening settings', async () => {
      await renderApp()
      const buttons = document.querySelectorAll('button')
      const settingsBtn = buttons[buttons.length - 1]
      fireEvent.click(settingsBtn)
      expect(mockLobster.voiceStop).toHaveBeenCalled()
    })

    it('calls stopPlayback when opening settings via red dot', async () => {
      await renderApp()
      act(() => {
        connectionStatusCallback?.('error')
      })
      fireEvent.click(screen.getByTitle('Connection error — open settings'))
      expect(mockStopPlayback).toHaveBeenCalled()
    })

    it('calls voiceStop when opening settings via red dot', async () => {
      await renderApp()
      act(() => {
        connectionStatusCallback?.('error')
      })
      fireEvent.click(screen.getByTitle('Connection error — open settings'))
      expect(mockLobster.voiceStop).toHaveBeenCalled()
    })
  })

  // ── Setup flow ─────────────────────────────────────────────────

  describe('setup flow', () => {
    it('shows VoiceView when all required keys are set', async () => {
      await renderApp()
      expect(screen.getByText('Ready')).toBeInTheDocument()
    })

    it('shows SetupModal when keys are not set', async () => {
      cleanup()
      mockLobster.getKeys.mockResolvedValue([
        { name: 'ELEVENLABS_API_KEY', isSet: false },
        { name: 'OPENCLAW_TOKEN', isSet: false },
      ])
      await act(async () => {
        render(<App />)
      })
      await act(async () => {
        await Promise.resolve()
      })
      // VoiceView should not be rendered — SetupModal is shown instead
      expect(screen.queryByText('Ready')).not.toBeInTheDocument()
      expect(screen.queryByText('Talkative Lobster')).not.toBeInTheDocument()
      // Restore for any tests that might follow
      mockLobster.getKeys.mockResolvedValue([
        { name: 'ELEVENLABS_API_KEY', isSet: true },
        { name: 'OPENCLAW_TOKEN', isSet: true },
      ])
    })
  })
})
