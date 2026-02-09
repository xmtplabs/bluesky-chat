/**
 * Provider-agnostic user profile.
 */
export interface UserProfile {
  id: string              // Provider identity ID: DID for Bluesky, npub for Nostr
  handle: string          // @alice.bsky.social, npub1abc...
  displayName?: string
  avatar?: string
  description?: string
  followersCount?: number
  followsCount?: number
}

/**
 * Identity mapping between provider identity and XMTP inbox.
 * Replaces the Bluesky-specific IdentityMapping.
 */
export interface IdentityMapping {
  identityId: string      // Provider-specific ID (DID, npub, etc.)
  identityHandle: string  // Human-readable handle
  xmtpInboxId: string
  verificationSignature: string
  createdAt: number
}

/**
 * The contract every identity provider must implement.
 * The chassis calls these methods — never provider internals directly.
 */
export interface IdentityProvider {
  // Auth
  login(identifier: string): Promise<{ profile: UserProfile; id: string }>
  loginWithPassword?(identifier: string, password: string): Promise<{ profile: UserProfile; id: string }>
  logout(): Promise<void>
  restoreSession(): Promise<{ profile: UserProfile; id: string } | null>

  // Identity <> XMTP inbox binding
  publishInboxBinding(inboxId: string, signature: string): Promise<void>
  lookupInboxForIdentity(id: string): Promise<{ found: true; inboxId: string; verificationSignature: string } | { found: false; notFound: boolean }>
  deleteInboxBinding(): Promise<void>

  // Profiles
  getProfile(id: string): Promise<UserProfile | null>
  getProfiles(ids: string[]): Promise<Map<string, UserProfile>>
  searchUsers(query: string, limit?: number): Promise<UserProfile[]>

  // Social graph (optional — chassis hides UI if not implemented)
  getFollowers?(id: string, cursor?: string): Promise<{ profiles: UserProfile[]; cursor?: string }>
  getFollowing?(id: string, cursor?: string): Promise<{ profiles: UserProfile[]; cursor?: string }>
  getAllFollowingIds?(id: string): Promise<Set<string>>

  // Provider-specific capabilities
  canPublishIdentity?(): boolean
  uploadBlob?(blob: Blob): Promise<string>
  updateProfile?(updates: { displayName?: string; description?: string; avatar?: Blob }): Promise<UserProfile>
}

/**
 * Static config for the identity provider.
 * Drives the login UI and build-time behavior.
 */
export interface ProviderConfig {
  name: string                     // "Bluesky", "Nostr"
  loginPlaceholder: string         // "username" or "npub1..."
  loginSuffix?: string             // ".bsky.social" (shown as suffix in input)
  loginMethods: Array<'oauth' | 'password' | 'extension' | 'nsec' | 'nip46-qr'>
  mappingServiceUrl: string
  supportsFollowers: boolean
  supportsFollowing: boolean
  supportsProfileUpdate: boolean
  supportsBlobUpload: boolean
  formatHandle: (handle: string) => string    // Display-formatted handle (e.g. "@alice" for Bluesky, "alice@relay.com" as-is for Nostr)
  profileUrl?: (handle: string) => string     // External profile link (optional — omit if no canonical web profile)
  passwordHelp?: {
    placeholder: string    // "xxxx-xxxx-xxxx-xxxx"
    url: string            // "https://bsky.app/settings/app-passwords"
    label: string          // "Create an app password at"
    linkText: string       // "bsky.app/settings/app-passwords"
  }
}

/**
 * Provider-specific NIP-46 helpers (Nostr only).
 * Null for non-Nostr providers.
 */
export interface Nip46Helpers {
  startConnect: (onQrDataUrl: (dataUrl: string) => void, onConnected?: () => void, onIdentityReady?: (identityId: string) => void) => Promise<UserProfile>
  cancelConnect: () => void
  hasExtension: () => boolean
  loginWithExtension: () => Promise<UserProfile>
}
