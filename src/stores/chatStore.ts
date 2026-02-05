import { create } from 'zustand'
import type { DecodedMessage } from '@xmtp/browser-sdk'
import type { ChatConversation, ChatMessage, BlueskyProfile } from '../types'
import { xmtpService } from '../services/xmtp'
import { identityService } from '../services/identity'
import { blueskyService } from '../services/bluesky'

// Module-level timeout for conversation stream debouncing (cleared on stop)
let conversationReloadTimeout: ReturnType<typeof setTimeout> | null = null

/**
 * Get a display name for a sender inbox ID.
 * Tries to resolve from identity cache, falls back to truncated ID.
 */
function getSenderName(senderInboxId: string): string {
  // Try to get the DID from identity service
  const did = identityService.getDidFromInboxId(senderInboxId)
  if (did) {
    // Try to get cached profile
    const profile = identityService.getCachedProfile(did)
    if (profile) {
      return profile.displayName || profile.handle
    }
  }
  // Fallback to truncated inbox ID
  return senderInboxId.slice(0, 8) + '...'
}

/**
 * Parse XMTP message content and detect system messages.
 * Returns parsed content and system message metadata.
 */
function parseMessageContent(
  msg: DecodedMessage,
  isGroup: boolean
): { content: string; isSystemMessage: boolean; systemMessageType?: ChatMessage['systemMessageType'] } {
  const content = msg.content
  const senderInboxId = msg.senderInboxId || ''
  const myInboxId = xmtpService.getInboxId()
  const isSelf = senderInboxId === myInboxId

  // Check if content is a string (regular text message)
  if (typeof content === 'string') {
    return { content, isSystemMessage: false }
  }

  // Check if it's a GroupUpdated message (membership changes)
  if (content && typeof content === 'object') {
    // GroupUpdated has addedInboxes, removedInboxes, metadataFieldChanges
    const groupUpdate = content as {
      addedInboxes?: Array<{ inboxId: string }>
      removedInboxes?: Array<{ inboxId: string }>
      metadataFieldChanges?: Array<{ fieldName: string; oldValue?: string; newValue?: string }>
    }

    // Skip membership updates in DMs - they're not meaningful
    if (!isGroup) {
      return { content: '', isSystemMessage: true, systemMessageType: 'unknown' }
    }

    // Get sender name for active voice messages
    const actorName = isSelf ? 'You' : getSenderName(senderInboxId)

    // Handle member additions
    if (groupUpdate.addedInboxes && groupUpdate.addedInboxes.length > 0) {
      const addedNames = groupUpdate.addedInboxes
        .map((m) => m.inboxId === myInboxId ? 'you' : getSenderName(m.inboxId))
      const text = addedNames.length === 1
        ? `${actorName} added ${addedNames[0]}`
        : `${actorName} added ${addedNames.slice(0, -1).join(', ')} and ${addedNames[addedNames.length - 1]}`
      return { content: text, isSystemMessage: true, systemMessageType: 'member_added' }
    }

    // Handle member removals
    if (groupUpdate.removedInboxes && groupUpdate.removedInboxes.length > 0) {
      const removedNames = groupUpdate.removedInboxes
        .map((m) => m.inboxId === myInboxId ? 'you' : getSenderName(m.inboxId))
      // Check if someone left voluntarily (removed themselves)
      const selfLeft = groupUpdate.removedInboxes.some((m) => m.inboxId === senderInboxId)
      if (selfLeft && groupUpdate.removedInboxes.length === 1) {
        const text = isSelf ? 'You left the group' : `${actorName} left the group`
        return { content: text, isSystemMessage: true, systemMessageType: 'member_removed' }
      }
      const text = removedNames.length === 1
        ? `${actorName} removed ${removedNames[0]}`
        : `${actorName} removed ${removedNames.slice(0, -1).join(', ')} and ${removedNames[removedNames.length - 1]}`
      return { content: text, isSystemMessage: true, systemMessageType: 'member_removed' }
    }

    // Handle metadata changes (name, description, image)
    if (groupUpdate.metadataFieldChanges && groupUpdate.metadataFieldChanges.length > 0) {
      const changes = groupUpdate.metadataFieldChanges
        .map((c) => {
          if (c.fieldName === 'group_name') {
            return c.newValue
              ? `${actorName} renamed the group to "${c.newValue}"`
              : `${actorName} cleared the group name`
          }
          if (c.fieldName === 'description') {
            return c.newValue
              ? `${actorName} updated the group description`
              : `${actorName} cleared the group description`
          }
          if (c.fieldName === 'group_image_url_square') {
            return c.newValue
              ? `${actorName} updated the group image`
              : `${actorName} removed the group image`
          }
          // Skip unknown field names to avoid exposing raw values
          return null
        })
        .filter(Boolean)
        .join(', ')

      if (!changes) {
        return { content: '', isSystemMessage: true, systemMessageType: 'unknown' }
      }
      return { content: changes, isSystemMessage: true, systemMessageType: 'group_updated' }
    }

    // Unknown object type - try to avoid [object Object]
    return { content: '', isSystemMessage: true, systemMessageType: 'unknown' }
  }

  // Fallback - convert to string but avoid [object Object]
  const stringContent = content?.toString() || ''
  if (stringContent === '[object Object]') {
    return { content: '', isSystemMessage: true, systemMessageType: 'unknown' }
  }

  return { content: stringContent, isSystemMessage: false }
}

// Load accepted requests from localStorage
const loadAcceptedRequests = (): Set<string> => {
  try {
    const stored = localStorage.getItem('xmtp_accepted_requests')
    if (stored) {
      return new Set(JSON.parse(stored))
    }
  } catch (error) {
    console.error('Failed to load accepted requests:', error)
  }
  return new Set()
}

// Save accepted requests to localStorage
const saveAcceptedRequests = (requests: Set<string>) => {
  try {
    localStorage.setItem('xmtp_accepted_requests', JSON.stringify([...requests]))
  } catch (error) {
    console.error('Failed to save accepted requests:', error)
  }
}

// Load initiated conversations from localStorage (conversations we started)
const loadInitiatedConversations = (): Set<string> => {
  try {
    const stored = localStorage.getItem('xmtp_initiated_conversations')
    if (stored) {
      return new Set(JSON.parse(stored))
    }
  } catch (error) {
    console.error('Failed to load initiated conversations:', error)
  }
  return new Set()
}

// Save initiated conversations to localStorage
const saveInitiatedConversations = (conversations: Set<string>) => {
  try {
    localStorage.setItem('xmtp_initiated_conversations', JSON.stringify([...conversations]))
  } catch (error) {
    console.error('Failed to save initiated conversations:', error)
  }
}

// Get last known conversation count for a DID (used to skip skeleton loading for known-empty inboxes)
export const getLastKnownConversationCount = (did: string): number | null => {
  try {
    const stored = localStorage.getItem(`xmtp_conversation_count_${did}`)
    return stored !== null ? parseInt(stored, 10) : null
  } catch {
    return null
  }
}

// Save conversation count for a DID
const saveConversationCount = (did: string, count: number) => {
  try {
    localStorage.setItem(`xmtp_conversation_count_${did}`, String(count))
  } catch (error) {
    console.error('Failed to save conversation count:', error)
  }
}

interface ChatState {
  conversations: ChatConversation[]
  messages: Map<string, ChatMessage[]>
  selectedConversationId: string | null
  isLoading: boolean
  isSending: boolean
  error: string | null
  unreadTotal: number
  acceptedRequests: Set<string>
  initiatedConversations: Set<string> // Conversations we started

  // Actions
  loadConversations: () => Promise<void>
  selectConversation: (conversationId: string | null) => void
  loadMessages: (conversationId: string) => Promise<void>
  sendMessage: (content: string) => Promise<void>
  createDm: (peerAddress: string, peerProfile?: BlueskyProfile) => Promise<string>
  createGroup: (memberAddresses: string[], name?: string) => Promise<string>
  startMessageStream: () => Promise<void>
  startConversationStream: () => Promise<void>
  stopStreaming: () => Promise<void>
  markAsRead: (conversationId: string) => void
  acceptRequest: (conversationId: string) => void
  clearError: () => void
  reset: () => void
}

export const useChatStore = create<ChatState>((set, get) => ({
  conversations: [],
  messages: new Map(),
  selectedConversationId: null,
  isLoading: false,
  isSending: false,
  error: null,
  unreadTotal: 0,
  acceptedRequests: loadAcceptedRequests(),
  initiatedConversations: loadInitiatedConversations(),

  loadConversations: async () => {
    set({ isLoading: true, error: null })

    try {
      const xmtpConversations = await xmtpService.getConversations()
      const chatConversations: ChatConversation[] = []
      const myInboxId = xmtpService.getInboxId()

      for (const conv of xmtpConversations) {
        const members = await xmtpService.getMembers(conv)
        // Use SDK's isGroup check - don't rely on member count since a group can have just 2 members
        const convIsGroup = xmtpService.isGroup(conv)
        let peerProfile: BlueskyProfile | undefined

        if (!convIsGroup) {
          // Get peer from members - find member that isn't us
          const peerMember = members.find((m) => m.inboxId !== myInboxId)
          const peerInboxId = peerMember?.inboxId

          if (peerInboxId) {
            // Try to resolve inbox ID to DID (checks local cache, then backend)
            const peerDid = await identityService.resolveInboxToDid(peerInboxId)
            if (peerDid) {
              // Check profile cache first
              const cachedProfile = identityService.getCachedProfile(peerDid)
              if (cachedProfile) {
                peerProfile = cachedProfile
              } else {
                // Try to fetch from Bluesky
                try {
                  const profile = await blueskyService.getProfile(peerDid)
                  if (profile) {
                    peerProfile = profile
                    identityService.cacheProfile(profile)
                  }
                } catch (err) {
                  console.debug('Could not fetch Bluesky profile for DID:', peerDid, err)
                }
              }
            }
          }
        }

        // Get last message
        const lastMessage = await conv.lastMessage()

        // Parse last message content properly (avoiding [object Object] for system messages)
        let lastMessagePreview: string | undefined
        if (lastMessage) {
          const parsed = parseMessageContent(lastMessage, convIsGroup)
          // Skip system messages in preview, or use their formatted text
          if (!parsed.isSystemMessage) {
            lastMessagePreview = parsed.content
          } else if (parsed.content) {
            // Use system message text but don't show empty ones
            lastMessagePreview = parsed.content
          }
        }

        // Get peer inbox ID for DMs
        const peerInboxId = !convIsGroup
          ? members.find((m) => m.inboxId !== myInboxId)?.inboxId
          : undefined

        chatConversations.push({
          id: conv.id,
          topic: conv.id, // Use id as topic since topic property isn't available
          peerAddress: peerInboxId || '',
          peerProfile,
          lastMessage: lastMessagePreview,
          lastMessageTime: lastMessage?.sentAtNs
            ? Number(lastMessage.sentAtNs) / 1_000_000
            : undefined,
          unreadCount: 0,
          isGroup: convIsGroup,
          groupName: xmtpService.getGroupName(conv) || undefined,
          groupDescription: xmtpService.getGroupDescription(conv) || undefined,
          groupImageUrl: xmtpService.getGroupImageUrl(conv) || undefined,
          groupMembers: members.map((m) => m.inboxId)
        })
      }

      // Sort by last message time
      chatConversations.sort((a, b) => (b.lastMessageTime || 0) - (a.lastMessageTime || 0))

      set({ conversations: chatConversations })

      // Persist conversation count for this user (used to skip skeleton loading on next launch)
      const did = blueskyService.getDid()
      if (did) {
        saveConversationCount(did, chatConversations.length)
      }
    } catch (error) {
      console.error('Failed to load conversations:', error)
      set({ error: error instanceof Error ? error.message : 'Failed to load conversations' })
    } finally {
      set({ isLoading: false })
    }
  },

  selectConversation: (conversationId: string | null) => {
    set({ selectedConversationId: conversationId })

    if (conversationId) {
      get().loadMessages(conversationId)
      get().markAsRead(conversationId)
    }
  },

  loadMessages: async (conversationId: string) => {
    set({ isLoading: true })

    try {
      const conversation = await xmtpService.getConversation(conversationId)
      if (!conversation) {
        throw new Error('Conversation not found')
      }

      // Determine if this is a group conversation using SDK's native check
      const isGroup = xmtpService.isGroup(conversation)

      const xmtpMessages = await xmtpService.getMessages(conversation)
      const chatMessages: ChatMessage[] = xmtpMessages
        .map((msg) => {
          const parsed = parseMessageContent(msg, isGroup)

          // Skip empty system messages (e.g., membership updates in DMs)
          if (parsed.isSystemMessage && !parsed.content) {
            return null
          }

          return {
            id: msg.id,
            conversationId,
            senderAddress: msg.senderInboxId || '',
            content: parsed.content,
            sentAt: Number(msg.sentAtNs) / 1_000_000,
            status: 'sent' as const,
            isSystemMessage: parsed.isSystemMessage,
            systemMessageType: parsed.systemMessageType
          }
        })
        .filter((msg): msg is ChatMessage => msg !== null)

      const messages = new Map(get().messages)
      messages.set(conversationId, chatMessages)
      set({ messages })
    } catch (error) {
      console.error('Failed to load messages:', error)
      set({ error: error instanceof Error ? error.message : 'Failed to load messages' })
    } finally {
      set({ isLoading: false })
    }
  },

  sendMessage: async (content: string) => {
    const { selectedConversationId, messages } = get()
    if (!selectedConversationId) return

    set({ isSending: true, error: null })

    try {
      const conversation = await xmtpService.getConversation(selectedConversationId)
      if (!conversation) {
        throw new Error('Conversation not found')
      }

      // Optimistic update
      const tempId = `temp-${Date.now()}`
      const tempMessage: ChatMessage = {
        id: tempId,
        conversationId: selectedConversationId,
        senderAddress: xmtpService.getInboxId() || '',
        content,
        sentAt: Date.now(),
        status: 'sending'
      }

      const currentMessages = messages.get(selectedConversationId) || []
      const newMessages = new Map(messages)
      newMessages.set(selectedConversationId, [...currentMessages, tempMessage])
      set({ messages: newMessages })

      // Send the message
      const messageId = await xmtpService.sendMessage(conversation, content)

      // Update message with real ID
      const updatedMessages = new Map(get().messages)
      const convMessages = updatedMessages.get(selectedConversationId) || []
      const msgIndex = convMessages.findIndex((m) => m.id === tempId)
      if (msgIndex !== -1) {
        convMessages[msgIndex] = { ...convMessages[msgIndex], id: messageId, status: 'sent' }
        updatedMessages.set(selectedConversationId, [...convMessages])
        set({ messages: updatedMessages })
      }

      // Update conversation's last message
      const conversations = get().conversations.map((c) =>
        c.id === selectedConversationId
          ? { ...c, lastMessage: content, lastMessageTime: Date.now() }
          : c
      )
      set({ conversations })
    } catch (error) {
      console.error('Failed to send message:', error)
      set({ error: error instanceof Error ? error.message : 'Failed to send message' })

      // Mark message as failed
      const failedMessages = new Map(get().messages)
      const convMessages = failedMessages.get(selectedConversationId) || []
      const lastMsg = convMessages[convMessages.length - 1]
      if (lastMsg?.status === 'sending') {
        convMessages[convMessages.length - 1] = { ...lastMsg, status: 'failed' }
        failedMessages.set(selectedConversationId, [...convMessages])
        set({ messages: failedMessages })
      }
    } finally {
      set({ isSending: false })
    }
  },

  createDm: async (peerInboxId: string, peerProfile?: BlueskyProfile) => {
    set({ isLoading: true, error: null })

    try {
      const conversation = await xmtpService.createDm(peerInboxId)

      // Cache the peer's profile and register the inboxId -> DID mapping
      // This ensures we can resolve their profile when loading conversations later
      if (peerProfile) {
        identityService.cacheProfile(peerProfile)
        // Register the reverse mapping for lookups
        identityService.registerIndexedMapping(peerInboxId, peerProfile.did)
      }

      const newConv: ChatConversation = {
        id: conversation.id,
        topic: conversation.id,
        peerAddress: peerInboxId, // Using inbox ID as the peer identifier
        peerProfile,
        unreadCount: 0,
        isGroup: false
      }

      // Mark as initiated by us (so it shows in primary inbox)
      const newInitiated = new Set(get().initiatedConversations)
      newInitiated.add(conversation.id)
      saveInitiatedConversations(newInitiated)

      const conversations = [newConv, ...get().conversations]
      set({ conversations, selectedConversationId: conversation.id, initiatedConversations: newInitiated })

      return conversation.id
    } catch (error) {
      console.error('Failed to create DM:', error)
      set({ error: error instanceof Error ? error.message : 'Failed to create conversation' })
      throw error
    } finally {
      set({ isLoading: false })
    }
  },

  createGroup: async (memberInboxIds: string[], name?: string) => {
    set({ isLoading: true, error: null })

    try {
      if (memberInboxIds.length === 0) {
        throw new Error('No valid XMTP members found')
      }

      const conversation = await xmtpService.createGroup(memberInboxIds, { name })

      const newConv: ChatConversation = {
        id: conversation.id,
        topic: conversation.id,
        peerAddress: '',
        unreadCount: 0,
        isGroup: true,
        groupName: name,
        groupMembers: memberInboxIds
      }

      // Mark as initiated by us (so it shows in primary inbox)
      const newInitiated = new Set(get().initiatedConversations)
      newInitiated.add(conversation.id)
      saveInitiatedConversations(newInitiated)

      const conversations = [newConv, ...get().conversations]
      set({ conversations, selectedConversationId: conversation.id, initiatedConversations: newInitiated })

      return conversation.id
    } catch (error) {
      console.error('Failed to create group:', error)
      set({ error: error instanceof Error ? error.message : 'Failed to create group' })
      throw error
    } finally {
      set({ isLoading: false })
    }
  },

  startMessageStream: async () => {
    try {
      const myInboxId = xmtpService.getInboxId()

      await xmtpService.streamMessages((message: DecodedMessage) => {
        const { messages, conversations, selectedConversationId } = get()

        // Skip our own messages - they're handled via optimistic update in sendMessage
        if (message.senderInboxId === myInboxId) {
          return
        }

        // Find conversation for this message
        const conversationId = message.conversationId

        if (!conversationId) {
          // New conversation, reload list
          get().loadConversations()
          return
        }

        // Check if we have this conversation
        const conv = conversations.find((c) => c.id === conversationId)
        if (!conv) {
          get().loadConversations()
          return
        }

        // Parse message content, handling system messages
        const parsed = parseMessageContent(message, conv.isGroup)

        // Skip empty system messages (e.g., membership updates in DMs)
        if (parsed.isSystemMessage && !parsed.content) {
          return
        }

        // Add message to state
        const chatMessage: ChatMessage = {
          id: message.id,
          conversationId,
          senderAddress: message.senderInboxId || '',
          content: parsed.content,
          sentAt: Number(message.sentAtNs) / 1_000_000,
          status: 'delivered',
          isSystemMessage: parsed.isSystemMessage,
          systemMessageType: parsed.systemMessageType
        }

        const currentMessages = messages.get(conversationId) || []
        // Avoid duplicate messages (belt and suspenders)
        if (currentMessages.some((m) => m.id === chatMessage.id)) {
          return
        }

        const newMessages = new Map(messages)
        newMessages.set(conversationId, [...currentMessages, chatMessage])

        // Update conversation metadata
        // Don't increment unread count for system messages, and use a preview for lastMessage
        const newConversations = conversations.map((c) => {
          if (c.id === conversationId) {
            const lastMessagePreview = chatMessage.isSystemMessage
              ? chatMessage.content // System message text is already formatted
              : chatMessage.content
            return {
              ...c,
              lastMessage: lastMessagePreview,
              lastMessageTime: chatMessage.sentAt,
              // Don't increment unread for system messages
              unreadCount: chatMessage.isSystemMessage
                ? c.unreadCount
                : c.id === selectedConversationId
                  ? 0
                  : c.unreadCount + 1
            }
          }
          return c
        })

        const unreadTotal = newConversations.reduce((sum, c) => sum + c.unreadCount, 0)

        set({ messages: newMessages, conversations: newConversations, unreadTotal })

        // Show notification only for non-system messages
        if (!chatMessage.isSystemMessage) {
          const senderName =
            conv?.peerProfile?.displayName || conv?.peerProfile?.handle || 'New message'

          if (window.electronAPI?.showNotification) {
            window.electronAPI.showNotification(senderName, chatMessage.content)
          }
        }
        if (window.electronAPI?.setBadgeCount) {
          window.electronAPI.setBadgeCount(unreadTotal)
        }
      })
    } catch (error) {
      console.error('Failed to start message stream:', error)
    }
  },

  startConversationStream: async () => {
    try {
      await xmtpService.streamConversations((conversation) => {
        console.log('New conversation received via stream:', conversation.id)

        // Debounce: wait 100ms before reloading in case more conversations arrive
        if (conversationReloadTimeout) clearTimeout(conversationReloadTimeout)
        conversationReloadTimeout = setTimeout(() => {
          conversationReloadTimeout = null
          get().loadConversations()
        }, 100)
      })
    } catch (error) {
      console.error('Failed to start conversation stream:', error)
    }
  },

  stopStreaming: async () => {
    // Clear any pending conversation reload
    if (conversationReloadTimeout) {
      clearTimeout(conversationReloadTimeout)
      conversationReloadTimeout = null
    }
    await xmtpService.stopStreaming()
  },

  markAsRead: (conversationId: string) => {
    const conversations = get().conversations.map((c) =>
      c.id === conversationId ? { ...c, unreadCount: 0 } : c
    )
    const unreadTotal = conversations.reduce((sum, c) => sum + c.unreadCount, 0)
    set({ conversations, unreadTotal })
    if (window.electronAPI?.setBadgeCount) {
      window.electronAPI.setBadgeCount(unreadTotal)
    }
  },

  acceptRequest: (conversationId: string) => {
    const newAcceptedRequests = new Set(get().acceptedRequests)
    newAcceptedRequests.add(conversationId)
    saveAcceptedRequests(newAcceptedRequests)
    set({ acceptedRequests: newAcceptedRequests })
  },

  clearError: () => set({ error: null }),

  reset: () => {
    // Clear localStorage for user-specific data
    localStorage.removeItem('xmtp_accepted_requests')
    localStorage.removeItem('xmtp_initiated_conversations')

    set({
      conversations: [],
      messages: new Map(),
      selectedConversationId: null,
      isLoading: false,
      isSending: false,
      error: null,
      unreadTotal: 0,
      acceptedRequests: new Set(),
      initiatedConversations: new Set()
    })
  }
}))
