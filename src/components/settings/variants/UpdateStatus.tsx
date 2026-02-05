import { useState, useEffect } from 'react'
import { useUpdaterStore, checkForUpdates, downloadUpdate, installUpdate } from '../../../stores/updaterStore'
import { formatBytes } from '../../../utils/format'
import type { BuildMode } from '../../../types'

/**
 * Update status section in Settings.
 * Shows current version and allows checking for updates.
 */
export function UpdateStatus() {
  const { status, updateInfo, downloadProgress, error } = useUpdaterStore()
  const [appVersion, setAppVersion] = useState<string | null>(null)
  const [buildMode, setBuildMode] = useState<BuildMode | null>(null)
  const [isActionInProgress, setIsActionInProgress] = useState(false)

  useEffect(() => {
    // Get version from package.json (injected by Vite)
    setAppVersion(__APP_VERSION__)

    // Get build mode
    window.electronAPI?.getBuildMode?.().then(setBuildMode).catch(() => {
      setBuildMode('development')
    })
  }, [])

  const isChecking = status === 'checking'
  const isDownloading = status === 'downloading'

  const handleDownload = async () => {
    if (isActionInProgress) return
    setIsActionInProgress(true)
    try {
      await downloadUpdate()
    } finally {
      setIsActionInProgress(false)
    }
  }

  const handleInstall = () => {
    if (isActionInProgress) return
    setIsActionInProgress(true)
    installUpdate()
    // No need to reset - app will restart
  }

  const getStatusText = () => {
    switch (status) {
      case 'checking':
        return 'Checking for updates...'
      case 'available':
        return `Version ${updateInfo?.version} available`
      case 'downloading':
        return `Downloading ${Math.round(downloadProgress?.percent ?? 0)}%`
      case 'ready':
        return `Version ${updateInfo?.version} ready to install`
      case 'error':
        return error || 'Update check failed'
      default:
        return 'Up to date'
    }
  }

  const getStatusColor = () => {
    switch (status) {
      case 'available':
      case 'ready':
        return 'text-[var(--color-bsky-500)]'
      case 'error':
        return 'text-[var(--color-error)]'
      default:
        return 'text-[var(--color-text-secondary)]'
    }
  }

  const getButtonContent = () => {
    if (isChecking) {
      return (
        <span className="flex items-center justify-center gap-2">
          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          Checking...
        </span>
      )
    }
    if (status === 'error') return 'Retry'
    return 'Check for Updates'
  }

  return (
    <div className="border-t border-[var(--color-border-light)] pt-4">
      <div className="px-3 py-2">
        <div className="flex items-center gap-2.5 mb-3">
          <svg aria-hidden="true" className="w-4 h-4 text-[var(--color-text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          <span className="text-[13px] font-medium text-[var(--color-text-primary)]">Updates</span>
        </div>

        {/* Version info */}
        <div className="space-y-2 mb-4">
          <div className="flex justify-between items-center">
            <span className="text-[12px] text-[var(--color-text-tertiary)]">Current version</span>
            <span className="text-[12px] font-medium text-[var(--color-text-primary)]">
              {appVersion ?? '...'}
              {buildMode === 'beta' && (
                <span className="ml-1.5 px-1.5 py-0.5 text-[10px] font-medium bg-[var(--color-bsky-500)]/15 text-[var(--color-bsky-500)] rounded">
                  Beta
                </span>
              )}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[12px] text-[var(--color-text-tertiary)]">Status</span>
            <span
              aria-live="polite"
              className={`text-[12px] font-medium ${getStatusColor()}`}
            >
              {getStatusText()}
            </span>
          </div>
        </div>

        {/* Progress bar when downloading */}
        {isDownloading && downloadProgress && (
          <div className="mb-4">
            <div
              role="progressbar"
              aria-valuenow={Math.round(downloadProgress.percent)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Download progress"
              className="h-1.5 bg-[var(--color-surface-secondary)] rounded-full overflow-hidden"
            >
              <div
                className="h-full bg-[var(--color-bsky-500)] rounded-full transition-all duration-300"
                style={{ width: `${downloadProgress.percent}%` }}
              />
            </div>
            <p className="text-[11px] text-[var(--color-text-tertiary)] mt-1">
              {formatBytes(downloadProgress.transferred)} / {formatBytes(downloadProgress.total)}
            </p>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-2">
          {status === 'available' ? (
            <button
              onClick={handleDownload}
              disabled={isActionInProgress}
              className="flex-1 h-9 text-[13px] font-semibold text-white bg-[var(--color-bsky-500)] hover:bg-[var(--color-bsky-600)] rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-bsky-500)] focus:ring-offset-2 disabled:opacity-50"
            >
              {isActionInProgress ? 'Starting...' : 'Download Update'}
            </button>
          ) : status === 'ready' ? (
            <button
              onClick={handleInstall}
              disabled={isActionInProgress}
              className="flex-1 h-9 text-[13px] font-semibold text-white bg-[var(--color-bsky-500)] hover:bg-[var(--color-bsky-600)] rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-bsky-500)] focus:ring-offset-2 disabled:opacity-50"
            >
              {isActionInProgress ? 'Restarting...' : 'Restart to Update'}
            </button>
          ) : status === 'downloading' ? (
            <button
              disabled
              className="flex-1 h-9 text-[13px] font-medium bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)] rounded-lg transition-colors disabled:opacity-50"
            >
              Downloading...
            </button>
          ) : (
            <button
              onClick={() => checkForUpdates()}
              disabled={isChecking}
              className="flex-1 h-9 text-[13px] font-medium bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)] rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-bsky-500)] focus:ring-offset-2 disabled:opacity-50"
            >
              {getButtonContent()}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
