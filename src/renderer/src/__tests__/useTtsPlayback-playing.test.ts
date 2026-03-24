// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ── Capture IPC callbacks ────────────────────────────────────────────

type AudioCallback = (data: ArrayBuffer) => void
type FormatCallback = (format: unknown) => void
type VoidCallback = () => void

let onTtsAudioCb: AudioCallback | null = null
let _onTtsFormatCb: FormatCallback | null = null
let onTtsStopCb: VoidCallback | null = null
let onTtsCancelCb: VoidCallback | null = null

const mockLobster = {
  ttsPlaybackStarted: vi.fn(),
  ttsPlaybackDone: vi.fn(),
  onTtsFormat: vi.fn((cb: FormatCallback) => {
    _onTtsFormatCb = cb
    return () => {
      _onTtsFormatCb = null
    }
  }),
  onTtsAudio: vi.fn((cb: AudioCallback) => {
    onTtsAudioCb = cb
    return () => {
      onTtsAudioCb = null
    }
  }),
  onTtsStop: vi.fn((cb: VoidCallback) => {
    onTtsStopCb = cb
    return () => {
      onTtsStopCb = null
    }
  }),
  onTtsCancel: vi.fn((cb: VoidCallback) => {
    onTtsCancelCb = cb
    return () => {
      onTtsCancelCb = null
    }
  })
}

// ── AudioContext / AudioBuffer mock ──────────────────────────────────

let mockOnEnded: (() => void) | null = null

const mockBufferSource = {
  connect: vi.fn(),
  start: vi.fn(),
  set buffer(_b: unknown) {},
  set onended(cb: (() => void) | null) {
    mockOnEnded = cb
  }
}

const mockAudioBuffer = {
  duration: 1.0,
  getChannelData: vi.fn().mockReturnValue({ set: vi.fn() })
}

class MockAudioContext {
  currentTime = 0
  state = 'running'
  createBufferSource = vi.fn(() => mockBufferSource)
  createBuffer = vi.fn(() => mockAudioBuffer)
  decodeAudioData = vi.fn(async () => mockAudioBuffer)
  resume = vi.fn(async () => {})
  close = vi.fn(async () => {})
  get destination() {
    return {}
  }
}

vi.stubGlobal('AudioContext', MockAudioContext)

// ── Setup ────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  mockOnEnded = null
  onTtsAudioCb = null
  _onTtsFormatCb = null
  onTtsStopCb = null
  onTtsCancelCb = null
  ;(window as unknown as { lobster: typeof mockLobster }).lobster = mockLobster
})

afterEach(() => {
  vi.restoreAllMocks()
})

// ── Tests ────────────────────────────────────────────────────────────

// Dynamic import after mocks are set up
async function importHook() {
  const mod = await import('../hooks/useTtsPlayback')
  return mod.useTtsPlayback
}

describe('useTtsPlayback playing state', () => {
  it('starts with playing = false', async () => {
    const useTtsPlayback = await importHook()
    const { result } = renderHook(() => useTtsPlayback())
    expect(result.current.playing).toBe(false)
  })

  it('sets playing = true when first audio buffer is scheduled', async () => {
    const useTtsPlayback = await importHook()
    const { result } = renderHook(() => useTtsPlayback())

    // Send encoded audio data (triggers decodeAudioData → scheduleBuffer)
    await act(async () => {
      onTtsAudioCb?.(new ArrayBuffer(100))
      await Promise.resolve()
    })

    expect(result.current.playing).toBe(true)
    expect(mockLobster.ttsPlaybackStarted).toHaveBeenCalled()
  })

  it('sets playing = false when playback completes', async () => {
    const useTtsPlayback = await importHook()
    const { result } = renderHook(() => useTtsPlayback())

    // Schedule a buffer
    await act(async () => {
      onTtsAudioCb?.(new ArrayBuffer(100))
      await Promise.resolve()
    })
    expect(result.current.playing).toBe(true)

    // Signal stream done + buffer finished
    act(() => {
      onTtsStopCb?.()
      mockOnEnded?.()
    })

    expect(result.current.playing).toBe(false)
    expect(mockLobster.ttsPlaybackDone).toHaveBeenCalled()
  })

  it('sets playing = false on cancel', async () => {
    const useTtsPlayback = await importHook()
    const { result } = renderHook(() => useTtsPlayback())

    // Schedule a buffer
    await act(async () => {
      onTtsAudioCb?.(new ArrayBuffer(100))
      await Promise.resolve()
    })
    expect(result.current.playing).toBe(true)

    // Cancel playback
    act(() => {
      onTtsCancelCb?.()
    })

    expect(result.current.playing).toBe(false)
  })

  it('sets playing = false on stopPlayback()', async () => {
    const useTtsPlayback = await importHook()
    const { result } = renderHook(() => useTtsPlayback())

    // Schedule a buffer
    await act(async () => {
      onTtsAudioCb?.(new ArrayBuffer(100))
      await Promise.resolve()
    })
    expect(result.current.playing).toBe(true)

    // Stop playback
    act(() => {
      result.current.stopPlayback()
    })

    expect(result.current.playing).toBe(false)
  })
})
