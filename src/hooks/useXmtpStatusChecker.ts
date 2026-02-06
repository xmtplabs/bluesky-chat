import { useState, useCallback } from 'react'
import { identityService } from '../services/identity'
import type { BlueskyProfile, XmtpUserStatus } from '../types'

/**
 * Shared hook for checking XMTP messaging eligibility of Bluesky users.
 * Used by both GroupAdminProviderBridge and NewConversationProviderBridge.
 *
 * Callers may invoke checkXmtpStatus for the same user on every effect run.
 * The identity service handles dedup (pendingStatusChecks) and caching
 * (statusCache with TTL), so repeated calls are cheap. We intentionally
 * do NOT gate on a ref here — that would prevent retries after transient errors.
 */
export function useXmtpStatusChecker() {
  const [xmtpStatus, setXmtpStatus] = useState<Map<string, XmtpUserStatus>>(new Map())

  const checkXmtpStatus = useCallback(async (user: BlueskyProfile) => {
    // Don't flash 'checking' if we already have a status for this user
    setXmtpStatus(prev => {
      const current = prev.get(user.did)
      if (current) return prev
      return new Map(prev).set(user.did, 'checking')
    })

    try {
      const status = await identityService.checkXmtpStatus(user.did)
      setXmtpStatus(prev => new Map(prev).set(user.did, status))
    } catch {
      // Leave as 'checking' so the next effect run can retry
    }
  }, [])

  return { xmtpStatus, checkXmtpStatus }
}
