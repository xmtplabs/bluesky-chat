import { ChatProviderBridge } from './ChatProviderBridge'
import { useChat } from './context/ChatContext'
import { ChatEmpty } from './ChatEmpty'
import { DMChat } from './variants/DMChat'
import { GroupChat } from './variants/GroupChat'

/**
 * Internal component that selects the appropriate chat variant
 */
function ChatViewInner() {
  const { state, meta } = useChat()
  const { conversation } = state
  const { variant } = meta

  if (!conversation) {
    return <ChatEmpty />
  }

  return variant === 'group' ? <GroupChat /> : <DMChat />
}

/**
 * ChatView - Main entry point for the chat area.
 * Auto-selects DMChat or GroupChat based on conversation type.
 */
export function ChatView() {
  return (
    <ChatProviderBridge>
      <ChatViewInner />
    </ChatProviderBridge>
  )
}
