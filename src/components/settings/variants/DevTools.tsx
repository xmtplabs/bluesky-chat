import { useState, useEffect } from 'react'
import { useSettings } from '../context/SettingsContext'
import { useAuthStore, useOnboardingStore } from '../../../stores/authStore'
import { useSettingsStore } from '../../../stores/settingsStore'
import { blueskyService } from '../../../services/bluesky'
import { identityService } from '../../../services/identity'
import { clearPrivateKey } from '../../../services/signer'
import type { BuildMode } from '../../../types'

function truncateId(id: string, chars = 8): string {
  if (id.length <= chars * 2 + 3) return id
  return `${id.slice(0, chars)}...${id.slice(-chars)}`
}

/**
 * Developer tools for testing identity states and ATProto records.
 * Only visible in development mode.
 */
export function DevTools() {
  const { actions, meta } = useSettings()
  const { blueskyProfile, xmtpInboxId, identityMismatch, signatureInvalid, publishedInboxId } = meta

  const { devToolsPanelOpen } = useSettingsStore()
  const [buildMode, setBuildMode] = useState<BuildMode | null>(null)
  const [showDevTools, setShowDevTools] = useState(false)
  const [isWorking, setIsWorking] = useState(false)
  const [atprotoRecord, setAtprotoRecord] = useState<{ inboxId: string; signature: string } | null | 'loading'>('loading')

  const { getPhase, setPhase: setOnboardingPhase } = useOnboardingStore()
  const { checkIdentityStatus } = useAuthStore()

  const hasWriteAccess = blueskyService.hasRepoWriteAccess()
  const onboardingPhase = blueskyProfile?.did ? getPhase(blueskyProfile.did) : { phase: 'fresh' as const }

  // Fetch build mode from main process
  useEffect(() => {
    window.electronAPI?.getBuildMode?.().then(setBuildMode).catch(() => {
      // Fallback for non-Electron environments (e.g., tests)
      setBuildMode('development')
    })
  }, [])

  // Visibility rules:
  // - Always visible in development mode
  // - Visible in beta mode only when toggled on via menu
  // - Never visible in production
  // - Don't render until we know the build mode
  if (buildMode === null) return null
  const isVisible = buildMode === 'development' || (buildMode === 'beta' && devToolsPanelOpen)
  if (!isVisible) return null

  // Fetch current ATProto record on mount when expanded
  useEffect(() => {
    if (!blueskyProfile?.did || !showDevTools) return

    identityService.lookupInboxForDid(blueskyProfile.did)
      .then(record => {
        setAtprotoRecord(record ? { inboxId: record.inboxId, signature: record.verificationSignature } : null)
      })
      .catch(() => setAtprotoRecord(null))
  }, [blueskyProfile?.did, showDevTools])

  const refreshAtprotoRecord = async () => {
    if (!blueskyProfile?.did) return
    setAtprotoRecord('loading')
    try {
      const record = await identityService.lookupInboxForDid(blueskyProfile.did)
      setAtprotoRecord(record ? { inboxId: record.inboxId, signature: record.verificationSignature } : null)
    } catch {
      setAtprotoRecord(null)
    }
  }

  const simulateMismatch = () => {
    useAuthStore.setState({
      identityMismatch: true,
      publishedInboxId: 'fake-inbox-id-for-testing-' + Date.now().toString(16),
      mismatchDismissed: false
    })
    actions.setSuccess('Simulated identity mismatch')
  }

  const clearMismatch = () => {
    useAuthStore.setState({
      identityMismatch: false,
      signatureInvalid: false,
      publishedInboxId: xmtpInboxId,
      mismatchDismissed: false
    })
    actions.setSuccess('Cleared mismatch state')
  }

  const deleteLocalKey = async () => {
    if (!blueskyProfile?.did) return
    if (!confirm('Delete local private key? You will need to restart the app and this will create a new inbox.')) return

    setIsWorking(true)
    try {
      await clearPrivateKey(blueskyProfile.did)
      actions.setSuccess('Local key deleted. Restart to create new inbox.')
    } catch (err) {
      actions.setError(err instanceof Error ? err.message : 'Failed to delete key')
    } finally {
      setIsWorking(false)
    }
  }

  const deleteAtprotoRecord = async () => {
    if (!confirm('Delete your org.xmtp.inbox record from Bluesky? This will make you appear as "not on chat" to others.')) return

    setIsWorking(true)
    try {
      const agent = blueskyService.getAgent()
      await identityService.deleteIdentityFromATProto(agent)
      setAtprotoRecord(null)
      await checkIdentityStatus()
      actions.setSuccess('Record deleted')
    } catch (err) {
      actions.setError(err instanceof Error ? err.message : 'Failed to delete record')
    } finally {
      setIsWorking(false)
    }
  }

  const publishBadSignature = async () => {
    if (!xmtpInboxId) return
    if (!confirm('Publish a record with an invalid signature? Other users will see "Identity not verified" when viewing your profile. Use "Update Profile" to fix.')) return

    setIsWorking(true)
    try {
      const agent = blueskyService.getAgent()
      // Publish with correct inbox ID but garbage signature
      const junkSignature = btoa('this-is-an-invalid-signature-for-testing-' + Date.now())
      await identityService.publishIdentityToATProto(agent, xmtpInboxId, junkSignature)
      await refreshAtprotoRecord()
      await checkIdentityStatus()
      actions.setSuccess('Published bad signature')
    } catch (err) {
      actions.setError(err instanceof Error ? err.message : 'Failed to publish')
    } finally {
      setIsWorking(false)
    }
  }

  const publishWrongInbox = async () => {
    if (!confirm('Publish a record with a fake inbox ID? This simulates the mismatch scenario where your published inbox differs from local. Use "Update Profile" to fix.')) return

    setIsWorking(true)
    try {
      const agent = blueskyService.getAgent()
      // Publish with fake inbox ID and fake signature
      const fakeInboxId = 'fake' + Date.now().toString(16) + 'abcdef1234567890'
      const junkSignature = btoa('fake-signature-' + Date.now())
      await identityService.publishIdentityToATProto(agent, fakeInboxId, junkSignature)
      await refreshAtprotoRecord()
      await checkIdentityStatus()
      actions.setSuccess('Published wrong inbox')
    } catch (err) {
      actions.setError(err instanceof Error ? err.message : 'Failed to publish')
    } finally {
      setIsWorking(false)
    }
  }

  return (
    <div className="border-t border-[var(--color-border-light)] pt-4">
      <button
        onClick={() => setShowDevTools(!showDevTools)}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-[var(--color-surface-secondary)] transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <svg className="w-4 h-4 text-[var(--color-text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z" />
          </svg>
          <span className="text-[13px] font-medium text-[var(--color-text-primary)]">Dev Tools</span>
        </div>
        <svg className={`w-4 h-4 text-[var(--color-text-tertiary)] transition-transform ${showDevTools ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {showDevTools && (
        <div className="mt-2 space-y-3 px-1">
          {/* Current State */}
          <div className="px-2 py-1.5 bg-[var(--color-surface-secondary)] rounded-lg font-mono text-[10px] space-y-0.5">
            <div className="flex justify-between">
              <span className="text-[var(--color-text-tertiary)]">DID:</span>
              <span className="text-[var(--color-text-primary)] truncate max-w-[140px]">{blueskyProfile?.did || 'none'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-text-tertiary)]">Local Inbox:</span>
              <span className="text-[var(--color-text-primary)]">{xmtpInboxId ? truncateId(xmtpInboxId, 6) : 'none'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-text-tertiary)]">Published:</span>
              <span className="text-[var(--color-text-primary)]">{publishedInboxId ? truncateId(publishedInboxId, 6) : 'none'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-text-tertiary)]">Mismatch:</span>
              <span className={identityMismatch ? 'text-[var(--color-warning)]' : 'text-[var(--color-success)]'}>{identityMismatch ? 'YES' : 'NO'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-text-tertiary)]">Sig Invalid:</span>
              <span className={signatureInvalid ? 'text-[var(--color-warning)]' : 'text-[var(--color-success)]'}>{signatureInvalid ? 'YES' : 'NO'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-text-tertiary)]">Onboarding:</span>
              <span className="text-[var(--color-text-primary)]">{onboardingPhase.phase}</span>
            </div>
          </div>

          {/* ATProto Record */}
          <details className="group" open>
            <summary className="flex items-center justify-between cursor-pointer text-[12px] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] px-2">
              <span className="flex items-center gap-1.5">
                <svg className="w-3 h-3 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                ATProto Record
              </span>
              <button
                onClick={(e) => { e.preventDefault(); refreshAtprotoRecord() }}
                className="text-[10px] text-[var(--color-bsky-500)] hover:text-[var(--color-bsky-600)]"
              >
                Refresh
              </button>
            </summary>
            <div className="mt-2 px-2 py-1.5 bg-[var(--color-surface-secondary)] rounded-lg font-mono text-[10px]">
              {atprotoRecord === 'loading' ? (
                <span className="text-[var(--color-text-tertiary)]">Loading...</span>
              ) : atprotoRecord === null ? (
                <span className="text-[var(--color-text-tertiary)]">No record found</span>
              ) : (
                <div className="space-y-0.5">
                  <div className="flex justify-between">
                    <span className="text-[var(--color-text-tertiary)]">Inbox ID:</span>
                    <span className="text-[var(--color-text-primary)]">{truncateId(atprotoRecord.inboxId, 6)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--color-text-tertiary)]">Signature:</span>
                    <span className="text-[var(--color-text-primary)]">{truncateId(atprotoRecord.signature, 6)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[var(--color-text-tertiary)]">Matches Local:</span>
                    <span className={atprotoRecord.inboxId === xmtpInboxId ? 'text-[var(--color-success)]' : 'text-[var(--color-warning)]'}>
                      {atprotoRecord.inboxId === xmtpInboxId ? 'YES' : 'NO'}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </details>

          {/* UI State Testing */}
          <details className="group">
            <summary className="flex items-center gap-1.5 cursor-pointer text-[12px] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] px-2">
              <svg className="w-3 h-3 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              UI State (local only)
            </summary>
            <div className="mt-2 grid grid-cols-2 gap-2 px-1">
              <button
                onClick={simulateMismatch}
                disabled={isWorking}
                className="h-8 text-[11px] font-medium bg-[var(--color-warning-light)] text-[var(--color-text-primary)] hover:brightness-95 rounded-lg transition-all disabled:opacity-50"
              >
                Simulate Mismatch
              </button>
              <button
                onClick={clearMismatch}
                disabled={isWorking}
                className="h-8 text-[11px] font-medium bg-[var(--color-success-light)] text-[var(--color-text-primary)] hover:brightness-95 rounded-lg transition-all disabled:opacity-50"
              >
                Clear Mismatch
              </button>
            </div>
          </details>

          {/* Onboarding Phase */}
          <details className="group">
            <summary className="flex items-center gap-1.5 cursor-pointer text-[12px] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] px-2">
              <svg className="w-3 h-3 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              Onboarding Phase
            </summary>
            <div className="mt-2 space-y-2 px-1">
              <p className="text-[10px] text-[var(--color-text-tertiary)] px-1">
                Current: <span className="font-medium text-[var(--color-text-primary)]">{onboardingPhase.phase}</span>
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    if (blueskyProfile?.did) {
                      setOnboardingPhase(blueskyProfile.did, { phase: 'fresh' })
                      actions.setSuccess('Set to fresh')
                    }
                  }}
                  disabled={!blueskyProfile?.did}
                  className="h-8 text-[11px] font-medium bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)] hover:brightness-95 rounded-lg transition-all disabled:opacity-50"
                >
                  fresh
                </button>
                <button
                  onClick={() => {
                    if (blueskyProfile?.did) {
                      setOnboardingPhase(blueskyProfile.did, { phase: 'restore-skipped' })
                      actions.setSuccess('Set to restore-skipped (shows backup banner)')
                    }
                  }}
                  disabled={!blueskyProfile?.did}
                  className="h-8 text-[11px] font-medium bg-[var(--color-bsky-500)]/15 text-[var(--color-bsky-600)] hover:brightness-95 rounded-lg transition-all disabled:opacity-50"
                >
                  restore-skipped
                </button>
                <button
                  onClick={() => {
                    if (blueskyProfile?.did) {
                      setOnboardingPhase(blueskyProfile.did, { phase: 'restored' })
                      actions.setSuccess('Set to restored')
                    }
                  }}
                  disabled={!blueskyProfile?.did}
                  className="h-8 text-[11px] font-medium bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)] hover:brightness-95 rounded-lg transition-all disabled:opacity-50"
                >
                  restored
                </button>
                <button
                  onClick={() => {
                    if (blueskyProfile?.did) {
                      setOnboardingPhase(blueskyProfile.did, { phase: 'backup-completed' })
                      actions.setSuccess('Set to backup-completed')
                    }
                  }}
                  disabled={!blueskyProfile?.did}
                  className="h-8 text-[11px] font-medium bg-[var(--color-success-light)] text-[var(--color-success)] hover:brightness-95 rounded-lg transition-all disabled:opacity-50"
                >
                  backup-completed
                </button>
              </div>
              <p className="text-[10px] text-[var(--color-text-tertiary)] px-1">
                Set "restore-skipped" to test the backup prompt banner.
              </p>
            </div>
          </details>

          {/* ATProto Actions */}
          <details className="group">
            <summary className="flex items-center gap-1.5 cursor-pointer text-[12px] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] px-2">
              <svg className="w-3 h-3 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              ATProto Record (real changes)
            </summary>
            <div className="mt-2 space-y-2 px-1">
              <button
                onClick={publishBadSignature}
                disabled={isWorking || !hasWriteAccess}
                className="w-full h-8 text-[11px] font-medium bg-[var(--color-warning-light)] text-[var(--color-text-primary)] hover:brightness-95 rounded-lg transition-all disabled:opacity-50"
              >
                Publish Bad Signature
              </button>
              <button
                onClick={publishWrongInbox}
                disabled={isWorking || !hasWriteAccess}
                className="w-full h-8 text-[11px] font-medium bg-[var(--color-warning-light)] text-[var(--color-text-primary)] hover:brightness-95 rounded-lg transition-all disabled:opacity-50"
              >
                Publish Wrong Inbox ID
              </button>
              <button
                onClick={deleteAtprotoRecord}
                disabled={isWorking || !hasWriteAccess}
                className="w-full h-8 text-[11px] font-medium bg-[var(--color-error-light)] text-[var(--color-error)] hover:brightness-95 rounded-lg transition-all disabled:opacity-50"
              >
                Delete ATProto Record
              </button>
              {!hasWriteAccess && (
                <p className="text-[10px] text-[var(--color-text-tertiary)] px-1">
                  App Password required for ATProto changes
                </p>
              )}
            </div>
          </details>

          {/* Local Storage Actions */}
          <details className="group">
            <summary className="flex items-center gap-1.5 cursor-pointer text-[12px] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] px-2">
              <svg className="w-3 h-3 transition-transform group-open:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              Local Storage (destructive)
            </summary>
            <div className="mt-2 px-1">
              <button
                onClick={deleteLocalKey}
                disabled={isWorking}
                className="w-full h-8 text-[11px] font-medium bg-[var(--color-error-light)] text-[var(--color-error)] hover:brightness-95 rounded-lg transition-all disabled:opacity-50"
              >
                Delete Local Private Key
              </button>
              <p className="text-[10px] text-[var(--color-text-tertiary)] mt-1.5 px-1">
                Requires restart. Creates new inbox on next login.
              </p>
            </div>
          </details>
        </div>
      )}
    </div>
  )
}
