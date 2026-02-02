import { ConversationProviderBridge } from '../ConversationProviderBridge'
import { ConversationListView } from '../ConversationListView'

interface RequestInboxProps {
  searchQuery?: string
  onSearchChange?: (query: string) => void
}

/**
 * Request inbox - shows message requests from people you don't follow
 */
export function RequestInbox({ searchQuery = '', onSearchChange }: RequestInboxProps) {
  return (
    <ConversationProviderBridge filter="requests" searchQuery={searchQuery} onSearchChange={onSearchChange}>
      <ConversationListView />
    </ConversationProviderBridge>
  )
}
