import { useNewConversation } from '../context/NewConversationContext'
import { UserListItem } from './UserListItem'

/**
 * Scrollable list of users to select from.
 */
export function UserList() {
  const { state, meta } = useNewConversation()
  const { searchQuery, listMode } = state
  const { displayList, isSearching } = meta

  if (isSearching) {
    return (
      <div className="flex-1 overflow-y-auto border-t border-[var(--color-border)]">
        <div className="space-y-0.5 p-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-xl animate-pulse">
              <div className="w-10 h-10 rounded-full bg-[var(--color-surface-tertiary)]" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 bg-[var(--color-surface-tertiary)] rounded w-2/5" />
                <div className="h-3 bg-[var(--color-surface-tertiary)] rounded w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (displayList.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto border-t border-[var(--color-border)]">
        <div className="p-8 text-center">
          <p className="text-[14px] text-[var(--color-text-secondary)]">
            {searchQuery.trim()
              ? 'No users found'
              : listMode === 'following'
                ? 'You\'re not following anyone yet'
                : 'No followers yet'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto border-t border-[var(--color-border)]">
      <div className="p-2">
        <div className="space-y-0.5">
          {displayList.map((user) => (
            <UserListItem key={user.id} user={user} />
          ))}
        </div>
      </div>
    </div>
  )
}
