import { useSettings } from '../context/SettingsContext'

/**
 * Displays error and success messages at the top of the settings view.
 */
export function MessageBanner() {
  const { state } = useSettings()
  const { error, success } = state

  if (!error && !success) return null

  return (
    <div role="status" aria-live="polite">
      {error && (
        <div className="flex items-start gap-2 px-3 py-2 bg-[var(--color-error-light)] border border-[var(--color-error)]/20 rounded-lg">
          <svg className="w-4 h-4 text-[var(--color-error)] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-[13px] text-[var(--color-error)]">{error}</p>
        </div>
      )}
      {success && (
        <div className="flex items-start gap-2 px-3 py-2 bg-[var(--color-success-light)] border border-[var(--color-success)]/20 rounded-lg">
          <svg className="w-4 h-4 text-[var(--color-success)] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <p className="text-[13px] text-[var(--color-success)]">{success}</p>
        </div>
      )}
    </div>
  )
}
