import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UserProfile } from '../types'
import { provider } from '../provider'
import { xmtpService, logStartupDiagnostics, verboseLog, verboseWarn, verboseGroup, verboseGroupEnd } from '../services/xmtp'
import { identityService } from '../services/identity'
import { getOrCreatePrivateKey, createXMTPSigner, getAddressFromPrivateKey, signDidWithInstallationKey, hasExistingKey } from '../services/signer'
import { mappingBackend } from '../services/mappingBackend'
import { useProfileStore } from './profileStore'
import { useChatStore } from './chatStore'
import { useUIStore } from './uiStore'

/**
 * Onboarding phase tracked per-DID to enable backup prompts for new users.
 */
export type OnboardingPhase =
  | { phase: 'fresh' }              // New user, no key yet
  | { phase: 'restore-skipped' }    // Skipped restore, needs backup nudge
  | { phase: 'restored' }           // Restored successfully from backup
  | { phase: 'backup-completed' }   // Backed up their key
  | { phase: 'backup-dismissed' }   // Dismissed backup prompt

interface AuthState {
  // Identity
  profile: UserProfile | null
  isLoggedIn: boolean

  // XMTP
  isXMTPConnected: boolean
  xmtpAddress: string | null
  xmtpInboxId: string | null

  // Identity status tracking
  identityMismatch: boolean
  signatureInvalid: boolean
  publishedInboxId: string | null
  mismatchDismissed: boolean

  // Loading states
  isLoading: boolean
  error: string | null

  // Actions
  initializeServices: () => Promise<void>
  login: (handle: string) => Promise<void>
  loginWithPassword: (identifier: string, password: string) => Promise<void>
  connectXMTP: () => Promise<void>
  updateUserProfile: (updates: { displayName?: string; description?: string; avatar?: Blob }) => Promise<void>
  republishIdentity: () => Promise<void>
  revokeOtherInstallations: () => Promise<void>
  checkIdentityStatus: () => Promise<void>
  dismissMismatch: () => void
  logout: () => Promise<void>
  clearError: () => void
}

/**
 * Separate persisted store for onboarding phases.
 * Keyed by DID so each account has independent onboarding state.
 */
interface OnboardingState {
  phases: Record<string, OnboardingPhase>
  getPhase: (did: string) => OnboardingPhase
  setPhase: (did: string, phase: OnboardingPhase) => void
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set, get) => ({
      phases: {},

      getPhase: (did: string): OnboardingPhase => {
        return get().phases[did] ?? { phase: 'fresh' }
      },

      setPhase: (did: string, phase: OnboardingPhase) => {
        set((state) => ({
          phases: { ...state.phases, [did]: phase }
        }))
      }
    }),
    {
      name: 'xmtp-onboarding'
    }
  )
)

// Module-level timer for binding retry (cleared on logout)
let bindingRetryTimer: ReturnType<typeof setTimeout> | null = null
// Guard against concurrent connectXMTP calls
let connectXMTPInFlight: Promise<void> | null = null

/**
 * Retry the identity binding in the background with exponential backoff.
 * Mobile signers (Primal) go to background after approving the NIP-46 connect,
 * so the first signEvent attempt often fails. This retries until the signer
 * becomes responsive again (e.g. user reopens the mobile app).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function scheduleBindingRetry(
  profile: UserProfile,
  inboxId: string,
  client: any,
  set: (partial: Partial<AuthState>) => void,
  attempt = 0,
): void {
  const delays = [15_000, 30_000, 60_000] // 15s, 30s, 60s then stop
  if (attempt >= delays.length) {
    console.log('[auth] Binding retry: giving up after', attempt, 'attempts')
    return
  }
  bindingRetryTimer = setTimeout(async () => {
    bindingRetryTimer = null
    console.log('[auth] Binding retry attempt', attempt + 1)
    try {
      await Promise.race([
        checkAndPublishBinding(profile, inboxId, client, set),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 10_000),
        ),
      ])
      console.log('[auth] Binding retry succeeded')
    } catch {
      console.log('[auth] Binding retry failed, scheduling next attempt')
      scheduleBindingRetry(profile, inboxId, client, set, attempt + 1)
    }
  }, delays[attempt])
}

/**
 * Check for an existing identity binding and publish a new one if needed.
 * Extracted so connectXMTP can race it against a timeout.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkAndPublishBinding(
  profile: UserProfile,
  inboxId: string,
  client: any,
  set: (partial: Partial<AuthState>) => void,
): Promise<void> {
  verboseLog('Checking for existing identity binding...')
  const existingBinding = await provider.lookupInboxForIdentity(profile.id)

  if (existingBinding.found) {
    verboseLog('Found existing record with inboxId:', existingBinding.inboxId)

    if (existingBinding.inboxId === inboxId) {
      verboseLog('Existing record matches our inbox ID - verifying signature...')
      const verifyResult = await identityService.verifyIdentityBinding(
        existingBinding.inboxId,
        profile.id,
        existingBinding.verificationSignature
      )

      if (verifyResult.verified) {
        verboseLog('Signature is valid')
        set({ identityMismatch: false, signatureInvalid: false, publishedInboxId: inboxId })
      } else if (verifyResult.definitive) {
        verboseWarn('Published signature is invalid!')
        set({ identityMismatch: false, signatureInvalid: true, publishedInboxId: inboxId, mismatchDismissed: false })
      } else {
        verboseWarn('Could not verify signature (network error)')
        set({ identityMismatch: false, signatureInvalid: false, publishedInboxId: inboxId })
      }

      const signature = await signDidWithInstallationKey(client, profile.id)
      await identityService.linkIdentity(profile.id, profile.handle, inboxId, signature)

      console.log('[auth] Registering existing mapping with backend for:', profile.id)
      mappingBackend.registerMapping({ id: profile.id })
        .then((success) => console.log('[auth] Backend registration result:', success ? 'success' : 'failed'))
        .catch((error) => console.warn('[auth] Backend registration error (non-critical):', error))
    } else {
      verboseWarn(`Identity mismatch! Published binding has inbox ${existingBinding.inboxId} but local client has ${inboxId}`)
      verboseWarn('This may happen if you logged in on a different device first. Messages sent to you will go to the published inbox.')
      set({ identityMismatch: true, signatureInvalid: false, publishedInboxId: existingBinding.inboxId, mismatchDismissed: false })

      const signature = await signDidWithInstallationKey(client, profile.id)
      await identityService.linkIdentity(profile.id, profile.handle, inboxId, signature)
    }
  } else {
    verboseLog('No existing identity binding found, creating new binding...')
    const signature = await signDidWithInstallationKey(client as any, profile.id)

    if (provider.canPublishIdentity?.() ?? false) {
      verboseLog('Publishing new identity binding via provider...')
      try {
        await provider.publishInboxBinding(inboxId, signature)
        verboseLog('Identity published via provider')

        console.log('[auth] Registering mapping with backend for:', profile.id)
        mappingBackend.registerMapping({ id: profile.id })
          .then((success) => console.log('[auth] Backend registration result:', success ? 'success' : 'failed'))
          .catch((error) => console.warn('[auth] Backend registration error (non-critical):', error))
      } catch (publishError) {
        verboseWarn('Failed to publish identity via provider:', publishError)
      }
    } else {
      verboseLog('Skipping identity publish (no write access).')
    }

    await identityService.linkIdentity(profile.id, profile.handle, inboxId, signature)
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  profile: null,
  isLoggedIn: false,
  isXMTPConnected: false,
  xmtpAddress: null,
  xmtpInboxId: null,
  identityMismatch: false,
  signatureInvalid: false,
  publishedInboxId: null,
  mismatchDismissed: false,
  isLoading: false,
  error: null,

  initializeServices: async () => {
    // Log startup diagnostics first to detect crashes/ungraceful shutdowns
    // Fire-and-forget — don't block initialization
    logStartupDiagnostics().catch((err) => console.warn('Startup diagnostics failed:', err))

    set({ isLoading: true, error: null })

    try {
      // Initialize identity service
      await identityService.init()

      // Try to restore existing provider session
      const restored = await provider.restoreSession()
      if (restored) {
        set({ profile: restored.profile, isLoggedIn: true })
        identityService.cacheProfile(restored.profile)
        // Note: XMTP connection is handled by ConnectionProviderBridge
        // which shows RestoreOpportunity for new users
      }
    } catch (error) {
      console.error('Failed to initialize services:', error)
      set({ error: error instanceof Error ? error.message : 'Failed to initialize' })
    } finally {
      set({ isLoading: false })
    }
  },

  login: async (handle: string) => {
    set({ isLoading: true, error: null })

    try {
      const { profile } = await provider.login(handle)
      set({ profile: profile, isLoggedIn: true })
      identityService.cacheProfile(profile)
      // Note: XMTP connection is handled by ConnectionProviderBridge
      // which shows RestoreOpportunity for new users
    } catch (error) {
      console.error('Login failed:', error)
      // User cancelled OAuth - silently reset to initial state
      const message = error instanceof Error ? error.message : 'Login failed'
      if (message.includes('cancelled') || message.includes('canceled')) {
        set({ error: null })
        return
      }
      set({ error: message })
      throw error
    } finally {
      set({ isLoading: false })
    }
  },

  loginWithPassword: async (identifier: string, password: string) => {
    set({ isLoading: true, error: null })

    try {
      if (!provider.loginWithPassword) {
        throw new Error('Password login not supported by this provider')
      }
      const { profile } = await provider.loginWithPassword(identifier, password)
      set({ profile: profile, isLoggedIn: true })
      identityService.cacheProfile(profile)
      // Note: XMTP connection is handled by ConnectionProviderBridge
      // which shows RestoreOpportunity for new users
    } catch (error) {
      console.error('Login failed:', error)
      set({ error: error instanceof Error ? error.message : 'Login failed' })
      throw error
    } finally {
      set({ isLoading: false })
    }
  },

  connectXMTP: async () => {
    // Guard: don't double-init (may be called early from onIdentityReady + later from ConnectionProviderBridge)
    if (get().isXMTPConnected) return
    if (connectXMTPInFlight) return connectXMTPInFlight

    const doConnect = async () => {
      // Log call with stack trace for debugging (dev/beta only)
      verboseGroup('📡 connectXMTP called')
      verboseLog('Timestamp:', new Date().toISOString())
      if (import.meta.env.DEV) console.trace('Call stack:')
      verboseGroupEnd()

      set({ isLoading: true, error: null })

      try {
        const { profile } = get()

        // Step 1: Initialize XMTP client FIRST (needed for verification)
        // Each identity gets its own XMTP installation key
        if (!profile) {
          throw new Error('Profile required for XMTP connection')
        }

        verboseLog('📡 connectXMTP: Getting or creating private key for DID:', profile.id)
        const privateKey = await getOrCreatePrivateKey(profile.id)
        const address = getAddressFromPrivateKey(privateKey)
        verboseLog('📡 connectXMTP: Got address:', address)

        verboseLog('📡 connectXMTP: Creating XMTP signer...')
        const signer = createXMTPSigner(privateKey)
        verboseLog('📡 connectXMTP: Signer created, initializing XMTP client...')
        const client = await xmtpService.init(signer)
        verboseLog('📡 connectXMTP: XMTP client initialized:', client.inboxId)

        const inboxId = client.inboxId

        // Step 2: Check for existing identity binding (now that XMTP is ready)
        // This is non-critical — if it times out (e.g. mobile signer went to background),
        // skip it and retry in the background. The binding will be published once the
        // signer becomes responsive again (e.g. user reopens Primal mobile).
        if (profile && inboxId) {
          const BINDING_TIMEOUT_MS = 10_000
          let bindingDone = false
          try {
            await Promise.race([
              checkAndPublishBinding(profile, inboxId, client, set),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Identity binding timed out')), BINDING_TIMEOUT_MS),
              ),
            ])
            bindingDone = true
          } catch (bindingError) {
            console.warn('[auth] Identity binding skipped:', bindingError instanceof Error ? bindingError.message : bindingError)
          }

          // If the initial attempt failed (likely signer went to background),
          // retry periodically until it succeeds or the user logs out.
          if (!bindingDone) {
            scheduleBindingRetry(profile, inboxId, client, set)
          }
        }

        set({
          isXMTPConnected: true,
          xmtpAddress: address,
          xmtpInboxId: client.inboxId
        })

        // Load following DIDs for primary/requests inbox filtering
        useProfileStore.getState().loadAllFollowingDids()
      } catch (error) {
        console.error('XMTP connection failed:', error)
        set({ error: error instanceof Error ? error.message : 'XMTP connection failed' })
        throw error
      } finally {
        set({ isLoading: false })
        connectXMTPInFlight = null
      }
    }

    connectXMTPInFlight = doConnect()
    return connectXMTPInFlight
  },

  updateUserProfile: async (updates: { displayName?: string; description?: string; avatar?: Blob }) => {
    set({ isLoading: true, error: null })

    try {
      if (!provider.updateProfile) {
        throw new Error('Profile updates not supported by this provider')
      }
      const updatedProfile = await provider.updateProfile(updates)
      set({ profile: updatedProfile })
      identityService.cacheProfile(updatedProfile)
    } catch (error) {
      console.error('Failed to update profile:', error)
      set({ error: error instanceof Error ? error.message : 'Failed to update profile' })
      throw error
    } finally {
      set({ isLoading: false })
    }
  },

  republishIdentity: async () => {
    const { profile, xmtpInboxId } = get()

    if (!profile || !xmtpInboxId) {
      throw new Error('Profile and XMTP connection required')
    }

    if (!(provider.canPublishIdentity?.() ?? false)) {
      throw new Error('Write access required to republish identity')
    }

    try {
      const client = xmtpService.getClient()

      if (!client) {
        throw new Error('XMTP client not available')
      }

      // Sign and publish with current installation
      const signature = await signDidWithInstallationKey(client, profile.id)
      await provider.publishInboxBinding(xmtpInboxId, signature)

      // Update local cache
      await identityService.linkIdentity(
        profile.id,
        profile.handle,
        xmtpInboxId,
        signature
      )

      // Register with backend service for faster lookups
      console.log('[auth] Registering mapping with backend for:', profile.id)
      mappingBackend.registerMapping({
        id: profile.id
      }).then((success) => {
        console.log('[auth] Backend registration result:', success ? 'success' : 'failed')
      }).catch((error) => {
        console.warn('[auth] Backend registration error (non-critical):', error)
      })

      // Clear mismatch/invalid state
      set({
        identityMismatch: false,
        signatureInvalid: false,
        publishedInboxId: xmtpInboxId,
        mismatchDismissed: false
      })

      console.log('Identity republished successfully')
    } catch (error) {
      console.error('Failed to republish identity:', error)
      throw error
    }
  },

  revokeOtherInstallations: async () => {
    const { profile, xmtpInboxId } = get()

    if (!profile || !xmtpInboxId) {
      throw new Error('Profile and XMTP connection required')
    }

    // Re-sign the identity binding with current installation BEFORE revoking others.
    // This ensures the signature remains valid after revocation.
    // Without this, if another installation signed the binding, revoking it would
    // orphan the signature and cause verification to fail.
    if (provider.canPublishIdentity?.() ?? false) {
      try {
        const client = xmtpService.getClient()

        if (client) {
          console.log('Re-signing identity record before revoking other installations...')
          const signature = await signDidWithInstallationKey(client, profile.id)
          await provider.publishInboxBinding(xmtpInboxId, signature)

          // Update local cache
          await identityService.linkIdentity(
            profile.id,
            profile.handle,
            xmtpInboxId,
            signature
          )

          // Register with backend service
          console.log('[auth] Registering mapping with backend for:', profile.id)
          mappingBackend.registerMapping({
            id: profile.id
          }).then((success) => {
            console.log('[auth] Backend registration result:', success ? 'success' : 'failed')
          }).catch((error) => {
            console.warn('[auth] Backend registration error (non-critical):', error)
          })

          // Clear any mismatch/invalid state
          set({
            identityMismatch: false,
            signatureInvalid: false,
            publishedInboxId: xmtpInboxId,
            mismatchDismissed: false
          })

          console.log('Identity binding re-signed with current installation')
        }
      } catch (error) {
        // Log but don't fail - user can fix signature later via banner
        console.warn('Could not re-sign identity binding:', error)
      }
    }

    // Now safe to revoke other installations
    await xmtpService.revokeAllOtherInstallations()
    console.log('Other installations revoked')
  },

  checkIdentityStatus: async () => {
    const { profile, xmtpInboxId } = get()

    if (!profile || !xmtpInboxId) {
      return
    }

    try {
      const result = await provider.lookupInboxForIdentity(profile.id)

      if (!result.found) {
        // No published record (or lookup failed)
        set({
          identityMismatch: false,
          signatureInvalid: false,
          publishedInboxId: null
        })
        return
      }

      if (result.inboxId !== xmtpInboxId) {
        // Different inbox published
        set({
          identityMismatch: true,
          signatureInvalid: false,
          publishedInboxId: result.inboxId,
          mismatchDismissed: false
        })
        return
      }

      // Same inbox - verify signature
      const verifyResult = await identityService.verifyIdentityBinding(
        result.inboxId,
        profile.id,
        result.verificationSignature
      )

      // Only mark as invalid on definitive verification failures, not network errors
      const signatureInvalid = !verifyResult.verified && verifyResult.definitive
      set({
        identityMismatch: false,
        signatureInvalid,
        publishedInboxId: result.inboxId,
        ...(signatureInvalid && { mismatchDismissed: false })
      })
    } catch (error) {
      console.error('Failed to check identity status:', error)
    }
  },

  dismissMismatch: () => {
    set({ mismatchDismissed: true })
  },

  logout: async () => {
    set({ isLoading: true })

    // Cancel any pending binding retry
    if (bindingRetryTimer) { clearTimeout(bindingRetryTimer); bindingRetryTimer = null }

    try {
      await provider.logout()
      await xmtpService.disconnect()
      identityService.clearStatusCache()

      // Reset all stores
      useUIStore.getState().reset()
      useChatStore.getState().reset()
      useProfileStore.getState().reset()

      // Clear identity service profile cache (mappings are universal, so keep those)
      identityService.clearProfileCache()

      set({
        profile: null,
        isLoggedIn: false,
        isXMTPConnected: false,
        xmtpAddress: null,
        xmtpInboxId: null,
        identityMismatch: false,
        signatureInvalid: false,
        publishedInboxId: null,
        mismatchDismissed: false,
        error: null
      })
    } catch (error) {
      console.error('Logout failed:', error)
    } finally {
      set({ isLoading: false })
    }
  },

  clearError: () => set({ error: null })
}))
