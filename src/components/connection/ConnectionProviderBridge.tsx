import { useState, useMemo, useCallback, useEffect, type ReactNode } from 'react'
import { toBytes, type Hex } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { Client, IdentifierKind, type Signer } from '@xmtp/browser-sdk'
import { ConnectionProvider, type ConnectionContextValue, type ConnectionPhase } from './context/ConnectionContext'
import { useAuthStore, useOnboardingStore } from '../../stores/authStore'
import { hasExistingKey, importPrivateKey, exportPrivateKey } from '../../services/signer'
import { verboseLog, verboseWarn, verboseError } from '../../services/xmtp'

// Match the environment used in xmtp.ts
const XMTP_ENV = import.meta.env.MODE === 'production' ? 'production' : 'dev'

interface ConnectionProviderBridgeProps {
  children: ReactNode
}

/**
 * Bridges authStore state to the Connection context.
 * Manages connection phase transitions and restore flow.
 */
export function ConnectionProviderBridge({ children }: ConnectionProviderBridgeProps) {
  const { blueskyProfile, connectXMTP, error: authError, clearError } = useAuthStore()
  const { getPhase, setPhase } = useOnboardingStore()

  const [phase, setLocalPhase] = useState<ConnectionPhase>('checking')
  const [error, setError] = useState<string | null>(null)
  const [restoredKey, setRestoredKey] = useState<Hex | null>(null)
  const [isRestoring, setIsRestoring] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const [keyExists, setKeyExists] = useState(false)

  // Check for existing key on mount
  useEffect(() => {
    if (!blueskyProfile?.did) return

    let cancelled = false

    const checkKey = async () => {
      verboseLog('🔍 CONNECTION: Checking for existing key...')
      console.log('   DID:', blueskyProfile.did)

      const exists = await hasExistingKey(blueskyProfile.did)
      if (cancelled) return

      setKeyExists(exists)
      verboseLog('🔍 CONNECTION: Key exists:', exists)

      if (exists) {
        // Returning user - go straight to connecting
        verboseLog('🔄 CONNECTION: Returning user - connecting with existing key')
        setLocalPhase('connecting')
        try {
          await connectXMTP()
        } catch (err) {
          if (cancelled) return
          setError(err instanceof Error ? err.message : 'Connection failed')
          setLocalPhase('error')
        }
      } else {
        // New user - show restore opportunity
        verboseLog('🆕 CONNECTION: New user - showing restore opportunity')
        setLocalPhase('restore-opportunity')
      }
    }

    checkKey()

    return () => {
      cancelled = true
    }
  }, [blueskyProfile?.did, connectXMTP])

  // Sync auth errors to local state
  useEffect(() => {
    if (authError) {
      setError(authError)
      setLocalPhase('error')
    }
  }, [authError])

  const skipRestore = useCallback(async () => {
    if (!blueskyProfile?.did) return

    verboseWarn('⏭️ SKIP RESTORE: User chose to skip key restore')
    verboseWarn('   DID:', blueskyProfile.did)
    verboseWarn('   ⚠️ This will CREATE A NEW XMTP installation!')

    // Mark as restore-skipped for backup prompt
    setPhase(blueskyProfile.did, { phase: 'restore-skipped' })
    setLocalPhase('connecting')

    try {
      await connectXMTP()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed')
      setLocalPhase('error')
    }
  }, [blueskyProfile?.did, connectXMTP, setPhase])

  const restoreFromBackup = useCallback(async (key: Hex) => {
    if (!blueskyProfile?.did) return

    verboseLog('🔐 RESTORE: Attempting to restore key from backup')
    verboseLog('   DID:', blueskyProfile.did)

    setIsRestoring(true)
    setError(null)

    // First, try to import the key
    try {
      await importPrivateKey(blueskyProfile.did, key)
      verboseLog('🔐 RESTORE: Key imported successfully')
    } catch (err) {
      // Import failed (wrong password, invalid key, etc.) - stay on restore screen
      verboseError('🔐 RESTORE: Key import failed:', err)
      setError(err instanceof Error ? err.message : 'Restore failed')
      setLocalPhase('restore-opportunity')
      setIsRestoring(false)
      return
    }

    // Import succeeded - mark as restored and try to connect
    setRestoredKey(key)
    setPhase(blueskyProfile.did, { phase: 'restored' })
    setLocalPhase('connecting')
    setIsRestoring(false)

    verboseLog('🔐 RESTORE: Connecting with restored key (should REUSE existing installation)')

    try {
      await connectXMTP()
    } catch (err) {
      // Connection failed, but key is already imported - go to error state
      // (not restore-opportunity, since restore succeeded)
      setError(err instanceof Error ? err.message : 'Connection failed')
      setLocalPhase('error')
    }
  }, [blueskyProfile?.did, connectXMTP, setPhase])

  const retryConnection = useCallback(async () => {
    verboseLog('🔄 RETRY: Retrying XMTP connection')

    setError(null)
    clearError()
    setLocalPhase('connecting')

    try {
      await connectXMTP()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connection failed')
      setLocalPhase('error')
    }
  }, [connectXMTP, clearError])

  const clearInstallations = useCallback(async () => {
    if (!blueskyProfile?.did) {
      verboseError('No Bluesky profile to clear installations for')
      return
    }

    verboseWarn('🗑️ CLEAR INSTALLATIONS: Starting installation cleanup')
    verboseWarn('   DID:', blueskyProfile.did)
    verboseWarn('   ⚠️ This will DELETE local IndexedDB and revoke all installations!')
    verboseWarn('   ⚠️ A NEW installation will be created on reconnect!')

    setIsClearing(true)

    try {
      // Get private key for this DID
      const privateKey = await exportPrivateKey(blueskyProfile.did)
      if (!privateKey) {
        verboseError('No private key found for DID:', blueskyProfile.did)
        setError('No private key found')
        setIsClearing(false)
        return
      }

      // Create signer
      const account = privateKeyToAccount(privateKey as Hex)
      const signer: Signer = {
        type: 'EOA',
        getIdentifier: () => ({
          identifier: account.address.toLowerCase(),
          identifierKind: IdentifierKind.Ethereum
        }),
        signMessage: async (message: string): Promise<Uint8Array> => {
          const signature = await account.signMessage({ message })
          return toBytes(signature)
        }
      }

      // Get inbox ID from IndexedDB or from the error message
      const databases = await indexedDB.databases()
      const dbPrefix = `xmtp-${XMTP_ENV}-`
      const xmtpDb = databases.find((db) => db.name?.startsWith(dbPrefix))

      // Extract inbox ID from error message if available
      const inboxIdFromError = error?.match(/InboxID\s+([a-f0-9]+)/)?.[1]

      let inboxId: string | null = null
      if (xmtpDb?.name) {
        inboxId = xmtpDb.name.replace(dbPrefix, '').replace('.db3', '')
      } else if (inboxIdFromError) {
        inboxId = inboxIdFromError
      }

      if (!inboxId) {
        verboseError('Could not find inbox ID')
        setError('Could not find inbox ID')
        setIsClearing(false)
        return
      }

      verboseLog('🗑️ CLEAR INSTALLATIONS: Revoking installations for inbox:', inboxId)

      // Fetch and revoke all installations
      const inboxStates = await Client.fetchInboxStates([inboxId], XMTP_ENV)
      if (inboxStates && inboxStates.length > 0) {
        const installations = inboxStates[0]?.installations ?? []
        verboseLog(`🗑️ CLEAR INSTALLATIONS: Found ${installations.length} installations to revoke`)

        const installationBytes = installations.map((i) => i.bytes)
        await Client.revokeInstallations(signer, inboxId, installationBytes, XMTP_ENV)
        verboseLog('🗑️ CLEAR INSTALLATIONS: All installations revoked')

        // Clean up local database
        if (xmtpDb?.name) {
          verboseWarn('🗑️ CLEAR INSTALLATIONS: Deleting IndexedDB:', xmtpDb.name)
          indexedDB.deleteDatabase(xmtpDb.name)
          verboseLog('🗑️ CLEAR INSTALLATIONS: Local database deleted')
        }
      }

      // Clear the error and retry connection
      setError(null)
      clearError()
      setLocalPhase('connecting')

      verboseWarn('🗑️ CLEAR INSTALLATIONS: Reconnecting (will create NEW installation)...')

      // Retry XMTP connection
      await connectXMTP()
    } catch (err) {
      verboseError('Failed to clear installations:', err)
      setError(err instanceof Error ? err.message : 'Failed to clear installations')
    } finally {
      setIsClearing(false)
    }
  }, [blueskyProfile?.did, error, connectXMTP, clearError])

  const contextValue: ConnectionContextValue = useMemo(() => ({
    state: {
      phase,
      error,
      restoredKey
    },
    actions: {
      skipRestore,
      restoreFromBackup,
      retryConnection,
      clearInstallations
    },
    meta: {
      blueskyProfile,
      isRestoring,
      isClearing,
      hasExistingKey: keyExists
    }
  }), [phase, error, restoredKey, skipRestore, restoreFromBackup, retryConnection, clearInstallations, blueskyProfile, isRestoring, isClearing, keyExists])

  return (
    <ConnectionProvider value={contextValue}>
      {children}
    </ConnectionProvider>
  )
}
