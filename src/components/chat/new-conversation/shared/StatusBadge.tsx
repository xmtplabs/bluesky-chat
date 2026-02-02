import type { XmtpUserStatus } from '../context/NewConversationContext'

interface StatusBadgeProps {
  status: XmtpUserStatus | undefined
}

/**
 * Badge showing user's XMTP verification status.
 */
export function StatusBadge({ status }: StatusBadgeProps) {
  if (status === 'unverified') {
    return (
      <span className="flex-shrink-0 flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-warning)] bg-[var(--color-warning)]/10 rounded">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        Unverified
      </span>
    )
  }

  return null
}
