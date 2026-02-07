import { ChatHeader } from '../ChatHeader'
import { ChatMessageList } from '../ChatMessageList'
import { useChat } from '../context/ChatContext'
import * as Composer from '../../composer/Composer'

/**
 * Group-specific chat composition.
 * Shows header with group name and member count.
 */
export function GroupChat() {
  const { state, actions } = useChat()

  return (
    <div className="flex-1 flex flex-col bg-[var(--color-surface)]">
      <ChatHeader />
      <div className="flex-1 min-h-0 flex flex-col">
        <ChatMessageList />
      </div>
      <Composer.Provider onSend={actions.sendMessage} isSending={state.isSending}>
        <div className="px-4 py-4 border-t border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="flex items-end gap-3">
            <Composer.TextArea />
            <Composer.SendButton />
          </div>
        </div>
      </Composer.Provider>
    </div>
  )
}
