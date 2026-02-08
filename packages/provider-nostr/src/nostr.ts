import { SimplePool } from 'nostr-tools/pool'
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure'
import { nip19 } from 'nostr-tools'
import type { UserProfile } from '@bluesky-chat/provider-interface'
import { parseKind0Content, extractXmtpBinding, hexToNpub, decodeNostrIdentity } from './utils'

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
