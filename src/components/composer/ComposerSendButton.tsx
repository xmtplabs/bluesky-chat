import { useComposer } from './context/ComposerContext'

/**
 * Send button with loading state
 */
export function ComposerSendButton() {
  const { state, actions } = useComposer()
  const { canSend, isSending } = state
  const { send } = actions

  return (
    <button
      type="button"
      onClick={send}
      disabled={!canSend}
      aria-label={isSending ? 'Sending message' : 'Send message'}
      className={`
        w-10 h-10 rounded-full transition-colors duration-200 flex-shrink-0 flex items-center justify-center self-end
        ${canSend
          ? 'bg-[var(--color-bsky-500)] hover:bg-[var(--color-bsky-600)] active:bg-[var(--color-bsky-700)] text-white'
          : 'bg-[var(--color-surface-tertiary)] text-[var(--color-text-disabled)] cursor-not-allowed'
        }
      `}
    >
      {isSending ? (
        <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
      ) : (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"
          />
        </svg>
      )}
    </button>
  )
}
