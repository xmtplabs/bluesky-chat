import type { IdentityProvider, ProviderConfig, UserProfile, Nip46Helpers } from '@bluesky-chat/provider-interface'
import { NostrService } from './nostr'
import { npubToHex } from './utils'

const service = new NostrService()

export const provider: IdentityProvider = {
  async login(identifier: string) {
    // NIP-46 flow is started via nip46.startConnect() from the LoginScreen.
    // This fallback handles the case where login('') is called directly.
    throw new Error('Use nip46.startConnect() or nip46.loginWithExtension() for Nostr login')
  },

  async loginWithPassword(identifier: string, nsecKey: string) {
    // "password" field is repurposed for nsec key input
    const profile = await service.loginWithNsec(nsecKey)
    return { profile, id: profile.id }
  },

  async logout() {
    await service.logout()
  },

  async restoreSession() {
    const profile = await service.restoreSession()
    if (!profile) return null
    return { profile, id: profile.id }
  },

  async publishInboxBinding(inboxId: string, signature: string) {
    await service.publishInboxBinding(inboxId, signature)
  },

  async lookupInboxForIdentity(id: string) {
    return service.lookupInboxBinding(id)
  },

  async deleteInboxBinding() {
    await service.deleteInboxBinding()
  },

  canPublishIdentity() {
    return service.isLoggedIn()
  },

  async getProfile(id: string) {
    return service.getProfile(id)
  },

  async getProfiles(ids: string[]) {
    return service.getProfiles(ids)
  },

  async searchUsers(query: string, limit = 10) {
    return service.searchUsers(query, limit)
  },

  async getFollowing(id: string, cursor?: string) {
    // Nostr kind 3 doesn't paginate — return all at once
    const npubs = await service.getFollowing(
      id.startsWith('npub1') ? npubToHex(id) : id
    )
    // Fetch profiles for the npubs
    const profiles: UserProfile[] = []
    // Batch fetch — limit to avoid hammering relays
    const batch = npubs.slice(0, 50)
    const profileMap = await service.getProfiles(batch)
    for (const npub of batch) {
      const p = profileMap.get(npub)
      if (p) profiles.push(p)
    }
    return { profiles, cursor: undefined }
  },

  async getAllFollowingIds(id: string) {
    const hex = id.startsWith('npub1') ? npubToHex(id) : id
    const npubs = await service.getFollowing(hex)
    return new Set(npubs)
  },
}

/**
 * Provider-specific NIP-46 helpers for the LoginScreen.
 * The shared IdentityProvider interface doesn't know about QR codes,
 * so the LoginScreen imports these directly.
 */
export const nip46: Nip46Helpers = {
  startConnect: (onQrDataUrl: (dataUrl: string) => void, onConnected?: () => void, onIdentityReady?: (identityId: string) => void) => service.loginViaNip46(onQrDataUrl, onConnected, onIdentityReady),
  cancelConnect: () => service.cancelNip46(),
  hasExtension: () => typeof window !== 'undefined' && !!window.nostr,
  loginWithExtension: () => service.loginWithExtension(),
}

export const config: ProviderConfig = {
  name: 'Nostr',
  loginPlaceholder: 'npub1…',
  loginSuffix: undefined,
  loginMethods: ['nip46-qr'],
  mappingServiceUrl: '',
  supportsFollowers: false,    // Requires relay indexing
  supportsFollowing: true,     // Kind 3 contacts list
  supportsProfileUpdate: false, // Could be added later
  supportsBlobUpload: false,   // No native blob storage
}
