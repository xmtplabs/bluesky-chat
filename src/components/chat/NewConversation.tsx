import * as NewConversation from './new-conversation/NewConversation'

interface NewConversationModalProps {
  onClose: () => void
}

export function NewConversationModal({ onClose }: NewConversationModalProps) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-conversation-title"
        className="bg-[var(--color-surface)] rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col shadow-[var(--shadow-modal)] border border-[var(--color-border)]"
        onClick={(e) => e.stopPropagation()}
      >
        <NewConversation.Provider onClose={onClose}>
          <NewConversation.Header />
          <NewConversation.ModeSelector />
          <NewConversation.GroupNameInput />
          <NewConversation.SelectedUsers />
          <NewConversation.SearchInput />
          <NewConversation.NetworkFilter />
          <NewConversation.UserList />
          <NewConversation.Footer />
        </NewConversation.Provider>
      </div>
    </div>
  )
}

// Keep the old export name for backwards compatibility
export { NewConversationModal as NewConversation }
