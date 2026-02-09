// Re-export from the provider selected at build time via Vite alias
export { provider, config } from '@provider'
export { nip46 } from '@provider'
export type { IdentityProvider, ProviderConfig, UserProfile, IdentityMapping, Nip46Helpers } from '@provider'

import { config as _config } from '@provider'

/** Display-formatted handle (e.g. "@alice.bsky.social" for Bluesky, "alice@relay.com" as-is for Nostr) */
export const formatHandle = (handle: string) => _config.formatHandle(handle)
