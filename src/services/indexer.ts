import { identityService } from './identity'

const JETSTREAM_URL = 'wss://jetstream2.us-west.bsky.network/subscribe'

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
 * IndexerService connects to ATProto Jetstream to watch org.xmtp.inbox records.
 * Forwards discovered mappings to IdentityService for storage.
 */
class IndexerService {
  private ws: WebSocket | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private isConnected = false

  /**
   * Connect to Jetstream and start watching org.xmtp.inbox records
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
        console.log(`Indexed org.xmtp.inbox: ${did} -> ${record.id}`)
        identityService.registerIndexedMapping(record.id, did)
      }
    } else if (operation === 'delete') {
      identityService.unregisterIndexedMapping(did)
    }
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
}

export const indexerService = new IndexerService()
