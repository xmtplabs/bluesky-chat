// NOTE: This file is intentionally duplicated in mapping-service and provider-bluesky.
// The two packages run in different runtimes (CF Worker vs Electron/browser) with no
// shared dependency path. The logic is stable and small enough that duplication is
// preferable to a new shared package.

/**
 * PDS resolution utilities for federated AT Protocol users.
 *
 * Users on non-bsky.social PDS servers (e.g. Blacksky) need their records
 * fetched from the correct PDS. This resolves DID -> PDS endpoint via plc.directory.
 */

const pdsCache = new Map<string, { endpoint: string; expiry: number }>()
const PDS_CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export async function resolvePdsEndpoint(did: string): Promise<string | null> {
  // did:web: resolution requires fetching https://{domain}/.well-known/did.json
  // with percent-decoding and SSRF protections. Not yet implemented — return null
  // so callers get a clear "not found" rather than silently hitting bsky.social.
  if (did.startsWith('did:web:')) return null

  const cached = pdsCache.get(did)
  if (cached) {
    if (cached.expiry > Date.now()) {
      return cached.endpoint
    }
    pdsCache.delete(did)
  }

  try {
    const response = await fetch(`https://plc.directory/${encodeURIComponent(did)}`)
    if (!response.ok) return null
    const doc = (await response.json()) as { service?: { id: string; type: string; serviceEndpoint: string }[] }
    const pdsService = doc.service?.find(
      (s: { id: string; type: string; serviceEndpoint: string }) =>
        s.id === '#atproto_pds'
    )
    const endpoint = pdsService?.serviceEndpoint ?? null
    if (endpoint) {
      pdsCache.set(did, { endpoint, expiry: Date.now() + PDS_CACHE_TTL })
    }
    return endpoint
  } catch {
    return null
  }
}

export async function fetchRecordFromPds(
  did: string,
  collection: string,
  rkey: string
): Promise<Response> {
  const pdsEndpoint = await resolvePdsEndpoint(did)
  const baseUrl = pdsEndpoint ?? 'https://bsky.social'
  return fetch(
    `${baseUrl}/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(did)}&collection=${encodeURIComponent(collection)}&rkey=${encodeURIComponent(rkey)}`
  )
}
