// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import type { VoiceState } from '../../../shared/types'
import { VoiceView } from '../components/VoiceView'

// ── Mock hooks ───────────────────────────────────────────────────────

vi.mock('../hooks/useVAD', () => ({
  useVAD: () => ({ listening: false })
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
  getAppVersion: vi.fn().mockResolvedValue('1.0.5'),
  checkForUpdate: vi.fn().mockResolvedValue({
    currentVersion: '1.0.5',
    latestVersion: '1.0.5',
    updateAvailable: false,
    releaseUrl: null
  })
}

beforeEach(() => {
  vi.clearAllMocks()
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

// ── Tests ────────────────────────────────────────────────────────────

describe('VoiceView', () => {
  function renderVoiceView(
    overrides: Partial<{
      state: VoiceState
      micOn: boolean
      onMicToggle: (on: boolean) => void
      onOpenSettings: () => void
      stopPlayback: () => void
    }> = {}
  ) {
    const props = {
      state: 'idle' as VoiceState,
      micOn: true,
      onMicToggle: vi.fn(),
      onOpenSettings: vi.fn(),
      stopPlayback: vi.fn(),
      ...overrides
    }
    const result = render(<VoiceView {...props} />)
    return { ...result, props }
  }

  function getStatusDot(container: HTMLElement) {
    const pill = container.querySelector('.bg-border')
    return pill?.querySelector('.h-2.w-2') as HTMLElement
  }

  function getMicButton(container: HTMLElement) {
    return container.querySelectorAll('button')[0] as HTMLElement
  }

  function getStopButton(container: HTMLElement) {
    return container.querySelectorAll('button')[1] as HTMLElement
  }

  function getSettingsButton(container: HTMLElement) {
    const buttons = container.querySelectorAll('button')
    return buttons[buttons.length - 1] as HTMLElement
  }

  // ── Status pill label ────────────────────────────────────────────

  describe('status pill', () => {
    it('shows "Ready" when idle and mic on', () => {
      renderVoiceView()
      expect(screen.getByText('Ready')).toBeInTheDocument()
    })

    it('shows "Offline" when mic is off and idle', () => {
      renderVoiceView({ micOn: false })
      expect(screen.getByText('Offline')).toBeInTheDocument()
    })

    it('shows "Offline" when mic is off and listening', () => {
      renderVoiceView({ micOn: false, state: 'listening' })
      expect(screen.getByText('Offline')).toBeInTheDocument()
    })

    it('shows "Listening..." when state is listening and mic on', () => {
      renderVoiceView({ state: 'listening' })
      expect(screen.getByText('Listening...')).toBeInTheDocument()
    })

    it('shows "Thinking..." when state is thinking', () => {
      renderVoiceView({ state: 'thinking' })
      expect(screen.getByText('Thinking...')).toBeInTheDocument()
    })

    it('shows "Thinking..." even when mic is off and thinking', () => {
      renderVoiceView({ state: 'thinking', micOn: false })
      expect(screen.getByText('Thinking...')).toBeInTheDocument()
    })

    it('shows "Speaking..." when state is speaking', () => {
      renderVoiceView({ state: 'speaking' })
      expect(screen.getByText('Speaking...')).toBeInTheDocument()
    })

    it('shows "Speaking..." even when mic is off and speaking', () => {
      renderVoiceView({ state: 'speaking', micOn: false })
      expect(screen.getByText('Speaking...')).toBeInTheDocument()
    })

    it('shows "Recognizing..." when state is processing', () => {
      renderVoiceView({ state: 'processing' })
      expect(screen.getByText('Recognizing...')).toBeInTheDocument()
    })

    it('shows "Recognizing..." even when mic is off and processing', () => {
      renderVoiceView({ state: 'processing', micOn: false })
      expect(screen.getByText('Recognizing...')).toBeInTheDocument()
    })
  })

  // ── Status dot color ─────────────────────────────────────────────

  describe('status dot color matches state', () => {
    it('uses idle color (--color-muted) when idle', () => {
      const { container } = renderVoiceView()
      const dot = getStatusDot(container)
      expect(dot.style.backgroundColor).toBe('var(--color-muted)')
    })

    it('uses listening color (--color-accent) when listening', () => {
      const { container } = renderVoiceView({ state: 'listening' })
      const dot = getStatusDot(container)
      expect(dot.style.backgroundColor).toBe('var(--color-accent)')
    })

    it('uses processing color (--color-warning) when processing', () => {
      const { container } = renderVoiceView({ state: 'processing' })
      const dot = getStatusDot(container)
      expect(dot.style.backgroundColor).toBe('var(--color-warning)')
    })

    it('uses thinking color (--color-info) when thinking', () => {
      const { container } = renderVoiceView({ state: 'thinking' })
      const dot = getStatusDot(container)
      expect(dot.style.backgroundColor).toBe('var(--color-info)')
    })

    it('uses speaking color (--color-speaking) when speaking', () => {
      const { container } = renderVoiceView({ state: 'speaking' })
      const dot = getStatusDot(container)
      expect(dot.style.backgroundColor).toBe('var(--color-speaking)')
    })

    it('uses offline color (--color-muted) when mic off and idle', () => {
      const { container } = renderVoiceView({ micOn: false })
      const dot = getStatusDot(container)
      expect(dot.style.backgroundColor).toBe('var(--color-muted)')
    })

    it('keeps thinking color when mic off and thinking', () => {
      const { container } = renderVoiceView({ micOn: false, state: 'thinking' })
      const dot = getStatusDot(container)
      expect(dot.style.backgroundColor).toBe('var(--color-info)')
    })

    it('keeps speaking color when mic off and speaking', () => {
      const { container } = renderVoiceView({ micOn: false, state: 'speaking' })
      const dot = getStatusDot(container)
      expect(dot.style.backgroundColor).toBe('var(--color-speaking)')
    })

    it('keeps processing color when mic off and processing', () => {
      const { container } = renderVoiceView({ micOn: false, state: 'processing' })
      const dot = getStatusDot(container)
      expect(dot.style.backgroundColor).toBe('var(--color-warning)')
    })

    it('has glow box-shadow matching dot color', () => {
      const { container } = renderVoiceView({ state: 'thinking' })
      const dot = getStatusDot(container)
      expect(dot.style.boxShadow).toBe('0 0 6px var(--color-info)')
    })
  })

  // ── Waveform props ───────────────────────────────────────────────

  describe('waveform', () => {
    it('passes current state to Waveform when mic on', () => {
      const { container } = renderVoiceView({ state: 'speaking' })
      const canvas = container.querySelector('canvas')
      expect(canvas).toBeInTheDocument()
    })

    it('renders canvas with correct dimensions', () => {
      const { container } = renderVoiceView()
      const canvas = container.querySelector('canvas')
      expect(canvas?.getAttribute('width')).toBe('320')
      expect(canvas?.getAttribute('height')).toBe('192')
    })
  })

  // ── Mic button ───────────────────────────────────────────────────

  describe('mic button', () => {
    it('renders ON label when mic is on', () => {
      const { container } = renderVoiceView()
      expect(getMicButton(container).textContent).toContain('ON')
    })

    it('renders OFF label when mic is off', () => {
      const { container } = renderVoiceView({ micOn: false })
      expect(getMicButton(container).textContent).toContain('OFF')
    })

    it('calls onMicToggle(false) when clicking mic ON button', () => {
      const { container, props } = renderVoiceView()
      fireEvent.click(getMicButton(container))
      expect(props.onMicToggle).toHaveBeenCalledWith(false)
    })

    it('calls onMicToggle(true) when clicking mic OFF button', () => {
      const { container, props } = renderVoiceView({ micOn: false })
      fireEvent.click(getMicButton(container))
      expect(props.onMicToggle).toHaveBeenCalledWith(true)
    })

    it('calls voiceStop when muting in idle state', () => {
      const { container } = renderVoiceView()
      fireEvent.click(getMicButton(container))
      expect(mockLobster.voiceStop).toHaveBeenCalled()
    })

    it('calls voiceStop when muting in listening state', () => {
      const { container } = renderVoiceView({ state: 'listening' })
      fireEvent.click(getMicButton(container))
      expect(mockLobster.voiceStop).toHaveBeenCalled()
    })

    it('does not call voiceStop when muting during speaking', () => {
      const { container } = renderVoiceView({ state: 'speaking' })
      fireEvent.click(getMicButton(container))
      expect(mockLobster.voiceStop).not.toHaveBeenCalled()
    })

    it('does not call voiceStop when muting during thinking', () => {
      const { container } = renderVoiceView({ state: 'thinking' })
      fireEvent.click(getMicButton(container))
      expect(mockLobster.voiceStop).not.toHaveBeenCalled()
    })

    it('does not call voiceStop when muting during processing', () => {
      const { container } = renderVoiceView({ state: 'processing' })
      fireEvent.click(getMicButton(container))
      expect(mockLobster.voiceStop).not.toHaveBeenCalled()
    })

    it('has green background when mic is on', () => {
      const { container } = renderVoiceView()
      expect(getMicButton(container).className).toContain('bg-accent')
    })

    it('has transparent background when mic is off', () => {
      const { container } = renderVoiceView({ micOn: false })
      expect(getMicButton(container).className).toContain('bg-transparent')
    })

    it('is rounded-full pill shape', () => {
      const { container } = renderVoiceView()
      expect(getMicButton(container).className).toContain('rounded-full')
    })
  })

  // ── STOP button ──────────────────────────────────────────────────

  describe('stop button', () => {
    it('renders STOP label', () => {
      const { container } = renderVoiceView()
      expect(getStopButton(container).textContent).toContain('STOP')
    })

    it('calls stopPlayback when clicked', () => {
      const { container, props } = renderVoiceView({ state: 'speaking' })
      fireEvent.click(getStopButton(container))
      expect(props.stopPlayback).toHaveBeenCalled()
    })

    it('calls voiceStop when clicked', () => {
      const { container } = renderVoiceView({ state: 'speaking' })
      fireEvent.click(getStopButton(container))
      expect(mockLobster.voiceStop).toHaveBeenCalled()
    })

    it('is disabled when state is idle', () => {
      const { container } = renderVoiceView({ state: 'idle' })
      expect(getStopButton(container).hasAttribute('disabled')).toBe(true)
    })

    it('is enabled when state is listening', () => {
      const { container } = renderVoiceView({ state: 'listening' })
      expect(getStopButton(container).hasAttribute('disabled')).toBe(false)
    })

    it('is enabled when state is thinking', () => {
      const { container } = renderVoiceView({ state: 'thinking' })
      expect(getStopButton(container).hasAttribute('disabled')).toBe(false)
    })

    it('is enabled when state is speaking', () => {
      const { container } = renderVoiceView({ state: 'speaking' })
      expect(getStopButton(container).hasAttribute('disabled')).toBe(false)
    })

    it('is enabled when state is processing', () => {
      const { container } = renderVoiceView({ state: 'processing' })
      expect(getStopButton(container).hasAttribute('disabled')).toBe(false)
    })

    it('has reduced opacity when disabled', () => {
      const { container } = renderVoiceView({ state: 'idle' })
      expect(getStopButton(container).className).toContain('disabled:opacity-30')
    })

    it('is rounded-full pill shape', () => {
      const { container } = renderVoiceView()
      expect(getStopButton(container).className).toContain('rounded-full')
    })
  })

  // ── Settings button ──────────────────────────────────────────────

  describe('settings button', () => {
    it('calls onOpenSettings when clicked', () => {
      const { container, props } = renderVoiceView()
      fireEvent.click(getSettingsButton(container))
      expect(props.onOpenSettings).toHaveBeenCalled()
    })

    it('is circular', () => {
      const { container } = renderVoiceView()
      const btn = getSettingsButton(container)
      expect(btn.className).toContain('h-10')
      expect(btn.className).toContain('w-10')
      expect(btn.className).toContain('rounded-full')
    })

    it('contains settings icon', () => {
      const { container } = renderVoiceView()
      const btn = getSettingsButton(container)
      const svg = btn.querySelector('svg')
      expect(svg).toBeInTheDocument()
      expect(svg?.classList.toString()).toContain('lucide-settings')
    })
  })

  // ── Footer layout ────────────────────────────────────────────────

  describe('footer layout', () => {
    it('has three buttons total (mic, stop, settings)', () => {
      const { container } = renderVoiceView()
      const buttons = container.querySelectorAll('button')
      expect(buttons.length).toBe(3)
    })

    it('footer has border-top separator', () => {
      const { container } = renderVoiceView()
      // The footer div wrapping buttons
      const footer = container.querySelector('.border-t')
      expect(footer).toBeInTheDocument()
    })
  })
})
