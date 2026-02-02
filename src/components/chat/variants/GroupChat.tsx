import { ChatHeader } from '../ChatHeader'
import { ChatMessageList } from '../ChatMessageList'
import { ChatInput } from '../ChatInput'

/**
 * Group-specific chat composition.
 * Shows header with group name and member count.
 */
export function GroupChat() {
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
