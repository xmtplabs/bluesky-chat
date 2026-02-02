import { identityService } from './identity'

const JETSTREAM_URL = 'wss://jetstream2.us-west.bsky.network/subscribe'
const INDEXER_CACHE_KEY = 'jetstream-indexer-cache'

/**
 * Jetstream event structure for org.xmtp.inbox records
 */
interface JetstreamEvent {
  did: string
  time_us: number
  kind: 'commit' | 'identity' | 'account'
  commit?: {
    rev: string
    operation: 'create' | 'update' | 'delete'
    collection: string
    rkey: string
    record?: {
      id?: string // XMTP inbox ID
      verificationSignature?: string
      createdAt?: string
    }
    cid?: string
  }
}

/**
 * IndexerService connects to ATProto Jetstream to index org.xmtp.inbox records.
 * This enables reverse lookups from XMTP inbox ID to Bluesky DID.
 */
class IndexerService {
  private ws: WebSocket | null = null
  private inboxToDid: Map<string, string> = new Map()
  private didToInbox: Map<string, string> = new Map()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private isConnected = false

  constructor() {
    this.loadCache()
  }

  private loadCache(): void {
    try {
      const cached = localStorage.getItem(INDEXER_CACHE_KEY)
      if (cached) {
        const data = JSON.parse(cached)
        this.inboxToDid = new Map(Object.entries(data.inboxToDid || {}))
        this.didToInbox = new Map(Object.entries(data.didToInbox || {}))
        console.log(`Loaded ${this.inboxToDid.size} indexed mappings from cache`)

        // Register all cached mappings with identity service
        for (const [inboxId, did] of this.inboxToDid) {
          identityService.registerIndexedMapping(inboxId, did)
        }
      }
    } catch (error) {
      console.error('Failed to load indexer cache:', error)
    }
  }

  private saveCache(): void {
    try {
      const data = {
        inboxToDid: Object.fromEntries(this.inboxToDid),
        didToInbox: Object.fromEntries(this.didToInbox)
      }
      localStorage.setItem(INDEXER_CACHE_KEY, JSON.stringify(data))
    } catch (error) {
      console.error('Failed to save indexer cache:', error)
    }
  }

  /**
   * Connect to Jetstream and start indexing org.xmtp.inbox records
   */
  connect(): void {
    if (this.ws && this.isConnected) {
      console.log('Jetstream already connected')
      return
    }

    const url = new URL(JETSTREAM_URL)
    url.searchParams.set('wantedCollections', 'org.xmtp.inbox')

    console.log('Connecting to Jetstream:', url.toString())

    this.ws = new WebSocket(url.toString())

    this.ws.onopen = () => {
      console.log('Jetstream connected')
      this.isConnected = true
      this.reconnectAttempts = 0
    }

    this.ws.onmessage = (event) => {
      try {
        const evt: JetstreamEvent = JSON.parse(event.data)
        this.handleEvent(evt)
      } catch (error) {
        console.error('Failed to parse Jetstream event:', error)
      }
    }

    this.ws.onerror = (error) => {
      console.error('Jetstream error:', error)
    }

    this.ws.onclose = () => {
      console.log('Jetstream disconnected')
      this.isConnected = false
      this.ws = null
      this.attemptReconnect()
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnect attempts reached, giving up')
      return
    }

    this.reconnectAttempts++
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)
    console.log(`Reconnecting to Jetstream in ${delay}ms (attempt ${this.reconnectAttempts})`)

    setTimeout(() => {
      this.connect()
    }, delay)
  }

  private handleEvent(evt: JetstreamEvent): void {
    if (evt.kind !== 'commit' || !evt.commit) {
      return
    }

    const { operation, collection, record } = evt.commit
    const did = evt.did

    if (collection !== 'org.xmtp.inbox') {
      return
    }

    if (operation === 'create' || operation === 'update') {
      if (record?.id) {
        const inboxId = record.id
        console.log(`Indexed org.xmtp.inbox: ${did} -> ${inboxId}`)

        this.inboxToDid.set(inboxId, did)
        this.didToInbox.set(did, inboxId)

        // Register with identity service
        identityService.registerIndexedMapping(inboxId, did)

        // Save to cache periodically (debounced in production)
        this.saveCache()
      }
    } else if (operation === 'delete') {
      const existingInboxId = this.didToInbox.get(did)
      if (existingInboxId) {
        this.inboxToDid.delete(existingInboxId)
        this.didToInbox.delete(did)
        this.saveCache()
      }
    }
  }

  /**
   * Lookup a Bluesky DID from an XMTP inbox ID
   */
  lookupDid(inboxId: string): string | null {
    return this.inboxToDid.get(inboxId) || null
  }

  /**
   * Lookup an XMTP inbox ID from a Bluesky DID
   */
  lookupInbox(did: string): string | null {
    return this.didToInbox.get(did) || null
  }

  /**
   * Disconnect from Jetstream
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
    this.isConnected = false
  }

  /**
   * Get connection status
   */
  isIndexerConnected(): boolean {
    return this.isConnected
  }

  /**
   * Get count of indexed mappings
   */
  getIndexedCount(): number {
    return this.inboxToDid.size
  }
}

export const indexerService = new IndexerService()
