import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AizuchiManager } from '../aizuchi'
import { IPC } from '../../shared/ipc-channels'

vi.mock('node:fs', () => ({
  readFileSync: vi.fn().mockReturnValue(Buffer.from([0xff, 0xfb, 0x90, 0x00])) // fake MP3 header
}))

function createMockWindow() {
  return {
    isDestroyed: vi.fn().mockReturnValue(false),
    webContents: {
      send: vi.fn()
    }
  } as unknown as import('electron').BrowserWindow
}

function getSendCalls(win: ReturnType<typeof createMockWindow>) {
  return (win.webContents.send as ReturnType<typeof vi.fn>).mock.calls
}

describe('AizuchiManager', () => {
  let win: ReturnType<typeof createMockWindow>
  let aizuchi: AizuchiManager

  beforeEach(() => {
    vi.useFakeTimers()
    win = createMockWindow()
    aizuchi = new AizuchiManager(win as import('electron').BrowserWindow)
  })

  afterEach(() => {
    aizuchi.stop()
    vi.useRealTimers()
  })

  it('does not play immediately on start', () => {
    aizuchi.start()
    expect(getSendCalls(win).length).toBe(0)
  })

  it('plays sound after initial delay using dedicated channels', () => {
    aizuchi.start()
    vi.advanceTimersByTime(3000)

    const calls = getSendCalls(win)
    const formatCall = calls.find((c: unknown[]) => c[0] === IPC.AIZUCHI_FORMAT)
    const audioCall = calls.find((c: unknown[]) => c[0] === IPC.AIZUCHI_AUDIO)
    const stopCall = calls.find((c: unknown[]) => c[0] === IPC.AIZUCHI_STOP)
    expect(formatCall).toBeDefined()
    expect(formatCall?.[1]).toEqual({ type: 'encoded' })
    expect(audioCall).toBeDefined()
    expect(stopCall).toBeDefined()

    // Should NOT use main TTS channels
    const ttsCall = calls.find((c: unknown[]) => c[0] === IPC.TTS_FORMAT)
    expect(ttsCall).toBeUndefined()
  })

  it('stops pending timer on stop()', () => {
    aizuchi.start()
    aizuchi.stop()
    vi.advanceTimersByTime(5000)

    const audioCall = getSendCalls(win).find((c: unknown[]) => c[0] === IPC.AIZUCHI_AUDIO)
    expect(audioCall).toBeUndefined()
  })

  it('sends AIZUCHI_CANCEL when stopped while playing flag is true', () => {
    const internals = aizuchi as unknown as { playing: boolean; active: boolean }
    internals.active = true
    internals.playing = true

    aizuchi.stop()

    const cancelCall = getSendCalls(win).find((c: unknown[]) => c[0] === IPC.AIZUCHI_CANCEL)
    expect(cancelCall).toBeDefined()
    expect(aizuchi.isPlaying).toBe(false)
  })

  it('does not start if already active', () => {
    aizuchi.start()
    aizuchi.start() // Should be no-op
    aizuchi.stop()
  })

  it('schedules next sound after playing one', () => {
    aizuchi.start()
    vi.advanceTimersByTime(3000)
    const firstAudioCount = getSendCalls(win).filter(
      (c: unknown[]) => c[0] === IPC.AIZUCHI_AUDIO
    ).length

    vi.advanceTimersByTime(6000)
    const secondAudioCount = getSendCalls(win).filter(
      (c: unknown[]) => c[0] === IPC.AIZUCHI_AUDIO
    ).length

    expect(secondAudioCount).toBeGreaterThan(firstAudioCount)
  })

  it('does not send to destroyed window', () => {
    ;(win.isDestroyed as ReturnType<typeof vi.fn>).mockReturnValue(true)
    aizuchi.start()
    vi.advanceTimersByTime(3000)

    expect(getSendCalls(win).length).toBe(0)
  })

  it('does not depend on TTS provider', () => {
    // AizuchiManager constructor takes only a BrowserWindow
    // No TTS provider needed — uses bundled sound file
    aizuchi.start()
    vi.advanceTimersByTime(3000)

    const audioCall = getSendCalls(win).find((c: unknown[]) => c[0] === IPC.AIZUCHI_AUDIO)
    expect(audioCall).toBeDefined()
  })
})
