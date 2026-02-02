import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { BlueskyProfile } from '../types'
import { blueskyService } from '../services/bluesky'
import { xmtpService } from '../services/xmtp'
import { identityService } from '../services/identity'
import { indexerService } from '../services/indexer'
import { getOrCreatePrivateKey, createXMTPSigner, getAddressFromPrivateKey, signDidWithInstallationKey, hasExistingKey } from '../services/signer'
import { useProfileStore } from './profileStore'
import { useChatStore } from './chatStore'
import { useUIStore } from './uiStore'
import { clearXmtpStatusCache } from '../components/chat/NewConversation'

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
  // Bluesky
  blueskyProfile: BlueskyProfile | null
  isBlueskyLoggedIn: boolean

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
  loginWithBluesky: (handle: string) => Promise<void>
  loginWithBlueskyPassword: (identifier: string, password: string) => Promise<void>
  connectXMTP: () => Promise<void>
  updateBlueskyProfile: (updates: { displayName?: string; description?: string; avatar?: Blob }) => Promise<void>
  republishIdentity: () => Promise<void>
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
  blueskyProfile: null,
  isBlueskyLoggedIn: false,
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
    set({ isLoading: true, error: null })

    try {
      // Initialize identity service
      await identityService.init()

      // Initialize Bluesky service
      await blueskyService.init()

      // Connect to Jetstream indexer for reverse lookups
      indexerService.connect()

      // Check if already logged in
      if (blueskyService.isLoggedIn()) {
        const profile = await blueskyService.getMyProfile()
        if (profile) {
          set({ blueskyProfile: profile, isBlueskyLoggedIn: true })
          identityService.cacheProfile(profile)
          // Note: XMTP connection is handled by ConnectionProviderBridge
          // which shows RestoreOpportunity for new users
        }
      }
    } catch (error) {
      console.error('Failed to initialize services:', error)
      set({ error: error instanceof Error ? error.message : 'Failed to initialize' })
    } finally {
      set({ isLoading: false })
    }
  },

  loginWithBluesky: async (handle: string) => {
    set({ isLoading: true, error: null })

    try {
      const profile = await blueskyService.login(handle)
      set({ blueskyProfile: profile, isBlueskyLoggedIn: true })
      identityService.cacheProfile(profile)
      // Note: XMTP connection is handled by ConnectionProviderBridge
      // which shows RestoreOpportunity for new users
    } catch (error) {
      console.error('Bluesky login failed:', error)
      set({ error: error instanceof Error ? error.message : 'Login failed' })
      throw error
    } finally {
      set({ isLoading: false })
    }
  },

  loginWithBlueskyPassword: async (identifier: string, password: string) => {
    set({ isLoading: true, error: null })

    try {
      const profile = await blueskyService.loginWithPassword(identifier, password)
      set({ blueskyProfile: profile, isBlueskyLoggedIn: true })
      identityService.cacheProfile(profile)
      // Note: XMTP connection is handled by ConnectionProviderBridge
      // which shows RestoreOpportunity for new users
    } catch (error) {
      console.error('Bluesky login failed:', error)
      set({ error: error instanceof Error ? error.message : 'Login failed' })
      throw error
    } finally {
      set({ isLoading: false })
    }
  },

  connectXMTP: async () => {
    set({ isLoading: true, error: null })

    try {
      const { blueskyProfile } = get()

      // Step 1: Initialize XMTP client FIRST (needed for verification)
      // Each Bluesky account gets its own XMTP identity
      if (!blueskyProfile) {
        throw new Error('Bluesky profile required for XMTP connection')
      }

      console.log('Getting or creating private key for DID:', blueskyProfile.did)
      const privateKey = await getOrCreatePrivateKey(blueskyProfile.did)
      const address = getAddressFromPrivateKey(privateKey)
      console.log('Got address:', address)

      console.log('Creating XMTP signer...')
      const signer = createXMTPSigner(privateKey)
      console.log('Signer created, initializing XMTP client...')
      const client = await xmtpService.init(signer)
      console.log('XMTP client initialized:', client.inboxId)

      const inboxId = client.inboxId

      // Step 2: Check for existing identity binding in ATProto (now that XMTP is ready)
      if (blueskyProfile && inboxId) {
        console.log('Checking for existing org.xmtp.inbox record...')
        const existingBinding = await identityService.lookupInboxForDid(blueskyProfile.did)

        if (existingBinding) {
          console.log('Found existing record with inboxId:', existingBinding.inboxId)

          // Check if the existing record matches our current inbox
          if (existingBinding.inboxId === inboxId) {
            // Inbox ID matches - verify the signature is valid
            console.log('Existing record matches our inbox ID - verifying signature...')
            const isSignatureValid = await identityService.verifyIdentityBinding(
              existingBinding.inboxId,
              blueskyProfile.did,
              existingBinding.verificationSignature
            )

            if (isSignatureValid) {
              console.log('Signature is valid')
              set({
                identityMismatch: false,
                signatureInvalid: false,
                publishedInboxId: inboxId
              })
            } else {
              // Signature is invalid - track this for UI
              console.warn('Published signature is invalid!')
              set({
                identityMismatch: false,
                signatureInvalid: true,
                publishedInboxId: inboxId,
                mismatchDismissed: false
              })
            }

            // Cache locally with a fresh signature for sending
            const signature = await signDidWithInstallationKey(client, blueskyProfile.did)
            await identityService.linkIdentity(
              blueskyProfile.did,
              blueskyProfile.handle,
              inboxId,
              signature
            )
          } else {
            // Different inbox ID - this is a conflict
            console.warn(
              `Identity mismatch! ATProto has inbox ${existingBinding.inboxId} but local client has ${inboxId}`
            )
            console.warn(
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
            const signature = await signDidWithInstallationKey(client, blueskyProfile.did)
            await identityService.linkIdentity(
              blueskyProfile.did,
              blueskyProfile.handle,
              inboxId,
              signature
            )
          }
        } else {
          // No existing record - create new binding
          console.log('No existing org.xmtp.inbox record found, creating new binding...')
          const signature = await signDidWithInstallationKey(client, blueskyProfile.did)

          if (blueskyService.hasRepoWriteAccess()) {
            console.log('Publishing new identity binding to ATProto PDS...')
            try {
              const agent = blueskyService.getAgent()
              await identityService.publishIdentityToATProto(agent, inboxId, signature)
              console.log('Identity published to ATProto PDS')
            } catch (publishError) {
              console.warn('Failed to publish identity to ATProto:', publishError)
            }
          } else {
            console.log(
              'Skipping ATProto publish (no write access). Use App Password for full identity linking.'
            )
          }

          await identityService.linkIdentity(
            blueskyProfile.did,
            blueskyProfile.handle,
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

  updateBlueskyProfile: async (updates: { displayName?: string; description?: string; avatar?: Blob }) => {
    set({ isLoading: true, error: null })

    try {
      const updatedProfile = await blueskyService.updateProfile(updates)
      set({ blueskyProfile: updatedProfile })
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
    const { blueskyProfile, xmtpInboxId } = get()

    if (!blueskyProfile || !xmtpInboxId) {
      throw new Error('Profile and XMTP connection required')
    }

    if (!blueskyService.hasRepoWriteAccess()) {
      throw new Error('App Password required to republish identity')
    }

    try {
      const agent = blueskyService.getAgent()
      const client = xmtpService.getClient()

      if (!client) {
        throw new Error('XMTP client not available')
      }

      // Sign and publish with current installation
      const signature = await signDidWithInstallationKey(client, blueskyProfile.did)
      await identityService.publishIdentityToATProto(agent, xmtpInboxId, signature)

      // Update local cache
      await identityService.linkIdentity(
        blueskyProfile.did,
        blueskyProfile.handle,
        xmtpInboxId,
        signature
      )

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

  checkIdentityStatus: async () => {
    const { blueskyProfile, xmtpInboxId } = get()

    if (!blueskyProfile || !xmtpInboxId) {
      return
    }

    try {
      const record = await identityService.lookupInboxForDid(blueskyProfile.did)

      if (!record) {
        // No published record
        set({
          identityMismatch: false,
          signatureInvalid: false,
          publishedInboxId: null
        })
        return
      }

      if (record.inboxId !== xmtpInboxId) {
        // Different inbox published
        set({
          identityMismatch: true,
          signatureInvalid: false,
          publishedInboxId: record.inboxId,
          mismatchDismissed: false
        })
        return
      }

      // Same inbox - verify signature
      const isValid = await identityService.verifyIdentityBinding(
        record.inboxId,
        blueskyProfile.did,
        record.verificationSignature
      )

      set({
        identityMismatch: false,
        signatureInvalid: !isValid,
        publishedInboxId: record.inboxId,
        ...(!isValid && { mismatchDismissed: false })
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
      await blueskyService.logout()
      await xmtpService.disconnect()
      indexerService.disconnect()
      clearXmtpStatusCache()

      // Reset all stores
      useUIStore.getState().reset()
      useChatStore.getState().reset()
      useProfileStore.getState().reset()

      // Clear identity service profile cache (mappings are universal, so keep those)
      identityService.clearProfileCache()

      set({
        blueskyProfile: null,
        isBlueskyLoggedIn: false,
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
