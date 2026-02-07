import { useRef, useEffect } from 'react'
import { useComposer } from './context/ComposerContext'

/**
 * Auto-resizing textarea for message composition
 */
export function ComposerTextArea() {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const { state, actions, meta } = useComposer()
  const { message, isSending } = state
  const { setMessage, send } = actions
  const { placeholder, maxLength } = meta

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`
    }
  }, [message])

  // Refocus textarea after sending completes
  useEffect(() => {
    if (!isSending && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [isSending])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <textarea
      ref={textareaRef}
      value={message}
      onChange={(e) => setMessage(e.target.value)}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      maxLength={maxLength}
      rows={1}
      className="flex-1 px-4 py-[9px] h-10 max-h-[120px] bg-[var(--color-surface-secondary)] rounded-2xl text-[15px] text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] resize-none focus:outline-none focus:bg-[var(--color-surface-tertiary)] transition-colors leading-[22px]"
      disabled={isSending}
    />
  )
}
