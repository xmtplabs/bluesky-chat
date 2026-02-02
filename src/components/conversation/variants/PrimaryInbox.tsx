import { ConversationProviderBridge } from '../ConversationProviderBridge'
import { ConversationListView } from '../ConversationListView'

interface PrimaryInboxProps {
  searchQuery?: string
  onSearchChange?: (query: string) => void
}

/**
 * Primary inbox - shows conversations from people you follow
 */
export function PrimaryInbox({ searchQuery = '', onSearchChange }: PrimaryInboxProps) {
  return (
    <ConversationProviderBridge filter="primary" searchQuery={searchQuery} onSearchChange={onSearchChange}>
      <ConversationListView />
    </ConversationProviderBridge>
  )
}
