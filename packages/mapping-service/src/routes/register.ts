import { Hono } from 'hono'
import type { Env, RegisterResponse } from '../types'
import { upsertMapping, getMappingByIdentityId } from '../services/db'
import { getIdentityProvider } from '../services/identity'

const register = new Hono<{ Bindings: Env }>()

/**
 * POST /v1/register
 * Register a new identity↔InboxId mapping by fetching from the source of truth.
 *
 * The client just needs to tell us which identity to index.
 *
 * Request body:
 * {
 *   "id": "did:plc:abc123" | "npub1..."
 * }
 */
register.post('/', async (c) => {
  let body: { id: string }

  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  if (!body || typeof body !== 'object') {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  if (!body.id || typeof body.id !== 'string') {
    return c.json({ error: 'Missing required field: id' }, 400)
  }

  const identityProvider = getIdentityProvider(c.env)

  if (!identityProvider.isValidIdentity(body.id)) {
    return c.json({ error: 'Invalid identity format' }, 400)
  }

  // Fetch from source of truth (ATProto, Nostr relays, etc.)
  const sourceRecord = await identityProvider.verifyFromSource(body.id)

  if (!sourceRecord) {
    return c.json(
      { error: 'No XMTP inbox binding found. Publish your identity first.' },
      404
    )
  }

  // Check for existing mapping (to preserve createdAt)
  const existing = await getMappingByIdentityId(c.env.DB, body.id)

  // Store whatever the source says
  await upsertMapping(c.env.DB, {
    identityId: body.id,
    inboxId: sourceRecord.inboxId,
    signature: sourceRecord.signature,
    createdAt: existing?.createdAt
  })

  const response: RegisterResponse = {
    success: true,
    id: body.id,
    inboxId: sourceRecord.inboxId
  }

  return c.json(response, existing ? 200 : 201)
})

export default register
