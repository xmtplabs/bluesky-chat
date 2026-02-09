import { useState, useRef } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { useUIStore } from '../../stores/uiStore'
import { provider } from '../../provider'

export function IdentityMismatchBanner() {
  const {
    identityMismatch,
    signatureInvalid,
    mismatchDismissed,
    dismissMismatch,
    republishIdentity
  } = useAuthStore()
  const { setSidebarView } = useUIStore()
  const [isUpdating, setIsUpdating] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const successRef = useRef(false)

  const hasWriteAccess = provider.canPublishIdentity?.() ?? false

  // Show banner for either mismatch or invalid signature (or briefly after fix)
  const hasIssue = identityMismatch || signatureInvalid || showSuccess || successRef.current
  if (!hasIssue || mismatchDismissed) {
    return null
  }

  const handleUpdateProfile = async () => {
    setIsUpdating(true)
    try {
      // Set ref before async op so banner stays visible during store update
      successRef.current = true
      await republishIdentity()
      setIsUpdating(false)
      setShowSuccess(true)
      setTimeout(() => {
        successRef.current = false
        setShowSuccess(false)
      }, 2000)
    } catch (err) {
      console.error('Failed to update profile:', err)
      successRef.current = false
      setIsUpdating(false)
    }
  }

  const handleOpenSettings = () => {
    setSidebarView('inbox-settings')
  }

  // Different UI for mismatch vs signature invalid
  if (identityMismatch) {
    return (
      <div
        role="alert"
        className="bg-[var(--color-warning)]/8 border-b border-[var(--color-warning)]/15 px-4 py-2.5"
      >
        <div className="flex items-center gap-3 max-w-3xl mx-auto">
          <div className="w-8 h-8 rounded-full bg-[var(--color-warning)]/15 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-[var(--color-warning)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-[var(--color-text-primary)] leading-tight">
              Different inbox linked
            </p>
            <p className="text-[12px] text-[var(--color-text-secondary)] mt-0.5 leading-snug">
              Messages sent to you may go to a different device.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleOpenSettings}
              className="px-3.5 h-8 text-[13px] font-semibold text-white bg-[var(--color-bsky-500)] hover:bg-[var(--color-bsky-600)] rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-bsky-500)] focus:ring-offset-2"
            >
              Fix Now
            </button>
            <button
              onClick={dismissMismatch}
              className="w-8 h-8 flex items-center justify-center text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-warning)]/15 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-bsky-500)] focus:ring-offset-2"
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

  // Signature invalid case (or success state)
  if (showSuccess || (successRef.current && !signatureInvalid)) {
    return (
      <div
        role="status"
        className="bg-green-500/8 border-b border-green-500/15 px-4 py-2.5"
      >
        <div className="flex items-center gap-3 max-w-3xl mx-auto">
          <div className="w-8 h-8 rounded-full bg-green-500/15 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-[13px] font-medium text-green-700">
            Fixed — you'll now appear verified to others
          </p>
        </div>
      </div>
    )
  }

  return (
    <div
      role="alert"
      className="bg-[var(--color-warning)]/8 border-b border-[var(--color-warning)]/15 px-4 py-2.5"
    >
      <div className="flex items-center gap-3 max-w-3xl mx-auto">
        <div className="w-8 h-8 rounded-full bg-[var(--color-warning)]/15 flex items-center justify-center flex-shrink-0">
          <svg className="w-4 h-4 text-[var(--color-warning)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-semibold text-[var(--color-text-primary)] leading-tight">
            Verification issue
          </p>
          <p className="text-[12px] text-[var(--color-text-secondary)] mt-0.5 leading-snug">
            Others won't be able to message you.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {hasWriteAccess ? (
            <button
              onClick={handleUpdateProfile}
              disabled={isUpdating}
              className="px-3.5 h-8 text-[13px] font-semibold text-white bg-[var(--color-bsky-500)] hover:bg-[var(--color-bsky-600)] rounded-lg transition-colors disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[var(--color-bsky-500)] focus:ring-offset-2"
            >
              {isUpdating ? 'Fixing...' : 'Fix Now'}
            </button>
          ) : (
            <button
              onClick={() => setSidebarView('inbox-settings')}
              className="px-3.5 h-8 text-[13px] font-semibold text-white bg-[var(--color-bsky-500)] hover:bg-[var(--color-bsky-600)] rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-bsky-500)] focus:ring-offset-2"
            >
              View Settings
            </button>
          )}
          <button
            onClick={dismissMismatch}
            className="w-8 h-8 flex items-center justify-center text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-warning)]/15 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--color-bsky-500)] focus:ring-offset-2"
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
