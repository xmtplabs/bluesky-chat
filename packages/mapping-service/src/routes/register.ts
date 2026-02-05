import { Hono } from 'hono'
import type { Env, RegisterRequest, RegisterResponse } from '../types'
import { upsertMapping, getMappingByDid } from '../services/db'
import { verifyFromATProto } from '../services/verify'

const register = new Hono<{ Bindings: Env }>()

/**
 * POST /v1/register
 * Register a new DID↔InboxId mapping
 *
 * The server re-verifies the signature before storing.
 * If the mapping already exists with the same inbox ID, it updates the verification timestamp.
 *
 * Request body:
 * {
 *   "did": "did:plc:abc123",
 *   "inboxId": "0x1234567890abcdef...",
 *   "signature": "base64-encoded-signature",
 *   "handle": "alice.bsky.social" (optional)
 * }
 */
register.post('/', async (c) => {
  let body: RegisterRequest

  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400)
  }

  // Validate required fields
  if (!body.did || !body.inboxId || !body.signature) {
    return c.json({ error: 'Missing required fields: did, inboxId, signature' }, 400)
  }

  // Validate DID format
  if (!body.did.startsWith('did:plc:') && !body.did.startsWith('did:web:')) {
    return c.json({ error: 'Invalid DID format' }, 400)
  }

  // Validate inbox ID format (hex string)
  if (!/^[a-f0-9]+$/i.test(body.inboxId)) {
    return c.json({ error: 'Invalid inbox ID format' }, 400)
  }

  // Always verify against ATProto as ground truth
  // This ensures only the DID owner can register their mapping
  const atprotoRecord = await verifyFromATProto(body.did)

  if (!atprotoRecord) {
    return c.json(
      { error: 'No org.xmtp.inbox record found on ATProto. Publish your identity first.' },
      404
    )
  }

  // Verify the provided data matches what's on ATProto
  if (atprotoRecord.inboxId !== body.inboxId) {
    return c.json(
      {
        error: 'Inbox ID does not match ATProto record',
        expected: atprotoRecord.inboxId
      },
      400
    )
  }

  // Use the signature from ATProto (canonical source)
  const signature = atprotoRecord.signature

  // Check for existing mapping
  const existing = await getMappingByDid(c.env.DB, body.did)
  const now = Date.now()

  // Upsert the mapping using ATProto-verified data
  await upsertMapping(c.env.DB, {
    did: body.did,
    inboxId: atprotoRecord.inboxId,
    signature,
    handle: body.handle ?? null,
    createdAt: existing?.createdAt ?? now,
    verifiedAt: now
  })

  const response: RegisterResponse = {
    success: true,
    did: body.did,
    inboxId: body.inboxId
  }

  return c.json(response, existing ? 200 : 201)
})

export default register
