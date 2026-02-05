import { Hono } from 'hono'
import type { Env, RegisterResponse } from '../types'
import { upsertMapping, getMappingByDid } from '../services/db'
import { verifyFromATProto } from '../services/verify'
import { isValidDid } from '../services/bluesky'

const register = new Hono<{ Bindings: Env }>()

/**
 * POST /v1/register
 * Register a new DID↔InboxId mapping by fetching from ATProto.
 *
 * This is a cache - ATProto is the source of truth.
 * The client just needs to tell us which DID to index.
 *
 * Request body:
 * {
 *   "did": "did:plc:abc123"
 * }
 */
register.post('/', async (c) => {
  let body: { did: string }

  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  if (!body.did) {
    return c.json({ error: 'Missing required field: did' }, 400)
  }

  if (!isValidDid(body.did)) {
    return c.json({ error: 'Invalid DID format' }, 400)
  }

  // Fetch from ATProto - the source of truth
  const atprotoRecord = await verifyFromATProto(body.did)

  if (!atprotoRecord) {
    return c.json(
      { error: 'No org.xmtp.inbox record found on ATProto. Publish your identity first.' },
      404
    )
  }

  // Check for existing mapping (to preserve createdAt)
  const existing = await getMappingByDid(c.env.DB, body.did)

  // Store whatever ATProto says
  await upsertMapping(c.env.DB, {
    did: body.did,
    inboxId: atprotoRecord.inboxId,
    signature: atprotoRecord.signature,
    createdAt: existing?.createdAt
  })

  const response: RegisterResponse = {
    success: true,
    did: body.did,
    inboxId: atprotoRecord.inboxId
  }

  return c.json(response, existing ? 200 : 201)
})

export default register
