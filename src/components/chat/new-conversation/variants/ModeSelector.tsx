import { useNewConversation } from '../context/NewConversationContext'

/**
 * Toggle between DM and Group conversation modes.
 */
export function ModeSelector() {
  const { state, actions } = useNewConversation()
  const { mode } = state

  return (
    <div className="px-4 pt-4 pb-3">
      <div className="flex gap-2">
        <button
          onClick={() => actions.setMode('dm')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl transition-all duration-200 border-2 ${
            mode === 'dm'
              ? 'bg-[var(--color-bsky-50)] border-[var(--color-bsky-500)] text-[var(--color-bsky-600)]'
              : 'bg-[var(--color-surface-secondary)] border-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]'
          }`}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <span className="text-[14px] font-semibold">Direct Message</span>
        </button>
        <button
          onClick={() => actions.setMode('group')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl transition-all duration-200 border-2 ${
            mode === 'group'
              ? 'bg-[var(--color-bsky-50)] border-[var(--color-bsky-500)] text-[var(--color-bsky-600)]'
              : 'bg-[var(--color-surface-secondary)] border-transparent text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]'
          }`}
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <span className="text-[14px] font-semibold">Group</span>
        </button>
      </div>
    </div>
  )
}
