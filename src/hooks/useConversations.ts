import { useMemo, useCallback } from 'react'
import { useChatStore } from '../stores/chatStore'
import { useProfileStore } from '../stores/profileStore'
import type { ChatConversation } from '../types'

export function useConversations() {
  const {
    conversations,
    selectedConversationId,
    unreadTotal,
    isLoading,
    selectConversation,
    loadConversations,
    markAsRead,
    acceptedRequests,
    acceptRequest,
    initiatedConversations
  } = useChatStore()

  const { followingDids } = useProfileStore()

  // Check if a conversation should be in primary inbox
  const isPrimaryConversation = useCallback((conv: ChatConversation): boolean => {
    // If we initiated this conversation, it's primary
    if (initiatedConversations.has(conv.id)) return true

    // If we explicitly accepted this request, it's primary
    if (acceptedRequests.has(conv.id)) return true

    // If we don't have following data yet, show all in primary (better UX than empty inbox)
    if (followingDids.size === 0) return true

    // For DMs: peer must be someone we follow
    if (!conv.isGroup) {
      const peerDid = conv.peerProfile?.did
      if (peerDid && followingDids.has(peerDid)) return true
      // If no peer profile/DID, put in primary (can't determine)
      if (!peerDid) return true
      return false
    }

    // For groups: at least one member (other than us) must be someone we follow
    // Since we don't have member DIDs easily available, put groups in primary for now
    // TODO: Implement proper group member DID resolution
    return true
  }, [initiatedConversations, acceptedRequests, followingDids])

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
    isLoading,
    select: selectConversation,
    refresh: loadConversations,
    markAsRead,
    acceptRequest
  }
}
