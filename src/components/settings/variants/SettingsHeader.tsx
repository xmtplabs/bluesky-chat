import { useSettings } from '../context/SettingsContext'

/**
 * Settings header with back button and title.
 */
export function SettingsHeader() {
  const { actions } = useSettings()

  return (
    <div className="h-14 flex items-center justify-between px-4 border-b border-[var(--color-border-light)] flex-shrink-0">
      <button
        onClick={actions.close}
        className="w-8 h-8 -ml-1 flex items-center justify-center text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] rounded-full transition-colors"
        aria-label="Back to conversations"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <h2 className="text-[15px] font-semibold text-[var(--color-text-primary)]">
        Settings
      </h2>
      <div className="w-8" />
    </div>
  )
}
