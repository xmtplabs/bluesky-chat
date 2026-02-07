import { identityService } from '../services/identity'
import type { BlueskyProfile } from '../types'

/**
 * Resolve an array of Bluesky profiles to XMTP inbox IDs.
 * For each resolved user, caches the profile and inbox↔DID mapping
 * so that subsequent lookups (e.g. in system messages) work instantly.
 *
 * Returns resolved inbox IDs and display names of users who couldn't be resolved.
 */
export async function resolveUsersToInboxIds(
  users: BlueskyProfile[]
): Promise<{ inboxIds: string[]; unresolvedNames: string[] }> {
  const inboxIds: string[] = []
  const unresolvedNames: string[] = []

  for (const user of users) {
    const inboxId = await identityService.resolveDidToInboxCached(user.did)
    if (inboxId) {
      identityService.cacheMapping(inboxId, user.did)
      identityService.cacheProfile(user)
      inboxIds.push(inboxId)
    } else {
      unresolvedNames.push(user.displayName || user.handle)
    }
  }

  return { inboxIds, unresolvedNames }
}
