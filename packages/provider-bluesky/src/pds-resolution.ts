/**
 * PDS resolution utilities for federated AT Protocol users.
 *
 * Users on non-bsky.social PDS servers (e.g. Blacksky) need their records
 * fetched from the correct PDS. This resolves DID -> PDS endpoint via plc.directory.
 */

export async function resolvePdsEndpoint(did: string): Promise<string | null> {
  try {
    const response = await fetch(`https://plc.directory/${encodeURIComponent(did)}`)
    if (!response.ok) return null
    const doc = await response.json()
    const pdsService = doc.service?.find(
      (s: { id: string; type: string; serviceEndpoint: string }) =>
        s.id === '#atproto_pds'
    )
    return pdsService?.serviceEndpoint ?? null
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
