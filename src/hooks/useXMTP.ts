import { useEffect, useCallback } from 'react'
import { useAuthStore } from '../stores/authStore'
import { useChatStore } from '../stores/chatStore'
import { xmtpService, verboseLog } from '../services/xmtp'

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
    startConversationStream,
    stopStreaming
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
      const installationId = client.installationId

      verboseLog('🔥 HOT RELOAD RECOVERY: Client survived hot reload')
      verboseLog('   Installation ID:', installationId)
      verboseLog('   Inbox ID:', inboxId)
      verboseLog('   Address:', address)
      verboseLog('   Restoring store state (NOT creating new installation)')

      useAuthStore.setState({
        isXMTPConnected: true,
        xmtpInboxId: inboxId,
        xmtpAddress: address
      })
    }
  }, [])

  // Start streaming when connected
  useEffect(() => {
    if (isXMTPConnected) {
      loadConversations()
      startMessageStream()
      startConversationStream()
    }

    return () => {
      stopStreaming()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isXMTPConnected]) // Zustand store functions are stable references

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
