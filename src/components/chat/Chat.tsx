/**
 * Chat Compound Component
 *
 * Usage:
 * ```tsx
 * import { Chat } from './components/chat/Chat'
 *
 * // Using the automatic view selector
 * <Chat.View />
 *
 * // Or compose manually with the provider
 * <Chat.Provider>
 *   <Chat.Header />
 *   <Chat.MessageList />
 * </Chat.Provider>
 * ```
 */

export { ChatProviderBridge as Provider } from './ChatProviderBridge'
export { ChatHeader as Header } from './ChatHeader'
export { ChatMessageList as MessageList } from './ChatMessageList'
export { ChatEmpty as Empty, ChatMessagesEmpty as MessagesEmpty, ChatMessagesLoading as MessagesLoading } from './ChatEmpty'
export { ChatView as View } from './ChatView'

// Sub-components
export { SecurityBanner } from './SecurityBanner'
export { DateDivider } from './DateDivider'
export { MessageBubble } from './MessageBubble'
export { SystemMessage } from './SystemMessage'

// Variants
export { DMChat } from './variants/DMChat'
export { GroupChat } from './variants/GroupChat'

// Context hook
export { useChat } from './context/ChatContext'
