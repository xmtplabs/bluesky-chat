import type { Agent, AtpAgent } from '@atproto/api'
import type { IdentityMapping, BlueskyProfile, XmtpUserStatus } from '../types'
import { verifyInboxOwnership, type VerifyInboxOwnershipResult } from './xmtp'

const IDENTITY_STORE_KEY = 'identity-mappings'
const INDEXED_MAPPINGS_KEY = 'jetstream-indexer-cache' // Shared inbox↔DID mappings
const ATPROTO_COLLECTION = 'org.xmtp.inbox'
const ATPROTO_RKEY = 'self'

// Status cache configuration
const STATUS_CACHE_MAX_SIZE = 500
const NOT_ON_CHAT_TTL_MS = 5 * 60 * 1000 // 5 minutes - re-check "not on chat" users periodically
const VERIFIED_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours - re-verify periodically

type StatusCacheEntry = { status: XmtpUserStatus; timestamp: number }

/**
 * ATProto record structure for org.xmtp.inbox
 * Stores the cryptographic binding between Bluesky DID and XMTP inbox
 */
interface ATProtoInboxRecord {
  $type: 'org.xmtp.inbox'
  id: string // XMTP inbox ID
  verificationSignature: string // base64-encoded signature from signWithInstallationKey(did)
  createdAt: string // ISO timestamp
  [key: string]: unknown // Allow additional properties for ATProto compatibility
}

class IdentityService {
  private mappings: Map<string, IdentityMapping> = new Map()
  private profileCache: Map<string, BlueskyProfile> = new Map()
  // Reverse lookup: inboxId -> DID (single source of truth for all mappings)
  private inboxToDid: Map<string, string> = new Map()
  private didToInbox: Map<string, string> = new Map()
  // Status cache for XMTP user status (verified/not-on-chat) with TTL
  private statusCache: Map<string, StatusCacheEntry> = new Map()
  // Track pending status checks to dedupe concurrent requests
  private pendingStatusChecks: Map<string, Promise<XmtpUserStatus>> = new Map()

  async init(): Promise<void> {
    await this.loadMappings()
    this.loadIndexedMappings()
  }

  private async loadMappings(): Promise<void> {
    try {
      const stored = localStorage.getItem(IDENTITY_STORE_KEY)
      if (stored) {
        const mappingsArray: IdentityMapping[] = JSON.parse(stored)
        this.mappings = new Map(mappingsArray.map((m) => [m.blueskyDid, m]))
        // Build reverse lookup
        for (const mapping of mappingsArray) {
          this.inboxToDid.set(mapping.xmtpInboxId, mapping.blueskyDid)
        }
      }
    } catch (error) {
      console.error('Failed to load identity mappings:', error)
    }
  }

  private async saveMappings(): Promise<void> {
    try {
      const mappingsArray = Array.from(this.mappings.values())
      localStorage.setItem(IDENTITY_STORE_KEY, JSON.stringify(mappingsArray))
    } catch (error) {
      console.error('Failed to save identity mappings:', error)
    }
  }

  private loadIndexedMappings(): void {
    try {
      const cached = localStorage.getItem(INDEXED_MAPPINGS_KEY)
      if (cached) {
        const data = JSON.parse(cached)
        // Merge into existing maps (don't replace - loadMappings may have added entries)
        for (const [inboxId, did] of Object.entries(data.inboxToDid || {})) {
          this.inboxToDid.set(inboxId, did as string)
        }
        for (const [did, inboxId] of Object.entries(data.didToInbox || {})) {
          this.didToInbox.set(did, inboxId as string)
        }
        console.log(`Loaded ${this.inboxToDid.size} indexed mappings from cache`)
      }
    } catch (error) {
      console.error('Failed to load indexed mappings:', error)
    }
  }

  private saveIndexedMappings(): void {
    try {
      const data = {
        inboxToDid: Object.fromEntries(this.inboxToDid),
        didToInbox: Object.fromEntries(this.didToInbox)
      }
      localStorage.setItem(INDEXED_MAPPINGS_KEY, JSON.stringify(data))
    } catch (error) {
      console.error('Failed to save indexed mappings:', error)
    }
  }

  /**
   * Publish the XMTP inbox identity to ATProto PDS.
   * Creates an org.xmtp.inbox record with the inbox ID and verification signature.
   */
  async publishIdentityToATProto(
    agent: Agent | AtpAgent | null,
    inboxId: string,
    signature: string
  ): Promise<void> {
    if (!agent) {
      throw new Error('ATProto agent not available')
    }

    const record: ATProtoInboxRecord = {
      $type: ATPROTO_COLLECTION,
      id: inboxId,
      verificationSignature: signature,
      createdAt: new Date().toISOString()
    }

    // Get the DID from the agent
    let did: string | undefined
    if ('did' in agent && agent.did) {
      did = agent.did
    } else if ('session' in agent && agent.session?.did) {
      did = agent.session.did
    }

    if (!did) {
      throw new Error('Could not determine DID from agent')
    }

    try {
      // Use putRecord to create or update the record
      await agent.com.atproto.repo.putRecord({
        repo: did,
        collection: ATPROTO_COLLECTION,
        rkey: ATPROTO_RKEY,
        record
      })
      console.log('Published org.xmtp.inbox record to ATProto PDS')
    } catch (error) {
      console.error('Failed to publish identity to ATProto:', error)
      throw error
    }
  }

  /**
   * Lookup the XMTP inbox record for a given DID from ATProto.
   * Fetches the org.xmtp.inbox record from the user's PDS.
   *
   * Returns:
   * - { found: true, inboxId, verificationSignature } on success
   * - { found: false, notFound: true } when record doesn't exist (404)
   * - { found: false, notFound: false } on network/other errors
   */
  async lookupInboxForDid(
    did: string
  ): Promise<
    { found: true; inboxId: string; verificationSignature: string } | { found: false; notFound: boolean }
  > {
    try {
      // Use public API to fetch the record
      const response = await fetch(
        `https://bsky.social/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(did)}&collection=${ATPROTO_COLLECTION}&rkey=${ATPROTO_RKEY}`
      )

      if (!response.ok) {
        if (response.status === 404) {
          return { found: false, notFound: true }
        }
        console.error(`Failed to fetch record: ${response.status}`)
        return { found: false, notFound: false }
      }

      const data = await response.json()
      const record = data.value as ATProtoInboxRecord

      if (!record.id || !record.verificationSignature) {
        console.warn('Invalid org.xmtp.inbox record:', record)
        return { found: false, notFound: true } // Treat invalid records as not found
      }

      return {
        found: true,
        inboxId: record.id,
        verificationSignature: record.verificationSignature
      }
    } catch (error) {
      console.error('Failed to lookup inbox for DID:', error)
      return { found: false, notFound: false }
    }
  }

  /**
   * Verify the cryptographic binding between a Bluesky DID and XMTP inbox.
   * Uses Client.verifySignedWithPublicKey to verify the signature.
   */
  async verifyIdentityBinding(
    inboxId: string,
    did: string,
    signature: string
  ): Promise<VerifyInboxOwnershipResult> {
    return verifyInboxOwnership(inboxId, did, signature)
  }

  /**
   * Delete the org.xmtp.inbox record from ATProto PDS.
   * This removes the identity binding between the Bluesky DID and XMTP inbox.
   */
  async deleteIdentityFromATProto(agent: Agent | AtpAgent | null): Promise<void> {
    if (!agent) {
      throw new Error('ATProto agent not available')
    }

    // Get the DID from the agent
    let did: string | undefined
    if ('did' in agent && agent.did) {
      did = agent.did
    } else if ('session' in agent && agent.session?.did) {
      did = agent.session.did
    }

    if (!did) {
      throw new Error('Could not determine DID from agent')
    }

    try {
      await agent.com.atproto.repo.deleteRecord({
        repo: did,
        collection: ATPROTO_COLLECTION,
        rkey: ATPROTO_RKEY
      })
      console.log('Deleted org.xmtp.inbox record from ATProto PDS')

      // Also clear from local cache
      const mapping = this.mappings.get(did)
      if (mapping) {
        this.inboxToDid.delete(mapping.xmtpInboxId)
      }
      this.mappings.delete(did)
      await this.saveMappings()
    } catch (error) {
      // Check if record doesn't exist
      const errorMessage = error instanceof Error ? error.message : String(error)
      if (errorMessage.includes('RecordNotFound') || errorMessage.includes('could not find record')) {
        console.log('No org.xmtp.inbox record found to delete')
        return
      }
      throw error
    }
  }

  /**
   * Resolve a Bluesky DID to an XMTP inbox ID.
   * Always fetches and verifies from ATProto to ensure mapping is current.
   * Use getInboxIdFromDid() for cached lookups (display purposes).
   */
  async resolveDidToInbox(did: string): Promise<string | null> {
    // Check local identity mappings (user's own verified identity)
    const cached = this.mappings.get(did)
    if (cached) {
      return cached.xmtpInboxId
    }

    // Always fetch and verify from ATProto for other users
    const result = await this.lookupInboxForDid(did)
    if (!result.found) {
      // Only clear cache on explicit 404 (record deleted), not on network errors
      if (result.notFound) {
        const staleInbox = this.didToInbox.get(did)
        if (staleInbox) {
          this.unregisterIndexedMapping(did)
        }
      }
      return null
    }

    // Verify the signature
    const verifyResult = await this.verifyIdentityBinding(result.inboxId, did, result.verificationSignature)
    if (!verifyResult.verified) {
      console.warn('Identity binding verification failed for DID:', did)
      // Only clear cache on definitive verification failures, not network errors
      if (verifyResult.definitive) {
        const staleInbox = this.didToInbox.get(did)
        if (staleInbox) {
          this.unregisterIndexedMapping(did)
        }
      }
      return null
    }

    // Update cache with verified mapping
    this.registerIndexedMapping(result.inboxId, did)

    return result.inboxId
  }

  /**
   * Resolve an XMTP inbox ID to a Bluesky DID.
   * Uses local cache and indexer for reverse lookups.
   */
  async resolveInboxToDid(inboxId: string): Promise<string | null> {
    // Check local cache first
    const cached = this.inboxToDid.get(inboxId)
    if (cached) {
      return cached
    }

    // The indexer will populate this map via Jetstream
    // For now, return null if not in cache
    // In production, this would query an indexer service
    return null
  }

  // Link a Bluesky DID to an XMTP inbox ID (local cache)
  async linkIdentity(
    blueskyDid: string,
    blueskyHandle: string,
    xmtpInboxId: string,
    verificationSignature: string
  ): Promise<void> {
    const mapping: IdentityMapping = {
      blueskyDid,
      blueskyHandle,
      xmtpInboxId,
      verificationSignature,
      createdAt: Date.now()
    }

    this.mappings.set(blueskyDid, mapping)
    this.inboxToDid.set(xmtpInboxId, blueskyDid)
    await this.saveMappings()
  }

  // Get XMTP inbox ID from Bluesky DID
  getInboxIdFromDid(blueskyDid: string): string | undefined {
    // Check local identity mappings first (own identity)
    const localMapping = this.mappings.get(blueskyDid)?.xmtpInboxId
    if (localMapping) return localMapping
    // Fall back to indexed mappings (other users)
    return this.didToInbox.get(blueskyDid)
  }

  // Get Bluesky DID from XMTP inbox ID
  getDidFromInboxId(inboxId: string): string | undefined {
    return this.inboxToDid.get(inboxId)
  }

  // Get Bluesky handle from XMTP inbox ID
  getHandleFromInboxId(inboxId: string): string | undefined {
    const did = this.inboxToDid.get(inboxId)
    if (!did) return undefined
    return this.mappings.get(did)?.blueskyHandle
  }

  // Get full mapping by inbox ID
  getMappingByInboxId(inboxId: string): IdentityMapping | undefined {
    const did = this.inboxToDid.get(inboxId)
    if (!did) return undefined
    return this.mappings.get(did)
  }

  // Get full mapping by DID
  getMappingByDid(blueskyDid: string): IdentityMapping | undefined {
    return this.mappings.get(blueskyDid)
  }

  // Cache a profile for quick lookup
  cacheProfile(profile: BlueskyProfile): void {
    this.profileCache.set(profile.did, profile)
    if (profile.handle) {
      this.profileCache.set(profile.handle, profile)
    }
  }

  // Get cached profile
  getCachedProfile(didOrHandle: string): BlueskyProfile | undefined {
    return this.profileCache.get(didOrHandle)
  }

  // Get all known inbox IDs (for checking who can message)
  getAllKnownInboxIds(): string[] {
    return Array.from(this.mappings.values()).map((m) => m.xmtpInboxId)
  }

  // Register an inbox↔DID mapping (from indexer or ATProto lookup)
  registerIndexedMapping(inboxId: string, did: string): void {
    const existingDid = this.inboxToDid.get(inboxId)
    const existingInbox = this.didToInbox.get(did)

    // Already have this exact mapping
    if (existingDid === did && existingInbox === inboxId) {
      return
    }

    // DID re-linked to a new inbox - clean up old reverse mapping
    if (existingInbox && existingInbox !== inboxId) {
      this.inboxToDid.delete(existingInbox)
    }

    // Inbox re-linked to a new DID - clean up old reverse mapping
    if (existingDid && existingDid !== did) {
      this.didToInbox.delete(existingDid)
    }

    this.inboxToDid.set(inboxId, did)
    this.didToInbox.set(did, inboxId)
    this.saveIndexedMappings()
  }

  // Remove an inbox↔DID mapping (called when indexer sees a delete event)
  unregisterIndexedMapping(did: string): void {
    const inboxId = this.didToInbox.get(did)
    if (inboxId) {
      this.inboxToDid.delete(inboxId)
      this.didToInbox.delete(did)
      this.saveIndexedMappings()
    }
  }

  // Remove a mapping
  async removeMapping(blueskyDid: string): Promise<void> {
    const mapping = this.mappings.get(blueskyDid)
    if (mapping) {
      this.inboxToDid.delete(mapping.xmtpInboxId)
    }
    this.mappings.delete(blueskyDid)
    await this.saveMappings()
  }

  /**
   * Check XMTP status for a user with caching.
   * Returns cached status if valid, otherwise fetches and verifies.
   * Dedupes concurrent requests for the same DID.
   */
  async checkXmtpStatus(did: string): Promise<XmtpUserStatus> {
    // Check cache first
    const cached = this.statusCache.get(did)
    if (cached && this.isStatusCacheValid(cached)) {
      return cached.status
    }

    // Check for pending request (dedupe concurrent calls)
    const pending = this.pendingStatusChecks.get(did)
    if (pending) {
      return pending
    }

    // Create new request
    const request = this.fetchAndCacheStatus(did)
    this.pendingStatusChecks.set(did, request)

    try {
      return await request
    } finally {
      this.pendingStatusChecks.delete(did)
    }
  }

  private isStatusCacheValid(entry: StatusCacheEntry): boolean {
    const age = Date.now() - entry.timestamp
    if (entry.status === 'verified') {
      return age < VERIFIED_TTL_MS
    }
    return age < NOT_ON_CHAT_TTL_MS
  }

  private async fetchAndCacheStatus(did: string): Promise<XmtpUserStatus> {
    const inboxId = await this.resolveDidToInbox(did)
    const status: XmtpUserStatus = inboxId ? 'verified' : 'not-on-chat'

    // Evict oldest entry if at capacity
    if (this.statusCache.size >= STATUS_CACHE_MAX_SIZE) {
      const oldestKey = this.statusCache.keys().next().value
      if (oldestKey) this.statusCache.delete(oldestKey)
    }

    this.statusCache.set(did, { status, timestamp: Date.now() })
    return status
  }

  // Clear status cache (called on logout)
  clearStatusCache(): void {
    this.statusCache.clear()
    this.pendingStatusChecks.clear()
  }

  // Clear all mappings and caches
  async clearAll(): Promise<void> {
    this.mappings.clear()
    this.profileCache.clear()
    this.inboxToDid.clear()
    this.didToInbox.clear()
    this.statusCache.clear()
    this.pendingStatusChecks.clear()
    await this.saveMappings()
  }

  // Clear only the profile cache (for logout - keeps identity mappings)
  clearProfileCache(): void {
    this.profileCache.clear()
  }
}

export const identityService = new IdentityService()
