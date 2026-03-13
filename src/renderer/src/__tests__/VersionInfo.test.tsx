// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { VersionInfo } from '../components/VersionInfo'

beforeEach(() => {
  ;(window as unknown as { lobster: Record<string, unknown> }).lobster = {
    checkForUpdate: vi.fn().mockResolvedValue({
      currentVersion: '1.2.3',
      latestVersion: '1.2.3',
      updateAvailable: false,
      releaseUrl: null
    })
  }
})

afterEach(() => {
  cleanup()
})

describe('VersionInfo', () => {
  it('displays the current version', async () => {
    render(<VersionInfo />)
    expect(await screen.findByText('v1.2.3')).toBeInTheDocument()
  })

  it('shows update link when a newer version is available', async () => {
    ;(window as unknown as { lobster: Record<string, unknown> }).lobster = {
      checkForUpdate: vi.fn().mockResolvedValue({
        currentVersion: '1.2.3',
        latestVersion: '1.3.0',
        updateAvailable: true,
        releaseUrl: 'https://github.com/coo-quack/talkative-lobster/releases/tag/v1.3.0'
      })
    }

    render(<VersionInfo />)

    const link = await screen.findByText('v1.3.0 available')
    expect(link).toBeInTheDocument()
    expect(link.closest('a')).toHaveAttribute(
      'href',
      'https://github.com/coo-quack/talkative-lobster/releases/tag/v1.3.0'
    )
  })

  it('does not show update link when version is current', async () => {
    render(<VersionInfo />)
    await screen.findByText('v1.2.3')
    expect(screen.queryByText(/available/)).not.toBeInTheDocument()
  })

  it('renders nothing when checkForUpdate is unavailable', async () => {
    ;(window as unknown as { lobster: Record<string, unknown> }).lobster = {}

    const { container } = render(<VersionInfo />)
    await waitFor(() => {
      expect(container.innerHTML).toBe('')
    })
  })
})
