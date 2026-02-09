/**
 * Identity provider abstraction for multi-network support.
 *
 * Each provider validates identities and fetches XMTP inbox bindings
 * from its respective source of truth (ATProto, Nostr relays, etc.).
 */

export interface IdentityProviderService {
  /** Validate that an identity string is well-formed for this provider. */
  isValidIdentity(id: string): boolean

  /** Validate inbox ID format (hex string). */
  isValidInboxId(inboxId: string): boolean

  /**
   * Fetch the XMTP inbox binding from the provider's source of truth.
   * Returns null if no binding is found.
   */
  verifyFromSource(id: string): Promise<{ inboxId: string; signature: string } | null>
}

let cachedProvider: IdentityProviderService | null = null
let cachedProviderName: string | null = null

/**
 * Get the identity provider for the current environment.
 * Reads IDENTITY_PROVIDER env var, defaults to 'bluesky'.
 */
export function getIdentityProvider(env: { IDENTITY_PROVIDER?: string }): IdentityProviderService {
  const providerName = env.IDENTITY_PROVIDER ?? 'bluesky'

  if (cachedProvider && cachedProviderName === providerName) {
    return cachedProvider
  }

  switch (providerName) {
    case 'bluesky': {
      const { BlueskyIdentityProvider } = require('./bluesky-identity') as typeof import('./bluesky-identity')
      cachedProvider = new BlueskyIdentityProvider()
      break
    }
    case 'nostr': {
      const { NostrIdentityProvider } = require('./nostr-identity') as typeof import('./nostr-identity')
      cachedProvider = new NostrIdentityProvider()
      break
    }
    default:
      throw new Error(`Unknown identity provider: ${providerName}`)
  }

  cachedProviderName = providerName
  return cachedProvider
}
