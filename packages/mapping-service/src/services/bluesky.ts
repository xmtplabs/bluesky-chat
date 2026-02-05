/**
 * Bluesky/ATProto API utilities.
 */

const ATPROTO_TIMEOUT_MS = 10_000

/**
 * Fetch a user's handle from Bluesky.
 *
 * @param did - The DID to look up
 * @returns The handle or null if not found/error
 */
export async function fetchHandle(did: string): Promise<string | null> {
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), ATPROTO_TIMEOUT_MS)

    const response = await fetch(
      `https://bsky.social/xrpc/com.atproto.repo.describeRepo?repo=${encodeURIComponent(did)}`,
      { signal: controller.signal }
    )

    clearTimeout(timeout)

    if (!response.ok) return null

    const data = (await response.json()) as { handle?: string }
    return data.handle ?? null
  } catch {
    return null
  }
}

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
