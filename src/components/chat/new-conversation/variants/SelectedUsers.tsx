import { useNewConversation } from '../context/NewConversationContext'
import { Avatar } from '../../../shared/Avatar'

/**
 * Displays selected users as chips. Only visible in group mode with selections.
 */
export function SelectedUsers() {
  const { state, actions } = useNewConversation()
  const { mode, selectedUsers } = state

  if (mode !== 'group' || selectedUsers.length === 0) return null

  return (
    <div className="px-4 pb-3">
      <div className="flex flex-wrap gap-1.5">
        {selectedUsers.map((user) => (
          <div
            key={user.did}
            className="flex items-center gap-1.5 pl-1 pr-2 py-1 bg-[var(--color-surface-selected)] rounded-full"
          >
            <Avatar src={user.avatar} fallback={user.displayName || user.handle} size="xs" />
            <span className="text-[12px] font-medium text-[var(--color-text-primary)]">
              {user.displayName || user.handle}
            </span>
            <button
              onClick={() => actions.removeUser(user.did)}
              className="p-0.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] rounded-full transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
