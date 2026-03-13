import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('electron', () => ({
  app: { getVersion: () => '1.0.5' }
}))

import { getAppVersion, checkForUpdate, compareVersions, resetUpdateCache } from '../update-checker'

describe('update-checker', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    vi.restoreAllMocks()
    resetUpdateCache()
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    resetUpdateCache()
  })

  describe('getAppVersion', () => {
    it('returns the app version from electron', () => {
      expect(getAppVersion()).toBe('1.0.5')
    })
  })

  describe('compareVersions', () => {
    it('returns > 0 when a is newer (major)', () => {
      expect(compareVersions('2.0.0', '1.0.0')).toBeGreaterThan(0)
    })

    it('returns < 0 when a is older (patch)', () => {
      expect(compareVersions('1.0.0', '1.0.1')).toBeLessThan(0)
    })

    it('returns 0 for equal versions', () => {
      expect(compareVersions('1.2.3', '1.2.3')).toBe(0)
    })

    it('treats release as greater than prerelease with same core', () => {
      expect(compareVersions('1.2.3', '1.2.3-beta.1')).toBeGreaterThan(0)
      expect(compareVersions('1.2.3-alpha', '1.2.3')).toBeLessThan(0)
    })

    it('orders prereleases with same core according to SemVer', () => {
      expect(compareVersions('1.2.3-alpha', '1.2.3-beta')).toBeLessThan(0)
    })

    it('orders numeric prerelease segments according to SemVer', () => {
      expect(compareVersions('1.2.3-beta.1', '1.2.3-beta.2')).toBeLessThan(0)
    })

    it('ignores build metadata', () => {
      expect(compareVersions('1.2.3+build.1', '1.2.3')).toBe(0)
      expect(compareVersions('1.2.3+build.1', '1.2.3-beta')).toBeGreaterThan(0)
    })

    it('handles non-numeric segments gracefully (treats as 0)', () => {
      expect(compareVersions('1.x.0', '1.0.0')).toBe(0)
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

    it('treats prerelease tag as not an update over the current release', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            tag_name: 'v1.0.5-beta.1',
            html_url: 'https://github.com/coo-quack/talkative-lobster/releases/tag/v1.0.5-beta.1'
          })
      })

      const result = await checkForUpdate()
      expect(result.updateAvailable).toBe(false)
    })

    it('returns cached result on second call without hitting fetch again', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            tag_name: 'v2.0.0',
            html_url: 'https://github.com/coo-quack/talkative-lobster/releases/tag/v2.0.0'
          })
      })
      globalThis.fetch = mockFetch

      await checkForUpdate()
      await checkForUpdate()

      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('caches error results to avoid repeated API calls on failure', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('network error'))
      globalThis.fetch = mockFetch

      await checkForUpdate()
      await checkForUpdate()

      expect(mockFetch).toHaveBeenCalledTimes(1)
    })
  })
})
