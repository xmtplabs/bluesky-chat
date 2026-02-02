import { useNewConversation } from '../context/NewConversationContext'

/**
 * Filter toggle between Following and Followers lists.
 * Hidden when search is active.
 */
export function NetworkFilter() {
  const { state, actions, meta } = useNewConversation()
  const { listMode, searchQuery } = state
  const { followers, following } = meta

  if (searchQuery.trim()) return null

  return (
    <div className="px-4 pb-3">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-[var(--color-text-tertiary)] uppercase tracking-wider">
          Your network
        </span>
        <div className="flex bg-[var(--color-surface-secondary)] rounded-lg p-0.5">
          <button
            onClick={() => actions.setListMode('following')}
            className={`px-3 py-1.5 text-[12px] font-medium rounded-md transition-all duration-200 ${
              listMode === 'following'
                ? 'bg-[var(--color-surface)] text-[var(--color-text-primary)] shadow-sm'
                : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
            }`}
          >
            Following{following.length > 0 && ` (${following.length})`}
          </button>
          <button
            onClick={() => actions.setListMode('followers')}
            className={`px-3 py-1.5 text-[12px] font-medium rounded-md transition-all duration-200 ${
              listMode === 'followers'
                ? 'bg-[var(--color-surface)] text-[var(--color-text-primary)] shadow-sm'
                : 'text-[var(--color-text-tertiary)] hover:text-[var(--color-text-secondary)]'
            }`}
          >
            Followers{followers.length > 0 && ` (${followers.length})`}
          </button>
        </div>
      </div>
    </div>
  )
}
