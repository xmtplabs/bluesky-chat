# Nostr Identity Module Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement a Nostr identity provider package that plugs into the existing identity chassis, enabling the app to build with `CHAT_PROVIDER=nostr` and authenticate users via Nostr keypairs.

**Architecture:** The module follows the same adapter pattern as `provider-bluesky`: an internal `NostrService` class handles all Nostr protocol details (relay connections, kind 0 events, NIP-07/nsec auth), wrapped by a thin `provider.ts` adapter that implements the `IdentityProvider` interface. XMTP inbox bindings are stored in the `xmtp` field of a user's kind 0 metadata event, per the [Nostr-XMTP linking spec](https://hackmd.io/x43UXu6VS5y88YTIo3K5tw).

**Tech Stack:** `nostr-tools` (nip19, SimplePool, event signing), NIP-07 browser extension API, kind 0 replaceable metadata events.

**Reference files (read these first):**
- `packages/provider-interface/src/index.ts` — the interface contract
- `packages/provider-bluesky/src/provider.ts` — adapter pattern template
- `packages/provider-bluesky/src/bluesky.ts` — internal service template
- `packages/provider-bluesky/package.json` — package structure template
- `src/provider.ts` — build-time re-export layer

---

## Task 1: Package Scaffolding

**Files:**
- Create: `packages/provider-nostr/package.json`
- Create: `packages/provider-nostr/tsconfig.json`
- Create: `packages/provider-nostr/src/index.ts`
- Create: `packages/provider-nostr/src/global.d.ts`

**Step 1: Create package.json**

```json
{
  "name": "@bluesky-chat/provider-nostr",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "dependencies": {
    "nostr-tools": "^2.10.4"
  },
  "peerDependencies": {
    "@bluesky-chat/provider-interface": "workspace:*"
  }
}
```

**Step 2: Create tsconfig.json**

Mirror `packages/provider-bluesky/tsconfig.json` exactly:

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "declaration": true,
    "paths": {
      "@bluesky-chat/provider-interface": ["../provider-interface/src"]
    }
  },
  "include": ["src"]
}
```

**Step 3: Create global.d.ts with NIP-07 types**

```typescript
// NIP-07 browser extension interface (Alby, nos2x, etc.)
declare global {
  interface Window {
    nostr?: {
      getPublicKey(): Promise<string>
      signEvent(event: {
        kind: number
        created_at: number
        tags: string[][]
        content: string
      }): Promise<{
        id: string
        pubkey: string
        created_at: number
        kind: number
        tags: string[][]
        content: string
        sig: string
      }>
    }
    electronAPI?: {
      secureStore: (key: string, value: string) => Promise<void>
      secureRetrieve: (key: string) => Promise<string | null>
      secureDelete: (key: string) => Promise<void>
    }
  }
}

export {}
```

**Step 4: Create stub index.ts**

```typescript
export { provider, config } from './provider'
export type { IdentityProvider, ProviderConfig, UserProfile, IdentityMapping } from '@bluesky-chat/provider-interface'
```

This will fail until `provider.ts` exists — that's expected. The scaffolding is done.

**Step 5: Install nostr-tools**

Run: `cd /Users/saulxmtp/Developer/bluesky-chat && npm install nostr-tools --workspace=packages/provider-nostr`

If the workspace isn't registered in the root `package.json`, add it first:
- Check root `package.json` for a `workspaces` field
- If missing, the Vite alias handles resolution directly — no workspace registration needed
- In that case: `cd packages/provider-nostr && npm install nostr-tools`

**Step 6: Commit**

```bash
git add packages/provider-nostr/
git commit -m "feat(nostr): scaffold provider-nostr package"
```

---

## Task 2: Pure Utility Functions + Tests

These are pure functions with no side effects — easiest to TDD.

**Files:**
- Create: `packages/provider-nostr/src/utils.ts`
- Create: `packages/provider-nostr/src/utils.test.ts`

**Step 1: Write the failing tests**

Create `packages/provider-nostr/src/utils.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import {
  decodeNostrIdentity,
  parseKind0Content,
  extractXmtpBinding,
  hexToNpub,
  npubToHex,
} from './utils'

describe('decodeNostrIdentity', () => {
  it('should decode an npub to hex pubkey', () => {
    // Known test vector: npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6
    const npub = 'npub180cvv07tjdrrgpa0j7j7tmnyl2yr6yr7l8j4s3evf6u64th6gkwsyjh6w6'
    const result = decodeNostrIdentity(npub)
    expect(result).not.toBeNull()
    expect(result!.type).toBe('npub')
    expect(typeof result!.pubkey).toBe('string')
    expect(result!.pubkey).toHaveLength(64) // hex pubkey is 64 chars
  })

  it('should decode a hex pubkey as-is', () => {
    const hex = '3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d'
    const result = decodeNostrIdentity(hex)
    expect(result).not.toBeNull()
    expect(result!.type).toBe('hex')
    expect(result!.pubkey).toBe(hex)
  })

  it('should return null for invalid input', () => {
    expect(decodeNostrIdentity('not-valid')).toBeNull()
    expect(decodeNostrIdentity('')).toBeNull()
  })
})

describe('hexToNpub / npubToHex', () => {
  it('should round-trip hex <-> npub', () => {
    const hex = '3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d'
    const npub = hexToNpub(hex)
    expect(npub).toMatch(/^npub1/)
    expect(npubToHex(npub)).toBe(hex)
  })
})

describe('parseKind0Content', () => {
  it('should parse standard metadata fields into UserProfile', () => {
    const content = JSON.stringify({
      name: 'alice',
      display_name: 'Alice',
      picture: 'https://example.com/avatar.jpg',
      about: 'Hello world',
    })
    const hexPubkey = '3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d'

    const profile = parseKind0Content(content, hexPubkey)
    expect(profile.id).toMatch(/^npub1/) // stored as npub
    expect(profile.handle).toBe('alice')
    expect(profile.displayName).toBe('Alice')
    expect(profile.avatar).toBe('https://example.com/avatar.jpg')
    expect(profile.description).toBe('Hello world')
  })

  it('should use nip05 as handle when name is missing', () => {
    const content = JSON.stringify({ nip05: 'alice@example.com' })
    const hex = 'abcd'.repeat(16)
    const profile = parseKind0Content(content, hex)
    expect(profile.handle).toBe('alice@example.com')
  })

  it('should fallback to truncated npub when no name or nip05', () => {
    const content = JSON.stringify({})
    const hex = '3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d'
    const profile = parseKind0Content(content, hex)
    expect(profile.handle).toMatch(/^npub1.+…$/)
  })

  it('should handle invalid JSON gracefully', () => {
    const hex = 'abcd'.repeat(16)
    const profile = parseKind0Content('not json', hex)
    expect(profile.id).toMatch(/^npub1/)
    expect(profile.handle).toMatch(/^npub1/)
  })
})

describe('extractXmtpBinding', () => {
  it('should extract xmtp binding from kind 0 content', () => {
    const content = JSON.stringify({
      name: 'alice',
      xmtp: {
        inboxId: 'inbox-123',
        verificationSignature: 'c2lnbmF0dXJl', // base64
        createdAt: '2025-01-01T00:00:00Z',
      },
    })
    const result = extractXmtpBinding(content)
    expect(result).not.toBeNull()
    expect(result!.inboxId).toBe('inbox-123')
    expect(result!.verificationSignature).toBe('c2lnbmF0dXJl')
  })

  it('should return null when xmtp field is missing', () => {
    const content = JSON.stringify({ name: 'alice' })
    expect(extractXmtpBinding(content)).toBeNull()
  })

  it('should return null when xmtp field is malformed', () => {
    const content = JSON.stringify({ xmtp: { inboxId: 'abc' } }) // missing verificationSignature
    expect(extractXmtpBinding(content)).toBeNull()
  })

  it('should return null for invalid JSON', () => {
    expect(extractXmtpBinding('not json')).toBeNull()
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/provider-nostr/src/utils.test.ts`

Expected: FAIL — `utils.ts` doesn't exist yet.

**Step 3: Implement the utility functions**

Create `packages/provider-nostr/src/utils.ts`:

```typescript
import { nip19 } from 'nostr-tools'
import type { UserProfile } from '@bluesky-chat/provider-interface'

/**
 * Decode an npub or hex pubkey string into a normalized form.
 */
export function decodeNostrIdentity(
  input: string
): { type: 'npub' | 'hex'; pubkey: string } | null {
  if (!input) return null

  // Try npub decode
  if (input.startsWith('npub1')) {
    try {
      const decoded = nip19.decode(input)
      if (decoded.type === 'npub') {
        return { type: 'npub', pubkey: decoded.data as string }
      }
    } catch {
      return null
    }
  }

  // Try hex (64-char hex string)
  if (/^[0-9a-f]{64}$/i.test(input)) {
    return { type: 'hex', pubkey: input.toLowerCase() }
  }

  return null
}

/**
 * Convert hex pubkey to npub.
 */
export function hexToNpub(hex: string): string {
  return nip19.npubEncode(hex)
}

/**
 * Convert npub to hex pubkey.
 */
export function npubToHex(npub: string): string {
  const decoded = nip19.decode(npub)
  if (decoded.type !== 'npub') throw new Error(`Expected npub, got ${decoded.type}`)
  return decoded.data as string
}

/**
 * Parse kind 0 event content JSON into a UserProfile.
 */
export function parseKind0Content(content: string, hexPubkey: string): UserProfile {
  const npub = hexToNpub(hexPubkey)
  const truncatedNpub = npub.slice(0, 12) + '…'

  let metadata: Record<string, unknown>
  try {
    metadata = JSON.parse(content)
  } catch {
    return { id: npub, handle: truncatedNpub }
  }

  const name = typeof metadata.name === 'string' ? metadata.name : undefined
  const nip05 = typeof metadata.nip05 === 'string' ? metadata.nip05 : undefined
  const handle = name || nip05 || truncatedNpub

  return {
    id: npub,
    handle,
    displayName: typeof metadata.display_name === 'string' ? metadata.display_name : undefined,
    avatar: typeof metadata.picture === 'string' ? metadata.picture : undefined,
    description: typeof metadata.about === 'string' ? metadata.about : undefined,
  }
}

/**
 * Extract the XMTP binding from a kind 0 event's content JSON.
 * Returns null if the xmtp field is missing or malformed.
 */
export function extractXmtpBinding(
  content: string
): { inboxId: string; verificationSignature: string; createdAt?: string } | null {
  let metadata: Record<string, unknown>
  try {
    metadata = JSON.parse(content)
  } catch {
    return null
  }

  const xmtp = metadata.xmtp
  if (!xmtp || typeof xmtp !== 'object') return null

  const binding = xmtp as Record<string, unknown>
  if (typeof binding.inboxId !== 'string' || typeof binding.verificationSignature !== 'string') {
    return null
  }

  return {
    inboxId: binding.inboxId,
    verificationSignature: binding.verificationSignature,
    createdAt: typeof binding.createdAt === 'string' ? binding.createdAt : undefined,
  }
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/provider-nostr/src/utils.test.ts`

Expected: All tests PASS.

**Step 5: Commit**

```bash
git add packages/provider-nostr/src/utils.ts packages/provider-nostr/src/utils.test.ts
git commit -m "feat(nostr): add pure utility functions for nip19, kind 0 parsing, binding extraction"
```

---

## Task 3: NostrService — Relay Pool + Profile Fetching

**Files:**
- Create: `packages/provider-nostr/src/nostr.ts`

**Step 1: Implement NostrService with relay pool and profile fetching**

Create `packages/provider-nostr/src/nostr.ts`:

```typescript
import { SimplePool } from 'nostr-tools/pool'
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure'
import { nip19 } from 'nostr-tools'
import type { UserProfile } from '@bluesky-chat/provider-interface'
import { parseKind0Content, extractXmtpBinding, hexToNpub, npubToHex, decodeNostrIdentity } from './utils'

const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
  'wss://relay.snort.social',
]

const SESSION_KEY = 'nostr_session'

interface NostrSession {
  hexPubkey: string
  loginMethod: 'extension' | 'nsec'
}

export class NostrService {
  private pool: SimplePool
  private relays: string[]
  private hexPubkey: string | null = null
  private secretKey: Uint8Array | null = null
  private loginMethod: 'extension' | 'nsec' | null = null

  constructor(relays?: string[]) {
    this.pool = new SimplePool()
    this.relays = relays ?? DEFAULT_RELAYS
  }

  // ── Auth ──────────────────────────────────────────────

  /**
   * Login via NIP-07 browser extension (Alby, nos2x, etc.).
   */
  async loginWithExtension(): Promise<UserProfile> {
    if (!window.nostr) {
      throw new Error('No Nostr extension found. Install Alby or nos2x.')
    }

    const hexPubkey = await window.nostr.getPublicKey()
    this.hexPubkey = hexPubkey
    this.loginMethod = 'extension'

    this.persistSession()

    return this.fetchProfile(hexPubkey)
  }

  /**
   * Login with nsec (private key). Key is stored in Electron secure storage.
   */
  async loginWithNsec(nsecOrHex: string): Promise<UserProfile> {
    let secretKey: Uint8Array
    let hexPubkey: string

    if (nsecOrHex.startsWith('nsec1')) {
      const decoded = nip19.decode(nsecOrHex)
      if (decoded.type !== 'nsec') throw new Error('Invalid nsec')
      secretKey = decoded.data as Uint8Array
    } else if (/^[0-9a-f]{64}$/i.test(nsecOrHex)) {
      secretKey = hexToBytes(nsecOrHex)
    } else {
      throw new Error('Invalid private key. Enter an nsec or 64-char hex key.')
    }

    hexPubkey = getPublicKey(secretKey)
    this.hexPubkey = hexPubkey
    this.secretKey = secretKey
    this.loginMethod = 'nsec'

    // Store secret key securely via Electron
    if (window.electronAPI?.secureStore) {
      await window.electronAPI.secureStore('nostr_nsec', nsecOrHex)
    }
    this.persistSession()

    return this.fetchProfile(hexPubkey)
  }

  async restoreSession(): Promise<UserProfile | null> {
    const stored = localStorage.getItem(SESSION_KEY)
    if (!stored) return null

    let session: NostrSession
    try {
      session = JSON.parse(stored)
    } catch {
      return null
    }

    if (session.loginMethod === 'extension') {
      if (!window.nostr) return null
      try {
        const pubkey = await window.nostr.getPublicKey()
        if (pubkey !== session.hexPubkey) return null // Different key in extension
        this.hexPubkey = pubkey
        this.loginMethod = 'extension'
        return this.fetchProfile(pubkey)
      } catch {
        return null
      }
    }

    if (session.loginMethod === 'nsec') {
      const nsec = await window.electronAPI?.secureRetrieve?.('nostr_nsec')
      if (!nsec) return null
      try {
        return await this.loginWithNsec(nsec)
      } catch {
        return null
      }
    }

    return null
  }

  async logout(): Promise<void> {
    this.hexPubkey = null
    this.secretKey = null
    this.loginMethod = null
    localStorage.removeItem(SESSION_KEY)
    await window.electronAPI?.secureDelete?.('nostr_nsec')
  }

  isLoggedIn(): boolean {
    return this.hexPubkey !== null
  }

  getHexPubkey(): string | null {
    return this.hexPubkey
  }

  getNpub(): string | null {
    return this.hexPubkey ? hexToNpub(this.hexPubkey) : null
  }

  // ── Profiles ──────────────────────────────────────────

  /**
   * Fetch a profile from relays by hex pubkey.
   */
  async fetchProfile(hexPubkey: string): Promise<UserProfile> {
    const event = await this.pool.get(this.relays, {
      kinds: [0],
      authors: [hexPubkey],
    })

    if (!event) {
      const npub = hexToNpub(hexPubkey)
      return { id: npub, handle: npub.slice(0, 12) + '…' }
    }

    return parseKind0Content(event.content, hexPubkey)
  }

  /**
   * Fetch profile by npub or hex.
   */
  async getProfile(id: string): Promise<UserProfile | null> {
    const decoded = decodeNostrIdentity(id)
    if (!decoded) return null
    const hex = decoded.type === 'npub' ? decoded.pubkey : id
    return this.fetchProfile(hex)
  }

  /**
   * Fetch multiple profiles in parallel.
   */
  async getProfiles(ids: string[]): Promise<Map<string, UserProfile>> {
    const results = new Map<string, UserProfile>()
    const profiles = await Promise.all(ids.map((id) => this.getProfile(id)))
    ids.forEach((id, i) => {
      if (profiles[i]) results.set(id, profiles[i]!)
    })
    return results
  }

  /**
   * Search users via nostr.band relay NIP-50 search.
   * Falls back to empty results if the relay doesn't support NIP-50.
   */
  async searchUsers(query: string, limit = 10): Promise<UserProfile[]> {
    try {
      const events = await this.pool.querySync(
        ['wss://relay.nostr.band'],
        { kinds: [0], search: query, limit } as any, // NIP-50 search filter
      )
      return events.map((e) => parseKind0Content(e.content, e.pubkey))
    } catch {
      return []
    }
  }

  // ── XMTP Binding ─────────────────────────────────────

  /**
   * Publish XMTP inbox binding to kind 0 metadata.
   * Merges the xmtp field into the existing metadata and republishes.
   */
  async publishInboxBinding(inboxId: string, verificationSignature: string): Promise<void> {
    if (!this.hexPubkey) throw new Error('Not logged in')

    // Fetch current kind 0 to merge
    const existing = await this.pool.get(this.relays, {
      kinds: [0],
      authors: [this.hexPubkey],
    })

    let metadata: Record<string, unknown> = {}
    if (existing) {
      try {
        metadata = JSON.parse(existing.content)
      } catch {
        // Start fresh if current metadata is broken
      }
    }

    // Merge xmtp binding
    metadata.xmtp = {
      inboxId,
      verificationSignature,
      createdAt: new Date().toISOString(),
    }

    const eventTemplate = {
      kind: 0,
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
      content: JSON.stringify(metadata),
    }

    const signedEvent = await this.signEvent(eventTemplate)

    // Publish to all relays
    await Promise.allSettled(
      this.pool.publish(this.relays, signedEvent)
    )
  }

  /**
   * Look up the XMTP inbox binding for a given npub/hex pubkey.
   */
  async lookupInboxBinding(
    id: string
  ): Promise<
    | { found: true; inboxId: string; verificationSignature: string }
    | { found: false; notFound: boolean }
  > {
    const decoded = decodeNostrIdentity(id)
    if (!decoded) return { found: false, notFound: true }

    const hexPubkey = decoded.pubkey

    try {
      const event = await this.pool.get(this.relays, {
        kinds: [0],
        authors: [hexPubkey],
      })

      if (!event) return { found: false, notFound: true }

      const binding = extractXmtpBinding(event.content)
      if (!binding) return { found: false, notFound: true }

      return {
        found: true,
        inboxId: binding.inboxId,
        verificationSignature: binding.verificationSignature,
      }
    } catch {
      return { found: false, notFound: false }
    }
  }

  /**
   * Delete XMTP binding by republishing kind 0 without the xmtp field.
   */
  async deleteInboxBinding(): Promise<void> {
    if (!this.hexPubkey) throw new Error('Not logged in')

    const existing = await this.pool.get(this.relays, {
      kinds: [0],
      authors: [this.hexPubkey],
    })

    let metadata: Record<string, unknown> = {}
    if (existing) {
      try {
        metadata = JSON.parse(existing.content)
      } catch {
        // nothing to delete
        return
      }
    }

    delete metadata.xmtp

    const eventTemplate = {
      kind: 0,
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
      content: JSON.stringify(metadata),
    }

    const signedEvent = await this.signEvent(eventTemplate)
    await Promise.allSettled(
      this.pool.publish(this.relays, signedEvent)
    )
  }

  // ── Social Graph (optional) ───────────────────────────

  /**
   * Get following list from kind 3 (contacts) event.
   */
  async getFollowing(hexPubkey: string): Promise<string[]> {
    const event = await this.pool.get(this.relays, {
      kinds: [3],
      authors: [hexPubkey],
    })

    if (!event) return []

    // Kind 3 tags: [["p", hexPubkey, relayUrl?, petname?], ...]
    return event.tags
      .filter((tag) => tag[0] === 'p' && tag[1])
      .map((tag) => hexToNpub(tag[1]))
  }

  // ── Internals ─────────────────────────────────────────

  /**
   * Sign an event using either NIP-07 extension or stored nsec.
   */
  private async signEvent(eventTemplate: {
    kind: number
    created_at: number
    tags: string[][]
    content: string
  }) {
    if (this.loginMethod === 'extension' && window.nostr) {
      return window.nostr.signEvent(eventTemplate)
    }

    if (this.loginMethod === 'nsec' && this.secretKey) {
      return finalizeEvent(eventTemplate, this.secretKey)
    }

    throw new Error('No signing method available')
  }

  private persistSession(): void {
    if (!this.hexPubkey || !this.loginMethod) return
    const session: NostrSession = {
      hexPubkey: this.hexPubkey,
      loginMethod: this.loginMethod,
    }
    localStorage.setItem(SESSION_KEY, JSON.stringify(session))
  }
}

// ── Helpers ───────────────────────────────────────────────

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return bytes
}
```

**Step 2: Verify it compiles**

Run: `cd /Users/saulxmtp/Developer/bluesky-chat && npx tsc --noEmit -p packages/provider-nostr/tsconfig.json`

Expected: No errors (or only the expected "provider.ts not found" since we haven't created it yet).

**Step 3: Commit**

```bash
git add packages/provider-nostr/src/nostr.ts
git commit -m "feat(nostr): implement NostrService with relay pool, auth, profiles, and binding"
```

---

## Task 4: Provider Adapter + Config

**Files:**
- Create: `packages/provider-nostr/src/provider.ts`

**Step 1: Write the failing test**

Create `packages/provider-nostr/src/provider.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock NostrService before importing provider
vi.mock('./nostr', () => {
  const mockService = {
    loginWithExtension: vi.fn().mockResolvedValue({
      id: 'npub1test',
      handle: 'alice',
      displayName: 'Alice',
    }),
    loginWithNsec: vi.fn().mockResolvedValue({
      id: 'npub1test',
      handle: 'alice',
      displayName: 'Alice',
    }),
    logout: vi.fn().mockResolvedValue(undefined),
    restoreSession: vi.fn().mockResolvedValue(null),
    getNpub: vi.fn().mockReturnValue('npub1test'),
    getProfile: vi.fn().mockResolvedValue({
      id: 'npub1test',
      handle: 'alice',
    }),
    getProfiles: vi.fn().mockResolvedValue(new Map()),
    searchUsers: vi.fn().mockResolvedValue([]),
    publishInboxBinding: vi.fn().mockResolvedValue(undefined),
    lookupInboxBinding: vi.fn().mockResolvedValue({ found: false, notFound: true }),
    deleteInboxBinding: vi.fn().mockResolvedValue(undefined),
    getFollowing: vi.fn().mockResolvedValue([]),
    fetchProfile: vi.fn(),
  }
  return { NostrService: vi.fn(() => mockService) }
})

import { provider, config } from './provider'

describe('Nostr provider adapter', () => {
  it('should export provider implementing IdentityProvider', () => {
    expect(provider.login).toBeTypeOf('function')
    expect(provider.logout).toBeTypeOf('function')
    expect(provider.restoreSession).toBeTypeOf('function')
    expect(provider.publishInboxBinding).toBeTypeOf('function')
    expect(provider.lookupInboxForIdentity).toBeTypeOf('function')
    expect(provider.deleteInboxBinding).toBeTypeOf('function')
    expect(provider.getProfile).toBeTypeOf('function')
    expect(provider.getProfiles).toBeTypeOf('function')
    expect(provider.searchUsers).toBeTypeOf('function')
  })

  it('should export config with correct Nostr values', () => {
    expect(config.name).toBe('Nostr')
    expect(config.loginPlaceholder).toMatch(/npub/)
    expect(config.loginSuffix).toBeUndefined()
    expect(config.loginMethods).toContain('extension')
    expect(config.loginMethods).toContain('nsec')
    expect(config.supportsBlobUpload).toBe(false)
  })

  it('login should delegate to NostrService.loginWithExtension', async () => {
    const result = await provider.login('npub1test')
    expect(result.profile.id).toBe('npub1test')
    expect(result.id).toBe('npub1test')
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run packages/provider-nostr/src/provider.test.ts`

Expected: FAIL — `provider.ts` doesn't exist yet.

**Step 3: Implement the provider adapter**

Create `packages/provider-nostr/src/provider.ts`:

```typescript
import type { IdentityProvider, ProviderConfig, UserProfile } from '@bluesky-chat/provider-interface'
import { NostrService } from './nostr'
import { npubToHex, hexToNpub } from './utils'

const service = new NostrService()

export const provider: IdentityProvider = {
  async login(identifier: string) {
    // Default login method: NIP-07 extension
    // The identifier may be ignored — extension provides the key
    const profile = await service.loginWithExtension()
    return { profile, id: profile.id }
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

  // Nostr doesn't have native blob storage
  // hasRepoWriteAccess, uploadBlob, updateProfile — not implemented
}

export const config: ProviderConfig = {
  name: 'Nostr',
  loginPlaceholder: 'npub1…',
  loginSuffix: undefined,
  loginMethods: ['extension', 'nsec'],
  mappingServiceUrl: '',
  supportsFollowers: false,    // Requires relay indexing
  supportsFollowing: true,     // Kind 3 contacts list
  supportsProfileUpdate: false, // Could be added later
  supportsBlobUpload: false,   // No native blob storage
}
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run packages/provider-nostr/src/provider.test.ts`

Expected: All tests PASS.

**Step 5: Commit**

```bash
git add packages/provider-nostr/src/provider.ts packages/provider-nostr/src/provider.test.ts
git commit -m "feat(nostr): implement provider adapter and config"
```

---

## Task 5: NostrService Unit Tests

**Files:**
- Create: `packages/provider-nostr/src/nostr.test.ts`

**Step 1: Write tests for NostrService**

These tests mock `nostr-tools` and `window.nostr` to test the service logic in isolation.

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock nostr-tools modules
vi.mock('nostr-tools/pool', () => ({
  SimplePool: vi.fn(() => ({
    get: vi.fn(),
    querySync: vi.fn(),
    publish: vi.fn(() => [Promise.resolve('ok')]),
  })),
}))

vi.mock('nostr-tools/pure', () => ({
  getPublicKey: vi.fn(() => 'a'.repeat(64)),
  finalizeEvent: vi.fn((template: any) => ({
    ...template,
    id: 'event-id',
    pubkey: 'a'.repeat(64),
    sig: 'sig',
  })),
}))

vi.mock('nostr-tools', () => ({
  nip19: {
    decode: vi.fn((input: string) => {
      if (input.startsWith('nsec1')) return { type: 'nsec', data: new Uint8Array(32) }
      if (input.startsWith('npub1')) return { type: 'npub', data: 'a'.repeat(64) }
      throw new Error('invalid')
    }),
    npubEncode: vi.fn(() => 'npub1mock'),
  },
}))

import { NostrService } from './nostr'
import { SimplePool } from 'nostr-tools/pool'

describe('NostrService', () => {
  let service: NostrService
  let mockPool: any

  beforeEach(() => {
    service = new NostrService(['wss://test-relay'])
    mockPool = vi.mocked(SimplePool).mock.results[
      vi.mocked(SimplePool).mock.results.length - 1
    ].value
    vi.mocked(localStorage.getItem).mockReturnValue(null)
    vi.mocked(localStorage.setItem).mockClear()
  })

  afterEach(() => {
    delete (window as any).nostr
  })

  describe('loginWithExtension', () => {
    it('should get pubkey from NIP-07 extension', async () => {
      ;(window as any).nostr = {
        getPublicKey: vi.fn().mockResolvedValue('a'.repeat(64)),
        signEvent: vi.fn(),
      }

      mockPool.get.mockResolvedValue({
        kind: 0,
        content: JSON.stringify({ name: 'alice', picture: 'https://img.com/a.jpg' }),
        pubkey: 'a'.repeat(64),
      })

      const profile = await service.loginWithExtension()
      expect(profile.handle).toBe('alice')
      expect(service.isLoggedIn()).toBe(true)
    })

    it('should throw when no extension is installed', async () => {
      await expect(service.loginWithExtension()).rejects.toThrow('No Nostr extension found')
    })
  })

  describe('lookupInboxBinding', () => {
    it('should return binding when xmtp field exists in kind 0', async () => {
      mockPool.get.mockResolvedValue({
        kind: 0,
        content: JSON.stringify({
          name: 'alice',
          xmtp: {
            inboxId: 'inbox-123',
            verificationSignature: 'sig-abc',
            createdAt: '2025-01-01T00:00:00Z',
          },
        }),
        pubkey: 'a'.repeat(64),
      })

      const result = await service.lookupInboxBinding('npub1test')
      expect(result.found).toBe(true)
      if (result.found) {
        expect(result.inboxId).toBe('inbox-123')
        expect(result.verificationSignature).toBe('sig-abc')
      }
    })

    it('should return not found when kind 0 has no xmtp field', async () => {
      mockPool.get.mockResolvedValue({
        kind: 0,
        content: JSON.stringify({ name: 'alice' }),
        pubkey: 'a'.repeat(64),
      })

      const result = await service.lookupInboxBinding('npub1test')
      expect(result.found).toBe(false)
    })

    it('should return not found when no kind 0 event exists', async () => {
      mockPool.get.mockResolvedValue(null)

      const result = await service.lookupInboxBinding('npub1test')
      expect(result.found).toBe(false)
      if (!result.found) expect(result.notFound).toBe(true)
    })
  })

  describe('publishInboxBinding', () => {
    it('should merge xmtp field into existing metadata', async () => {
      ;(window as any).nostr = {
        getPublicKey: vi.fn().mockResolvedValue('a'.repeat(64)),
        signEvent: vi.fn((t: any) => ({ ...t, id: 'id', pubkey: 'a'.repeat(64), sig: 'sig' })),
      }

      // Login first
      mockPool.get.mockResolvedValue({
        kind: 0,
        content: JSON.stringify({ name: 'alice' }),
        pubkey: 'a'.repeat(64),
      })
      await service.loginWithExtension()

      // Now publish binding — get should return existing metadata
      mockPool.get.mockResolvedValue({
        kind: 0,
        content: JSON.stringify({ name: 'alice', about: 'existing bio' }),
        pubkey: 'a'.repeat(64),
      })

      await service.publishInboxBinding('inbox-123', 'sig-abc')

      // Check the signed event content includes merged fields
      const signCall = (window as any).nostr.signEvent.mock.calls[0][0]
      const content = JSON.parse(signCall.content)
      expect(content.name).toBe('alice')
      expect(content.about).toBe('existing bio')
      expect(content.xmtp.inboxId).toBe('inbox-123')
      expect(content.xmtp.verificationSignature).toBe('sig-abc')
    })
  })
})
```

**Step 2: Run tests**

Run: `npx vitest run packages/provider-nostr/src/nostr.test.ts`

Expected: All tests PASS.

**Step 3: Commit**

```bash
git add packages/provider-nostr/src/nostr.test.ts
git commit -m "test(nostr): add unit tests for NostrService"
```

---

## Task 6: Integration — Build with CHAT_PROVIDER=nostr

**Files:**
- Modify: `vitest.config.ts` (add dynamic provider alias)

**Step 1: Verify the Vite build alias already works**

The `electron.vite.config.ts` already resolves `@provider` dynamically:

```typescript
const provider = process.env.CHAT_PROVIDER || 'bluesky'
// ...
'@provider': resolve(__dirname, `packages/provider-${provider}/src`),
```

And `package.json` already has `dev:nostr` and `build:nostr` scripts. So building should work out of the box.

**Step 2: Update vitest.config.ts for dynamic provider selection**

Read `vitest.config.ts` — currently hardcodes `provider-bluesky`. Update:

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

const provider = process.env.CHAT_PROVIDER || 'bluesky'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{js,ts,jsx,tsx}'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['node_modules/', 'src/test/']
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@provider': resolve(__dirname, `packages/provider-${provider}/src`),
    }
  }
})
```

**Step 3: Run the full existing test suite with Bluesky (no regression)**

Run: `npx vitest run`

Expected: All existing tests still pass.

**Step 4: Run TypeScript check with Nostr provider**

Run: `CHAT_PROVIDER=nostr npx tsc --noEmit`

Fix any type errors that surface. Common issues:
- Missing return types
- `nip19.decode` return type narrowing

**Step 5: Run dev server with Nostr provider**

Run: `CHAT_PROVIDER=nostr npm run dev`

Expected: App starts. Login screen shows "Nostr" branding, `npub1…` placeholder, extension/nsec login methods.

**Step 6: Commit**

```bash
git add vitest.config.ts
git commit -m "feat(nostr): wire up build-time provider selection for tests"
```

---

## Task 7: Run Nostr Provider Tests in CI-Compatible Way

**Step 1: Add a vitest config for provider-nostr package tests**

The provider package tests (`packages/provider-nostr/src/*.test.ts`) need their own vitest invocation since they're not under `src/`.

Run provider tests:

```bash
npx vitest run packages/provider-nostr/src/utils.test.ts packages/provider-nostr/src/nostr.test.ts packages/provider-nostr/src/provider.test.ts
```

If the path-based alias resolution fails for provider tests, add a `packages/provider-nostr/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@bluesky-chat/provider-interface': resolve(__dirname, '../provider-interface/src'),
    },
  },
})
```

Then run: `npx vitest run -c packages/provider-nostr/vitest.config.ts`

Expected: All provider tests pass.

**Step 2: Commit**

```bash
git add packages/provider-nostr/vitest.config.ts
git commit -m "test(nostr): add vitest config for provider package tests"
```

---

## Summary

| Task | What | Files | Tests |
|------|------|-------|-------|
| 1 | Package scaffolding | package.json, tsconfig, index.ts, global.d.ts | — |
| 2 | Pure utilities (nip19, parsing) | utils.ts | utils.test.ts |
| 3 | NostrService (relay, auth, binding) | nostr.ts | — |
| 4 | Provider adapter + config | provider.ts | provider.test.ts |
| 5 | NostrService unit tests | — | nostr.test.ts |
| 6 | Build integration | vitest.config.ts | Existing suite |
| 7 | CI-compatible test runner | vitest.config.ts (package) | All provider tests |

**Dependencies between tasks:** 1 → 2 → 3 → 4 → 5 → 6 → 7 (sequential — each builds on the previous).

**What's NOT in scope (future work):**
- `getFollowers()` — requires relay indexing infrastructure
- `updateProfile()` — kind 0 republish with updated fields
- `uploadBlob()` — Nostr has no native blob storage (could use NIP-96 or Blossom later)
- Backend mapping service indexer for Nostr relays (separate `packages/mapping-service/src/indexers/nostr.ts`)
