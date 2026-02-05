import { Hono } from 'hono'
import type { Env, BulkRequest, BulkResponse } from '../types'
import { getMappingsByDids, getMappingsByInboxIds } from '../services/db'

const bulk = new Hono<{ Bindings: Env }>()

const MAX_BULK_SIZE = 100

/**
 * POST /v1/bulk
 * Bulk lookup for up to 100 identifiers
 *
 * Request body:
 * {
 *   "type": "by-did" | "by-inbox",
 *   "identifiers": ["did:plc:a", "did:plc:b", ...]
 * }
 */
bulk.post('/', async (c) => {
  let body: BulkRequest

  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  // Validate request
  if (!body.type || !['by-did', 'by-inbox'].includes(body.type)) {
    return c.json({ error: 'Invalid type. Must be "by-did" or "by-inbox"' }, 400)
  }

  if (!Array.isArray(body.identifiers)) {
    return c.json({ error: 'identifiers must be an array' }, 400)
  }

  if (body.identifiers.length === 0) {
    return c.json({ mappings: [], notFound: [] } satisfies BulkResponse)
  }

  if (body.identifiers.length > MAX_BULK_SIZE) {
    return c.json(
      { error: `Too many identifiers. Maximum is ${MAX_BULK_SIZE}` },
      400
    )
  }

  // Dedupe and validate identifiers
  const uniqueIds = [...new Set(body.identifiers)]

  if (body.type === 'by-did') {
    // Validate DID formats
    const invalidDids = uniqueIds.filter(
      (id) => !id.startsWith('did:plc:') && !id.startsWith('did:web:')
    )
    if (invalidDids.length > 0) {
      return c.json(
        { error: `Invalid DID format: ${invalidDids[0]}` },
        400
      )
    }

    const mappings = await getMappingsByDids(c.env.DB, uniqueIds)
    const foundDids = new Set(mappings.map((m) => m.did))
    const notFound = uniqueIds.filter((id) => !foundDids.has(id))

    const response: BulkResponse = {
      mappings: mappings.map((m) => ({
        did: m.did,
        inboxId: m.inboxId
      })),
      notFound
    }

    return c.json(response)
  } else {
    // by-inbox
    // Validate inbox ID formats
    const invalidIds = uniqueIds.filter((id) => !/^[a-f0-9]+$/i.test(id))
    if (invalidIds.length > 0) {
      return c.json(
        { error: `Invalid inbox ID format: ${invalidIds[0]}` },
        400
      )
    }

    const mappings = await getMappingsByInboxIds(c.env.DB, uniqueIds)
    const foundInboxIds = new Set(mappings.map((m) => m.inboxId))
    const notFound = uniqueIds.filter((id) => !foundInboxIds.has(id))

    const response: BulkResponse = {
      mappings: mappings.map((m) => ({
        did: m.did,
        inboxId: m.inboxId
      })),
      notFound
    }

    return c.json(response)
  }
})

export default bulk
