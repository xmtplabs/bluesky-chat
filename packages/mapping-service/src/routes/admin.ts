import { Hono } from 'hono'
import type { Env } from '../types'
import { upsertMapping, getTotalMappings } from '../services/db'
import { verifyInboxOwnership, verifyFromATProto } from '../services/verify'

const admin = new Hono<{ Bindings: Env }>()

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

  if (!providedKey || providedKey !== adminKey) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  await next()
})

/**
 * POST /v1/admin/backfill
 * Backfill mappings for a list of DIDs by fetching from ATProto.
 *
 * Request body:
 * {
 *   "dids": ["did:plc:a", "did:plc:b", ...]
 * }
 *
 * This is useful for initial deployment to populate the cache with
 * existing mappings that predate the Jetstream indexer.
 */
admin.post('/backfill', async (c) => {
  let body: { dids: string[] }

  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  if (!Array.isArray(body.dids) || body.dids.length === 0) {
    return c.json({ error: 'dids must be a non-empty array' }, 400)
  }

  const results = {
    total: body.dids.length,
    indexed: 0,
    notFound: 0,
    failed: 0,
    errors: [] as string[]
  }

  for (const did of body.dids) {
    try {
      // Fetch from ATProto
      const record = await verifyFromATProto(did)

      if (!record) {
        results.notFound++
        continue
      }

      // Verify the signature
      const verifyResult = await verifyInboxOwnership(
        record.inboxId,
        did,
        record.signature,
        'production'
      )

      if (!verifyResult.verified) {
        results.failed++
        results.errors.push(`${did}: verification failed - ${verifyResult.error}`)
        continue
      }

      // Fetch handle
      const handle = await fetchHandle(did)

      // Store in database
      await upsertMapping(c.env.DB, {
        did,
        inboxId: record.inboxId,
        signature: record.signature,
        handle,
        verifiedAt: Date.now()
      })

      results.indexed++
    } catch (error) {
      results.failed++
      results.errors.push(`${did}: ${error instanceof Error ? error.message : 'unknown error'}`)
    }
  }

  return c.json(results)
})

/**
 * POST /v1/admin/backfill-from-firehose
 * Backfill by scanning repos from the ATProto relay.
 * This is a heavier operation that scans for org.xmtp.inbox records.
 *
 * Query params:
 * - limit: Max number of repos to scan (default 1000)
 * - cursor: Pagination cursor for resuming
 */
admin.post('/backfill-from-firehose', async (c) => {
  const limit = parseInt(c.req.query('limit') ?? '1000', 10)
  const cursor = c.req.query('cursor')

  const results = {
    scanned: 0,
    indexed: 0,
    cursor: null as string | null,
    errors: [] as string[]
  }

  try {
    // List repos from relay
    const params = new URLSearchParams({ limit: String(Math.min(limit, 1000)) })
    if (cursor) params.set('cursor', cursor)

    const response = await fetch(
      `https://bsky.network/xrpc/com.atproto.sync.listRepos?${params}`
    )

    if (!response.ok) {
      return c.json({ error: `Relay error: ${response.status}` }, 500)
    }

    const data = (await response.json()) as {
      repos: Array<{ did: string }>
      cursor?: string
    }

    results.cursor = data.cursor ?? null

    for (const repo of data.repos) {
      results.scanned++

      try {
        // Try to fetch org.xmtp.inbox record
        const record = await verifyFromATProto(repo.did)

        if (!record) continue

        // Verify
        const verifyResult = await verifyInboxOwnership(
          record.inboxId,
          repo.did,
          record.signature,
          'production'
        )

        if (!verifyResult.verified) continue

        // Fetch handle
        const handle = await fetchHandle(repo.did)

        // Store
        await upsertMapping(c.env.DB, {
          did: repo.did,
          inboxId: record.inboxId,
          signature: record.signature,
          handle,
          verifiedAt: Date.now()
        })

        results.indexed++
      } catch {
        // Skip individual errors, continue scanning
      }
    }

    return c.json(results)
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'Backfill failed' },
      500
    )
  }
})

/**
 * GET /v1/admin/stats
 * Get detailed statistics about the mapping database.
 */
admin.get('/stats', async (c) => {
  const totalMappings = await getTotalMappings(c.env.DB)

  // Get recent mappings
  const recentResult = await c.env.DB
    .prepare('SELECT did, handle, verified_at FROM mappings ORDER BY verified_at DESC LIMIT 10')
    .all<{ did: string; handle: string | null; verified_at: number }>()

  // Get oldest mappings
  const oldestResult = await c.env.DB
    .prepare('SELECT did, handle, created_at FROM mappings ORDER BY created_at ASC LIMIT 5')
    .all<{ did: string; handle: string | null; created_at: number }>()

  return c.json({
    totalMappings,
    recentMappings: (recentResult.results ?? []).map((r) => ({
      did: r.did,
      handle: r.handle,
      verifiedAt: new Date(r.verified_at).toISOString()
    })),
    oldestMappings: (oldestResult.results ?? []).map((r) => ({
      did: r.did,
      handle: r.handle,
      createdAt: new Date(r.created_at).toISOString()
    }))
  })
})

/**
 * GET /v1/admin/indexer/status
 * Get the current status of the Jetstream indexer.
 */
admin.get('/indexer/status', async (c) => {
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
 * POST /v1/admin/indexer/start
 * Start or initialize the Jetstream indexer.
 */
admin.post('/indexer/start', async (c) => {
  try {
    const indexerId = c.env.JETSTREAM_INDEXER.idFromName('singleton')
    const indexer = c.env.JETSTREAM_INDEXER.get(indexerId)

    // Trigger the indexer by fetching its status
    const response = await indexer.fetch(new Request('http://internal/status'))
    const status = await response.json()

    return c.json({ success: true, status })
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : 'Failed to start indexer' },
      500
    )
  }
})

/**
 * POST /v1/admin/indexer/reconnect
 * Force the Jetstream indexer to reconnect.
 */
admin.post('/indexer/reconnect', async (c) => {
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

async function fetchHandle(did: string): Promise<string | null> {
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

export default admin
