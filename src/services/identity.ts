import type { IdentityMapping, UserProfile, XmtpUserStatus } from '../types'
import { provider } from '../provider'
import { verifyInboxOwnership, type VerifyInboxOwnershipResult } from './xmtp'
import { mappingBackend } from './mappingBackend'

const IDENTITY_STORE_KEY = 'identity-mappings'
const CACHED_MAPPINGS_KEY = 'jetstream-indexer-cache' // Local inbox↔DID mapping cache

// Status cache configuration
const STATUS_CACHE_MAX_SIZE = 500
const NOT_ON_CHAT_TTL_MS = 5 * 60 * 1000 // 5 minutes - re-check "not on chat" users periodically
const VERIFIED_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours - re-verify periodically

type StatusCacheEntry = { status: XmtpUserStatus; timestamp: number }

class IdentityService {
  private mappings: Map<string, IdentityMapping> = new Map()
  private profileCache: Map<string, UserProfile> = new Map()
  // Reverse lookup: inboxId -> DID (single source of truth for all mappings)
  private inboxToDid: Map<string, string> = new Map()
  private idToInbox: Map<string, string> = new Map()
  // Status cache for XMTP user status (verified/not-on-chat) with TTL
  private statusCache: Map<string, StatusCacheEntry> = new Map()
  // Track pending status checks to dedupe concurrent requests
  private pendingStatusChecks: Map<string, Promise<XmtpUserStatus>> = new Map()

  async init(): Promise<void> {
    await this.loadMappings()
    this.loadCachedMappings()
  }

  private async loadMappings(): Promise<void> {
    try {
      const stored = localStorage.getItem(IDENTITY_STORE_KEY)
      if (stored) {
        const raw = JSON.parse(stored)
        // Migrate old field names (blueskyDid → identityId, blueskyHandle → identityHandle)
        const mappingsArray = raw.map((m: Record<string, unknown>) => ({
          identityId: m.identityId ?? m.blueskyDid,
          identityHandle: m.identityHandle ?? m.blueskyHandle,
          xmtpInboxId: m.xmtpInboxId,
          verificationSignature: m.verificationSignature,
          createdAt: m.createdAt,
        })) as IdentityMapping[]
        this.mappings = new Map(mappingsArray.map((m) => [m.identityId, m]))
        // Build reverse lookup
        for (const mapping of mappingsArray) {
          this.inboxToDid.set(mapping.xmtpInboxId, mapping.identityId)
        }
        // Save migrated format
        await this.saveMappings()
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

  private loadCachedMappings(): void {
    try {
      const cached = localStorage.getItem(CACHED_MAPPINGS_KEY)
      if (cached) {
        const data = JSON.parse(cached)
        // Merge into existing maps (don't replace - loadMappings may have added entries)
        for (const [inboxId, did] of Object.entries(data.inboxToDid || {})) {
          this.inboxToDid.set(inboxId, did as string)
        }
        for (const [did, inboxId] of Object.entries(data.idToInbox || data.didToInbox || {})) {
          this.idToInbox.set(did, inboxId as string)
        }
        console.log(`Loaded ${this.inboxToDid.size} cached mappings`)
      }
    } catch (error) {
      console.error('Failed to load cached mappings:', error)
    }
  }

  private saveCachedMappings(): void {
    try {
      const data = {
        inboxToDid: Object.fromEntries(this.inboxToDid),
        idToInbox: Object.fromEntries(this.idToInbox)
      }
      localStorage.setItem(CACHED_MAPPINGS_KEY, JSON.stringify(data))
    } catch (error) {
      console.error('Failed to save cached mappings:', error)
    }
  }


  /**
   * Verify the cryptographic binding between an identity ID and XMTP inbox.
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
   * Resolve an identity ID to an XMTP inbox ID.
   * Uses a 3-tier fallback strategy:
   * 1. Local cache (instant, includes user's own identity)
   * 2. Backend (fast, pre-verified global cache)
   * 3. Direct ATProto lookup (ultimate source of truth)
   *
   * Use getInboxIdFromId() for synchronous cached lookups (display purposes).
   */
  async resolveIdToInbox(did: string): Promise<string | null> {
    // Tier 1: Check local caches first (instant)
    // User's own verified identity (instant, already verified at link time)
    const ownMapping = this.mappings.get(did)
    if (ownMapping) {
      return ownMapping.xmtpInboxId
    }
    // Note: We intentionally do NOT short-circuit on local cache (didToInbox)
    // here. That cache is for display purposes via getInboxIdFromId(). For authoritative
    // lookups, we must verify through backend or ATProto.

    // Tier 2: Try backend service (fast, pre-verified)
    if (mappingBackend.isAvailable()) {
      try {
        const backendResult = await mappingBackend.lookupByDid(did)
        if (backendResult) {
          // Backend already verified, update local cache
          this.cacheMapping(backendResult.inboxId, did)
          return backendResult.inboxId
        }
        // Backend returned null - fall through to ATProto
      } catch (error) {
        console.warn('Backend lookup failed, falling back to ATProto:', error)
      }
    }

    // Tier 3: Fetch and verify from ATProto (source of truth)
    // This is a fallback - if we're hitting this often, the backend may be behind
    console.log(`[identity] Provider fallback for DID lookup: ${did} (backend had no record)`)
    const result = await provider.lookupInboxForIdentity(did)
    if (!result.found) {
      // Only clear cache on explicit 404 (record deleted), not on network errors
      if (result.notFound) {
        const staleInbox = this.idToInbox.get(did)
        if (staleInbox) {
          this.uncacheMapping(did)
        }
      }
      return null
    }

    // Verify the signature
    console.log(`[identity] Verifying ATProto record for ${did}: inboxId=${result.inboxId.slice(0, 16)}...`)
    const verifyResult = await this.verifyIdentityBinding(result.inboxId, did, result.verificationSignature)
    if (!verifyResult.verified) {
      console.warn(`[identity] Verification failed for ${did}: definitive=${verifyResult.definitive}`)
      // Only clear cache on definitive verification failures, not network errors
      if (verifyResult.definitive) {
        const staleInbox = this.idToInbox.get(did)
        if (staleInbox) {
          this.uncacheMapping(did)
        }
      }
      return null
    }

    // Update cache with verified mapping
    this.cacheMapping(result.inboxId, did)

    // Report to backend so it can index this mapping (fire-and-forget)
    // This helps the backend catch up on mappings Jetstream may have missed
    console.log(`[identity] Reporting discovered mapping to backend: ${did}`)
    mappingBackend.registerMapping({ id: did }).then((success) => {
      console.log(`[identity] Backend registration result: ${success ? 'success' : 'failed'}`)
    }).catch(() => {
      // Non-critical - we already have the mapping locally
    })

    return result.inboxId
  }

  /**
   * Resolve an XMTP inbox ID to an identity ID.
   * Uses a 2-tier fallback:
   * 1. Local cache (instant)
   * 2. Backend service (global cache)
   */
  async resolveInboxToId(inboxId: string): Promise<string | null> {
    // Check local cache first
    const cached = this.inboxToDid.get(inboxId)
    if (cached) {
      return cached
    }

    // Try backend service
    if (mappingBackend.isAvailable()) {
      try {
        const backendResult = await mappingBackend.lookupByInbox(inboxId)
        if (backendResult) {
          // Update local cache
          this.cacheMapping(backendResult.inboxId, backendResult.id)
          return backendResult.id
        }
      } catch (error) {
        console.warn('Backend reverse lookup failed:', error)
      }
    }

    return null
  }

  /**
   * Bulk resolve multiple DIDs to inbox IDs.
   * More efficient than individual lookups for lists (e.g., conversation list).
   * Returns a map of DID -> inboxId for found mappings.
   */
  async bulkResolveIdToInbox(dids: string[]): Promise<Map<string, string>> {
    const results = new Map<string, string>()
    const uncachedDids: string[] = []

    // First pass: check local caches
    for (const did of dids) {
      // Check local identity mappings (user's own verified identity)
      const localMapping = this.mappings.get(did)
      if (localMapping) {
        results.set(did, localMapping.xmtpInboxId)
        continue
      }

      // Check cached mappings
      const cachedInbox = this.idToInbox.get(did)
      if (cachedInbox) {
        results.set(did, cachedInbox)
        continue
      }

      uncachedDids.push(did)
    }

    // Second pass: bulk lookup uncached DIDs via backend
    if (uncachedDids.length > 0 && mappingBackend.isAvailable()) {
      try {
        const backendResults = await mappingBackend.bulkLookupByDid(uncachedDids)

        for (const mapping of backendResults.mappings) {
          results.set(mapping.id, mapping.inboxId)
          // Update local cache
          this.cacheMapping(mapping.inboxId, mapping.id)
        }
      } catch (error) {
        console.warn('Backend bulk lookup failed:', error)
      }
    }

    return results
  }

  /**
   * Bulk resolve multiple inbox IDs to DIDs.
   * Returns a map of inboxId -> DID for found mappings.
   */
  async bulkResolveInboxToId(inboxIds: string[]): Promise<Map<string, string>> {
    const results = new Map<string, string>()
    const uncachedIds: string[] = []

    // First pass: check local cache
    for (const inboxId of inboxIds) {
      const cachedDid = this.inboxToDid.get(inboxId)
      if (cachedDid) {
        results.set(inboxId, cachedDid)
      } else {
        uncachedIds.push(inboxId)
      }
    }

    // Second pass: bulk lookup via backend
    if (uncachedIds.length > 0 && mappingBackend.isAvailable()) {
      try {
        const backendResults = await mappingBackend.bulkLookupByInbox(uncachedIds)

        for (const mapping of backendResults.mappings) {
          results.set(mapping.inboxId, mapping.id)
          // Update local cache
          this.cacheMapping(mapping.inboxId, mapping.id)
        }
      } catch (error) {
        console.warn('Backend bulk reverse lookup failed:', error)
      }
    }

    return results
  }

  // Link an identity to an XMTP inbox ID (local cache)
  async linkIdentity(
    identityId: string,
    identityHandle: string,
    xmtpInboxId: string,
    verificationSignature: string
  ): Promise<void> {
    const mapping: IdentityMapping = {
      identityId,
      identityHandle,
      xmtpInboxId,
      verificationSignature,
      createdAt: Date.now()
    }

    this.mappings.set(identityId, mapping)
    this.inboxToDid.set(xmtpInboxId, identityId)
    await this.saveMappings()
  }

  // Get XMTP inbox ID from identity ID (synchronous cache lookup)
  getInboxIdFromId(identityId: string): string | undefined {
    // Check local identity mappings first (own identity)
    const localMapping = this.mappings.get(identityId)?.xmtpInboxId
    if (localMapping) return localMapping
    // Fall back to cached mappings (other users)
    return this.idToInbox.get(identityId)
  }

  /**
   * Resolve a DID to an inbox ID, checking the local cache first.
   * Convenience wrapper over getInboxIdFromId() + resolveIdToInbox().
   */
  async resolveIdToInboxCached(did: string): Promise<string | undefined> {
    return this.getInboxIdFromId(did) || await this.resolveIdToInbox(did) || undefined
  }

  // Get identity ID from XMTP inbox ID
  getIdFromInboxId(inboxId: string): string | undefined {
    return this.inboxToDid.get(inboxId)
  }

  // Get handle from XMTP inbox ID
  getHandleFromInboxId(inboxId: string): string | undefined {
    const did = this.inboxToDid.get(inboxId)
    if (!did) return undefined
    return this.mappings.get(did)?.identityHandle
  }

  // Get full mapping by inbox ID
  getMappingByInboxId(inboxId: string): IdentityMapping | undefined {
    const did = this.inboxToDid.get(inboxId)
    if (!did) return undefined
    return this.mappings.get(did)
  }

  // Get full mapping by identity ID
  getMappingById(identityId: string): IdentityMapping | undefined {
    return this.mappings.get(identityId)
  }

  // Cache a profile for quick lookup
  cacheProfile(profile: UserProfile): void {
    this.profileCache.set(profile.id, profile)
    if (profile.handle) {
      this.profileCache.set(profile.handle, profile)
    }
  }

  // Get cached profile
  getCachedProfile(didOrHandle: string): UserProfile | undefined {
    return this.profileCache.get(didOrHandle)
  }

  // Get all known inbox IDs (for checking who can message)
  getAllKnownInboxIds(): string[] {
    return Array.from(this.mappings.values()).map((m) => m.xmtpInboxId)
  }

  // Cache an inbox↔DID mapping locally
  cacheMapping(inboxId: string, did: string): void {
    const existingDid = this.inboxToDid.get(inboxId)
    const existingInbox = this.idToInbox.get(did)

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
      this.idToInbox.delete(existingDid)
    }

    this.inboxToDid.set(inboxId, did)
    this.idToInbox.set(did, inboxId)
    this.saveCachedMappings()
  }

  // Remove an inbox↔DID mapping from local cache
  uncacheMapping(did: string): void {
    const inboxId = this.idToInbox.get(did)
    if (inboxId) {
      this.inboxToDid.delete(inboxId)
      this.idToInbox.delete(did)
      this.saveCachedMappings()
    }
  }

  // Remove a mapping
  async removeMapping(identityId: string): Promise<void> {
    const mapping = this.mappings.get(identityId)
    if (mapping) {
      this.inboxToDid.delete(mapping.xmtpInboxId)
    }
    this.mappings.delete(identityId)
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
    const inboxId = await this.resolveIdToInbox(did)
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
    this.idToInbox.clear()
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
