import { useNewConversation } from '../context/NewConversationContext'
import { Avatar } from '../../../shared/Avatar'

/**
 * Footer with error display, selection summary, and action button.
 * Only visible when users are selected.
 */
export function Footer() {
  const { state, actions, meta } = useNewConversation()
  const { mode, selectedUsers, isCreating, error } = state
  const { canCreate } = meta

  if (selectedUsers.length === 0) return null

  return (
    <div className="p-4 border-t border-[var(--color-border)] space-y-3">
      {error && (
        <div className="p-2.5 bg-[var(--color-error-light)] rounded-xl text-[var(--color-error)] text-[13px]">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        {mode === 'group' && (
          <span className="text-[13px] text-[var(--color-text-secondary)]">
            {selectedUsers.length} selected
          </span>
        )}
        {mode === 'dm' && (
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Avatar src={selectedUsers[0].avatar} fallback={selectedUsers[0].displayName || selectedUsers[0].handle} size="sm" />
            <span className="text-[14px] font-medium text-[var(--color-text-primary)] truncate">
              {selectedUsers[0].displayName || selectedUsers[0].handle}
            </span>
          </div>
        )}
        <button
          onClick={actions.startConversation}
          disabled={!canCreate || isCreating}
          className={`py-2.5 px-5 text-[14px] font-semibold rounded-full transition-all duration-200 ${
            canCreate && !isCreating
              ? 'bg-[var(--color-bsky-500)] hover:bg-[var(--color-bsky-600)] text-white'
              : 'bg-[var(--color-surface-tertiary)] text-[var(--color-text-disabled)] cursor-not-allowed'
          }`}
        >
          {isCreating ? 'Starting...' : mode === 'dm' ? 'Message' : 'Create'}
        </button>
      </div>
    </div>
  )
}
