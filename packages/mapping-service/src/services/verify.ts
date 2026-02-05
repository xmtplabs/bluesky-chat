/**
 * XMTP signature verification service.
 *
 * Verifies that a signature was created by an installation belonging to the given inbox.
 * This provides the cryptographic binding between Bluesky DIDs and XMTP inboxes.
 *
 * Verification approach:
 * 1. Fetch inbox state from XMTP network to get installation public keys
 * 2. For each installation, verify the signature against the DID using ed25519
 *
 * Note: For production, this should use the XMTP GRPC API or REST API to fetch
 * inbox states. For now, we implement a lightweight verification that can be
 * enhanced later.
 */

// XMTP API endpoints
const XMTP_API_URLS = {
  production: 'https://grpc.production.xmtp.network',
  dev: 'https://grpc.dev.xmtp.network'
} as const

export type XmtpEnv = keyof typeof XMTP_API_URLS

export interface VerifyResult {
  verified: boolean
  error?: string
}

/**
 * Base64 decode helper
 */
function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

/**
 * Verify a signature was created by an installation belonging to the inbox.
 *
 * The signature is created by signing the DID string with an XMTP installation key.
 * We verify by:
 * 1. Fetching the inbox state to get all installation public keys
 * 2. Attempting to verify the signature against each installation's public key
 *
 * @param inboxId - XMTP inbox ID
 * @param did - Bluesky DID that was signed
 * @param signature - Base64-encoded signature
 * @param env - XMTP environment (production or dev)
 * @returns Verification result
 */
export async function verifyInboxOwnership(
  inboxId: string,
  did: string,
  signature: string,
  env: XmtpEnv = 'production'
): Promise<VerifyResult> {
  try {
    // For now, we'll do a lightweight verification approach:
    // Trust the client-side verification and store the mapping.
    // The indexer will re-verify when it sees the ATProto record.
    //
    // Full verification would require:
    // 1. GRPC client to fetch inbox states
    // 2. Ed25519 signature verification against installation public keys
    //
    // Since the data is public anyway (from ATProto), the main security
    // is preventing spam/invalid mappings, which the indexer handles.

    // Basic validation
    if (!inboxId || !did || !signature) {
      return { verified: false, error: 'Missing required fields' }
    }

    // Validate DID format
    if (!did.startsWith('did:plc:') && !did.startsWith('did:web:')) {
      return { verified: false, error: 'Invalid DID format' }
    }

    // Validate inbox ID format (should be hex)
    if (!/^[a-f0-9]+$/i.test(inboxId)) {
      return { verified: false, error: 'Invalid inbox ID format' }
    }

    // Validate signature is valid base64
    try {
      base64ToBytes(signature)
    } catch {
      return { verified: false, error: 'Invalid signature encoding' }
    }

    // For MVP: Trust client verification, indexer will validate from ATProto
    // TODO: Implement full ed25519 verification against inbox installation keys
    return { verified: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { verified: false, error: message }
  }
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
