import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BrowserWindow } from 'electron'
import { IPC } from '../shared/ipc-channels'

/** Minimum delay before first aizuchi (ms) */
const INITIAL_DELAY_MIN = 1500
const INITIAL_DELAY_MAX = 2500

/** Interval between aizuchis (ms) */
const INTERVAL_MIN = 3000
const INTERVAL_MAX = 5000

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

/**
 * Plays a short sound effect while the AI is thinking,
 * to fill silence and make conversation feel natural.
 *
 * Uses a bundled MP3 file and dedicated IPC channels (AIZUCHI_*)
 * separate from main TTS, so playback does NOT trigger voice
 * state machine transitions or depend on the TTS provider.
 */
export class AizuchiManager {
  private timer: ReturnType<typeof setTimeout> | null = null
  private active = false
  private playing = false
  private soundBuffer: Buffer | null = null

  constructor(private win: BrowserWindow) {}

  /** Start playing aizuchi at random intervals. */
  start(): void {
    if (this.active) return
    this.active = true
    this.scheduleNext(randomBetween(INITIAL_DELAY_MIN, INITIAL_DELAY_MAX))
  }

  /** Stop all aizuchi — cancels pending timer and in-flight audio. */
  stop(): void {
    this.active = false
    if (this.timer) {
      clearTimeout(this.timer)
      this.timer = null
    }
    if (this.playing) {
      this.playing = false
      this.send(IPC.AIZUCHI_CANCEL, null)
    }
  }

  get isPlaying(): boolean {
    return this.playing
  }

  private loadSound(): Buffer | null {
    if (this.soundBuffer) return this.soundBuffer
    try {
      const soundPath = join(__dirname, '../../resources/aizuchi.mp3')
      this.soundBuffer = readFileSync(soundPath)
      return this.soundBuffer
    } catch (err) {
      console.error('[aizuchi] Failed to load sound file:', err)
      return null
    }
  }

  private scheduleNext(delay: number): void {
    if (!this.active) return
    this.timer = setTimeout(() => {
      this.timer = null
      if (!this.active) return
      this.playOne()
    }, delay)
  }

  private playOne(): void {
    if (!this.active || this.playing) return

    const sound = this.loadSound()
    if (!sound) {
      this.scheduleNext(randomBetween(INTERVAL_MIN, INTERVAL_MAX))
      return
    }

    console.log('[aizuchi] Playing sound')
    this.playing = true

    this.send(IPC.AIZUCHI_FORMAT, { type: 'encoded' })
    this.send(IPC.AIZUCHI_AUDIO, new Uint8Array(sound).buffer)
    this.send(IPC.AIZUCHI_STOP, null)

    this.playing = false

    if (this.active) {
      this.scheduleNext(randomBetween(INTERVAL_MIN, INTERVAL_MAX))
    }
  }

  private send(channel: string, data: unknown): void {
    if (!this.win.isDestroyed()) {
      this.win.webContents.send(channel, data)
    }
  }
}
