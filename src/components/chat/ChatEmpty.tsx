/**
 * Empty state shown when no conversation is selected
 */
export function ChatEmpty() {
  return (
    <div className="flex-1 flex items-center justify-center bg-[var(--color-surface)]">
      <div className="text-center max-w-sm px-6">
        <p className="text-[20px] font-semibold text-[var(--color-text-primary)] mb-2">
          Select a conversation
        </p>
        <p className="text-[15px] text-[var(--color-text-secondary)]">
          Choose a conversation from the sidebar to start chatting
        </p>
      </div>
    </div>
  )
}

/**
 * Empty state shown when a conversation has no messages yet
 */
export function ChatMessagesEmpty() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-6">
      <p className="text-[15px] font-medium text-[var(--color-text-primary)]">No messages yet</p>
      <p className="text-[13px] text-[var(--color-text-secondary)] mt-1">
        Send a message to start the conversation
      </p>
      <div className="flex items-center justify-center gap-1.5 text-[var(--color-text-tertiary)] mt-3">
        <svg
          className="w-3 h-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
          />
        </svg>
        <span className="text-[12px]">
          End-to-end encrypted ·{' '}
          <a
            href="https://xmtp.org"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[var(--color-text-secondary)] transition-colors"
          >
            Secured by XMTP
          </a>
        </span>
      </div>
    </div>
  )
}

/**
 * Loading skeleton for messages
 */
export function ChatMessagesLoading() {
  return (
    <div className="p-4 space-y-4 animate-pulse">
      <div className="flex gap-2">
        <div className="w-8 h-8 rounded-full bg-[var(--color-surface-tertiary)]" />
        <div className="h-16 bg-[var(--color-surface-tertiary)] rounded-2xl rounded-bl-md w-1/2" />
      </div>
      <div className="flex justify-end">
        <div className="h-12 bg-[var(--color-bsky-100)] rounded-2xl rounded-br-md w-1/3" />
      </div>
      <div className="flex gap-2">
        <div className="w-8 h-8 rounded-full bg-[var(--color-surface-tertiary)]" />
        <div className="h-20 bg-[var(--color-surface-tertiary)] rounded-2xl rounded-bl-md w-2/3" />
      </div>
    </div>
  )
}
