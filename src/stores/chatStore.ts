import { create } from 'zustand'
import type { DecodedMessage } from '@xmtp/browser-sdk'
import type { ChatConversation, ChatMessage, BlueskyProfile } from '../types'
import { xmtpService } from '../services/xmtp'
import { identityService } from '../services/identity'
import { blueskyService } from '../services/bluesky'
import { getErrorMessage } from '../utils/errors'

// Module-level timeout for conversation stream debouncing (cleared on stop)
let conversationReloadTimeout: ReturnType<typeof setTimeout> | null = null

// Per-conversation message insertion queue to preserve ordering across async/sync messages
const messageInsertionQueues = new Map<string, Promise<void>>()

// Cancellation token for loadConversations — each call captures the current symbol;
// before writing state it checks if it's still current (if not, results are discarded)
let loadConversationsToken: symbol | null = null

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
 * Runtime type guard for GroupUpdated message content.
 * Validates the shape of the content before accessing properties.
 */
interface GroupUpdateContent {
  addedInboxes?: Array<{ inboxId: string }>
  removedInboxes?: Array<{ inboxId: string }>
  metadataFieldChanges?: Array<{ fieldName: string; oldValue?: string; newValue?: string }>
}

function isInboxEntry(entry: unknown): entry is { inboxId: string } {
  return (
    typeof entry === 'object' &&
    entry !== null &&
    'inboxId' in entry &&
    typeof (entry as { inboxId: unknown }).inboxId === 'string'
  )
}

function isGroupUpdateContent(content: unknown): content is GroupUpdateContent {
  if (!content || typeof content !== 'object') return false
  const obj = content as Record<string, unknown>

  // Must have at least one of the expected fields
  const hasExpectedField =
    'addedInboxes' in obj || 'removedInboxes' in obj || 'metadataFieldChanges' in obj
  if (!hasExpectedField) return false

  // Validate array fields if present
  if ('addedInboxes' in obj && obj.addedInboxes !== undefined) {
    if (!Array.isArray(obj.addedInboxes) || !obj.addedInboxes.every(isInboxEntry)) return false
  }
  if ('removedInboxes' in obj && obj.removedInboxes !== undefined) {
    if (!Array.isArray(obj.removedInboxes) || !obj.removedInboxes.every(isInboxEntry)) return false
  }
  if ('metadataFieldChanges' in obj && obj.metadataFieldChanges !== undefined) {
    if (!Array.isArray(obj.metadataFieldChanges)) return false
  }

  return true
}

/**
 * Extract all inbox IDs referenced in a GroupUpdated message content.
 */
function extractInboxIdsFromGroupUpdate(content: unknown): string[] {
  if (!isGroupUpdateContent(content)) return []
  const ids: string[] = []
  if (content.addedInboxes) {
    ids.push(...content.addedInboxes.map((m) => m.inboxId))
  }
  if (content.removedInboxes) {
    ids.push(...content.removedInboxes.map((m) => m.inboxId))
  }
  return ids
}

/**
 * Resolve inbox IDs to DIDs and cache their profiles.
 * After this completes, getSenderName() will return display names for these IDs.
 */
async function ensureInboxIdsResolved(inboxIds: string[]): Promise<void> {
  // Bulk resolve any unresolved inbox→DID mappings
  const unresolved = inboxIds.filter((id) => !identityService.getDidFromInboxId(id))
  const resolved = unresolved.length > 0
    ? await identityService.bulkResolveInboxToDid(unresolved)
    : new Map<string, string>()

  // Collect DIDs that need profile fetching
  const didsToFetch: string[] = []
  for (const inboxId of inboxIds) {
    const did = resolved.get(inboxId) || identityService.getDidFromInboxId(inboxId)
    if (did && !identityService.getCachedProfile(did)) {
      didsToFetch.push(did)
    }
  }

  // Fetch profiles in batches to avoid rate limiting
  const BATCH_SIZE = 10
  for (let i = 0; i < didsToFetch.length; i += BATCH_SIZE) {
    const batch = didsToFetch.slice(i, i + BATCH_SIZE)
    await Promise.allSettled(
      batch.map((did) =>
        blueskyService.getProfile(did).then((profile) => {
          if (profile) identityService.cacheProfile(profile)
        }).catch(() => {
          console.debug('Profile fetch failed for DID:', did)
        })
      )
    )
  }
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
  if (isGroupUpdateContent(content)) {
    const groupUpdate = content

    // Skip membership updates in DMs - they're not meaningful
    if (!isGroup) {
      return { content: '', isSystemMessage: true, systemMessageType: 'unknown' }
    }

    // Get sender name for active voice messages
    const actorName = isSelf ? 'You' : getSenderName(senderInboxId)

    // Handle member additions
    if (groupUpdate.addedInboxes && groupUpdate.addedInboxes.length > 0) {
      // Filter out the sender — they appear in addedInboxes during group creation
      const othersAdded = groupUpdate.addedInboxes.filter((m) => m.inboxId !== senderInboxId)
      if (othersAdded.length === 0) {
        // Sender only added themselves — this is a group creation event
        const text = isSelf ? 'You created this group' : `${actorName} created this group`
        return { content: text, isSystemMessage: true, systemMessageType: 'member_added' }
      }
      const addedNames = othersAdded
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

  // Unknown non-string object - treat as system message to avoid [object Object]
  if (content && typeof content === 'object') {
    return { content: '', isSystemMessage: true, systemMessageType: 'unknown' }
  }

  // Fallback - convert to string but avoid [object Object]
  const stringContent = content?.toString() || ''
  if (stringContent === '[object Object]') {
    return { content: '', isSystemMessage: true, systemMessageType: 'unknown' }
  }

  return { content: stringContent, isSystemMessage: false }
}

/**
 * Add a streamed message to the store state.
 * Extracted so it can be called after async name resolution for system messages.
 */
function addStreamedMessage(
  message: DecodedMessage,
  conv: ChatConversation,
  get: () => ChatState,
  set: (partial: Partial<ChatState> | ((state: ChatState) => Partial<ChatState>)) => void
): void {
  const conversationId = message.conversationId

  if (!conversationId) return

  // Parse message content, handling system messages
  const parsed = parseMessageContent(message, conv.isGroup)

  // Skip empty system messages (e.g., membership updates in DMs)
  if (parsed.isSystemMessage && !parsed.content) {
    return
  }

  // Build message outside the state update
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

  // Use functional update to avoid read-modify-write race between conversation queues
  let isDuplicate = false
  let unreadTotal = 0

  set((state) => {
    const currentMessages = state.messages.get(conversationId) || []
    // Avoid duplicate messages (belt and suspenders)
    if (currentMessages.some((m) => m.id === chatMessage.id)) {
      isDuplicate = true
      return {}
    }

    const newMessages = new Map(state.messages)
    newMessages.set(conversationId, [...currentMessages, chatMessage])

    // Update conversation metadata
    // Don't increment unread count for system messages, and use a preview for lastMessage
    const newConversations = state.conversations.map((c) => {
      if (c.id === conversationId) {
        return {
          ...c,
          lastMessage: chatMessage.content,
          lastMessageTime: chatMessage.sentAt,
          unreadCount: chatMessage.isSystemMessage
            ? c.unreadCount
            : c.id === state.selectedConversationId
              ? 0
              : c.unreadCount + 1
        }
      }
      return c
    })

    unreadTotal = newConversations.reduce((sum, c) => sum + c.unreadCount, 0)

    return { messages: newMessages, conversations: newConversations, unreadTotal }
  })

  if (isDuplicate) return

  // Side effects outside the state update
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
}

// Generic localStorage helpers for Set<string> persistence
function loadStringSet(key: string): Set<string> {
  try {
    const stored = localStorage.getItem(key)
    if (stored) return new Set(JSON.parse(stored))
  } catch (error) {
    console.error(`Failed to load ${key}:`, error)
  }
  return new Set()
}

function saveStringSet(key: string, items: Set<string>): void {
  try {
    localStorage.setItem(key, JSON.stringify([...items]))
  } catch (error) {
    console.error(`Failed to save ${key}:`, error)
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
  isLoadingConversations: boolean
  isLoadingMessages: boolean
  isCreating: boolean
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
  isLoadingConversations: false,
  isLoadingMessages: false,
  isCreating: false,
  isSending: false,
  error: null,
  unreadTotal: 0,
  acceptedRequests: loadStringSet('xmtp_accepted_requests'),
  initiatedConversations: loadStringSet('xmtp_initiated_conversations'),

  loadConversations: async () => {
    const thisToken = Symbol()
    loadConversationsToken = thisToken

    set({ isLoadingConversations: true, error: null })

    try {
      const xmtpConversations = await xmtpService.getConversations()
      const chatConversations: ChatConversation[] = []
      const myInboxId = xmtpService.getInboxId()

      // Phase 1: Gather all conversation data and collect inbox IDs that need resolution
      const allInboxIds = new Set<string>()
      interface ConvData {
        conv: typeof xmtpConversations[0]
        members: Awaited<ReturnType<typeof xmtpService.getMembers>>
        isGroup: boolean
        lastMessage: DecodedMessage | undefined
        peerInboxId: string | undefined
      }
      const convDatas: ConvData[] = []

      for (const conv of xmtpConversations) {
        const members = await xmtpService.getMembers(conv)
        const convIsGroup = xmtpService.isGroup(conv)
        console.debug('[chatStore] Conversation', conv.id.slice(0, 8), 'isGroup:', convIsGroup, 'members:', members.length, 'metadata:', conv.metadata)

        const peerInboxId = !convIsGroup
          ? members.find((m) => m.inboxId !== myInboxId)?.inboxId
          : undefined

        const lastMessage = (await conv.lastMessage()) ?? undefined

        // Collect inbox IDs that need resolution
        if (peerInboxId) allInboxIds.add(peerInboxId)
        if (lastMessage && convIsGroup) {
          for (const id of extractInboxIdsFromGroupUpdate(lastMessage.content)) {
            allInboxIds.add(id)
          }
          if (lastMessage.senderInboxId) allInboxIds.add(lastMessage.senderInboxId)
        }

        convDatas.push({ conv, members, isGroup: convIsGroup, lastMessage, peerInboxId })
      }

      // Phase 2: Single bulk resolution for all inbox IDs
      if (allInboxIds.size > 0) {
        await ensureInboxIdsResolved([...allInboxIds])
      }

      // Phase 3: Build conversation objects with resolved names
      for (const { conv, members, isGroup: convIsGroup, lastMessage, peerInboxId } of convDatas) {
        let peerProfile: BlueskyProfile | undefined

        if (!convIsGroup && peerInboxId) {
          const peerDid = identityService.getDidFromInboxId(peerInboxId)
          if (peerDid) {
            peerProfile = identityService.getCachedProfile(peerDid) || undefined
          }
        }

        // Parse last message content (names are now resolved from phase 2)
        let lastMessagePreview: string | undefined
        if (lastMessage) {
          const parsed = parseMessageContent(lastMessage, convIsGroup)
          if (parsed.content) {
            lastMessagePreview = parsed.content
          }
        }

        chatConversations.push({
          id: conv.id,
          topic: conv.id,
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

      // If a newer loadConversations call has started, discard these results
      if (loadConversationsToken !== thisToken) return

      set({ conversations: chatConversations })

      // Persist conversation count for this user (used to skip skeleton loading on next launch)
      const did = blueskyService.getDid()
      if (did) {
        saveConversationCount(did, chatConversations.length)
      }
    } catch (error) {
      console.error('Failed to load conversations:', error)
      if (loadConversationsToken === thisToken) {
        set({ error: getErrorMessage(error, 'Failed to load conversations') })
      }
    } finally {
      // Only clear loading if this call is still the current one —
      // a newer call may be in flight and owns the loading state
      if (loadConversationsToken === thisToken) {
        set({ isLoadingConversations: false })
      }
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
    set({ isLoadingMessages: true })

    try {
      const conversation = await xmtpService.getConversation(conversationId)
      if (!conversation) {
        throw new Error('Conversation not found')
      }

      // Determine if this is a group conversation using SDK's native check
      const isGroup = xmtpService.isGroup(conversation)

      const xmtpMessages = await xmtpService.getMessages(conversation)

      // Helper to parse all messages into ChatMessage[]
      const buildChatMessages = (msgs: DecodedMessage[]): ChatMessage[] =>
        msgs
          .map((msg): ChatMessage | null => {
            const parsed = parseMessageContent(msg, isGroup)
            if (parsed.isSystemMessage && !parsed.content) return null
            return {
              id: msg.id,
              conversationId,
              senderAddress: msg.senderInboxId || '',
              content: parsed.content,
              sentAt: Number(msg.sentAtNs) / 1_000_000,
              status: 'sent',
              isSystemMessage: parsed.isSystemMessage,
              systemMessageType: parsed.systemMessageType
            }
          })
          .filter((msg): msg is ChatMessage => msg !== null)

      // Render messages immediately (system messages show truncated IDs as fallback)
      const chatMessages = buildChatMessages(xmtpMessages)
      const messages = new Map(get().messages)
      messages.set(conversationId, chatMessages)
      set({ messages })

      // For groups, resolve names in background then re-render with proper display names
      if (isGroup) {
        const allInboxIds = new Set<string>()
        for (const msg of xmtpMessages) {
          for (const id of extractInboxIdsFromGroupUpdate(msg.content)) {
            allInboxIds.add(id)
          }
          if (msg.senderInboxId) allInboxIds.add(msg.senderInboxId)
        }
        if (allInboxIds.size > 0) {
          ensureInboxIdsResolved([...allInboxIds]).then(() => {
            // Re-parse with resolved names, merging with current state
            // to preserve any messages that arrived via streaming since the initial load
            const resolvedMessages = buildChatMessages(xmtpMessages)
            const resolvedById = new Map(resolvedMessages.map((m) => [m.id, m]))
            set((state) => {
              const currentMsgs = state.messages.get(conversationId) || []
              const merged = currentMsgs.map((m) => resolvedById.get(m.id) || m)
              const updatedMessages = new Map(state.messages)
              updatedMessages.set(conversationId, merged)
              return { messages: updatedMessages }
            })
          }).catch(() => {
            console.debug('Background name resolution failed for conversation:', conversationId)
          })
        }
      }
    } catch (error) {
      console.error('Failed to load messages:', error)
      set({ error: getErrorMessage(error, 'Failed to load messages') })
    } finally {
      set({ isLoadingMessages: false })
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
      set({ error: getErrorMessage(error, 'Failed to send message') })

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
    set({ isCreating: true, error: null })

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
      saveStringSet('xmtp_initiated_conversations', newInitiated)

      const conversations = [newConv, ...get().conversations]
      set({ conversations, selectedConversationId: conversation.id, initiatedConversations: newInitiated })

      return conversation.id
    } catch (error) {
      console.error('Failed to create DM:', error)
      set({ error: getErrorMessage(error, 'Failed to create conversation') })
      throw error
    } finally {
      set({ isCreating: false })
    }
  },

  createGroup: async (memberInboxIds: string[], name?: string) => {
    set({ isCreating: true, error: null })

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
      saveStringSet('xmtp_initiated_conversations', newInitiated)

      const conversations = [newConv, ...get().conversations]
      set({ conversations, selectedConversationId: conversation.id, initiatedConversations: newInitiated })

      // Load messages so the system message ("you added X and Y") appears immediately
      get().loadMessages(conversation.id)

      return conversation.id
    } catch (error) {
      console.error('Failed to create group:', error)
      set({ error: getErrorMessage(error, 'Failed to create group') })
      throw error
    } finally {
      set({ isCreating: false })
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

        // Queue message insertion to preserve ordering across async/sync messages
        const inboxIds = conv.isGroup ? extractInboxIdsFromGroupUpdate(message.content) : []
        if (inboxIds.length > 0 && message.senderInboxId) {
          inboxIds.push(message.senderInboxId)
        }

        const prevTask = messageInsertionQueues.get(conversationId) || Promise.resolve()
        const nextTask = prevTask.then(async () => {
          if (inboxIds.length > 0) {
            await ensureInboxIdsResolved(inboxIds).catch(() => {})
          }
          // Re-fetch conv from current state to avoid stale closure
          const freshConv = get().conversations.find((c) => c.id === conversationId)
          if (freshConv) {
            addStreamedMessage(message, freshConv, get, set)
          }
        }).catch((err) => {
          // Catch errors to prevent breaking the promise chain for subsequent messages
          console.error('Message insertion failed for conversation:', conversationId, err)
        })
        messageInsertionQueues.set(conversationId, nextTask)
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
    saveStringSet('xmtp_accepted_requests', newAcceptedRequests)
    set({ acceptedRequests: newAcceptedRequests })
  },

  clearError: () => set({ error: null }),

  reset: () => {
    // Clear pending debounced conversation reload
    if (conversationReloadTimeout) {
      clearTimeout(conversationReloadTimeout)
      conversationReloadTimeout = null
    }
    // Invalidate any in-flight loadConversations
    loadConversationsToken = null
    // Clear message insertion queues
    messageInsertionQueues.clear()

    // Clear localStorage for user-specific data
    localStorage.removeItem('xmtp_accepted_requests')
    localStorage.removeItem('xmtp_initiated_conversations')

    set({
      conversations: [],
      messages: new Map(),
      selectedConversationId: null,
      isLoadingConversations: false,
      isLoadingMessages: false,
      isCreating: false,
      isSending: false,
      error: null,
      unreadTotal: 0,
      acceptedRequests: new Set(),
      initiatedConversations: new Set()
    })
  }
}))
