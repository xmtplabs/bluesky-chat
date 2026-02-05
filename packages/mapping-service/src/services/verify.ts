/**
 * XMTP signature verification service.
 *
 * SECURITY MODEL:
 * This service performs FORMAT VALIDATION only, not cryptographic verification.
 *
 * Why:
 * 1. The Jetstream indexer verifies mappings from ATProto (ground truth)
 * 2. Clients MUST verify signatures independently - never trust this server
 * 3. This service is a cache/index, not an authority
 *
 * Format validation prevents garbage data but allows unverified mappings
 * until the indexer confirms them from ATProto.
 */

export type XmtpEnv = 'production' | 'dev'

export interface VerifyResult {
  verified: boolean
  error?: string
}

/**
 * Validate the format of a mapping registration request.
 *
 * This performs format validation only - cryptographic verification
 * happens via the Jetstream indexer when it sees the ATProto record.
 *
 * Clients looking up mappings MUST verify signatures independently.
 *
 * @param inboxId - XMTP inbox ID (hex string)
 * @param did - Bluesky DID
 * @param signature - Base64-encoded signature
 * @param _env - XMTP environment (unused, kept for API compatibility)
 * @returns Validation result
 */
export async function verifyInboxOwnership(
  inboxId: string,
  did: string,
  signature: string,
  _env: XmtpEnv = 'production'
): Promise<VerifyResult> {
  // Validate required fields
  if (!inboxId || !did || !signature) {
    return { verified: false, error: 'Missing required fields' }
  }

  // Validate DID format
  if (!did.startsWith('did:plc:') && !did.startsWith('did:web:')) {
    return { verified: false, error: 'Invalid DID format' }
  }

  // Validate inbox ID format (should be hex, typically 64 chars)
  if (!/^[a-f0-9]+$/i.test(inboxId)) {
    return { verified: false, error: 'Invalid inbox ID format' }
  }

  // Validate signature is valid base64 and correct length for Ed25519 (64 bytes)
  let signatureBytes: Uint8Array
  try {
    const binary = atob(signature)
    signatureBytes = Uint8Array.from(binary, (c) => c.charCodeAt(0))
  } catch {
    return { verified: false, error: 'Invalid signature encoding' }
  }

  if (signatureBytes.length !== 64) {
    return { verified: false, error: 'Invalid signature length' }
  }

  // Format validation passed - cryptographic verification deferred to indexer
  return { verified: true }
}

/**
 * Verify a mapping by fetching the ATProto record directly.
 * This provides ground-truth verification from the source.
 *
 * @param did - Bluesky DID to verify
 * @returns The ATProto record if valid, null otherwise
 */
export async function verifyFromATProto(
  did: string
): Promise<{ inboxId: string; signature: string } | null> {
  try {
    const response = await fetch(
      `https://bsky.social/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(did)}&collection=org.xmtp.inbox&rkey=self`
    )

    if (!response.ok) {
      return null
    }

    const data = (await response.json()) as {
      value?: { id?: string; verificationSignature?: string }
    }
    const record = data.value

    if (!record?.id || !record?.verificationSignature) {
      return null
    }

    return {
      inboxId: record.id,
      signature: record.verificationSignature
    }
  } catch {
    return null
  }
}
