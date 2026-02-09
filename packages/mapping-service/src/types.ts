import type { D1Database, DurableObjectNamespace } from '@cloudflare/workers-types'

/**
 * Cloudflare Rate Limiting binding interface
 * @see https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
 */
interface RateLimit {
  limit(options: { key: string }): Promise<{ success: boolean }>
}

export interface Env {
  DB: D1Database
  JETSTREAM_INDEXER?: DurableObjectNamespace
  ADMIN_KEY?: string // Set via `wrangler secret put ADMIN_KEY`
  RATE_LIMITER: RateLimit // Global rate limiter for public endpoints
  ADMIN_RATE_LIMITER: RateLimit // Stricter rate limiter for admin endpoints
  IDENTITY_PROVIDER?: string // 'bluesky' (default) or 'nostr'
}

export interface Mapping {
  identityId: string
  inboxId: string
  signature: string
  createdAt: number
}

export interface MappingRow {
  identity_id: string
  inbox_id: string
  signature: string
  created_at: number
}

export interface LookupResponse {
  id: string
  inboxId: string
}

export interface BulkRequest {
  type: 'by-id' | 'by-inbox'
  identifiers: string[]
}

export interface BulkResponse {
  mappings: LookupResponse[]
  notFound: string[]
}

export interface RegisterRequest {
  id: string
}

export interface RegisterResponse {
  success: boolean
  id: string
  inboxId: string
}

export interface ErrorResponse {
  error: string
  retryAfter?: number
}

export interface HealthResponse {
  status: 'ok' | 'degraded'
  timestamp: string
  stats: {
    totalMappings: number
    indexerConnected: boolean
  }
}
