import { createSafeContext } from '../../../lib/context/createSafeContext'
import type { ContextValue } from '../../../lib/context/types'
import type { ChatConversation, ChatMessage, UserProfile } from '../../../types'

export interface ChatState {
  conversation: ChatConversation | null
  messages: ChatMessage[]
  isLoading: boolean
  isSending: boolean
}

export interface ChatActions {
  sendMessage: (content: string) => Promise<void>
  markAsRead: () => void
}

export interface ChatMeta {
  inboxId: string | null
  variant: 'dm' | 'group'
  myProfile: UserProfile | null
}

export type ChatContextValue = ContextValue<ChatState, ChatActions, ChatMeta>

export const [ChatProvider, useChat, ChatContext] = createSafeContext<ChatContextValue>('Chat')
