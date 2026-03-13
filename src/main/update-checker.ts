import { app } from 'electron'

const GITHUB_REPO = 'coo-quack/talkative-lobster'

export interface UpdateInfo {
  currentVersion: string
  latestVersion: string | null
  updateAvailable: boolean
  releaseUrl: string | null
}

export function getAppVersion(): string {
  return app.getVersion()
}

export async function checkForUpdate(): Promise<UpdateInfo> {
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
      return { currentVersion, latestVersion: null, updateAvailable: false, releaseUrl: null }
    }
    const data = (await res.json()) as { tag_name?: string; html_url?: string }
    const latestTag = data.tag_name ?? null
    const latestVersion = latestTag?.replace(/^v/, '') ?? null
    const releaseUrl = data.html_url ?? null

    const updateAvailable = latestVersion ? compareVersions(latestVersion, currentVersion) > 0 : false

    return { currentVersion, latestVersion, updateAvailable, releaseUrl }
  } catch {
    return { currentVersion, latestVersion: null, updateAvailable: false, releaseUrl: null }
  }
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const na = pa[i] ?? 0
    const nb = pb[i] ?? 0
    if (na > nb) return 1
    if (na < nb) return -1
  }
  return 0
}
