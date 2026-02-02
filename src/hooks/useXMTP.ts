import { useEffect, useCallback } from 'react'
import { useAuthStore } from '../stores/authStore'
import { useChatStore } from '../stores/chatStore'
import { xmtpService } from '../services/xmtp'

export function useXMTP() {
  const {
    isXMTPConnected,
    xmtpAddress,
    xmtpInboxId,
    connectXMTP,
    isLoading: isConnecting
  } = useAuthStore()

  const {
    conversations,
    messages,
    selectedConversationId,
    isLoading: isLoadingChat,
    isSending,
    error,
    loadConversations,
    selectConversation,
    sendMessage,
    createDm,
    createGroup,
    startMessageStream,
    stopMessageStream
  } = useChatStore()

  // On mount, check if XMTP client is still connected (survives hot reload)
  // and sync the store state if needed
  useEffect(() => {
    const client = xmtpService.getClient()
    if (client && !isXMTPConnected) {
      // Client exists but store thinks we're disconnected (hot reload case)
      // Restore the connection state and reload data
      const inboxId = client.inboxId
      const address = client.accountIdentifier?.identifier
      useAuthStore.setState({
        isXMTPConnected: true,
        xmtpInboxId: inboxId,
        xmtpAddress: address
      })
    }
  }, [])

  // Start message streaming when connected
  useEffect(() => {
    if (isXMTPConnected) {
      loadConversations()
      startMessageStream()
    }

    return () => {
      stopMessageStream()
    }
  }, [isXMTPConnected])

  const canMessage = useCallback(
    async (addresses: string[]): Promise<Map<string, boolean>> => {
      if (!isXMTPConnected) {
        return new Map(addresses.map((a) => [a, false]))
      }
      return xmtpService.canMessage(addresses)
    },
    [isXMTPConnected]
  )

  const selectedConversation = conversations.find((c) => c.id === selectedConversationId)
  const selectedMessages = selectedConversationId
    ? messages.get(selectedConversationId) || []
    : []

  return {
    // Connection state
    isConnected: isXMTPConnected,
    isConnecting,
    address: xmtpAddress,
    inboxId: xmtpInboxId,

    // Conversations
    conversations,
    selectedConversation,
    selectedConversationId,
    selectConversation,

    // Messages
    messages: selectedMessages,
    sendMessage,
    isSending,

    // Actions
    createDm,
    createGroup,
    canMessage,
    connectXMTP,

    // Loading state
    isLoading: isLoadingChat,
    error
  }
}
