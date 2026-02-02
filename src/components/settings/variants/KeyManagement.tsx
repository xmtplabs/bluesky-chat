import { useSettings } from '../context/SettingsContext'
import { BackupForm } from '../shared/BackupForm'
import { RestoreForm } from '../shared/RestoreForm'

/**
 * Collapsible section for backup and restore functionality.
 */
export function KeyManagement() {
  const { state, actions } = useSettings()
  const { showKeyManagement, keyTab } = state

  return (
    <div className="border-t border-[var(--color-border-light)] pt-4">
      <button
        onClick={() => {
          actions.setShowKeyManagement(!showKeyManagement)
          actions.setError(null)
          actions.setSuccess(null)
        }}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-[var(--color-surface-secondary)] transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <svg className="w-4 h-4 text-[var(--color-text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
          </svg>
          <span className="text-[13px] font-medium text-[var(--color-text-primary)]">Backup & Restore</span>
        </div>
        <svg className={`w-4 h-4 text-[var(--color-text-tertiary)] transition-transform ${showKeyManagement ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {showKeyManagement && (
        <div className="mt-3 space-y-3 px-1">
          {/* Segmented Controller */}
          <div className="flex p-1 bg-[var(--color-surface-secondary)] rounded-lg">
            <button
              onClick={() => actions.setKeyTab('backup')}
              className={`flex-1 px-3 py-1.5 text-[13px] font-medium rounded-md transition-all ${
                keyTab === 'backup'
                  ? 'bg-white text-[var(--color-text-primary)] shadow-sm'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              Backup
            </button>
            <button
              onClick={() => actions.setKeyTab('restore')}
              className={`flex-1 px-3 py-1.5 text-[13px] font-medium rounded-md transition-all ${
                keyTab === 'restore'
                  ? 'bg-white text-[var(--color-text-primary)] shadow-sm'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              }`}
            >
              Restore
            </button>
          </div>

          {keyTab === 'backup' && <BackupForm />}
          {keyTab === 'restore' && <RestoreForm />}
        </div>
      )}
    </div>
  )
}
