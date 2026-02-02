import { useState, useRef, useEffect } from 'react'
import { useChat } from './context/ChatContext'

/**
 * Chat input component - message composition and sending
 */
export function ChatInput() {
  const [message, setMessage] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { state, actions } = useChat()
  const { conversation, isSending } = state
  const { sendMessage } = actions

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`
    }
  }, [message])

  if (!conversation) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const trimmed = message.trim()
    if (!trimmed || isSending) return

    setMessage('')
    await sendMessage(trimmed)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  const canSend = message.trim().length > 0 && !isSending

  return (
    <form onSubmit={handleSubmit} className="px-4 py-4 border-t border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex items-end gap-3">
        <textarea
          ref={textareaRef}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          rows={1}
          className="flex-1 px-4 py-[9px] h-10 max-h-[120px] bg-[var(--color-surface-secondary)] rounded-2xl text-[15px] text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] resize-none focus:outline-none focus:bg-[var(--color-surface-tertiary)] transition-colors leading-[22px]"
          disabled={isSending}
        />
        <button
          type="submit"
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
      </div>
    </form>
  )
}
