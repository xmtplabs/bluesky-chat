import { useNewConversation } from '../context/NewConversationContext'

/**
 * Search input for finding Bluesky users.
 */
export function SearchInput() {
  const { state, actions } = useNewConversation()
  const { searchQuery } = state

  return (
    <div className="px-4 pb-3">
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-[var(--color-text-tertiary)]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
          />
        </svg>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => actions.setSearchQuery(e.target.value)}
          placeholder="Search Bluesky users..."
          autoComplete="off"
          aria-label="Search Bluesky users"
          className="w-full pl-10 pr-4 py-2.5 bg-[var(--color-surface-secondary)] rounded-xl text-[14px] text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:bg-[var(--color-surface-tertiary)] transition-colors"
        />
      </div>
    </div>
  )
}
