/**
 * Bluesky/ATProto API utilities.
 */

/**
 * Validate DID format.
 */
export function isValidDid(did: string): boolean {
  return did.startsWith('did:plc:') || did.startsWith('did:web:')
}

/**
 * Validate inbox ID format (hex string).
 */
export function isValidInboxId(inboxId: string): boolean {
  return /^[a-f0-9]+$/i.test(inboxId)
}
