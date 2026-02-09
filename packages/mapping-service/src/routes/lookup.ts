import { Hono } from 'hono'
import type { Env, LookupResponse } from '../types'
import { getMappingByIdentityId, getMappingByInboxId } from '../services/db'
import { getIdentityProvider } from '../services/identity'

const lookup = new Hono<{ Bindings: Env }>()

/**
 * GET /v1/lookup/id/:id
 * Forward lookup: identity → InboxId
 */
lookup.get('/id/:id', async (c) => {
  const id = c.req.param('id')

  // Validate identity format
  const identityProvider = getIdentityProvider(c.env)
  if (!identityProvider.isValidIdentity(id)) {
    return c.json({ error: 'Invalid identity format' }, 400)
  }

  const mapping = await getMappingByIdentityId(c.env.DB, id)

  if (!mapping) {
    return c.json({ error: 'NOT_FOUND', id }, 404)
  }

  const response: LookupResponse = {
    id: mapping.identityId,
    inboxId: mapping.inboxId
  }

  return c.json(response)
})

/**
 * GET /v1/lookup/inbox/:inboxId
 * Reverse lookup: InboxId → identity
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
    id: mapping.identityId,
    inboxId: mapping.inboxId
  }

  return c.json(response)
})

export default lookup
