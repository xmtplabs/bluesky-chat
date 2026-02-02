import { useSettings } from '../context/SettingsContext'

/**
 * Settings footer with sign out button.
 */
export function SettingsFooter() {
  const { actions } = useSettings()

  return (
    <div className="p-4 border-t border-[var(--color-border-light)] flex-shrink-0">
      <button
        onClick={actions.logout}
        className="w-full h-10 flex items-center justify-center gap-2 text-[14px] font-medium text-[var(--color-error)] hover:bg-[var(--color-error-light)] rounded-xl transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
        </svg>
        Sign Out
      </button>
    </div>
  )
}
