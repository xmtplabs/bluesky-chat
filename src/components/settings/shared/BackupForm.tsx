import { useState, useEffect } from 'react'
import { useSettings } from '../context/SettingsContext'
import { useOnboardingStore } from '../../../stores/authStore'
import { exportPrivateKey } from '../../../services/signer'
import { encryptWithPassword } from '../../../services/crypto'
import { PasswordStrengthIndicator } from './PasswordStrengthIndicator'

/**
 * Backup form for creating encrypted key backups.
 */
export function BackupForm() {
  const { state, actions, meta } = useSettings()
  const { setPhase } = useOnboardingStore()

  const [exportPassword, setExportPassword] = useState('')
  const [exportPasswordConfirm, setExportPasswordConfirm] = useState('')
  const [isExporting, setIsExporting] = useState(false)
  const [exportComplete, setExportComplete] = useState(false)

  // Reset state when key management section closes or tab changes
  useEffect(() => {
    if (!state.showKeyManagement || state.keyTab !== 'backup') {
      setExportPassword('')
      setExportPasswordConfirm('')
      setExportComplete(false)
    }
  }, [state.showKeyManagement, state.keyTab])

  const passwordMeetsRequirements = exportPassword.length >= 8
  const passwordsMatch = exportPassword === exportPasswordConfirm && exportPasswordConfirm.length > 0

  const handleExportKey = async () => {
    if (!meta.profile?.id) return

    if (exportPassword.length < 8) {
      actions.setError('Password must be at least 8 characters')
      return
    }
    if (exportPassword !== exportPasswordConfirm) {
      actions.setError('Passwords do not match')
      return
    }

    setIsExporting(true)
    actions.setError(null)
    try {
      const key = await exportPrivateKey(meta.profile.id)
      if (key) {
        const encrypted = await encryptWithPassword(key, exportPassword)
        setExportPassword('')
        setExportPasswordConfirm('')

        const backup = {
          version: 1,
          type: 'xmtp-identity-backup',
          handle: meta.profile.handle,
          createdAt: new Date().toISOString(),
          encryptedKey: encrypted
        }

        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `xmtp-backup-${meta.profile.handle.replace(/\./g, '-')}.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)

        setExportComplete(true)
        actions.setSuccess('Backup downloaded')
        // Mark onboarding phase as completed
        setPhase(meta.profile.id, { phase: 'backup-completed' })
      } else {
        actions.setError('No key found for this account')
      }
    } catch (err) {
      actions.setError(err instanceof Error ? err.message : 'Failed to export key')
    } finally {
      setIsExporting(false)
    }
  }

  if (exportComplete) {
    return (
      <div className="flex items-center gap-2 py-3">
        <svg className="w-5 h-5 text-[var(--color-success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        <span className="text-[13px] text-[var(--color-text-secondary)]">Backup downloaded. Store it safely.</span>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-[12px] text-[var(--color-text-tertiary)]">
        Create an encrypted backup to restore on another device.
      </p>
      <div>
        <input
          type="password"
          autoComplete="new-password"
          value={exportPassword}
          onChange={(e) => setExportPassword(e.target.value)}
          placeholder="Password (min 8 characters)"
          className="w-full px-3 py-2 bg-[var(--color-surface-secondary)] border border-[var(--color-border-light)] rounded-lg text-[13px] text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-bsky-500)] focus:ring-2 focus:ring-[var(--color-bsky-500)]/20 transition-all"
        />
        <PasswordStrengthIndicator password={exportPassword} />
      </div>
      <input
        type="password"
        autoComplete="new-password"
        value={exportPasswordConfirm}
        onChange={(e) => setExportPasswordConfirm(e.target.value)}
        placeholder="Confirm password"
        className={`w-full px-3 py-2 bg-[var(--color-surface-secondary)] border rounded-lg text-[13px] text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 transition-all ${
          exportPasswordConfirm.length > 0
            ? passwordsMatch
              ? 'border-[var(--color-success)] focus:border-[var(--color-success)] focus:ring-[var(--color-success)]/20'
              : 'border-[var(--color-error)] focus:border-[var(--color-error)] focus:ring-[var(--color-error)]/20'
            : 'border-[var(--color-border-light)] focus:border-[var(--color-bsky-500)] focus:ring-[var(--color-bsky-500)]/20'
        }`}
      />
      <button
        onClick={handleExportKey}
        disabled={isExporting || !passwordMeetsRequirements || !passwordsMatch}
        className="w-full h-10 flex items-center justify-center gap-2 text-[14px] font-semibold bg-[var(--color-bsky-500)] text-white hover:bg-[var(--color-bsky-600)] rounded-lg transition-colors disabled:opacity-50"
      >
        {isExporting ? 'Encrypting...' : 'Download Backup'}
      </button>
    </div>
  )
}
