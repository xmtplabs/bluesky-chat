import { ChatHeader } from '../ChatHeader'
import { ChatMessageList } from '../ChatMessageList'
import { ChatInput } from '../ChatInput'

/**
 * DM-specific chat composition.
 * Shows standard header with peer avatar and handle.
 */
export function DMChat() {
  return (
    <div className="flex-1 flex flex-col bg-[var(--color-surface)]">
      <ChatHeader />
      <div className="flex-1 min-h-0 flex flex-col">
        <ChatMessageList />
      </div>
      <ChatInput />
    </div>
  )
}
