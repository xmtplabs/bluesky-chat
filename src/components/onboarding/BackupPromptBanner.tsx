import { useAuthStore, useOnboardingStore } from '../../stores/authStore'
import { useUIStore } from '../../stores/uiStore'

/**
 * Banner prompting new users to back up their inbox key.
 * Only shown when the user skipped restore and hasn't backed up yet.
 * Does not show if IdentityMismatchBanner is showing (avoid two banners).
 */
export function BackupPromptBanner() {
  const { profile, identityMismatch, signatureInvalid, mismatchDismissed } = useAuthStore()
  const { getPhase, setPhase } = useOnboardingStore()
  const { setSidebarView } = useUIStore()

  if (!profile?.id) {
    return null
  }

  // Don't show if identity mismatch banner is showing
  const identityBannerShowing = (identityMismatch || signatureInvalid) && !mismatchDismissed
  if (identityBannerShowing) {
    return null
  }

  const onboardingPhase = getPhase(profile.id)

  // Only show for users who skipped restore and haven't backed up yet
  if (onboardingPhase.phase !== 'restore-skipped') {
    return null
  }

  const handleBackupNow = () => {
    setSidebarView('inbox-settings')
  }

  const handleDismiss = () => {
    setPhase(profile.id, { phase: 'backup-dismissed' })
  }

  return (
    <div
      role="alert"
      className="bg-[var(--color-bsky-500)]/8 border-b border-[var(--color-bsky-500)]/15 px-4 py-2.5"
    >
      <div className="flex items-center gap-3 max-w-3xl mx-auto">
        <div className="w-8 h-8 rounded-full bg-[var(--color-bsky-500)]/15 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-[var(--color-bsky-500)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-[var(--color-text-primary)] leading-tight">
            Back up your inbox
          </p>
          <p className="text-[12px] text-[var(--color-text-secondary)] mt-0.5 leading-snug">
            Keep access to your messages if you switch devices.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleBackupNow}
            className="px-3.5 h-8 text-[13px] font-semibold text-white bg-[var(--color-bsky-500)] hover:bg-[var(--color-bsky-600)] rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-bsky-500)] focus:ring-offset-2"
          >
            Back Up Now
          </button>
          <button
            onClick={handleDismiss}
            className="w-8 h-8 flex items-center justify-center text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bsky-500)]/15 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-bsky-500)] focus:ring-offset-2"
            aria-label="Dismiss"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
