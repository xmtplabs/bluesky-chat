import { useGroupAdmin } from '../context/GroupAdminContext'

export function Header() {
  const { state, actions, meta } = useGroupAdmin()
  const { editMode, isSaving } = state
  const { setEditMode, saveMetadata, addMembers, close } = actions
  const { canEditMetadata } = meta

  const isEditingMetadata = editMode === 'edit-metadata'
  const isAddingMember = editMode === 'add-member'
  const isEditing = isEditingMetadata || isAddingMember

  const handleCancel = () => {
    setEditMode('view')
  }

  const handleSave = async () => {
    if (isEditingMetadata) {
      await saveMetadata()
    } else if (isAddingMember) {
      await addMembers()
    }
  }

  const getTitle = () => {
    if (isEditingMetadata) return 'Edit Group'
    if (isAddingMember) return 'Add Members'
    return 'Group Settings'
  }

  return (
    <div className="relative h-12 flex items-center justify-between px-4 border-b border-[var(--color-border-light)]">
      {isEditing ? (
        <>
          <button
            onClick={handleCancel}
            disabled={isSaving}
            className="text-[15px] text-[var(--color-bsky-500)] hover:text-[var(--color-bsky-600)] transition-colors font-medium disabled:opacity-50"
          >
            Cancel
          </button>
          <span className="absolute left-1/2 -translate-x-1/2 text-[15px] font-semibold text-[var(--color-text-primary)]">
            {getTitle()}
          </span>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="text-[15px] text-[var(--color-bsky-500)] hover:text-[var(--color-bsky-600)] transition-colors font-semibold disabled:opacity-50"
          >
            {isSaving ? 'Saving' : 'Done'}
          </button>
        </>
      ) : (
        <>
          <button
            onClick={close}
            aria-label="Close"
            className="w-8 h-8 -ml-1 flex items-center justify-center text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] rounded-full transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <span className="absolute left-1/2 -translate-x-1/2 text-[15px] font-semibold text-[var(--color-text-primary)]">
            {getTitle()}
          </span>
          {canEditMetadata ? (
            <button
              onClick={() => setEditMode('edit-metadata')}
              className="text-[15px] text-[var(--color-bsky-500)] hover:text-[var(--color-bsky-600)] transition-colors font-medium"
            >
              Edit
            </button>
          ) : (
            <div className="w-8" />
          )}
        </>
      )}
    </div>
  )
}
