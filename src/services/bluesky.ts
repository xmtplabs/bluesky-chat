import { Agent, AtpAgent, type AppBskyActorDefs } from '@atproto/api'
import { BrowserOAuthClient, type OAuthSession } from '@atproto/oauth-client-browser'
import { buildAtprotoLoopbackClientId } from '@atproto/oauth-types'
import type { BlueskyProfile } from '../types'

class BlueskyService {
  private oauthClient: BrowserOAuthClient | null = null
  // Use Agent for OAuth, AtpAgent for password auth
  private agent: Agent | AtpAgent | null = null
  private session: OAuthSession | null = null

  async init(): Promise<void> {
    // Initialize OAuth client with our app's metadata
    // This is optional - password login works without it
    try {
      // For loopback (localhost) clients, use buildAtprotoLoopbackClientId
      // which supports configuring scope in the client ID.
      // We request 'transition:generic' to enable writing custom collections
      // like org.xmtp.inbox to the user's PDS.
      const loc = window.location

      // In packaged Electron apps, window.location is file:// which isn't valid for OAuth.
      // Use a fixed loopback URI instead - Electron intercepts the redirect before
      // the browser actually navigates there, so no server needs to be listening.
      let redirectUri: string
      if (loc.protocol === 'http:' || loc.protocol === 'https:') {
        // Dev mode - use actual location
        const hostname = loc.hostname === 'localhost' ? '127.0.0.1' : loc.hostname
        redirectUri = `http://${hostname}:${loc.port}${loc.pathname}`
      } else {
        // Packaged app - use fixed loopback URI
        redirectUri = 'http://127.0.0.1/oauth/callback'
      }

      const clientId = buildAtprotoLoopbackClientId({
        scope: 'atproto transition:generic',
        redirect_uris: [redirectUri]
      })

      this.oauthClient = await BrowserOAuthClient.load({
        clientId,
        handleResolver: 'https://bsky.social'
      })

      // Try to restore existing session
      await this.tryRestoreSession()
    } catch (error) {
      console.warn('OAuth client initialization failed:', error)
      console.warn('Error details:', error instanceof Error ? error.stack : error)
      // OAuth is optional, password login will still work
      this.oauthClient = null
    }
  }

  private async tryRestoreSession(): Promise<boolean> {
    if (!this.oauthClient) return false

    try {
      const result = await this.oauthClient.init()
      if (result?.session) {
        this.session = result.session
        // Create Agent directly from OAuth session
        this.agent = new Agent(result.session)
        return true
      }
    } catch (error) {
      console.error('Failed to restore Bluesky session:', error)
    }

    return false
  }

  async login(handle: string): Promise<BlueskyProfile> {
    if (!this.oauthClient) {
      throw new Error('OAuth not available. Please use App Password login instead.')
    }

    // Normalize handle - add .bsky.social if no domain specified
    const normalizedHandle = handle.includes('.') ? handle : `${handle}.bsky.social`

    // Get authorization URL
    // Don't pass scope here - use the scope declared in the client ID metadata
    let authUrl: URL
    try {
      authUrl = await this.oauthClient.authorize(normalizedHandle)
    } catch (error) {
      console.error('OAuth authorize failed:', error)
      throw new Error(
        `Failed to start OAuth: ${error instanceof Error ? error.message : 'Unknown error'}. Try App Password login instead.`
      )
    }

    // Open OAuth window in Electron
    if (!window.electronAPI?.openOAuthWindow) {
      throw new Error('OAuth requires Electron. Please run the app with "npm run dev".')
    }
    const result = await window.electronAPI.openOAuthWindow(authUrl.toString())

    if (!result) {
      throw new Error('OAuth authorization cancelled')
    }

    // Complete OAuth flow with callback
    // The callback method just needs the search params with code and state
    // The library validates these against the stored PKCE state
    const callbackParams = new URLSearchParams()
    callbackParams.set('code', result.code)
    callbackParams.set('state', result.state)
    // Add iss parameter for issuer validation per OAuth spec
    if (result.iss) {
      callbackParams.set('iss', result.iss)
    }

    const { session } = await this.oauthClient.callback(callbackParams)
    this.session = session

    // Create Agent directly from OAuth session - this is the key fix!
    // The Agent class accepts an OAuthSession and uses it for authenticated requests
    this.agent = new Agent(session)

    // Fetch and return profile
    const profile = await this.getMyProfile()
    if (!profile) {
      throw new Error('Failed to fetch profile after login')
    }

    return profile
  }

  async loginWithPassword(identifier: string, password: string): Promise<BlueskyProfile> {
    // Direct password login (simpler for development)
    const atpAgent = new AtpAgent({ service: 'https://bsky.social' })

    // Normalize identifier - add .bsky.social if it looks like a handle without domain
    // (but don't modify email addresses)
    const normalizedIdentifier = identifier.includes('@') || identifier.includes('.')
      ? identifier
      : `${identifier}.bsky.social`

    await atpAgent.login({
      identifier: normalizedIdentifier,
      password
    })

    this.agent = atpAgent

    const profile = await this.getMyProfile()
    if (!profile) {
      throw new Error('Failed to fetch profile after login')
    }

    return profile
  }

  async getMyProfile(): Promise<BlueskyProfile | null> {
    if (!this.agent) return null

    try {
      // Get DID - works for both Agent (OAuth) and AtpAgent (password)
      const did = this.getDid()
      if (!did) {
        console.error('No DID available from agent')
        return null
      }

      try {
        // Try authenticated request first
        const { data } = await this.agent.getProfile({
          actor: did
        })
        return this.mapProfile(data)
      } catch (authError) {
        // If scope error with OAuth, fall back to public API
        console.warn('Authenticated profile fetch failed, trying public API:', authError)
        return this.getProfileFromPublicApi(did)
      }
    } catch (error) {
      console.error('Failed to fetch profile:', error)
      return null
    }
  }

  // Fetch profile from public API (doesn't require auth)
  private async getProfileFromPublicApi(handleOrDid: string): Promise<BlueskyProfile | null> {
    try {
      const response = await fetch(
        `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(handleOrDid)}`
      )

      if (!response.ok) {
        throw new Error(`Public API returned ${response.status}`)
      }

      const data = await response.json()
      return this.mapProfile(data)
    } catch (error) {
      console.error('Failed to fetch profile from public API:', error)
      return null
    }
  }

  async getProfile(handleOrDid: string): Promise<BlueskyProfile | null> {
    // Try authenticated request first, fall back to public API
    if (this.agent) {
      try {
        const { data } = await this.agent.getProfile({
          actor: handleOrDid
        })
        return this.mapProfile(data)
      } catch (error) {
        console.warn('Authenticated profile fetch failed, trying public API:', error)
      }
    }

    // Fall back to public API
    return this.getProfileFromPublicApi(handleOrDid)
  }

  async searchUsers(query: string, limit = 10): Promise<BlueskyProfile[]> {
    // Try authenticated request first
    if (this.agent) {
      try {
        const { data } = await this.agent.searchActors({
          q: query,
          limit
        })
        return data.actors.map((actor) => this.mapProfile(actor))
      } catch (error) {
        console.warn('Authenticated search failed, trying public API:', error)
      }
    }

    // Fall back to public API
    return this.searchUsersFromPublicApi(query, limit)
  }

  private async searchUsersFromPublicApi(query: string, limit: number): Promise<BlueskyProfile[]> {
    try {
      const response = await fetch(
        `https://public.api.bsky.app/xrpc/app.bsky.actor.searchActors?q=${encodeURIComponent(query)}&limit=${limit}`
      )

      if (!response.ok) {
        throw new Error(`Public API returned ${response.status}`)
      }

      const data = await response.json()
      return data.actors.map((actor: AppBskyActorDefs.ProfileViewBasic) => this.mapProfile(actor))
    } catch (error) {
      console.error('Failed to search users from public API:', error)
      return []
    }
  }

  async getFollowers(
    handleOrDid?: string,
    cursor?: string
  ): Promise<{ followers: BlueskyProfile[]; cursor?: string }> {
    const actor = handleOrDid || this.getDid() || ''
    if (!actor) return { followers: [] }

    // Try authenticated request first
    if (this.agent) {
      try {
        const { data } = await this.agent.getFollowers({
          actor,
          limit: 50,
          cursor
        })

        return {
          followers: data.followers.map((f) => this.mapProfile(f)),
          cursor: data.cursor
        }
      } catch (error) {
        console.warn('Authenticated followers fetch failed, trying public API:', error)
      }
    }

    // Fall back to public API
    return this.getFollowersFromPublicApi(actor, cursor)
  }

  private async getFollowersFromPublicApi(
    actor: string,
    cursor?: string
  ): Promise<{ followers: BlueskyProfile[]; cursor?: string }> {
    try {
      let url = `https://public.api.bsky.app/xrpc/app.bsky.graph.getFollowers?actor=${encodeURIComponent(actor)}&limit=50`
      if (cursor) {
        url += `&cursor=${encodeURIComponent(cursor)}`
      }

      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`Public API returned ${response.status}`)
      }

      const data = await response.json()
      return {
        followers: data.followers.map((f: AppBskyActorDefs.ProfileView) => this.mapProfile(f)),
        cursor: data.cursor
      }
    } catch (error) {
      console.error('Failed to fetch followers from public API:', error)
      return { followers: [] }
    }
  }

  async getFollowing(
    handleOrDid?: string,
    cursor?: string
  ): Promise<{ following: BlueskyProfile[]; cursor?: string }> {
    const actor = handleOrDid || this.getDid() || ''
    if (!actor) return { following: [] }

    // Try authenticated request first
    if (this.agent) {
      try {
        const { data } = await this.agent.getFollows({
          actor,
          limit: 50,
          cursor
        })

        return {
          following: data.follows.map((f) => this.mapProfile(f)),
          cursor: data.cursor
        }
      } catch (error) {
        console.warn('Authenticated following fetch failed, trying public API:', error)
      }
    }

    // Fall back to public API
    return this.getFollowingFromPublicApi(actor, cursor)
  }

  private async getFollowingFromPublicApi(
    actor: string,
    cursor?: string
  ): Promise<{ following: BlueskyProfile[]; cursor?: string }> {
    try {
      let url = `https://public.api.bsky.app/xrpc/app.bsky.graph.getFollows?actor=${encodeURIComponent(actor)}&limit=50`
      if (cursor) {
        url += `&cursor=${encodeURIComponent(cursor)}`
      }

      const response = await fetch(url)

      if (!response.ok) {
        throw new Error(`Public API returned ${response.status}`)
      }

      const data = await response.json()
      return {
        following: data.follows.map((f: AppBskyActorDefs.ProfileView) => this.mapProfile(f)),
        cursor: data.cursor
      }
    } catch (error) {
      console.error('Failed to fetch following from public API:', error)
      return { following: [] }
    }
  }

  getDid(): string | undefined {
    if (!this.agent) return undefined

    // Agent (OAuth) has .did property directly
    if ('did' in this.agent && this.agent.did) {
      return this.agent.did
    }

    // AtpAgent (password) has session.did
    if ('session' in this.agent && this.agent.session?.did) {
      return this.agent.session.did
    }

    return undefined
  }

  getHandle(): string | undefined {
    if (!this.agent) return undefined

    // AtpAgent (password) has session.handle
    if ('session' in this.agent && this.agent.session?.handle) {
      return this.agent.session.handle
    }

    // For OAuth, we don't have direct access to handle
    // It would need to be fetched from the profile
    return undefined
  }

  isLoggedIn(): boolean {
    return !!this.getDid()
  }

  /**
   * Check if we have repo write access for custom collections.
   * Both App Password login and OAuth with transition:generic scope have write access.
   * The scope is now declared in our loopback client ID.
   */
  hasRepoWriteAccess(): boolean {
    // Both password login (AtpAgent) and OAuth (Agent with transition:generic scope) have access
    return !!this.agent
  }

  /**
   * Get the ATProto agent for record operations.
   * Used to publish org.xmtp.inbox records to the user's PDS.
   */
  getAgent(): Agent | AtpAgent | null {
    return this.agent
  }

  async logout(): Promise<void> {
    if (this.session) {
      try {
        await this.session.signOut()
      } catch (error) {
        console.error('Error signing out:', error)
      }
    }

    // AtpAgent has logout method
    if (this.agent && 'logout' in this.agent) {
      try {
        await (this.agent as AtpAgent).logout()
      } catch (error) {
        console.error('Error logging out agent:', error)
      }
    }

    this.agent = null
    this.session = null
  }

  // Cache for all following DIDs
  private followingDidsCache: Set<string> | null = null
  private followingDidsCacheTime: number = 0
  private static FOLLOWING_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

  /**
   * Get all DIDs of accounts the user follows.
   * Paginates through the entire following list and caches the result.
   */
  async getAllFollowingDids(): Promise<Set<string>> {
    // Return cached result if still valid
    if (
      this.followingDidsCache &&
      Date.now() - this.followingDidsCacheTime < BlueskyService.FOLLOWING_CACHE_TTL
    ) {
      return this.followingDidsCache
    }

    const allDids = new Set<string>()
    let cursor: string | undefined

    try {
      do {
        const { following, cursor: nextCursor } = await this.getFollowing(undefined, cursor)
        following.forEach((f) => allDids.add(f.did))
        cursor = nextCursor
      } while (cursor)

      // Cache the result
      this.followingDidsCache = allDids
      this.followingDidsCacheTime = Date.now()

      return allDids
    } catch (error) {
      console.error('Failed to load all following DIDs:', error)
      // Return empty set on error, don't use stale cache
      return new Set()
    }
  }

  /**
   * Update the current user's profile.
   * Uses upsertProfile to merge changes with existing profile data.
   */
  async updateProfile(updates: {
    displayName?: string
    description?: string
    avatar?: Blob
  }): Promise<BlueskyProfile> {
    if (!this.agent) {
      throw new Error('Not logged in')
    }

    const did = this.getDid()
    if (!did) {
      throw new Error('Could not determine DID')
    }

    // Upload avatar if provided
    let avatarRef: { $type: string; ref: unknown; mimeType: string; size: number } | undefined
    if (updates.avatar) {
      const response = await this.agent.uploadBlob(updates.avatar, {
        encoding: updates.avatar.type
      })
      avatarRef = {
        $type: 'blob',
        ref: response.data.blob.ref,
        mimeType: updates.avatar.type,
        size: updates.avatar.size
      }
    }

    // Get current profile to preserve fields we're not updating
    const currentProfile = await this.getMyProfile()

    // Build the profile record
    const profileRecord: Record<string, unknown> = {
      $type: 'app.bsky.actor.profile',
      displayName: updates.displayName !== undefined ? updates.displayName : currentProfile?.displayName || '',
      description: updates.description !== undefined ? updates.description : currentProfile?.description || ''
    }

    // Handle avatar - preserve existing if not updating
    if (avatarRef) {
      profileRecord.avatar = avatarRef
    }

    // Update the profile using putRecord
    await this.agent.com.atproto.repo.putRecord({
      repo: did,
      collection: 'app.bsky.actor.profile',
      rkey: 'self',
      record: profileRecord
    })

    // Fetch and return updated profile
    const updatedProfile = await this.getMyProfile()
    if (!updatedProfile) {
      throw new Error('Failed to fetch updated profile')
    }

    return updatedProfile
  }

  /**
   * Upload a blob to the user's PDS and return the CDN URL.
   * Used for group images and other media uploads.
   */
  async uploadBlob(blob: Blob): Promise<string> {
    if (!this.agent) {
      throw new Error('Not logged in')
    }

    const response = await this.agent.uploadBlob(blob, {
      encoding: blob.type
    })

    // The blob ref contains the CID which we can use to construct the CDN URL
    // Bluesky CDN URLs are: https://cdn.bsky.app/img/feed_fullsize/plain/{did}/{cid}@{ext}
    const did = this.getDid()
    if (!did) {
      throw new Error('Could not determine DID')
    }

    // Extract the CID from the blob ref
    // The ref can be either a CID object with toString() or a {$link: string} object
    const blobRef = response.data.blob
    const ref = blobRef.ref
    const cid = typeof ref === 'object' && ref !== null
      ? ('$link' in ref ? ref.$link : ref.toString())
      : String(ref)

    if (!cid) {
      throw new Error('Failed to extract CID from blob upload response')
    }

    // Determine extension from mime type
    const extMap: Record<string, string> = {
      'image/jpeg': 'jpeg',
      'image/jpg': 'jpeg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp'
    }
    const ext = extMap[blob.type] || 'jpeg'

    // Construct the CDN URL
    return `https://cdn.bsky.app/img/feed_fullsize/plain/${did}/${cid}@${ext}`
  }

  private mapProfile(
    data:
      | AppBskyActorDefs.ProfileViewBasic
      | AppBskyActorDefs.ProfileView
      | AppBskyActorDefs.ProfileViewDetailed
  ): BlueskyProfile {
    return {
      did: data.did,
      handle: data.handle,
      displayName: data.displayName,
      avatar: data.avatar,
      description: 'description' in data ? data.description : undefined,
      followersCount: 'followersCount' in data ? data.followersCount : undefined,
      followsCount: 'followsCount' in data ? data.followsCount : undefined
    }
  }
}

export const blueskyService = new BlueskyService()
