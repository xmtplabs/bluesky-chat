import type { IdentityProvider, ProviderConfig, UserProfile } from '@bluesky-chat/provider-interface'
import { BlueskyService } from './bluesky'

const service = new BlueskyService()

export const provider: IdentityProvider = {
  async login(identifier: string) {
    await service.init()
    const profile = await service.login(identifier)
    return { profile, id: profile.id }
  },

  async loginWithPassword(identifier: string, password: string) {
    const profile = await service.loginWithPassword(identifier, password)
    return { profile, id: profile.id }
  },

  async logout() {
    await service.logout()
  },

  async restoreSession() {
    await service.init()
    if (!service.isLoggedIn()) return null
    const profile = await service.getMyProfile()
    if (!profile) return null
    return { profile, id: profile.id }
  },

  async publishInboxBinding(inboxId: string, signature: string) {
    const agent = service.getAgent()
    if (!agent) throw new Error('Not logged in')

    const did = service.getDid()
    if (!did) throw new Error('Could not determine DID')

    await agent.com.atproto.repo.putRecord({
      repo: did,
      collection: 'org.xmtp.inbox',
      rkey: 'self',
      record: {
        $type: 'org.xmtp.inbox',
        id: inboxId,
        verificationSignature: signature,
        createdAt: new Date().toISOString(),
      },
    })
  },

  async lookupInboxForIdentity(id: string) {
    try {
      const response = await fetch(
        `https://bsky.social/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(id)}&collection=org.xmtp.inbox&rkey=self`
      )
      if (!response.ok) {
        if (response.status === 400 || response.status === 404) {
          return { found: false as const, notFound: true }
        }
        return { found: false as const, notFound: false }
      }
      const data = await response.json()
      const record = data.value
      if (!record.id || !record.verificationSignature) {
        return { found: false as const, notFound: true }
      }
      return {
        found: true as const,
        inboxId: record.id,
        verificationSignature: record.verificationSignature,
      }
    } catch {
      return { found: false as const, notFound: false }
    }
  },

  async deleteInboxBinding() {
    const agent = service.getAgent()
    if (!agent) throw new Error('Not logged in')
    const did = service.getDid()
    if (!did) throw new Error('Could not determine DID')

    await agent.com.atproto.repo.deleteRecord({
      repo: did,
      collection: 'org.xmtp.inbox',
      rkey: 'self',
    })
  },

  async getProfile(id: string) {
    return service.getProfile(id)
  },

  async getProfiles(ids: string[]) {
    const results = new Map<string, UserProfile>()
    // Bluesky doesn't have a bulk profile API, fetch in parallel
    const profiles = await Promise.all(ids.map((id) => service.getProfile(id)))
    ids.forEach((id, i) => {
      if (profiles[i]) results.set(id, profiles[i]!)
    })
    return results
  },

  async searchUsers(query: string, limit = 10) {
    return service.searchUsers(query, limit)
  },

  async getFollowers(id: string, cursor?: string) {
    const result = await service.getFollowers(id, cursor)
    return { profiles: result.followers, cursor: result.cursor }
  },

  async getFollowing(id: string, cursor?: string) {
    const result = await service.getFollowing(id, cursor)
    return { profiles: result.following, cursor: result.cursor }
  },

  async getAllFollowingIds() {
    const dids = await service.getAllFollowingDids()
    return dids
  },

  canPublishIdentity() {
    return service.hasRepoWriteAccess()
  },

  async uploadBlob(blob: Blob) {
    return service.uploadBlob(blob)
  },

  async updateProfile(updates) {
    return service.updateProfile(updates)
  },
}

export const config: ProviderConfig = {
  name: 'Bluesky',
  loginPlaceholder: 'username',
  loginSuffix: '.bsky.social',
  loginMethods: ['oauth', 'password'],
  mappingServiceUrl: 'https://bluesky-chat-mapping-service.xmtp.workers.dev',
  supportsFollowers: true,
  supportsFollowing: true,
  supportsProfileUpdate: true,
  supportsBlobUpload: true,
  formatHandle: (handle) => `@${handle}`,
  profileUrl: (handle) => `https://bsky.app/profile/${handle}`,
  passwordHelp: {
    placeholder: 'xxxx-xxxx-xxxx-xxxx',
    url: 'https://bsky.app/settings/app-passwords',
    label: 'Create an app password at',
    linkText: 'bsky.app/settings/app-passwords',
  },
}
