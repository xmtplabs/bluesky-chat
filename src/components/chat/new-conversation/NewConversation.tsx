/**
 * NewConversation Compound Component
 *
 * Handles creating new DM or group conversations.
 *
 * Usage:
 * ```tsx
 * import * as NewConversation from './components/chat/new-conversation/NewConversation'
 *
 * <NewConversation.Root onClose={handleClose}>
 *   <NewConversation.Header />
 *   <NewConversation.ModeSelector />
 *   <NewConversation.GroupNameInput />
 *   <NewConversation.SelectedUsers />
 *   <NewConversation.SearchInput />
 *   <NewConversation.NetworkFilter />
 *   <NewConversation.UserList />
 *   <NewConversation.Footer />
 * </NewConversation.Root>
 * ```
 */

export { NewConversationProviderBridge as Provider } from './NewConversationProviderBridge'

// Variants
export { Header } from './variants/Header'
export { ModeSelector } from './variants/ModeSelector'
export { GroupNameInput } from './variants/GroupNameInput'
export { SelectedUsers } from './variants/SelectedUsers'
export { SearchInput } from './variants/SearchInput'
export { NetworkFilter } from './variants/NetworkFilter'
export { UserList } from './variants/UserList'
export { UserListItem } from './variants/UserListItem'
export { Footer } from './variants/Footer'

// Shared components
export { Avatar } from '../../shared/Avatar'

// Context hook and types
export { useNewConversation } from './context/NewConversationContext'
export type { XmtpUserStatus, ConversationMode, ListMode } from './context/NewConversationContext'
