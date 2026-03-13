import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('electron', () => ({
  app: { getVersion: () => '1.0.5' }
}))

import { getAppVersion, checkForUpdate } from '../update-checker'

describe('update-checker', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  describe('getAppVersion', () => {
    it('returns the app version from electron', () => {
      expect(getAppVersion()).toBe('1.0.5')
    })
  })

  describe('checkForUpdate', () => {
    it('returns updateAvailable=true when latest is newer', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            tag_name: 'v2.0.0',
            html_url: 'https://github.com/coo-quack/talkative-lobster/releases/tag/v2.0.0'
          })
      })

      const result = await checkForUpdate()
      expect(result.currentVersion).toBe('1.0.5')
      expect(result.latestVersion).toBe('2.0.0')
      expect(result.updateAvailable).toBe(true)
      expect(result.releaseUrl).toBe(
        'https://github.com/coo-quack/talkative-lobster/releases/tag/v2.0.0'
      )
    })

    it('returns updateAvailable=false when current is latest', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            tag_name: 'v1.0.5',
            html_url: 'https://github.com/coo-quack/talkative-lobster/releases/tag/v1.0.5'
          })
      })

      const result = await checkForUpdate()
      expect(result.updateAvailable).toBe(false)
      expect(result.latestVersion).toBe('1.0.5')
    })

    it('returns updateAvailable=false when current is newer', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            tag_name: 'v1.0.0',
            html_url: 'https://github.com/coo-quack/talkative-lobster/releases/tag/v1.0.0'
          })
      })

      const result = await checkForUpdate()
      expect(result.updateAvailable).toBe(false)
    })

    it('handles tag without v prefix', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            tag_name: '2.0.0',
            html_url: 'https://github.com/coo-quack/talkative-lobster/releases/tag/2.0.0'
          })
      })

      const result = await checkForUpdate()
      expect(result.latestVersion).toBe('2.0.0')
      expect(result.updateAvailable).toBe(true)
    })

    it('returns gracefully on HTTP error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 })

      const result = await checkForUpdate()
      expect(result.currentVersion).toBe('1.0.5')
      expect(result.latestVersion).toBeNull()
      expect(result.updateAvailable).toBe(false)
      expect(result.releaseUrl).toBeNull()
    })

    it('returns gracefully on network error', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('network error'))

      const result = await checkForUpdate()
      expect(result.currentVersion).toBe('1.0.5')
      expect(result.latestVersion).toBeNull()
      expect(result.updateAvailable).toBe(false)
    })

    it('compares multi-segment versions correctly', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            tag_name: 'v1.0.6',
            html_url: 'https://github.com/coo-quack/talkative-lobster/releases/tag/v1.0.6'
          })
      })

      const result = await checkForUpdate()
      expect(result.updateAvailable).toBe(true)
    })
  })
})
