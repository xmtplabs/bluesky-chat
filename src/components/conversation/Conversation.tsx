/**
 * Conversation Compound Component
 *
 * Usage:
 * ```tsx
 * import { Conversation } from './components/conversation/Conversation'
 *
 * // Using explicit variants
 * <Conversation.PrimaryInbox searchQuery={query} />
 * <Conversation.RequestInbox />
 *
 * // Or compose manually with the provider
 * <Conversation.Provider filter="primary" searchQuery={query}>
 *   <Conversation.List />
 * </Conversation.Provider>
 * ```
 */

export { ConversationProviderBridge as Provider } from './ConversationProviderBridge'
export { ConversationListView as List } from './ConversationListView'
export { ConversationItem as Item } from './ConversationItem'

// Variants
export { PrimaryInbox } from './variants/PrimaryInbox'
export { RequestInbox } from './variants/RequestInbox'

// Context hook
export { useConversation } from './context/ConversationContext'
