import { useGroupAdmin } from '../context/GroupAdminContext'

export function Footer() {
  const { state } = useGroupAdmin()
  const { editMode, error, selectedMembersToAdd } = state

  // Show member count when adding members
  const showMemberCount = editMode === 'add-member'

  // Don't render footer if there's nothing to show
  if (!error && !showMemberCount) {
    return null
  }

  return (
    <div className="border-t border-[var(--color-border)] px-4 py-3 bg-[var(--color-surface-secondary)]">
      {error && (
        <div className="p-3 bg-[var(--color-error-light)] border border-[var(--color-error)]/20 rounded-xl text-[var(--color-error)] text-[13px] mb-3">
          {error}
        </div>
      )}

      {showMemberCount && (
        <div className="text-center">
          <span className="text-[13px] text-[var(--color-text-secondary)]">
            {selectedMembersToAdd.length} member{selectedMembersToAdd.length !== 1 ? 's' : ''} selected
          </span>
        </div>
      )}
    </div>
  )
}
