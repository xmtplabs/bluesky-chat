import { SimplePool } from 'nostr-tools/pool'
import { finalizeEvent, getPublicKey } from 'nostr-tools/pure'
import { nip19 } from 'nostr-tools'
import type { UserProfile } from '@bluesky-chat/provider-interface'
import { parseKind0Content, extractXmtpBinding, hexToNpub, decodeNostrIdentity } from './utils'
import {
  startNip46Connect,
  loginWithExtension as nip46LoginWithExtension,
  restoreNip46Session,
  clearNip46Session,
  getActiveBunkerSigner,
} from './nip46-auth'

const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.snort.social',
  'wss://relay.primal.net',
]

const SESSION_KEY = 'nostr_session'

export class NostrService {
  private pool: SimplePool
  private relays: string[]
  private hexPubkey: string | null = null
  private secretKey: Uint8Array | null = null
  private loginMethod: 'nip46' | 'extension' | 'nsec' | null = null
  private nip46Abort: (() => void) | null = null

  constructor(relays?: string[]) {
    this.pool = new SimplePool()
    this.relays = relays ?? DEFAULT_RELAYS
  }

  // ── Auth ──────────────────────────────────────────────

  /**
   * Login via NIP-46 Nostr Connect (QR code flow).
   * Generates a QR code data URL, calls onQrDataUrl so the UI can display
   * it, then waits for a bunker app to connect.
   */
  async loginViaNip46(onQrDataUrl: (dataUrl: string) => void, onConnected?: () => void): Promise<UserProfile> {
    console.log('[NostrService] loginViaNip46 called, relays:', this.relays)
    const { promise, abort } = startNip46Connect(this.relays, onQrDataUrl, onConnected)
    this.nip46Abort = abort

    console.log('[NostrService] Awaiting NIP-46 connect promise...')
    const hexPubkey = await promise
    console.log('[NostrService] NIP-46 connect resolved, hexPubkey:', hexPubkey)
    this.hexPubkey = hexPubkey
    this.loginMethod = 'nip46'
    this.nip46Abort = null

    console.log('[NostrService] Fetching profile...')
    const profile = await this.fetchProfile(hexPubkey)
    console.log('[NostrService] Profile fetched:', profile)
    return profile
  }

  /**
   * Cancel an in-progress NIP-46 connect flow.
   */
  cancelNip46(): void {
    this.nip46Abort?.()
    this.nip46Abort = null
  }

  /**
   * Login via NIP-07 browser extension (Alby, nos2x, etc.).
   */
  async loginWithExtension(): Promise<UserProfile> {
    const hexPubkey = await nip46LoginWithExtension()
    this.hexPubkey = hexPubkey
    this.loginMethod = 'extension'

    return this.fetchProfile(hexPubkey)
  }

  /**
   * Login with nsec (private key). Key is stored in Electron secure storage.
   * Kept for programmatic use; nostr-login's "local" method handles UI nsec.
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



    return this.fetchProfile(hexPubkey)
  }

  /**
   * Restore session from stored NIP-46 session or NIP-07 extension.
   */
  async restoreSession(): Promise<UserProfile | null> {
    // Try NIP-46 session first
    try {
      const hexPubkey = await restoreNip46Session()
      if (hexPubkey) {
        this.hexPubkey = hexPubkey
        this.loginMethod = 'nip46'
        return this.fetchProfile(hexPubkey)
      }
    } catch {
      // Fall through to extension
    }

    // Try NIP-07 extension (only if available, never triggers a modal)
    if (typeof window !== 'undefined' && window.nostr) {
      try {
        const hexPubkey = await window.nostr.getPublicKey()
        this.hexPubkey = hexPubkey
        this.loginMethod = 'extension'
        return this.fetchProfile(hexPubkey)
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
    await clearNip46Session()
    localStorage.removeItem(SESSION_KEY)
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
   * Fetch a profile via Primal cache, falling back to relays.
   */
  async fetchProfile(hexPubkey: string): Promise<UserProfile> {
    console.log('[NostrService] fetchProfile for hex:', hexPubkey)

    // Try Primal first (fast, indexed)
    try {
      const events = await primalCacheQuery('user_profile', { pubkey: hexPubkey }, 0)
      console.log('[NostrService] Primal returned', events.length, 'events')
      const event = events.find((e) => e.pubkey === hexPubkey)
      if (event) {
        console.log('[NostrService] Found matching Primal event')
        return parseKind0Content(event.content, hexPubkey)
      }
      console.log('[NostrService] No matching Primal event for pubkey')
    } catch (err) {
      console.warn('[NostrService] Primal cache query failed:', err)
    }

    // Fallback to relays
    console.log('[NostrService] Trying relay fallback on:', this.relays)
    const event = await this.pool.get(this.relays, {
      kinds: [0],
      authors: [hexPubkey],
    })

    if (!event) {
      console.warn('[NostrService] No kind 0 event found on relays either')
      const npub = hexToNpub(hexPubkey)
      return { id: npub, handle: npub.slice(0, 12) + '…' }
    }

    console.log('[NostrService] Found kind 0 event on relay')
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
   * Fetch multiple profiles via Primal's batch API, falling back to parallel relay fetches.
   */
  async getProfiles(ids: string[]): Promise<Map<string, UserProfile>> {
    const results = new Map<string, UserProfile>()
    if (ids.length === 0) return results

    // Resolve npubs to hex for Primal
    const hexPubkeys = ids.map((id) => {
      const decoded = decodeNostrIdentity(id)
      return decoded ? decoded.pubkey : id
    })

    try {
      const events = await primalCacheQuery('user_infos', { pubkeys: hexPubkeys }, 0)
      const eventsByPubkey = new Map(events.map((e) => [e.pubkey, e]))

      for (let i = 0; i < ids.length; i++) {
        const event = eventsByPubkey.get(hexPubkeys[i])
        if (event) {
          results.set(ids[i], parseKind0Content(event.content, event.pubkey))
        }
      }

      // Fetch any missing profiles from relays
      const missing = ids.filter((id) => !results.has(id))
      if (missing.length > 0) {
        const fallback = await Promise.all(missing.map((id) => this.getProfile(id)))
        missing.forEach((id, i) => {
          if (fallback[i]) results.set(id, fallback[i]!)
        })
      }
    } catch {
      // Full fallback to parallel relay fetches
      const profiles = await Promise.all(ids.map((id) => this.getProfile(id)))
      ids.forEach((id, i) => {
        if (profiles[i]) results.set(id, profiles[i]!)
      })
    }

    return results
  }

  /**
   * Search users via Primal's cache API.
   * Primal indexes all Nostr profiles and provides fast, ranked search.
   */
  async searchUsers(query: string, limit = 10): Promise<UserProfile[]> {
    try {
      const events = await primalCacheQuery('user_search', { query, limit }, 0)
      const seen = new Set<string>()
      return events
        .filter((e) => {
          if (seen.has(e.pubkey)) return false
          seen.add(e.pubkey)
          return true
        })
        .map((e) => parseKind0Content(e.content, e.pubkey))
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
   * Sign an event using the active signing method.
   */
  private async signEvent(eventTemplate: {
    kind: number
    created_at: number
    tags: string[][]
    content: string
  }) {
    if (this.loginMethod === 'nip46') {
      const signer = getActiveBunkerSigner()
      if (signer) return signer.signEvent(eventTemplate)
      throw new Error('NIP-46 signer not available')
    }

    if (this.loginMethod === 'extension' && window.nostr) {
      return window.nostr.signEvent(eventTemplate)
    }

    if (this.loginMethod === 'nsec' && this.secretKey) {
      return finalizeEvent(eventTemplate, this.secretKey)
    }

    throw new Error('No signing method available')
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

// ── Primal Cache API ──────────────────────────────────────

const PRIMAL_CACHE_URL = 'wss://cache2.primal.net/v1'

interface NostrEvent {
  kind: number
  pubkey: string
  content: string
  created_at: number
  tags: string[][]
}

/**
 * Generic Primal cache query. Opens a WebSocket, sends the cache command,
 * collects events matching the filter kind, and resolves on EOSE.
 */
function primalCacheQuery(
  command: string,
  payload: Record<string, unknown>,
  filterKind?: number,
): Promise<NostrEvent[]> {
  return new Promise((resolve, reject) => {
    const subId = command + '_' + Math.random().toString(36).slice(2, 8)
    const events: NostrEvent[] = []
    let ws: WebSocket

    const timeout = setTimeout(() => {
      ws?.close()
      resolve(events)
    }, 5000)

    try {
      ws = new WebSocket(PRIMAL_CACHE_URL)
    } catch (err) {
      clearTimeout(timeout)
      reject(err)
      return
    }

    ws.onopen = () => {
      ws.send(JSON.stringify(['REQ', subId, { cache: [command, payload] }]))
    }

    ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data)
        if (data[0] === 'EVENT' && data[1] === subId) {
          if (filterKind === undefined || data[2]?.kind === filterKind) {
            events.push(data[2])
          }
        }
        if (data[0] === 'EOSE' && data[1] === subId) {
          clearTimeout(timeout)
          ws.close()
          resolve(events)
        }
      } catch {
        // ignore parse errors
      }
    }

    ws.onerror = () => {
      clearTimeout(timeout)
      ws.close()
      resolve(events)
    }
  })
}
