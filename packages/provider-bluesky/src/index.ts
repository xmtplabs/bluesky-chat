export { provider, config } from './provider'
export type { IdentityProvider, ProviderConfig, UserProfile, IdentityMapping, Nip46Helpers } from '@bluesky-chat/provider-interface'

// NIP-46 helpers are Nostr-only; null for Bluesky
import type { Nip46Helpers } from '@bluesky-chat/provider-interface'
export const nip46: Nip46Helpers | null = null
