import { useGroupAdmin } from '../context/GroupAdminContext'
import { MemberListItem } from './MemberListItem'

export function MemberList() {
  const { state, actions, meta } = useGroupAdmin()
  const { editMode, isLoadingMembers } = state
  const { setEditMode } = actions
  const { members, canManageMembers } = meta

  // Don't show member list while adding members
  if (editMode === 'add-member') {
    return null
  }

  return (
    <div className="border-t border-[var(--color-border-light)]">
      {/* Section header */}
      <div className="px-4 py-3 flex items-center justify-between">
        <span className="text-[13px] font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">
          Members ({members.length})
        </span>
        {canManageMembers && editMode === 'view' && (
          <button
            onClick={() => setEditMode('add-member')}
            className="flex items-center gap-1 text-[13px] font-medium text-[var(--color-bsky-500)] hover:text-[var(--color-bsky-600)] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Add
          </button>
        )}
      </div>

      {/* Member list */}
      <div className="px-2 pb-2">
        {isLoadingMembers ? (
          <div className="space-y-1">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 p-3 animate-pulse">
                <div className="w-11 h-11 rounded-full bg-[var(--color-surface-tertiary)]" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-[var(--color-surface-tertiary)] rounded-lg w-2/5" />
                  <div className="h-3 bg-[var(--color-surface-tertiary)] rounded-lg w-1/3" />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-0.5">
            {members.map((member) => (
              <MemberListItem key={member.inboxId} member={member} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
