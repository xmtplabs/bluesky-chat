# Pluggable Identity Chassis Design

Turn bluesky-chat into a generic chat chassis that produces separate compiled builds per identity provider (Bluesky, Nostr, etc.). The chat experience is shared; only the identity layer swaps out.

## Decisions

- **Separate compiled builds**, not a unified app with runtime switching
- **Shared chrome, swapped panels** — chat UI identical across builds; login, profiles, user search, and contact discovery are provider-specific
- **Package-per-provider** in the monorepo under `packages/`
- **Single mapping service with pluggable indexers** — shared lookup API, provider-specific ingestion
- **Incremental refactor in place** — app works at every commit

## Monorepo Structure

```
packages/
  provider-interface/        # TypeScript interfaces only
    src/
      index.ts               # IdentityProvider, UserProfile, ProviderConfig
  provider-bluesky/          # Extracted from current src/services/
    src/
      auth.ts                # OAuth + password login
      profiles.ts            # Profile fetching, search, avatar URLs
      identity.ts            # DID <> inbox resolution via ATProto records
      social.ts              # Followers/following
      index.ts               # Exports implementing IdentityProvider
    package.json
  provider-nostr/            # New, implements same interface
    src/
      auth.ts                # nsec/NIP-07 browser extension login
      profiles.ts            # kind 0 metadata fetching from relays
      identity.ts            # npub <> inbox via kind 0 xmtp field
      social.ts              # kind 3 follow lists
      index.ts
    package.json
  mapping-service/           # Existing, refactored
    src/
      indexers/
        bluesky.ts           # Jetstream watcher (existing)
        nostr.ts             # Relay watcher for kind 0 events (new)
      routes/                # Unchanged lookup API
src/                         # The chassis -- identity-agnostic
```

## Provider Interface

```typescript
// packages/provider-interface/src/index.ts

export interface UserProfile {
  id: string;              // Opaque: DID for Bluesky, npub for Nostr
  handle: string;          // @alice.bsky.social, npub1abc...
  displayName?: string;
  avatar?: string;
  description?: string;
}

export interface IdentityProvider {
  // Auth
  login(identifier: string): Promise<{ profile: UserProfile; did: string }>;
  logout(): Promise<void>;
  restoreSession(): Promise<{ profile: UserProfile; did: string } | null>;

  // Identity <> XMTP inbox resolution
  publishInboxBinding(inboxId: string, signature: string): Promise<void>;
  lookupInboxForIdentity(id: string): Promise<string | null>;
  deleteInboxBinding(): Promise<void>;

  // Profiles
  getProfile(id: string): Promise<UserProfile | null>;
  getProfiles(ids: string[]): Promise<Map<string, UserProfile>>;
  searchUsers(query: string): Promise<UserProfile[]>;

  // Social graph (optional)
  getFollowers?(id: string, cursor?: string): Promise<{ profiles: UserProfile[]; cursor?: string }>;
  getFollowing?(id: string, cursor?: string): Promise<{ profiles: UserProfile[]; cursor?: string }>;
}

export interface ProviderConfig {
  name: string;            // "Bluesky", "Nostr"
  loginPlaceholder: string;
  loginMethods: Array<'oauth' | 'password' | 'extension' | 'nsec'>;
  mappingServiceUrl: string;
}
```

Social graph is optional. The chassis hides follower/following UI if the provider doesn't implement it.

## Build-Time Provider Selection

Vite alias swaps the provider at compile time:

```typescript
// vite.config.ts
const provider = process.env.CHAT_PROVIDER || 'bluesky';

export default defineConfig({
  resolve: {
    alias: {
      '@provider': path.resolve(__dirname, `packages/provider-${provider}/src`),
    },
  },
});
```

```json
{
  "scripts": {
    "dev:bluesky": "CHAT_PROVIDER=bluesky vite",
    "dev:nostr": "CHAT_PROVIDER=nostr vite",
    "build:bluesky": "CHAT_PROVIDER=bluesky vite build",
    "build:nostr": "CHAT_PROVIDER=nostr vite build"
  }
}
```

TypeScript path mapping in `tsconfig.json` points `@provider` at `provider-bluesky` as the default for IDE support. The actual resolution is controlled by Vite.

## Chassis Changes

**Types** — `BlueskyProfile` replaced by `UserProfile` from `@provider`. `ChatConversation.peerProfile` and `ChatMessage.senderProfile` use the new type. `IdentityMapping` uses `identityId`/`identityHandle` instead of `blueskyDid`/`blueskyHandle`.

**Auth store** — Calls `provider.login()`, `provider.getProfile()` instead of `blueskyService` directly. The `connectXMTP` flow stays structurally identical but calls `provider.publishInboxBinding()`.

**Identity service** — Most of `src/services/identity.ts` moves into provider packages. The chassis keeps a thin caching/delegation layer. The 3-tier fallback (local, backend, direct lookup) stays, but direct lookup delegates to the provider.

**Chat store** — `ensureInboxIdsResolved()` calls `provider.getProfiles()`. `getSenderName()` uses `UserProfile` fields. Same logic, different types.

**Components** — `BlueskyLogin.tsx` becomes a generic `LoginScreen.tsx` driven by `ProviderConfig.loginMethods`. Profile displays use `UserProfile` fields. Social graph tabs conditionally render.

**Deleted from `src/`** — `src/services/bluesky.ts` (moves to provider-bluesky), most of `src/services/identity.ts` (splits between chassis cache layer and provider).

## Nostr Provider (Reference: hackmd.io/x43UXu6VS5y88YTIo3K5tw)

The Nostr provider implements `IdentityProvider` using:

- **Auth**: NIP-07 browser extension signing or direct nsec input
- **Identity binding**: Signs XMTP inbox ID with Nostr key, stores in kind 0 metadata `xmtp` field, publishes to relays
- **Resolution**: npub-to-inbox via kind 0 fetch and signature verification; inbox-to-npub via mapping service indexer
- **Profiles**: Fetched from kind 0 metadata events on relays
- **Social graph**: kind 3 follow list events

## Mapping Service Changes

The existing `packages/mapping-service/` gets refactored:

- Extract Jetstream watcher into `src/indexers/bluesky.ts`
- Add `src/indexers/nostr.ts` that watches kind 0 events on relays for the `xmtp` field
- Indexer selection is config-driven
- Lookup routes (`/v1/lookup/identity/:id`, `/v1/lookup/inbox/:inboxId`) stay unchanged

## Refactoring Sequence

Each phase is a standalone PR. The app ships normally throughout.

**Phase 1: Define the interface** — Create `packages/provider-interface/` with `UserProfile`, `IdentityProvider`, `ProviderConfig`. No app changes.

**Phase 2: Rename types in the chassis** — `BlueskyProfile` to `UserProfile`, field renames across types/stores/components. App works, just new names.

**Phase 3: Extract the Bluesky provider** — Move `bluesky.ts` and identity resolution logic into `packages/provider-bluesky/`. Wire up Vite alias. Replace direct imports with `@provider`. App works identically.

**Phase 4: Genericize the login UI** — Replace `BlueskyLogin.tsx` with data-driven `LoginScreen.tsx` reading `ProviderConfig`.

**Phase 5: Refactor the mapping service** — Extract Jetstream indexer, make indexer selection config-driven. Lookup routes unchanged.

**Phase 6: Build the Nostr provider** — Implement `IdentityProvider` against Nostr relays/kind 0. Add Nostr indexer to mapping service. `CHAT_PROVIDER=nostr vite dev` works.
