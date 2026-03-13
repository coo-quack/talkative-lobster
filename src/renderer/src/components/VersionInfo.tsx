import { useState, useEffect } from 'react'
import type { UpdateInfo } from '../../../shared/types'

export function VersionInfo() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null)

  useEffect(() => {
    window.lobster
      ?.checkForUpdate?.()
      ?.then(setUpdate)
      .catch(() => {})
  }, [])

  if (!update) return null

  return (
    <div className="mt-4 border-border border-t pt-3 text-center text-xs text-neutral-500">
      <span>v{update.currentVersion}</span>
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
