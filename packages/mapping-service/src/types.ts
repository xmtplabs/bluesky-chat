import type { D1Database, DurableObjectNamespace } from '@cloudflare/workers-types'

export interface Env {
  DB: D1Database
  JETSTREAM_INDEXER: DurableObjectNamespace
  ADMIN_KEY?: string // Set via `wrangler secret put ADMIN_KEY`
}

export interface Mapping {
  did: string
  inboxId: string
  signature: string
  handle: string | null
  createdAt: number
  verifiedAt: number
}

export interface MappingRow {
  did: string
  inbox_id: string
  signature: string
  handle: string | null
  created_at: number
  verified_at: number
}

export interface LookupResponse {
  did: string
  inboxId: string
  handle: string | null
  verifiedAt: string
}

export interface BulkRequest {
  type: 'by-did' | 'by-inbox'
  identifiers: string[]
}

export interface BulkResponse {
  mappings: LookupResponse[]
  notFound: string[]
}

export interface RegisterRequest {
  did: string
  inboxId: string
  signature: string
  handle?: string
}

export interface RegisterResponse {
  success: boolean
  did: string
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
