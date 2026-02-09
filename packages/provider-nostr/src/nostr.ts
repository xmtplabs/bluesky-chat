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
  'wss://relay.primal.net',
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.snort.social',
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
  async loginViaNip46(onQrDataUrl: (dataUrl: string) => void, onConnected?: () => void, onIdentityReady?: (identityId: string) => void): Promise<UserProfile> {
    console.log('[NostrService] loginViaNip46 called, relays:', this.relays)
    // Convert hex pubkey to npub for the identity-ready callback
    const onPubkeyReady = onIdentityReady
      ? (hexPubkey: string) => onIdentityReady(hexToNpub(hexPubkey))
      : undefined
    const { promise, abort } = startNip46Connect(this.relays, onQrDataUrl, onConnected, onPubkeyReady)
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
   * Fetch a kind 0 (metadata) event via Primal cache, falling back to relays.
   * Shared by fetchProfile, publishInboxBinding, lookupInboxBinding, and deleteInboxBinding.
   */
  private async fetchKind0(hexPubkey: string): Promise<NostrEvent | null> {
    console.log('[NostrService] fetchKind0 for:', hexPubkey.slice(0, 12))
    // Try Primal first (fast, indexed)
    try {
      const events = await primalCacheQuery('user_profile', { pubkey: hexPubkey }, 0)
      console.log('[NostrService] fetchKind0: Primal returned', events.length, 'events')
      const event = events.find((e) => e.pubkey === hexPubkey)
      if (event) {
        console.log('[NostrService] fetchKind0: found via Primal')
        return event
      }
    } catch (err) {
      console.warn('[NostrService] Primal cache query failed:', err)
    }

    // Fallback to relays with timeout (pool.get can hang if relays are unresponsive)
    console.log('[NostrService] fetchKind0: trying relay fallback...')
    try {
      const event = await Promise.race([
        this.pool.get(this.relays, { kinds: [0], authors: [hexPubkey] }),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 8000)),
      ])
      if (event) {
        console.log('[NostrService] fetchKind0: found via relay')
      } else {
        console.log('[NostrService] fetchKind0: not found (relay timeout or no event)')
      }
      return event
    } catch {
      console.warn('[NostrService] fetchKind0: relay fallback failed')
      return null
    }
  }

  /**
   * Fetch a profile via Primal cache, falling back to relays.
   */
  async fetchProfile(hexPubkey: string): Promise<UserProfile> {
    const event = await this.fetchKind0(hexPubkey)

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
    const existing = await this.fetchKind0(this.hexPubkey)

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

    console.log('[NostrService] publishInboxBinding: requesting NIP-46 sign...')
    const signedEvent = await this.signEvent(eventTemplate)
    console.log('[NostrService] publishInboxBinding: sign succeeded, publishing to relays...')

    // Publish to all relays
    const results = await Promise.allSettled(
      this.pool.publish(this.relays, signedEvent)
    )
    const ok = results.filter(r => r.status === 'fulfilled').length
    const fail = results.filter(r => r.status === 'rejected').length
    console.log(`[NostrService] publishInboxBinding: published to ${ok}/${ok + fail} relays`)
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
      const event = await this.fetchKind0(hexPubkey)

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

    const existing = await this.fetchKind0(this.hexPubkey)
    if (!existing) return

    let metadata: Record<string, unknown>
    try {
      metadata = JSON.parse(existing.content)
    } catch {
      return
    }

    if (!metadata.xmtp) return
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
      if (!signer) throw new Error('NIP-46 signer not available')
      console.log('[NostrService] signEvent: sending NIP-46 sign_event RPC for kind', eventTemplate.kind)
      console.log('[NostrService] signEvent: signer relays:', signer.bp?.relays)
      return Promise.race([
        signer.signEvent(eventTemplate).then((result) => {
          console.log('[NostrService] signEvent: signer responded successfully')
          return result
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => {
            console.warn('[NostrService] signEvent: 15s timeout — no response from signer')
            reject(new Error('NIP-46 sign timed out (signer unresponsive)'))
          }, 15000),
        ),
      ])
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
// Persistent WebSocket connection to Primal's caching service,
// matching the pattern used by Primal's own web app:
// single connection, multiplexed subscriptions via subId.

const PRIMAL_CACHE_URL = 'wss://cache2.primal.net/v1'

interface NostrEvent {
  kind: number
  pubkey: string
  content: string
  created_at: number
  tags: string[][]
}

interface PendingSub {
  events: NostrEvent[]
  filterKind?: number
  resolve: (events: NostrEvent[]) => void
  timeout: ReturnType<typeof setTimeout>
}

let primalSocket: WebSocket | null = null
let primalSubs = new Map<string, PendingSub>()
let primalReady: Promise<void> | null = null
let primalQueue: string[] = [] // messages queued while connecting

function getPrimalSocket(): Promise<void> {
  if (primalSocket?.readyState === WebSocket.OPEN) {
    return Promise.resolve()
  }

  if (primalReady && primalSocket?.readyState === WebSocket.CONNECTING) {
    return primalReady
  }

  // Close stale socket if any
  if (primalSocket) {
    try { primalSocket.close() } catch { /* ignore */ }
    primalSocket = null
  }

  primalReady = new Promise<void>((resolve, reject) => {
    try {
      primalSocket = new WebSocket(PRIMAL_CACHE_URL)
    } catch (err) {
      primalReady = null
      reject(err)
      return
    }

    primalSocket.onopen = () => {
      // Flush queued messages
      for (const msg of primalQueue) {
        primalSocket!.send(msg)
      }
      primalQueue = []
      resolve()
    }

    primalSocket.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data)
        const subId = data[1]
        const sub = primalSubs.get(subId)
        if (!sub) return

        if (data[0] === 'EVENT' && data[2]) {
          if (sub.filterKind === undefined || data[2].kind === sub.filterKind) {
            sub.events.push(data[2])
          }
        }
        if (data[0] === 'EOSE') {
          clearTimeout(sub.timeout)
          sub.resolve(sub.events)
          primalSubs.delete(subId)
        }
      } catch {
        // ignore parse errors
      }
    }

    primalSocket.onerror = () => {
      // Resolve all pending subs with whatever they have
      for (const [id, sub] of primalSubs) {
        clearTimeout(sub.timeout)
        sub.resolve(sub.events)
      }
      primalSubs.clear()
      primalSocket = null
      primalReady = null
    }

    primalSocket.onclose = () => {
      // Resolve any remaining subs
      for (const [id, sub] of primalSubs) {
        clearTimeout(sub.timeout)
        sub.resolve(sub.events)
      }
      primalSubs.clear()
      primalSocket = null
      primalReady = null
    }
  })

  return primalReady
}

function primalCacheQuery(
  command: string,
  payload: Record<string, unknown>,
  filterKind?: number,
): Promise<NostrEvent[]> {
  return new Promise<NostrEvent[]>(async (resolve) => {
    const subId = command + '_' + Math.random().toString(36).slice(2, 8)

    const timeout = setTimeout(() => {
      const sub = primalSubs.get(subId)
      if (sub) {
        sub.resolve(sub.events)
        primalSubs.delete(subId)
      }
    }, 5000)

    primalSubs.set(subId, { events: [], filterKind, resolve, timeout })

    try {
      await getPrimalSocket()
      const msg = JSON.stringify(['REQ', subId, { cache: [command, payload] }])
      if (primalSocket?.readyState === WebSocket.OPEN) {
        primalSocket.send(msg)
      } else {
        // Socket not ready yet — queue it
        primalQueue.push(msg)
      }
    } catch {
      clearTimeout(timeout)
      primalSubs.delete(subId)
      resolve([])
    }
  })
}
