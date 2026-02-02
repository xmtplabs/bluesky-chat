import { createSafeContext } from '../../../lib/context/createSafeContext'
import type { ContextValue } from '../../../lib/context/types'
import type { ChatConversation } from '../../../types'

export interface ConversationState {
  conversations: ChatConversation[]
  selectedId: string | null
  filter: 'primary' | 'requests'
  searchQuery: string
}

export interface ConversationActions {
  select: (id: string) => void
  search: (query: string) => void
  acceptRequest: (id: string) => void
}

export interface ConversationMeta {
  isLoading: boolean
  requestCount: number
}

export type ConversationContextValue = ContextValue<ConversationState, ConversationActions, ConversationMeta>

export const [ConversationProvider, useConversation, ConversationContext] = createSafeContext<ConversationContextValue>('Conversation')
