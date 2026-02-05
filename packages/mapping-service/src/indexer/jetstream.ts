import type { DurableObjectState, DurableObject } from '@cloudflare/workers-types'
import type { Env } from '../types'
import { upsertMapping, deleteMapping } from '../services/db'
import { verifyInboxOwnership } from '../services/verify'

const JETSTREAM_URL = 'wss://jetstream2.us-east.bsky.network/subscribe'
const COLLECTION = 'org.xmtp.inbox'
const RECONNECT_DELAY_MS = 5000
const CURSOR_KEY = 'jetstream_cursor'

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
 */
export class JetstreamIndexer implements DurableObject {
  private state: DurableObjectState
  private env: Env
  private ws: WebSocket | null = null
  private isConnected = false
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null

  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env

    // Start connection on initialization
    this.state.blockConcurrencyWhile(async () => {
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
            cursor: await this.getCursor()
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
    return await this.state.storage.get<number>(CURSOR_KEY) ?? null
  }

  private async saveCursor(cursor: number): Promise<void> {
    await this.state.storage.put(CURSOR_KEY, cursor)
  }

  private async connect(): Promise<void> {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    try {
      const cursor = await this.getCursor()
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

    this.ws.addEventListener('message', async (event) => {
      try {
        const data = typeof event.data === 'string'
          ? event.data
          : new TextDecoder().decode(event.data as ArrayBuffer)

        const parsed = JSON.parse(data) as JetstreamEvent
        await this.handleEvent(parsed)
      } catch (error) {
        console.error('[Jetstream] Message parse error:', error)
      }
    })

    this.ws.addEventListener('close', (event) => {
      console.log(`[Jetstream] Disconnected: ${event.code} ${event.reason}`)
      this.isConnected = false
      this.ws = null
      this.scheduleReconnect()
    })

    this.ws.addEventListener('error', (error) => {
      console.error('[Jetstream] WebSocket error:', error)
      this.isConnected = false
    })
  }

  private async handleEvent(event: JetstreamEvent): Promise<void> {
    // Save cursor for resume capability
    if (event.time_us) {
      await this.saveCursor(event.time_us)
    }

    // Only process commit events for org.xmtp.inbox
    if (event.kind !== 'commit' || !event.commit) return
    if (event.commit.collection !== COLLECTION) return

    const { did } = event
    const { operation, record } = event.commit

    if (operation === 'delete') {
      console.log(`[Jetstream] Deleting mapping for ${did}`)
      await deleteMapping(this.env.DB, did)
      return
    }

    if ((operation === 'create' || operation === 'update') && record) {
      const inboxId = record.id
      const signature = record.verificationSignature

      if (!inboxId || !signature) {
        console.warn(`[Jetstream] Invalid record for ${did}: missing id or signature`)
        return
      }

      // Verify the signature
      const verifyResult = await verifyInboxOwnership(inboxId, did, signature, 'production')

      if (!verifyResult.verified) {
        console.warn(`[Jetstream] Verification failed for ${did}: ${verifyResult.error}`)
        return
      }

      // Fetch handle from Bluesky
      const handle = await this.fetchHandle(did)

      console.log(`[Jetstream] Indexing mapping: ${did} -> ${inboxId.slice(0, 16)}...`)

      await upsertMapping(this.env.DB, {
        did,
        inboxId,
        signature,
        handle,
        verifiedAt: Date.now()
      })
    }
  }

  private async fetchHandle(did: string): Promise<string | null> {
    try {
      const response = await fetch(
        `https://bsky.social/xrpc/com.atproto.repo.describeRepo?repo=${encodeURIComponent(did)}`
      )

      if (!response.ok) return null

      const data = (await response.json()) as { handle?: string }
      return data.handle ?? null
    } catch {
      return null
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
