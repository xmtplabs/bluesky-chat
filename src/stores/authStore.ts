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

      // Step 2: Check for existing identity binding in ATProto (now that XMTP is ready)
      if (profile && inboxId) {
        verboseLog('Checking for existing org.xmtp.inbox record...')
        const existingBinding = await provider.lookupInboxForIdentity(profile.id)

        if (existingBinding.found) {
          verboseLog('Found existing record with inboxId:', existingBinding.inboxId)

          // Check if the existing record matches our current inbox
          if (existingBinding.inboxId === inboxId) {
            // Inbox ID matches - verify the signature is valid
            verboseLog('Existing record matches our inbox ID - verifying signature...')
            const verifyResult = await identityService.verifyIdentityBinding(
              existingBinding.inboxId,
              profile.id,
              existingBinding.verificationSignature
            )

            if (verifyResult.verified) {
              verboseLog('Signature is valid')
              set({
                identityMismatch: false,
                signatureInvalid: false,
                publishedInboxId: inboxId
              })
            } else if (verifyResult.definitive) {
              // Signature is definitively invalid - track this for UI
              verboseWarn('Published signature is invalid!')
              set({
                identityMismatch: false,
                signatureInvalid: true,
                publishedInboxId: inboxId,
                mismatchDismissed: false
              })
            } else {
              // Network error - can't verify, assume valid for now
              verboseWarn('Could not verify signature (network error)')
              set({
                identityMismatch: false,
                signatureInvalid: false,
                publishedInboxId: inboxId
              })
            }

            // Cache locally with a fresh signature for sending
            const signature = await signDidWithInstallationKey(client, profile.id)
            await identityService.linkIdentity(
              profile.id,
              profile.handle,
              inboxId,
              signature
            )

            // Register with backend to ensure it has this mapping
            console.log('[auth] Registering existing mapping with backend for:', profile.id)
            mappingBackend.registerMapping({
              id: profile.id
            }).then((success) => {
              console.log('[auth] Backend registration result:', success ? 'success' : 'failed')
            }).catch((error) => {
              console.warn('[auth] Backend registration error (non-critical):', error)
            })
          } else {
            // Different inbox ID - this is a conflict
            verboseWarn(
              `Identity mismatch! ATProto has inbox ${existingBinding.inboxId} but local client has ${inboxId}`
            )
            verboseWarn(
              'This may happen if you logged in on a different device first. ' +
                'Messages sent to you will go to the ATProto-linked inbox.'
            )
            // Track the mismatch for UI display
            set({
              identityMismatch: true,
              signatureInvalid: false,
              publishedInboxId: existingBinding.inboxId,
              mismatchDismissed: false
            })
            // Don't overwrite - the existing record might be intentional
            // Just cache our local inbox without publishing
            const signature = await signDidWithInstallationKey(client, profile.id)
            await identityService.linkIdentity(
              profile.id,
              profile.handle,
              inboxId,
              signature
            )
          }
        } else {
          // No existing record - create new binding
          verboseLog('No existing org.xmtp.inbox record found, creating new binding...')
          const signature = await signDidWithInstallationKey(client, profile.id)

          if (provider.hasRepoWriteAccess?.() ?? false) {
            verboseLog('Publishing new identity binding via provider...')
            try {
              await provider.publishInboxBinding(inboxId, signature)
              verboseLog('Identity published via provider')

              // Register with backend service for faster lookups
              console.log('[auth] Registering mapping with backend for:', profile.id)
              mappingBackend.registerMapping({
                id: profile.id
              }).then((success) => {
                console.log('[auth] Backend registration result:', success ? 'success' : 'failed')
              }).catch((error) => {
                console.warn('[auth] Backend registration error (non-critical):', error)
              })
            } catch (publishError) {
              verboseWarn('Failed to publish identity via provider:', publishError)
            }
          } else {
            verboseLog(
              'Skipping identity publish (no write access). Use App Password for full identity linking.'
            )
          }

          await identityService.linkIdentity(
            profile.id,
            profile.handle,
            inboxId,
            signature
          )
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
    }
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

    if (!(provider.hasRepoWriteAccess?.() ?? false)) {
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

    // Re-sign the ATProto record with current installation BEFORE revoking others.
    // This ensures the signature remains valid after revocation.
    // Without this, if another installation signed the record, revoking it would
    // orphan the signature and cause verification to fail.
    if (provider.hasRepoWriteAccess?.() ?? false) {
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

          console.log('ATProto record re-signed with current installation')
        }
      } catch (error) {
        // Log but don't fail - user can fix signature later via banner
        console.warn('Could not re-sign ATProto record:', error)
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
