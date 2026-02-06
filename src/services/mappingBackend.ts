/**
 * Client for the DID↔InboxId mapping backend service.
 *
 * Features:
 * - Request deduplication for concurrent lookups
 * - Exponential backoff on 429 rate limit responses
 * - Circuit breaker for backend failures
 * - Bulk lookup support for efficiency
 */

// Backend URL - can be overridden via environment variable
const BACKEND_URL = import.meta.env.VITE_MAPPING_BACKEND_URL ?? 'https://bluesky-chat-mapping-service.xmtp.workers.dev'

// Circuit breaker configuration
const CIRCUIT_BREAKER_THRESHOLD = 5 // Open after 5 consecutive failures
const CIRCUIT_BREAKER_RESET_MS = 60_000 // Try again after 1 minute

// Retry configuration
const MAX_RETRIES = 3
const INITIAL_BACKOFF_MS = 1000
const MAX_BACKOFF_MS = 30_000

interface LookupResponse {
  did: string
  inboxId: string
}

interface BulkResponse {
  mappings: LookupResponse[]
  notFound: string[]
}

interface RegisterRequest {
  did: string
}

type CircuitState = 'closed' | 'open' | 'half-open'

class MappingBackendClient {
  // Request deduplication
  private pendingRequests: Map<string, Promise<LookupResponse | null>> = new Map()
  private pendingBulkRequests: Map<string, Promise<BulkResponse>> = new Map()

  // Circuit breaker state
  private circuitState: CircuitState = 'closed'
  private consecutiveFailures = 0
  private circuitOpenedAt = 0

  // Rate limit backoff state
  private nextRequestAllowedAt = 0

  /**
   * Lookup a DID to get its InboxId.
   * Deduplicates concurrent requests for the same DID.
   */
  async lookupByDid(did: string): Promise<LookupResponse | null> {
    const cacheKey = `did:${did}`

    // Check for pending request
    const pending = this.pendingRequests.get(cacheKey)
    if (pending) {
      return pending
    }

    // Create new request
    const request = this.doLookupByDid(did)
    this.pendingRequests.set(cacheKey, request)

    try {
      return await request
    } finally {
      this.pendingRequests.delete(cacheKey)
    }
  }

  /**
   * Lookup an InboxId to get its DID.
   * Deduplicates concurrent requests for the same inbox.
   */
  async lookupByInbox(inboxId: string): Promise<LookupResponse | null> {
    const cacheKey = `inbox:${inboxId}`

    // Check for pending request
    const pending = this.pendingRequests.get(cacheKey)
    if (pending) {
      return pending
    }

    // Create new request
    const request = this.doLookupByInbox(inboxId)
    this.pendingRequests.set(cacheKey, request)

    try {
      return await request
    } finally {
      this.pendingRequests.delete(cacheKey)
    }
  }

  /**
   * Bulk lookup DIDs to get their InboxIds.
   * More efficient than individual lookups for lists.
   */
  async bulkLookupByDid(dids: string[]): Promise<BulkResponse> {
    if (dids.length === 0) {
      return { mappings: [], notFound: [] }
    }

    // Sort and create cache key from DIDs
    const sortedDids = [...dids].sort()
    const cacheKey = `bulk:did:${sortedDids.join(',')}`

    // Check for pending request
    const pending = this.pendingBulkRequests.get(cacheKey)
    if (pending) {
      return pending
    }

    // Create new request
    const request = this.doBulkLookup('by-did', dids)
    this.pendingBulkRequests.set(cacheKey, request)

    try {
      return await request
    } finally {
      this.pendingBulkRequests.delete(cacheKey)
    }
  }

  /**
   * Bulk lookup InboxIds to get their DIDs.
   */
  async bulkLookupByInbox(inboxIds: string[]): Promise<BulkResponse> {
    if (inboxIds.length === 0) {
      return { mappings: [], notFound: [] }
    }

    // Sort and create cache key
    const sortedIds = [...inboxIds].sort()
    const cacheKey = `bulk:inbox:${sortedIds.join(',')}`

    // Check for pending request
    const pending = this.pendingBulkRequests.get(cacheKey)
    if (pending) {
      return pending
    }

    // Create new request
    const request = this.doBulkLookup('by-inbox', inboxIds)
    this.pendingBulkRequests.set(cacheKey, request)

    try {
      return await request
    } finally {
      this.pendingBulkRequests.delete(cacheKey)
    }
  }

  /**
   * Register a new DID↔InboxId mapping with the backend.
   * Called after publishing to ATProto.
   */
  async registerMapping(params: RegisterRequest): Promise<boolean> {
    if (!this.canMakeRequest()) {
      console.log('[MappingBackend] Skipping register - circuit open or rate limited')
      return false
    }

    try {
      const response = await this.fetchWithRetry(`${BACKEND_URL}/v1/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      })

      if (response.ok) {
        this.recordSuccess()
        return true
      }

      // Not a success, but might not be a failure to track
      if (response.status === 400) {
        // Client error - don't count as circuit breaker failure
        const error = await response.json().catch(() => ({})) as { error?: string }
        console.warn('[MappingBackend] Register rejected:', error.error)
        return false
      }

      this.recordFailure()
      return false
    } catch (error) {
      console.error('[MappingBackend] Register error:', error)
      this.recordFailure()
      return false
    }
  }

  /**
   * Check if the backend is available.
   */
  isAvailable(): boolean {
    return this.canMakeRequest()
  }

  /**
   * Get circuit breaker state for debugging.
   */
  getState(): { circuitState: CircuitState; consecutiveFailures: number } {
    this.checkCircuitState()
    return {
      circuitState: this.circuitState,
      consecutiveFailures: this.consecutiveFailures
    }
  }

  private async doLookupByDid(did: string): Promise<LookupResponse | null> {
    if (!this.canMakeRequest()) {
      return null
    }

    try {
      const response = await this.fetchWithRetry(
        `${BACKEND_URL}/v1/lookup/did/${encodeURIComponent(did)}`
      )

      if (response.ok) {
        this.recordSuccess()
        return await response.json() as LookupResponse
      }

      if (response.status === 404) {
        this.recordSuccess() // 404 is not a failure
        return null
      }

      this.recordFailure()
      return null
    } catch (error) {
      console.error('[MappingBackend] Lookup error:', error)
      this.recordFailure()
      return null
    }
  }

  private async doLookupByInbox(inboxId: string): Promise<LookupResponse | null> {
    if (!this.canMakeRequest()) {
      return null
    }

    try {
      const response = await this.fetchWithRetry(
        `${BACKEND_URL}/v1/lookup/inbox/${encodeURIComponent(inboxId)}`
      )

      if (response.ok) {
        this.recordSuccess()
        return await response.json() as LookupResponse
      }

      if (response.status === 404) {
        this.recordSuccess()
        return null
      }

      this.recordFailure()
      return null
    } catch (error) {
      console.error('[MappingBackend] Lookup error:', error)
      this.recordFailure()
      return null
    }
  }

  private async doBulkLookup(
    type: 'by-did' | 'by-inbox',
    identifiers: string[]
  ): Promise<BulkResponse> {
    if (!this.canMakeRequest()) {
      return { mappings: [], notFound: identifiers }
    }

    try {
      const response = await this.fetchWithRetry(`${BACKEND_URL}/v1/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, identifiers })
      })

      if (response.ok) {
        this.recordSuccess()
        return await response.json() as BulkResponse
      }

      this.recordFailure()
      return { mappings: [], notFound: identifiers }
    } catch (error) {
      console.error('[MappingBackend] Bulk lookup error:', error)
      this.recordFailure()
      return { mappings: [], notFound: identifiers }
    }
  }

  private async fetchWithRetry(url: string, init?: RequestInit): Promise<Response> {
    let lastError: Error | null = null
    let backoffMs = INITIAL_BACKOFF_MS

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      // Wait for rate limit if needed
      const waitTime = this.nextRequestAllowedAt - Date.now()
      if (waitTime > 0) {
        await this.sleep(waitTime)
      }

      try {
        const response = await fetch(url, init)

        // Handle rate limiting
        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get('Retry-After') ?? '1', 10)
          this.nextRequestAllowedAt = Date.now() + retryAfter * 1000

          // Use exponential backoff with jitter
          const jitter = Math.random() * 0.2 * backoffMs
          await this.sleep(Math.min(backoffMs + jitter, MAX_BACKOFF_MS))
          backoffMs *= 2

          continue
        }

        return response
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        // Network error - use exponential backoff
        if (attempt < MAX_RETRIES - 1) {
          const jitter = Math.random() * 0.2 * backoffMs
          await this.sleep(Math.min(backoffMs + jitter, MAX_BACKOFF_MS))
          backoffMs *= 2
        }
      }
    }

    throw lastError ?? new Error('Max retries exceeded')
  }

  private canMakeRequest(): boolean {
    this.checkCircuitState()

    if (this.circuitState === 'open') {
      return false
    }

    return true
  }

  private checkCircuitState(): void {
    if (this.circuitState === 'open') {
      // Check if enough time has passed to try again
      if (Date.now() - this.circuitOpenedAt >= CIRCUIT_BREAKER_RESET_MS) {
        this.circuitState = 'half-open'
      }
    }
  }

  private recordSuccess(): void {
    this.consecutiveFailures = 0

    if (this.circuitState === 'half-open') {
      this.circuitState = 'closed'
    }
  }

  private recordFailure(): void {
    this.consecutiveFailures++

    if (this.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
      this.circuitState = 'open'
      this.circuitOpenedAt = Date.now()
      console.warn('[MappingBackend] Circuit breaker opened after consecutive failures')
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

// Singleton instance
export const mappingBackend = new MappingBackendClient()
