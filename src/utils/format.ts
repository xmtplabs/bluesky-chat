import { identityService } from '../services/identity'
import { xmtpService } from '../services/xmtp'

/**
 * Format bytes into human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * Get a display name for a group chat based on its members.
 * Returns comma-separated member names (excluding current user), e.g., "Alice, Bob, Charlie"
 * Falls back to "Group Chat" if no member profiles are available.
 */
export function getGroupMemberNames(memberInboxIds: string[] | undefined, maxNames = 3): string {
  if (!memberInboxIds || memberInboxIds.length === 0) {
    return 'Group Chat'
  }

  const myInboxId = xmtpService.getInboxId()
  const otherMembers = memberInboxIds.filter((id) => id !== myInboxId)

  if (otherMembers.length === 0) {
    return 'Group Chat'
  }

  const names: string[] = []
  for (const inboxId of otherMembers) {
    if (names.length >= maxNames) break
    const did = identityService.getDidFromInboxId(inboxId)
    if (did) {
      const profile = identityService.getCachedProfile(did)
      if (profile) {
        names.push(profile.displayName || profile.handle || inboxId.slice(0, 8))
      } else {
        // DID is resolved but profile isn't cached - use first 8 chars of inbox ID
        names.push(inboxId.slice(0, 8))
      }
    } else {
      // Inbox ID not resolved - use first 8 chars
      names.push(inboxId.slice(0, 8))
    }
  }

  if (names.length === 0) {
    return 'Group Chat'
  }

  const remaining = otherMembers.length - names.length
  if (remaining > 0) {
    return `${names.join(', ')} +${remaining}`
  }

  return names.join(', ')
}
