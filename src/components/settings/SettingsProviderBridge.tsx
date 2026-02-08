import { useState, useMemo, useCallback, useEffect, type ReactNode } from 'react'
import { SettingsProvider, type SettingsContextValue } from './context/SettingsContext'
import { useUIStore } from '../../stores/uiStore'
import { useAuthStore } from '../../stores/authStore'
import { provider } from '../../provider'

interface SettingsProviderBridgeProps {
  children: ReactNode
}

/**
 * Bridges authStore and uiStore state to the Settings context.
 * Manages settings-specific state like key management visibility.
 */
export function SettingsProviderBridge({ children }: SettingsProviderBridgeProps) {
  const { toggleInboxSettings } = useUIStore()
  const {
    profile,
    xmtpInboxId,
    identityMismatch,
    signatureInvalid,
    publishedInboxId,
    republishIdentity: authRepublishIdentity,
    checkIdentityStatus: authCheckIdentityStatus,
    logout: authLogout
  } = useAuthStore()

  // Key management state - auto-expand and show restore tab if identity mismatch
  const [showKeyManagement, setShowKeyManagement] = useState(identityMismatch)
  const [keyTab, setKeyTab] = useState<'backup' | 'restore'>(identityMismatch ? 'restore' : 'backup')

  // General state
  const [isRepublishing, setIsRepublishing] = useState(false)
  const [isChecking, setIsChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const hasWriteAccess = provider.hasRepoWriteAccess?.() ?? false

  // Check identity status on mount
  useEffect(() => {
    const checkStatus = async () => {
      setIsChecking(true)
      try {
        await authCheckIdentityStatus()
      } finally {
        setIsChecking(false)
      }
    }
    checkStatus()
  }, [authCheckIdentityStatus])

  // Reset key tab when section closes
  useEffect(() => {
    if (!showKeyManagement) {
      setKeyTab('backup')
    }
  }, [showKeyManagement])

  const republishIdentity = useCallback(async () => {
    setIsRepublishing(true)
    setError(null)
    try {
      await authRepublishIdentity()
      setSuccess('Identity updated')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to republish')
    } finally {
      setIsRepublishing(false)
    }
  }, [authRepublishIdentity])

  const checkIdentityStatus = useCallback(async () => {
    setIsChecking(true)
    try {
      await authCheckIdentityStatus()
    } finally {
      setIsChecking(false)
    }
  }, [authCheckIdentityStatus])

  const close = useCallback(() => {
    toggleInboxSettings()
  }, [toggleInboxSettings])

  const logout = useCallback(async () => {
    await authLogout()
  }, [authLogout])

  const contextValue: SettingsContextValue = useMemo(() => ({
    state: {
      error,
      success,
      showKeyManagement,
      keyTab,
      isRepublishing,
      isChecking
    },
    actions: {
      setError,
      setSuccess,
      setShowKeyManagement,
      setKeyTab,
      republishIdentity,
      checkIdentityStatus,
      close,
      logout
    },
    meta: {
      profile,
      xmtpInboxId,
      identityMismatch,
      signatureInvalid,
      publishedInboxId,
      hasWriteAccess
    }
  }), [
    error,
    success,
    showKeyManagement,
    keyTab,
    isRepublishing,
    isChecking,
    republishIdentity,
    checkIdentityStatus,
    close,
    logout,
    profile,
    xmtpInboxId,
    identityMismatch,
    signatureInvalid,
    publishedInboxId,
    hasWriteAccess
  ])

  return (
    <SettingsProvider value={contextValue}>
      {children}
    </SettingsProvider>
  )
}
