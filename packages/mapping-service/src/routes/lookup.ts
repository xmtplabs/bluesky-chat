import { Hono } from 'hono'
import type { Env, LookupResponse } from '../types'
import { getMappingByDid, getMappingByInboxId } from '../services/db'

const lookup = new Hono<{ Bindings: Env }>()

/**
 * GET /v1/lookup/did/:did
 * Forward lookup: DID → InboxId
 */
lookup.get('/did/:did', async (c) => {
  const did = c.req.param('did')

  // Validate DID format
  if (!did.startsWith('did:plc:') && !did.startsWith('did:web:')) {
    return c.json({ error: 'Invalid DID format' }, 400)
  }

  const mapping = await getMappingByDid(c.env.DB, did)

  if (!mapping) {
    return c.json({ error: 'NOT_FOUND', did }, 404)
  }

  const response: LookupResponse = {
    did: mapping.did,
    inboxId: mapping.inboxId,
    handle: mapping.handle,
    verifiedAt: new Date(mapping.verifiedAt).toISOString()
  }

  return c.json(response)
})

/**
 * GET /v1/lookup/inbox/:inboxId
 * Reverse lookup: InboxId → DID
 */
lookup.get('/inbox/:inboxId', async (c) => {
  const inboxId = c.req.param('inboxId')

  // Validate inbox ID format (hex string)
  if (!/^[a-f0-9]+$/i.test(inboxId)) {
    return c.json({ error: 'Invalid inbox ID format' }, 400)
  }

  const mapping = await getMappingByInboxId(c.env.DB, inboxId)

  if (!mapping) {
    return c.json({ error: 'NOT_FOUND', inboxId }, 404)
  }

  const response: LookupResponse = {
    did: mapping.did,
    inboxId: mapping.inboxId,
    handle: mapping.handle,
    verifiedAt: new Date(mapping.verifiedAt).toISOString()
  }

  return c.json(response)
})

export default lookup
