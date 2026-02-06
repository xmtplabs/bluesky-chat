import { useMemo, useCallback } from 'react'
import { useChatStore } from '../stores/chatStore'
import type { ChatConversation } from '../types'

export function useConversations() {
  const {
    conversations,
    selectedConversationId,
    unreadTotal,
    isLoadingConversations,
    selectConversation,
    loadConversations,
    markAsRead,
    acceptRequest,
    denyRequest
  } = useChatStore()

  // Check if a conversation should be in primary inbox
  const isPrimaryConversation = useCallback((conv: ChatConversation): boolean => {
    return conv.consentState === 'allowed'
  }, [])

  // Sort conversations by last message time (unread first)
  const sortedConversations = useMemo(() => {
    return [...conversations].sort((a, b) => {
      // Prioritize unread
      if (a.unreadCount > 0 && b.unreadCount === 0) return -1
      if (b.unreadCount > 0 && a.unreadCount === 0) return 1

      // Then by time
      return (b.lastMessageTime || 0) - (a.lastMessageTime || 0)
    })
  }, [conversations])

  // Primary inbox conversations (people we follow, accepted requests, or conversations we started)
  const primaryConversations = useMemo(() => {
    return sortedConversations.filter(isPrimaryConversation)
  }, [sortedConversations, isPrimaryConversation])

  // Request conversations (people we don't follow and didn't initiate)
  const requestConversations = useMemo(() => {
    return sortedConversations.filter((c) => !isPrimaryConversation(c))
  }, [sortedConversations, isPrimaryConversation])

  // Selected conversation
  const selectedConversation = useMemo(() => {
    return conversations.find((c) => c.id === selectedConversationId)
  }, [conversations, selectedConversationId])

  return {
    all: sortedConversations,
    primary: primaryConversations,
    requests: requestConversations,
    requestCount: requestConversations.length,
    selected: selectedConversation,
    selectedId: selectedConversationId,
    unreadTotal,
    isLoading: isLoadingConversations,
    select: selectConversation,
    refresh: loadConversations,
    markAsRead,
    acceptRequest,
    denyRequest
  }
}
