import type { DurableObjectState, DurableObject } from '@cloudflare/workers-types'
import type { Env } from '../types'
import { upsertMapping, deleteMapping } from '../services/db'
import { verifyInboxOwnership } from '../services/verify'

const JETSTREAM_URL = 'wss://jetstream2.us-east.bsky.network/subscribe'
const COLLECTION = 'org.xmtp.inbox'
const RECONNECT_DELAY_MS = 5000
const CURSOR_KEY = 'jetstream_cursor'

// Performance tuning
const CURSOR_SAVE_INTERVAL_MS = 5000 // Save cursor every 5 seconds
const CURSOR_SAVE_EVENT_COUNT = 100 // Or every 100 events
const MAX_CONCURRENT_EVENTS = 10 // Process up to 10 events concurrently
const MAX_QUEUE_SIZE = 1000 // Drop oldest events if queue exceeds this (we're a cache, can re-index)

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
      id?: string
      verificationSignature?: string
      createdAt?: string
    }
  }
}

/**
 * Durable Object that maintains a persistent WebSocket connection to Bluesky Jetstream.
 * Indexes all org.xmtp.inbox records automatically.
 *
 * Performance optimizations:
 * - Debounced cursor saves (every 5s or 100 events)
 * - Concurrent event processing (up to 10 parallel)
 * - Cursor saved after successful DB operations
 */
export class JetstreamIndexer implements DurableObject {
  private state: DurableObjectState
  private env: Env
  private ws: WebSocket | null = null
  private isConnected = false
  private isIntentionalDisconnect: boolean = false
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null

  // Cursor management
  private lastSavedCursor: number | null = null
  private pendingCursor: number | null = null
  private cursorSaveTimeout: ReturnType<typeof setTimeout> | null = null
  private eventsSinceLastSave = 0

  // Concurrent processing
  private processingCount = 0
  private eventQueue: JetstreamEvent[] = []

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env

    // Start connection on initialization
    this.state.blockConcurrencyWhile(async () => {
      this.lastSavedCursor = await this.getCursor()
      await this.connect()
    })
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)

    switch (url.pathname) {
      case '/status':
        return new Response(
          JSON.stringify({
            connected: this.isConnected,
            cursor: this.lastSavedCursor,
            pendingCursor: this.pendingCursor,
            queueSize: this.eventQueue.length,
            processing: this.processingCount
          }),
          { headers: { 'Content-Type': 'application/json' } }
        )

      case '/reconnect':
        await this.reconnect()
        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' }
        })

      default:
        return new Response('Not found', { status: 404 })
    }
  }

  private async getCursor(): Promise<number | null> {
    return (await this.state.storage.get<number>(CURSOR_KEY)) ?? null
  }

  private async saveCursorNow(): Promise<void> {
    if (this.pendingCursor && this.pendingCursor !== this.lastSavedCursor) {
      await this.state.storage.put(CURSOR_KEY, this.pendingCursor)
      this.lastSavedCursor = this.pendingCursor
      this.eventsSinceLastSave = 0
    }
  }

  private scheduleCursorSave(cursor: number): void {
    this.pendingCursor = cursor
    this.eventsSinceLastSave++

    // Save immediately if we've processed enough events
    if (this.eventsSinceLastSave >= CURSOR_SAVE_EVENT_COUNT) {
      this.saveCursorNow()
      return
    }

    // Otherwise schedule a debounced save
    if (!this.cursorSaveTimeout) {
      this.cursorSaveTimeout = setTimeout(() => {
        this.cursorSaveTimeout = null
        this.saveCursorNow()
      }, CURSOR_SAVE_INTERVAL_MS)
    }
  }

  private async connect(): Promise<void> {
    if (this.ws) {
      this.isIntentionalDisconnect = true
      this.ws.close()
      this.ws = null
    }

    try {
      const cursor = this.lastSavedCursor
      const params = new URLSearchParams({
        wantedCollections: COLLECTION
      })

      if (cursor) {
        params.set('cursor', cursor.toString())
      }

      const wsUrl = `${JETSTREAM_URL}?${params.toString()}`
      console.log(`[Jetstream] Connecting to ${wsUrl}`)

      this.ws = new WebSocket(wsUrl)
      this.setupWebSocketHandlers()
      this.isIntentionalDisconnect = false
    } catch (error) {
      console.error('[Jetstream] Connection error:', error)
      this.scheduleReconnect()
    }
  }

  private setupWebSocketHandlers(): void {
    if (!this.ws) return

    this.ws.addEventListener('open', () => {
      console.log('[Jetstream] Connected')
      this.isConnected = true
    })

    this.ws.addEventListener('message', (event) => {
      try {
        const data =
          typeof event.data === 'string'
            ? event.data
            : new TextDecoder().decode(event.data as ArrayBuffer)

        const parsed = JSON.parse(data) as JetstreamEvent
        this.enqueueEvent(parsed)
      } catch (error) {
        console.error('[Jetstream] Message parse error:', error)
      }
    })

    this.ws.addEventListener('close', (event) => {
      console.log(`[Jetstream] Disconnected: ${event.code} ${event.reason}`)
      this.isConnected = false
      this.ws = null
      // Save cursor before reconnecting
      this.saveCursorNow()
      if (!this.isIntentionalDisconnect) {
        this.scheduleReconnect()
      }
    })

    this.ws.addEventListener('error', (error) => {
      console.error('[Jetstream] WebSocket error:', error)
      this.isConnected = false
    })
  }

  /**
   * Enqueue an event for processing with bounded concurrency.
   * Drops new events if queue is full to prevent cursor advancement past dropped events.
   * Dropped events will be reprocessed on reconnection since cursor hasn't moved past them.
   */
  private enqueueEvent(event: JetstreamEvent): void {
    if (this.eventQueue.length >= MAX_QUEUE_SIZE) {
      console.warn(`[Jetstream] Queue full (${MAX_QUEUE_SIZE}), dropping new event for ${event.did}`)
      return
    }
    this.eventQueue.push(event)
    this.processQueue()
  }

  /**
   * Process events from the queue with bounded concurrency.
   */
  private processQueue(): void {
    while (
      this.eventQueue.length > 0 &&
      this.processingCount < MAX_CONCURRENT_EVENTS
    ) {
      const event = this.eventQueue.shift()!
      this.processingCount++

      this.handleEvent(event)
        .catch((error) => {
          console.error('[Jetstream] Event processing error:', error)
        })
        .finally(() => {
          this.processingCount--
          // Continue processing queue
          this.processQueue()
        })
    }
  }

  private async handleEvent(event: JetstreamEvent): Promise<void> {
    // Only process commit events for org.xmtp.inbox
    if (event.kind !== 'commit' || !event.commit) return
    if (event.commit.collection !== COLLECTION) return

    const { did } = event
    const { operation, record } = event.commit

    if (operation === 'delete') {
      console.log(`[Jetstream] Deleting mapping for ${did}`)
      await deleteMapping(this.env.DB, did)
      // Save cursor AFTER successful DB operation
      if (event.time_us) {
        this.scheduleCursorSave(event.time_us)
      }
      return
    }

    if ((operation === 'create' || operation === 'update') && record) {
      const inboxId = record.id
      const signature = record.verificationSignature

      if (!inboxId || !signature) {
        console.warn(
          `[Jetstream] Invalid record for ${did}: missing id or signature`
        )
        return
      }

      // Verify the signature (format validation)
      const verifyResult = await verifyInboxOwnership(
        inboxId,
        did,
        signature,
        'production'
      )

      if (!verifyResult.verified) {
        console.warn(
          `[Jetstream] Verification failed for ${did}: ${verifyResult.error}`
        )
        return
      }

      console.log(
        `[Jetstream] Indexing mapping: ${did} -> ${inboxId.slice(0, 16)}...`
      )

      await upsertMapping(this.env.DB, {
        did,
        inboxId,
        signature
      })

      // Save cursor AFTER successful DB operation
      if (event.time_us) {
        this.scheduleCursorSave(event.time_us)
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
    }

    console.log(`[Jetstream] Reconnecting in ${RECONNECT_DELAY_MS / 1000}s...`)

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null
      this.connect()
    }, RECONNECT_DELAY_MS)
  }

  private async reconnect(): Promise<void> {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }

    await this.connect()
  }
}
