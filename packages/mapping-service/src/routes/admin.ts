import { timingSafeEqual } from 'node:crypto'
import { Hono } from 'hono'
import type { Env } from '../types'
import { upsertMapping, getTotalMappings } from '../services/db'
import { getIdentityProvider } from '../services/identity'

const admin = new Hono<{ Bindings: Env }>()

/**
 * Timing-safe string comparison to prevent timing attacks.
 * Returns true if strings are equal, false otherwise.
 */
function timingSafeCompare(a: string, b: string): boolean {
  const encoder = new TextEncoder()
  const aBytes = encoder.encode(a)
  const bBytes = encoder.encode(b)

  // Different lengths - still do constant-time comparison to avoid timing leak
  if (aBytes.length !== bBytes.length) {
    // Compare against itself to ensure constant time, then return false
    timingSafeEqual(Buffer.from(aBytes), Buffer.from(aBytes))
    return false
  }

  return timingSafeEqual(Buffer.from(aBytes), Buffer.from(bBytes))
}

// Middleware to check admin authentication
admin.use('*', async (c, next) => {
  const adminKey = c.env.ADMIN_KEY

  // If no ADMIN_KEY is configured, deny all admin requests
  if (!adminKey) {
    return c.json({ error: 'Admin endpoint not configured' }, 503)
  }

  const providedKey =
    c.req.header('X-Admin-Key') ??
    c.req.header('Authorization')?.replace('Bearer ', '')

  if (!providedKey) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  // Timing-safe comparison to prevent timing attacks
  if (!timingSafeCompare(providedKey, adminKey)) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await next()
})

// Maximum identities allowed per backfill request
const MAX_BACKFILL_BATCH = 100

/**
 * POST /v1/admin/backfill
 * Backfill mappings for a list of identities by fetching from the source of truth.
 *
 * Request body:
 * {
 *   "ids": ["did:plc:a", "npub1...", ...]
 * }
 */
admin.post('/backfill', async (c) => {
  let body: { ids: string[] }

  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return c.json({ error: 'ids must be a non-empty array' }, 400)
  }

  if (body.ids.length > MAX_BACKFILL_BATCH) {
    return c.json(
      { error: `Maximum ${MAX_BACKFILL_BATCH} identities per request` },
      400
    )
  }

  const results = {
    total: body.ids.length,
    indexed: 0,
    notFound: 0,
    failed: 0,
    errors: [] as string[]
  }

  const identityProvider = getIdentityProvider(c.env)

  for (const id of body.ids) {
    // Validate identity is a string and has valid format before making external calls
    if (typeof id !== 'string' || !identityProvider.isValidIdentity(id)) {
      results.failed++
      results.errors.push(`${String(id)}: invalid identity format`)
      continue
    }

    try {
      // Fetch from source of truth
      const record = await identityProvider.verifyFromSource(id)

      if (!record) {
        results.notFound++
        continue
      }

      // Store in database
      await upsertMapping(c.env.DB, {
        identityId: id,
        inboxId: record.inboxId,
        signature: record.signature
      })

      results.indexed++
    } catch (error) {
      results.failed++
      results.errors.push(`${id}: ${error instanceof Error ? error.message : 'unknown error'}`)
    }
  }

  return c.json(results)
})

/**
 * GET /v1/admin/stats
 * Get detailed statistics about the mapping database.
 */
admin.get('/stats', async (c) => {
  const totalMappings = await getTotalMappings(c.env.DB)

  // Get recent mappings
  const recentResult = await c.env.DB
    .prepare('SELECT identity_id, created_at FROM mappings ORDER BY created_at DESC LIMIT 10')
    .all<{ identity_id: string; created_at: number }>()

  // Get oldest mappings
  const oldestResult = await c.env.DB
    .prepare('SELECT identity_id, created_at FROM mappings ORDER BY created_at ASC LIMIT 5')
    .all<{ identity_id: string; created_at: number }>()

  return c.json({
    totalMappings,
    recentMappings: (recentResult.results ?? []).map((r) => ({
      id: r.identity_id,
      createdAt: new Date(r.created_at).toISOString()
    })),
    oldestMappings: (oldestResult.results ?? []).map((r) => ({
      id: r.identity_id,
      createdAt: new Date(r.created_at).toISOString()
    }))
  })
})

/**
 * GET /v1/admin/indexer/status
 * Get the current status of the Jetstream indexer.
 */
admin.get('/indexer/status', async (c) => {
  if (!c.env.JETSTREAM_INDEXER) {
    return c.json({ indexer: 'not-configured' })
  }

  try {
    const indexerId = c.env.JETSTREAM_INDEXER.idFromName('singleton')
    const indexer = c.env.JETSTREAM_INDEXER.get(indexerId)

    const response = await indexer.fetch(new Request('http://internal/status'))
    const status = await response.json()

    return c.json({ success: true, status })
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'Failed to get indexer status' },
      500
    )
  }
})

/**
 * POST /v1/admin/indexer/reconnect
 * Force the Jetstream indexer to reconnect.
 */
admin.post('/indexer/reconnect', async (c) => {
  if (!c.env.JETSTREAM_INDEXER) {
    return c.json({ indexer: 'not-configured' })
  }

  try {
    const indexerId = c.env.JETSTREAM_INDEXER.idFromName('singleton')
    const indexer = c.env.JETSTREAM_INDEXER.get(indexerId)

    const response = await indexer.fetch(new Request('http://internal/reconnect'))
    const result = await response.json()

    return c.json(result)
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'Failed to reconnect indexer' },
      500
    )
  }
})

export default admin
