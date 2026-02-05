import { useEffect, useState } from 'react'
import {
  useUpdaterStore,
  initUpdaterListeners,
  cleanupUpdaterListeners,
  downloadUpdate,
  installUpdate
} from '../../stores/updaterStore'
import { formatBytes } from '../../utils/format'

/**
 * In-app banner for update notifications.
 * Shows when an update is available, downloading, or ready to install.
 */
export function UpdateBanner() {
  const { status, updateInfo, downloadProgress, dismissed, dismiss } = useUpdaterStore()
  const [isActionInProgress, setIsActionInProgress] = useState(false)
  const [isVisible, setIsVisible] = useState(false)

  // Initialize listeners on mount
  useEffect(() => {
    initUpdaterListeners()
    return () => cleanupUpdaterListeners()
  }, [])

  // Handle entrance animation
  const shouldShow = !dismissed && (status === 'available' || status === 'downloading' || status === 'ready')

  useEffect(() => {
    if (shouldShow) {
      // Small delay for entrance animation
      const timer = setTimeout(() => setIsVisible(true), 10)
      return () => clearTimeout(timer)
    } else {
      setIsVisible(false)
    }
  }, [shouldShow])

  // Don't render if not showing
  if (!shouldShow) {
    return null
  }

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

  return (
    <div
      role="alert"
      className={`bg-[var(--color-bsky-500)]/8 border-b border-[var(--color-bsky-500)]/15 px-4 py-2.5 transition-all duration-200 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
      }`}
    >
      <div className="flex items-center gap-3 max-w-3xl mx-auto">
        {/* Icon */}
        <div className="w-8 h-8 rounded-full bg-[var(--color-bsky-500)]/15 flex items-center justify-center flex-shrink-0">
          <svg aria-hidden="true" className="w-4 h-4 text-[var(--color-bsky-500)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {status === 'available' && (
            <>
              <p className="text-[13px] font-semibold text-[var(--color-text-primary)] leading-tight">
                Update available
              </p>
              <p className="text-[12px] text-[var(--color-text-secondary)] mt-0.5 leading-snug">
                Version {updateInfo?.version} is ready to download.
              </p>
            </>
          )}

          {status === 'downloading' && (
            <>
              <p className="text-[13px] font-semibold text-[var(--color-text-primary)] leading-tight">
                Downloading update...
              </p>
              <div className="mt-1.5">
                <div className="flex items-center gap-2">
                  <div
                    role="progressbar"
                    aria-valuenow={Math.round(downloadProgress?.percent ?? 0)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Download progress"
                    className="flex-1 h-1.5 bg-[var(--color-bsky-500)]/20 rounded-full overflow-hidden"
                  >
                    <div
                      className="h-full bg-[var(--color-bsky-500)] rounded-full transition-all duration-300"
                      style={{ width: `${downloadProgress?.percent ?? 0}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-[var(--color-text-tertiary)] tabular-nums min-w-[40px] text-right">
                    {Math.round(downloadProgress?.percent ?? 0)}%
                  </span>
                </div>
                {downloadProgress && (
                  <p className="text-[11px] text-[var(--color-text-tertiary)] mt-0.5">
                    {formatBytes(downloadProgress.transferred)} / {formatBytes(downloadProgress.total)}
                  </p>
                )}
              </div>
            </>
          )}

          {status === 'ready' && (
            <>
              <p className="text-[13px] font-semibold text-[var(--color-text-primary)] leading-tight">
                Update ready
              </p>
              <p className="text-[12px] text-[var(--color-text-secondary)] mt-0.5 leading-snug">
                Version {updateInfo?.version} is ready to install.
              </p>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {status === 'available' && (
            <>
              <button
                onClick={handleDownload}
                disabled={isActionInProgress}
                className="px-3.5 h-8 text-[13px] font-semibold text-white bg-[var(--color-bsky-500)] hover:bg-[var(--color-bsky-600)] rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-bsky-500)] focus:ring-offset-2 disabled:opacity-50"
              >
                {isActionInProgress ? 'Starting...' : 'Download'}
              </button>
              <button
                onClick={dismiss}
                className="w-8 h-8 flex items-center justify-center text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bsky-500)]/15 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-bsky-500)] focus:ring-offset-2"
                aria-label="Dismiss"
              >
                <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </>
          )}

          {status === 'ready' && (
            <>
              <button
                onClick={handleInstall}
                disabled={isActionInProgress}
                className="px-3.5 h-8 text-[13px] font-semibold text-white bg-[var(--color-bsky-500)] hover:bg-[var(--color-bsky-600)] rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-bsky-500)] focus:ring-offset-2 disabled:opacity-50"
              >
                {isActionInProgress ? 'Restarting...' : 'Restart to Update'}
              </button>
              <button
                onClick={dismiss}
                className="w-8 h-8 flex items-center justify-center text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bsky-500)]/15 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-bsky-500)] focus:ring-offset-2"
                aria-label="Later"
              >
                <svg aria-hidden="true" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
