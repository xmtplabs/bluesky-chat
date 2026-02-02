import { useMemo, useCallback, type ReactNode } from 'react'
import { ChatProvider, type ChatContextValue, type ChatMeta } from './context/ChatContext'
import { useXMTP } from '../../hooks/useXMTP'
import { useBluesky } from '../../hooks/useBluesky'
import { useConversations } from '../../hooks/useConversations'

interface ChatProviderBridgeProps {
  children: ReactNode
}

/**
 * Bridges Zustand stores to the Chat context.
 * This component reads from existing stores and provides data
 * through the compound component context pattern.
 */
export function ChatProviderBridge({ children }: ChatProviderBridgeProps) {
  const { selectedConversation, messages, inboxId, isLoading, isSending, sendMessage } = useXMTP()
  const { profile } = useBluesky()
  const { markAsRead } = useConversations()

  const handleSendMessage = useCallback(async (content: string) => {
    await sendMessage(content)
  }, [sendMessage])

  const handleMarkAsRead = useCallback(() => {
    if (selectedConversation) {
      markAsRead(selectedConversation.id)
    }
  }, [selectedConversation, markAsRead])

  const variant: ChatMeta['variant'] = selectedConversation?.isGroup ? 'group' : 'dm'

  const contextValue: ChatContextValue = useMemo(() => ({
    state: {
      conversation: selectedConversation ?? null,
      messages,
      isLoading,
      isSending
    },
    actions: {
      sendMessage: handleSendMessage,
      markAsRead: handleMarkAsRead
    },
    meta: {
      inboxId: inboxId ?? null,
      variant,
      myProfile: profile ?? null
    }
  }), [selectedConversation, messages, isLoading, isSending, handleSendMessage, handleMarkAsRead, inboxId, variant, profile])

  return (
    <ChatProvider value={contextValue}>
      {children}
    </ChatProvider>
  )
}
