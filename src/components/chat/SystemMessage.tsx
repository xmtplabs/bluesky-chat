import type { ChatMessage } from '../../types'

interface SystemMessageProps {
  message: ChatMessage
}

/**
 * System message component - renders centered, subtle text for
 * group membership changes and other system events.
 */
export function SystemMessage({ message }: SystemMessageProps) {
  const time = new Date(message.sentAt).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit'
  })

  // Choose icon based on message type
  const icon = (() => {
    switch (message.systemMessageType) {
      case 'member_added':
        return (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
          </svg>
        )
      case 'member_removed':
        return (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6" />
          </svg>
        )
      case 'group_updated':
        return (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        )
      case 'unsupported':
        return (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        )
      default:
        return (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )
    }
  })()

  return (
    <div className="flex justify-center py-2">
      <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--color-message-system)] rounded-full text-[var(--color-message-system-text)]">
        {icon}
        <span className="text-[12px]">{message.content}</span>
        <span className="text-[12px] opacity-60">·</span>
        <span className="text-[12px] opacity-60">{time}</span>
      </div>
    </div>
  )
}
