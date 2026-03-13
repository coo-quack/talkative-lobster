import { app } from 'electron'
import type { UpdateInfo } from '../shared/types'

export type { UpdateInfo }

const GITHUB_REPO = 'coo-quack/talkative-lobster'
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

let cachedResult: UpdateInfo | null = null
let cacheTimestamp = 0

export function getAppVersion(): string {
  return app.getVersion()
}

export async function checkForUpdate(): Promise<UpdateInfo> {
  const now = Date.now()
  if (cachedResult !== null && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedResult
  }

  const currentVersion = getAppVersion()
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      {
        headers: { Accept: 'application/vnd.github.v3+json' },
        signal: AbortSignal.timeout(10_000)
      }
    )
    if (!res.ok) {
      const result: UpdateInfo = { currentVersion, latestVersion: null, updateAvailable: false, releaseUrl: null }
      cachedResult = result
      cacheTimestamp = now
      return result
    }
    const data = (await res.json()) as { tag_name?: string; html_url?: string }
    const latestTag = data.tag_name ?? null
    const latestVersion = latestTag?.replace(/^v/, '') ?? null
    const releaseUrl = data.html_url ?? null

    const updateAvailable = latestVersion ? compareVersions(latestVersion, currentVersion) > 0 : false

    const result: UpdateInfo = { currentVersion, latestVersion, updateAvailable, releaseUrl }
    cachedResult = result
    cacheTimestamp = now
    return result
  } catch {
    const result: UpdateInfo = { currentVersion, latestVersion: null, updateAvailable: false, releaseUrl: null }
    cachedResult = result
    cacheTimestamp = now
    return result
  }
}

/** Reset the in-memory cache (intended for testing only). */
export function resetUpdateCache(): void {
  cachedResult = null
  cacheTimestamp = 0
}

/**
 * Compare two semver strings. Returns > 0 if a > b, < 0 if a < b, 0 if equal.
 * Handles prerelease identifiers (e.g. `1.2.3-beta.1`): a release version is
 * considered greater than a prerelease with the same major.minor.patch.
 * Non-numeric segments and build metadata (+...) are ignored gracefully.
 */
export function compareVersions(a: string, b: string): number {
  // Strip build metadata (+...) then split into core and prerelease on first '-'
  const parse = (v: string): { parts: number[]; prerelease: string | null } => {
    const withoutBuild = v.split('+')[0]
    const dashIdx = withoutBuild.indexOf('-')
    const core = dashIdx === -1 ? withoutBuild : withoutBuild.slice(0, dashIdx)
    const prerelease = dashIdx === -1 ? null : withoutBuild.slice(dashIdx + 1)
    const parts = core.split('.').map((s) => {
      const n = Number(s)
      return Number.isFinite(n) ? n : 0
    })
    return { parts, prerelease }
  }

  const pa = parse(a)
  const pb = parse(b)
  const len = Math.max(pa.parts.length, pb.parts.length)

  for (let i = 0; i < len; i++) {
    const na = pa.parts[i] ?? 0
    const nb = pb.parts[i] ?? 0
    if (na > nb) return 1
    if (na < nb) return -1
  }

  // Numeric parts are equal: release > prerelease (semver §11.3)
  if (pa.prerelease === null && pb.prerelease !== null) return 1
  if (pa.prerelease !== null && pb.prerelease === null) return -1
  return 0
}
