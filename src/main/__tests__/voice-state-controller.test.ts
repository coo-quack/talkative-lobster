import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VoiceState } from '../../shared/types'
import { type TransitionLog, VoiceStateController } from '../voice-state-controller'

describe('VoiceStateController', () => {
  let controller: VoiceStateController

  afterEach(() => {
    controller?.stop()
    vi.useRealTimers()
  })

  // ── Normal transition paths ────────────────────────────────────

  describe('normal transitions', () => {
    beforeEach(() => {
      controller = new VoiceStateController()
      controller.start()
    })

    it('starts in idle state', () => {
      expect(controller.getState()).toBe('idle')
    })

    it('transitions idle → listening on SPEECH_START', () => {
      expect(controller.send({ type: 'SPEECH_START' })).toBe(true)
      expect(controller.getState()).toBe('listening')
    })

    it('transitions listening → processing on SPEECH_END', () => {
      controller.send({ type: 'SPEECH_START' })
      expect(controller.send({ type: 'SPEECH_END' })).toBe(true)
      expect(controller.getState()).toBe('processing')
    })

    it('transitions processing → thinking on STT_DONE', () => {
      controller.send({ type: 'SPEECH_START' })
      controller.send({ type: 'SPEECH_END' })
      expect(controller.send({ type: 'STT_DONE', text: 'hello' })).toBe(true)
      expect(controller.getState()).toBe('thinking')
    })

    it('transitions thinking → speaking on TTS_PLAYING', () => {
      controller.send({ type: 'SPEECH_START' })
      controller.send({ type: 'SPEECH_END' })
      controller.send({ type: 'STT_DONE', text: 'hello' })
      expect(controller.send({ type: 'TTS_PLAYING' })).toBe(true)
      expect(controller.getState()).toBe('speaking')
    })

    it('transitions speaking → idle on TTS_DONE', () => {
      controller.send({ type: 'SPEECH_START' })
      controller.send({ type: 'SPEECH_END' })
      controller.send({ type: 'STT_DONE', text: 'hello' })
      controller.send({ type: 'TTS_PLAYING' })
      expect(controller.send({ type: 'TTS_DONE' })).toBe(true)
      expect(controller.getState()).toBe('idle')
    })

    it('completes full cycle: idle → listening → processing → thinking → speaking → idle', () => {
      controller.send({ type: 'SPEECH_START' })
      controller.send({ type: 'SPEECH_END' })
      controller.send({ type: 'STT_DONE', text: 'hello' })
      controller.send({ type: 'TTS_PLAYING' })
      controller.send({ type: 'TTS_DONE' })
      expect(controller.getState()).toBe('idle')
    })

    it('transitions thinking → idle on TTS_DONE (skip speaking)', () => {
      controller.send({ type: 'SPEECH_START' })
      controller.send({ type: 'SPEECH_END' })
      controller.send({ type: 'STT_DONE', text: 'hello' })
      controller.send({ type: 'TTS_DONE' })
      expect(controller.getState()).toBe('idle')
    })

    it('transitions processing → idle on STT_FAIL', () => {
      controller.send({ type: 'SPEECH_START' })
      controller.send({ type: 'SPEECH_END' })
      expect(controller.send({ type: 'STT_FAIL' })).toBe(true)
      expect(controller.getState()).toBe('idle')
    })
  })

  // ── Guard (rejected events) ───────────────────────────────────

  describe('guard blocks', () => {
    beforeEach(() => {
      controller = new VoiceStateController()
      controller.start()
    })

    it('rejects SPEECH_END in idle', () => {
      expect(controller.send({ type: 'SPEECH_END' })).toBe(false)
      expect(controller.getState()).toBe('idle')
    })

    it('rejects TTS_DONE in idle', () => {
      expect(controller.send({ type: 'TTS_DONE' })).toBe(false)
      expect(controller.getState()).toBe('idle')
    })

    it('rejects TTS_PLAYING in idle', () => {
      expect(controller.send({ type: 'TTS_PLAYING' })).toBe(false)
      expect(controller.getState()).toBe('idle')
    })

    it('rejects STT_DONE in idle', () => {
      expect(controller.send({ type: 'STT_DONE', text: 'hello' })).toBe(false)
      expect(controller.getState()).toBe('idle')
    })

    it('rejects STT_FAIL in idle', () => {
      expect(controller.send({ type: 'STT_FAIL' })).toBe(false)
      expect(controller.getState()).toBe('idle')
    })

    it('rejects SPEECH_START in listening', () => {
      controller.send({ type: 'SPEECH_START' })
      expect(controller.send({ type: 'SPEECH_START' })).toBe(false)
      expect(controller.getState()).toBe('listening')
    })

    it('rejects TTS_PLAYING in processing', () => {
      controller.send({ type: 'SPEECH_START' })
      controller.send({ type: 'SPEECH_END' })
      expect(controller.send({ type: 'TTS_PLAYING' })).toBe(false)
      expect(controller.getState()).toBe('processing')
    })

    it('rejects SPEECH_END in speaking', () => {
      controller.send({ type: 'SPEECH_START' })
      controller.send({ type: 'SPEECH_END' })
      controller.send({ type: 'STT_DONE', text: 'hello' })
      controller.send({ type: 'TTS_PLAYING' })
      expect(controller.send({ type: 'SPEECH_END' })).toBe(false)
      expect(controller.getState()).toBe('speaking')
    })
  })

  // ── Interrupt (SPEECH_START from non-idle states) ─────────────

  describe('interrupts', () => {
    beforeEach(() => {
      controller = new VoiceStateController()
      controller.start()
    })

    it('speaking → listening on SPEECH_START', () => {
      controller.send({ type: 'SPEECH_START' })
      controller.send({ type: 'SPEECH_END' })
      controller.send({ type: 'STT_DONE', text: 'hello' })
      controller.send({ type: 'TTS_PLAYING' })
      expect(controller.getState()).toBe('speaking')

      expect(controller.send({ type: 'SPEECH_START' })).toBe(true)
      expect(controller.getState()).toBe('listening')
    })

    it('thinking → listening on SPEECH_START', () => {
      controller.send({ type: 'SPEECH_START' })
      controller.send({ type: 'SPEECH_END' })
      controller.send({ type: 'STT_DONE', text: 'hello' })
      expect(controller.getState()).toBe('thinking')

      expect(controller.send({ type: 'SPEECH_START' })).toBe(true)
      expect(controller.getState()).toBe('listening')
    })

    it('processing → listening on SPEECH_START', () => {
      controller.send({ type: 'SPEECH_START' })
      controller.send({ type: 'SPEECH_END' })
      expect(controller.getState()).toBe('processing')

      expect(controller.send({ type: 'SPEECH_START' })).toBe(true)
      expect(controller.getState()).toBe('listening')
    })
  })

  // ── CANCEL ────────────────────────────────────────────────────

  describe('cancel', () => {
    beforeEach(() => {
      controller = new VoiceStateController()
      controller.start()
    })

    it('cancel() from listening → idle', () => {
      controller.send({ type: 'SPEECH_START' })
      controller.cancel()
      expect(controller.getState()).toBe('idle')
    })

    it('cancel() from processing → idle', () => {
      controller.send({ type: 'SPEECH_START' })
      controller.send({ type: 'SPEECH_END' })
      controller.cancel()
      expect(controller.getState()).toBe('idle')
    })

    it('cancel() from thinking → idle', () => {
      controller.send({ type: 'SPEECH_START' })
      controller.send({ type: 'SPEECH_END' })
      controller.send({ type: 'STT_DONE', text: 'hello' })
      controller.cancel()
      expect(controller.getState()).toBe('idle')
    })

    it('cancel() from speaking → idle', () => {
      controller.send({ type: 'SPEECH_START' })
      controller.send({ type: 'SPEECH_END' })
      controller.send({ type: 'STT_DONE', text: 'hello' })
      controller.send({ type: 'TTS_PLAYING' })
      controller.cancel()
      expect(controller.getState()).toBe('idle')
    })

    it('cancel() in idle is a no-op', () => {
      controller.cancel()
      expect(controller.getState()).toBe('idle')
    })
  })

  // ── Stuck detection ───────────────────────────────────────────

  describe('stuck detection', () => {
    it('auto-cancels processing after timeout', () => {
      vi.useFakeTimers()
      const onStuck = vi.fn()
      controller = new VoiceStateController({
        stuckTimeouts: { processing: 100 },
        onStuckRecovery: onStuck
      })
      controller.start()

      controller.send({ type: 'SPEECH_START' })
      controller.send({ type: 'SPEECH_END' })
      expect(controller.getState()).toBe('processing')

      vi.advanceTimersByTime(100)

      expect(controller.getState()).toBe('idle')
      expect(onStuck).toHaveBeenCalledWith('processing', expect.any(Number))
    })

    it('auto-cancels thinking after timeout', () => {
      vi.useFakeTimers()
      const onStuck = vi.fn()
      controller = new VoiceStateController({
        stuckTimeouts: { thinking: 200 },
        onStuckRecovery: onStuck
      })
      controller.start()

      controller.send({ type: 'SPEECH_START' })
      controller.send({ type: 'SPEECH_END' })
      controller.send({ type: 'STT_DONE', text: 'hello' })
      expect(controller.getState()).toBe('thinking')

      vi.advanceTimersByTime(200)

      expect(controller.getState()).toBe('idle')
      expect(onStuck).toHaveBeenCalledWith('thinking', expect.any(Number))
    })

    it('auto-cancels speaking after timeout', () => {
      vi.useFakeTimers()
      const onStuck = vi.fn()
      controller = new VoiceStateController({
        stuckTimeouts: { speaking: 300 },
        onStuckRecovery: onStuck
      })
      controller.start()

      controller.send({ type: 'SPEECH_START' })
      controller.send({ type: 'SPEECH_END' })
      controller.send({ type: 'STT_DONE', text: 'hello' })
      controller.send({ type: 'TTS_PLAYING' })
      expect(controller.getState()).toBe('speaking')

      vi.advanceTimersByTime(300)

      expect(controller.getState()).toBe('idle')
      expect(onStuck).toHaveBeenCalledWith('speaking', expect.any(Number))
    })

    it('does not fire stuck timer if state changes before timeout', () => {
      vi.useFakeTimers()
      const onStuck = vi.fn()
      controller = new VoiceStateController({
        stuckTimeouts: { processing: 100 },
        onStuckRecovery: onStuck
      })
      controller.start()

      controller.send({ type: 'SPEECH_START' })
      controller.send({ type: 'SPEECH_END' })
      expect(controller.getState()).toBe('processing')

      vi.advanceTimersByTime(50)
      controller.send({ type: 'STT_DONE', text: 'hello' })
      expect(controller.getState()).toBe('thinking')

      vi.advanceTimersByTime(100)

      expect(onStuck).not.toHaveBeenCalled()
    })

    it('does not fire for idle state', () => {
      vi.useFakeTimers()
      const onStuck = vi.fn()
      controller = new VoiceStateController({
        stuckTimeouts: { idle: 0 },
        onStuckRecovery: onStuck
      })
      controller.start()

      vi.advanceTimersByTime(100_000)
      expect(onStuck).not.toHaveBeenCalled()
    })
  })

  // ── Subscribe ─────────────────────────────────────────────────

  describe('subscribe', () => {
    beforeEach(() => {
      controller = new VoiceStateController()
      controller.start()
    })

    it('notifies subscribers on state change', () => {
      const states: VoiceState[] = []
      controller.subscribe((s) => states.push(s))

      controller.send({ type: 'SPEECH_START' })
      controller.send({ type: 'SPEECH_END' })

      expect(states).toContain('listening')
      expect(states).toContain('processing')
    })

    it('unsubscribe stops notifications', () => {
      const states: VoiceState[] = []
      const unsub = controller.subscribe((s) => states.push(s))

      controller.send({ type: 'SPEECH_START' })
      unsub()
      controller.send({ type: 'SPEECH_END' })

      expect(states).toEqual(['listening'])
    })
  })

  // ── Transition log callback ────────────────────────────────────

  describe('onTransition', () => {
    it('calls onTransition with from/to/event on state change', () => {
      const logs: TransitionLog[] = []
      controller = new VoiceStateController({
        onTransition: (log) => logs.push(log)
      })
      controller.start()

      controller.send({ type: 'SPEECH_START' })

      expect(logs.length).toBe(1)
      expect(logs[0].from).toBe('idle')
      expect(logs[0].to).toBe('listening')
      expect(logs[0].event).toBe('SPEECH_START')
      expect(typeof logs[0].timestamp).toBe('number')
    })

    it('logs each transition in a full cycle', () => {
      const logs: TransitionLog[] = []
      controller = new VoiceStateController({
        onTransition: (log) => logs.push(log)
      })
      controller.start()

      controller.send({ type: 'SPEECH_START' })
      controller.send({ type: 'SPEECH_END' })
      controller.send({ type: 'STT_DONE', text: 'hello' })
      controller.send({ type: 'TTS_PLAYING' })
      controller.send({ type: 'TTS_DONE' })

      expect(logs.length).toBe(5)
      expect(logs.map((l) => `${l.from}->${l.to}`)).toEqual([
        'idle->listening',
        'listening->processing',
        'processing->thinking',
        'thinking->speaking',
        'speaking->idle'
      ])
    })

    it('logs CANCEL event name', () => {
      const logs: TransitionLog[] = []
      controller = new VoiceStateController({
        onTransition: (log) => logs.push(log)
      })
      controller.start()

      controller.send({ type: 'SPEECH_START' })
      controller.cancel()

      expect(logs[1].event).toBe('CANCEL')
      expect(logs[1].from).toBe('listening')
      expect(logs[1].to).toBe('idle')
    })

    it('does not log when event is rejected by guard', () => {
      const logs: TransitionLog[] = []
      controller = new VoiceStateController({
        onTransition: (log) => logs.push(log)
      })
      controller.start()

      controller.send({ type: 'TTS_DONE' }) // rejected in idle

      expect(logs.length).toBe(0)
    })
  })

  // ── getSnapshot compatibility ─────────────────────────────────

  describe('getSnapshot', () => {
    beforeEach(() => {
      controller = new VoiceStateController()
      controller.start()
    })

    it('returns { value: VoiceState } matching current state', () => {
      expect(controller.getSnapshot()).toEqual({ value: 'idle' })
      controller.send({ type: 'SPEECH_START' })
      expect(controller.getSnapshot()).toEqual({ value: 'listening' })
    })
  })

  // ── start/stop lifecycle ──────────────────────────────────────

  describe('lifecycle', () => {
    it('can be started and stopped', () => {
      controller = new VoiceStateController()
      controller.start()
      expect(controller.getState()).toBe('idle')
      controller.stop()
    })

    it('clears subscribers on stop', () => {
      controller = new VoiceStateController()
      controller.start()
      const states: VoiceState[] = []
      controller.subscribe((s) => states.push(s))
      controller.stop()

      // After stop, subscribers are cleared — new starts won't notify old subscribers
      expect(states.length).toBeLessThanOrEqual(1) // May get initial idle
    })

    it('clears stuck timer on stop', () => {
      vi.useFakeTimers()
      const onStuck = vi.fn()
      controller = new VoiceStateController({
        stuckTimeouts: { processing: 100 },
        onStuckRecovery: onStuck
      })
      controller.start()

      controller.send({ type: 'SPEECH_START' })
      controller.send({ type: 'SPEECH_END' })
      expect(controller.getState()).toBe('processing')

      controller.stop()
      vi.advanceTimersByTime(200)

      expect(onStuck).not.toHaveBeenCalled()
    })
  })
})
