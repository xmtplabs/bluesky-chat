import type { DurableObjectState } from '@cloudflare/workers-types'
import type { Env } from '../types'

/**
 * Contract for indexers that watch an identity provider's data source
 * and index identity<>XMTP inbox mappings into D1.
 *
 * Each indexer is a Cloudflare Durable Object that maintains a persistent
 * connection to its data source (e.g. Jetstream for Bluesky, relay for Nostr).
 */
export interface Indexer {
  fetch(request: Request): Promise<Response>
}

/**
 * Constructor shape for an Indexer Durable Object class.
 */
export interface IndexerConstructor {
  new (state: DurableObjectState, env: Env): Indexer
}
