import { useMemo, useCallback, type ReactNode } from 'react'
import { ConversationProvider, type ConversationContextValue } from './context/ConversationContext'
import { useConversations } from '../../hooks/useConversations'

interface ConversationProviderBridgeProps {
  children: ReactNode
  filter?: 'primary' | 'requests'
  searchQuery?: string
  onSearchChange?: (query: string) => void
}

/**
 * Bridges Zustand stores to the Conversation context.
 * This component reads from existing stores and provides data
 * through the compound component context pattern.
 */
export function ConversationProviderBridge({
  children,
  filter = 'primary',
  searchQuery = '',
  onSearchChange
}: ConversationProviderBridgeProps) {
  const { primary, requests, requestCount, selectedId, isLoading, select, acceptRequest, denyRequest } = useConversations()

  const conversations = filter === 'requests' ? requests : primary

  // Filter conversations by search query (name, handle, and last message)
  const filteredConversations = useMemo(() => {
    if (!searchQuery.trim()) return conversations

    const query = searchQuery.toLowerCase()
    return conversations.filter((conv) => {
      const displayName = conv.isGroup
        ? conv.groupName || 'Group Chat'
        : conv.peerProfile?.displayName || ''
      const handle = conv.peerProfile?.handle || ''
      const lastMessage = conv.lastMessage || ''

      return (
        displayName.toLowerCase().includes(query) ||
        handle.toLowerCase().includes(query) ||
        lastMessage.toLowerCase().includes(query)
      )
    })
  }, [conversations, searchQuery])

  const handleSearch = useCallback((query: string) => {
    onSearchChange?.(query)
  }, [onSearchChange])

  const contextValue: ConversationContextValue = useMemo(() => ({
    state: {
      conversations: filteredConversations,
      selectedId,
      filter,
      searchQuery
    },
    actions: {
      select,
      search: handleSearch,
      acceptRequest,
      denyRequest
    },
    meta: {
      isLoading,
      requestCount
    }
  }), [filteredConversations, selectedId, filter, searchQuery, select, handleSearch, acceptRequest, denyRequest, isLoading, requestCount])

  return (
    <ConversationProvider value={contextValue}>
      {children}
    </ConversationProvider>
  )
}
