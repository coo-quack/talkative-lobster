import { useState, useEffect } from 'react'
import type { UpdateInfo } from '../../../shared/types'

export function VersionInfo() {
  const [version, setVersion] = useState<string | null>(null)
  const [update, setUpdate] = useState<UpdateInfo | null>(null)

  useEffect(() => {
    window.lobster.getAppVersion().then(setVersion).catch(() => {})
    window.lobster.checkForUpdate().then(setUpdate).catch(() => {})
  }, [])

  if (!version) return null

  return (
    <div className="mt-4 border-border border-t pt-3 text-center text-xs text-neutral-500">
      <span>v{version}</span>
      {update?.updateAvailable && update.releaseUrl && (
        <span className="ml-2">
          —{' '}
          <a
            href={update.releaseUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#f0c040] underline hover:text-[#f0d060]"
          >
            v{update.latestVersion} available
          </a>
        </span>
      )}
    </div>
  )
}
