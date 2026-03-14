import { type AnyActorRef, createActor } from 'xstate'
import type { VoiceState } from '../shared/types'
import { type VoiceEvent, voiceMachine } from './voice-machine'

export type { VoiceEvent }

export interface TransitionLog {
  from: VoiceState
  to: VoiceState
  event: string
  timestamp: number
}

const DEFAULT_STUCK_TIMEOUTS: Record<VoiceState, number> = {
  idle: 0,
  listening: 0, // XState has its own 10s timeout
  processing: 30_000,
  thinking: 60_000,
  speaking: 120_000
}

// Derive accepted events from the machine definition to stay in sync automatically
const ACCEPTED_EVENTS: Record<VoiceState, ReadonlySet<string>> = (() => {
  const states = voiceMachine.config.states ?? {}
  const result = {} as Record<VoiceState, ReadonlySet<string>>
  for (const [stateName, stateConfig] of Object.entries(states)) {
    const on = (stateConfig as Record<string, unknown>).on as Record<string, unknown> | undefined
    result[stateName as VoiceState] = new Set(Object.keys(on ?? {}))
  }
  return result
})()

export interface VoiceStateControllerOptions {
  stuckTimeouts?: Partial<Record<VoiceState, number>>
  onStuckRecovery?: (state: VoiceState, elapsed: number) => void
  onTransition?: (log: TransitionLog) => void
}

export class VoiceStateController {
  private actor: AnyActorRef
  private stuckTimer: ReturnType<typeof setTimeout> | null = null
  private stuckTimeouts: Record<VoiceState, number>
  private onStuckRecovery?: (state: VoiceState, elapsed: number) => void
  private onTransition?: (log: TransitionLog) => void
  private previousState: VoiceState = 'idle'
  private started = false
  private lastEventType = ''
  private subscribers = new Set<(state: VoiceState) => void>()
  private actorSub: { unsubscribe: () => void } | null = null

  constructor(options?: VoiceStateControllerOptions) {
    this.stuckTimeouts = { ...DEFAULT_STUCK_TIMEOUTS, ...options?.stuckTimeouts }
    this.onStuckRecovery = options?.onStuckRecovery
    this.onTransition = options?.onTransition
    this.actor = createActor(voiceMachine)
  }

  start(): void {
    this.actor.start()
    this.previousState = 'idle'
    this.started = true

    this.actorSub = this.actor.subscribe((snapshot) => {
      const state = snapshot.value as VoiceState
      this.handleStateChange(state)
    })

    this.resetStuckTimer(this.getState())
  }

  stop(): void {
    this.clearStuckTimer()
    this.actorSub?.unsubscribe()
    this.actorSub = null
    this.actor.stop()
    this.subscribers.clear()
  }

  send(event: VoiceEvent): boolean {
    const currentState = this.getState()
    const accepted = ACCEPTED_EVENTS[currentState]

    if (!accepted.has(event.type)) {
      return false
    }

    this.lastEventType = event.type
    this.actor.send(event)
    return true
  }

  getState(): VoiceState {
    return this.actor.getSnapshot().value as VoiceState
  }

  getSnapshot(): { value: VoiceState } {
    return { value: this.getState() }
  }

  subscribe(cb: (state: VoiceState) => void): () => void {
    this.subscribers.add(cb)
    return () => {
      this.subscribers.delete(cb)
    }
  }

  cancel(): void {
    this.lastEventType = 'CANCEL'
    this.actor.send({ type: 'CANCEL' })
    this.resetStuckTimer('idle')
  }

  private handleStateChange(state: VoiceState): void {
    const now = Date.now()
    const from = this.previousState

    // Skip the initial subscription fire (XState emits the initial state on subscribe)
    if (this.started && from !== state) {
      this.onTransition?.({ from, to: state, event: this.lastEventType, timestamp: now })
    }

    this.previousState = state
    this.resetStuckTimer(state)

    for (const cb of this.subscribers) {
      cb(state)
    }
  }

  private resetStuckTimer(state: VoiceState): void {
    this.clearStuckTimer()
    const timeout = this.stuckTimeouts[state]
    if (!timeout) return

    const enteredAt = Date.now()
    this.stuckTimer = setTimeout(() => {
      const elapsed = Date.now() - enteredAt
      this.onStuckRecovery?.(state, elapsed)
      this.actor.send({ type: 'CANCEL' })
    }, timeout)
  }

  private clearStuckTimer(): void {
    if (this.stuckTimer) {
      clearTimeout(this.stuckTimer)
      this.stuckTimer = null
    }
  }
}
