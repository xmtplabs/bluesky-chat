import { useState } from 'react'
import { useConnection } from '../context/ConnectionContext'
import { formatHandle } from '../../../provider'
import { RestorePrompt } from '../RestorePrompt'

/**
 * Offers new users the option to restore from backup or continue with a new identity.
 */
export function RestoreOpportunity() {
  const { state, actions, meta } = useConnection()
  const [showRestore, setShowRestore] = useState(false)

  return (
    <div className="h-screen flex items-center justify-center bg-white">
      <div className="text-center max-w-sm px-4">
        {/* Icon */}
        <div className="w-16 h-16 mx-auto mb-5 rounded-full bg-[var(--color-bsky-500)]/10 flex items-center justify-center">
          <svg className="w-8 h-8 text-[var(--color-bsky-500)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
          </svg>
        </div>

        {/* Welcome text */}
        <h1 className="text-xl font-semibold text-[var(--color-text-primary)] mb-2">
          Welcome to Chat
        </h1>
        <p className="text-[14px] text-[var(--color-text-secondary)] mb-6">
          {meta.profile?.handle && (
            <span className="text-[var(--color-text-primary)] font-medium">
              {formatHandle(meta.profile.handle)}
            </span>
          )}
          {meta.profile?.handle && ', '}
          set up your encrypted inbox to start messaging.
        </p>

        {/* Continue button */}
        <button
          onClick={actions.skipRestore}
          className="w-full h-11 flex items-center justify-center gap-2 text-[15px] font-semibold bg-[var(--color-bsky-500)] text-white hover:bg-[var(--color-bsky-600)] rounded-xl transition-colors mb-4"
        >
          Continue
        </button>

        {/* Restore option - collapsed by default */}
        <div className="text-left">
          <button
            onClick={() => setShowRestore(!showRestore)}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-[var(--color-surface-secondary)] transition-colors text-left"
          >
            <div className="flex items-center gap-2.5">
              <svg className="w-4 h-4 text-[var(--color-text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
              </svg>
              <span className="text-[13px] font-medium text-[var(--color-text-secondary)]">
                Have a backup?
              </span>
            </div>
            <svg
              className={`w-4 h-4 text-[var(--color-text-tertiary)] transition-transform ${showRestore ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showRestore && (
            <div className="mt-3 px-1">
              <RestorePrompt
                onRestore={actions.restoreFromBackup}
                isRestoring={meta.isRestoring}
                error={state.error}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
