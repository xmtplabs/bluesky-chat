import { useNewConversation } from '../context/NewConversationContext'

/**
 * Modal header with title and close button.
 */
export function Header() {
  const { actions } = useNewConversation()

  return (
    <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between">
      <h2 id="new-conversation-title" className="text-[17px] font-semibold text-[var(--color-text-primary)]">
        New Conversation
      </h2>
      <button
        onClick={actions.close}
        aria-label="Close"
        className="p-2 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] rounded-xl transition-colors duration-200"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}
