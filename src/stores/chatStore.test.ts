import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mockElectronAPI } from '../test/setup'

// Mock the services - define mocks inside the factory
vi.mock('../services/xmtp', () => ({
  xmtpService: {
    getConversations: vi.fn().mockResolvedValue([]),
    getInboxId: vi.fn().mockReturnValue('my-inbox-id'),
    getMembers: vi.fn().mockResolvedValue([]),
    getConversation: vi.fn(),
    getMessages: vi.fn().mockResolvedValue([]),
    sendMessage: vi.fn(),
    createDm: vi.fn(),
    createGroup: vi.fn(),
    getGroupName: vi.fn().mockReturnValue(undefined),
    getGroupDescription: vi.fn().mockReturnValue(undefined),
    getGroupImageUrl: vi.fn().mockReturnValue(undefined),
    isGroup: vi.fn().mockReturnValue(false),
    streamMessages: vi.fn(),
    stopStreaming: vi.fn()
  }
}))

vi.mock('../services/bluesky', () => ({
  blueskyService: {
    getProfile: vi.fn()
  }
}))

vi.mock('../services/identity', () => ({
  identityService: {
    getAddressFromDid: vi.fn(),
    getDidFromInboxId: vi.fn().mockReturnValue(undefined),
    getCachedProfile: vi.fn().mockReturnValue(undefined),
    cacheProfile: vi.fn()
  }
}))

describe('ChatStore', () => {
  let useChatStore: typeof import('./chatStore').useChatStore
  let xmtpService: typeof import('../services/xmtp').xmtpService

  beforeEach(async () => {
    vi.clearAllMocks()
    // Reset modules to get fresh store
    vi.resetModules()
    const chatModule = await import('./chatStore')
    useChatStore = chatModule.useChatStore
    const xmtpModule = await import('../services/xmtp')
    xmtpService = xmtpModule.xmtpService

    // Reset store state
    useChatStore.setState({
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
  })

  describe('initial state', () => {
    it('should have correct initial values', () => {
      const state = useChatStore.getState()

      expect(state.conversations).toEqual([])
      expect(state.messages.size).toBe(0)
      expect(state.selectedConversationId).toBeNull()
      expect(state.isLoadingConversations).toBe(false)
      expect(state.isSending).toBe(false)
      expect(state.error).toBeNull()
      expect(state.unreadTotal).toBe(0)
    })
  })

  describe('loadConversations', () => {
    it('should load and transform conversations', async () => {
      const mockConversations = [
        {
          id: 'conv-1',
          metadata: {},
          lastMessage: vi.fn().mockResolvedValue({ content: 'Hello', sentAtNs: BigInt(1000000000) })
        }
      ]

      vi.mocked(xmtpService.getConversations).mockResolvedValueOnce(mockConversations as any)
      vi.mocked(xmtpService.getMembers).mockResolvedValueOnce([
        { inboxId: 'my-inbox-id' },
        { inboxId: 'peer-inbox-id' }
      ] as any)
      vi.mocked(xmtpService.getGroupName).mockReturnValueOnce(undefined)

      const { loadConversations } = useChatStore.getState()
      await loadConversations()

      const state = useChatStore.getState()
      expect(state.conversations.length).toBe(1)
      expect(state.conversations[0].id).toBe('conv-1')
      expect(state.conversations[0].isGroup).toBe(false)
      expect(state.isLoadingConversations).toBe(false)
    })

    it('should handle errors', async () => {
      vi.mocked(xmtpService.getConversations).mockRejectedValueOnce(new Error('Network error'))

      const { loadConversations } = useChatStore.getState()
      await loadConversations()

      const state = useChatStore.getState()
      expect(state.error).toBe('Network error')
      expect(state.isLoadingConversations).toBe(false)
    })
  })

  describe('selectConversation', () => {
    it('should set selected conversation', () => {
      const { selectConversation } = useChatStore.getState()
      selectConversation('conv-1')

      const state = useChatStore.getState()
      expect(state.selectedConversationId).toBe('conv-1')
    })

    it('should handle null selection', () => {
      useChatStore.setState({ selectedConversationId: 'conv-1' })

      const { selectConversation } = useChatStore.getState()
      selectConversation(null)

      expect(useChatStore.getState().selectedConversationId).toBeNull()
    })
  })

  describe('loadMessages', () => {
    it('should load messages for conversation', async () => {
      const mockConversation = { id: 'conv-1', sync: vi.fn(), messages: vi.fn() }
      const mockMessages = [
        {
          id: 'msg-1',
          senderInboxId: 'sender-1',
          content: 'Hello',
          sentAtNs: BigInt(1000000000)
        }
      ]

      vi.mocked(xmtpService.getConversation).mockResolvedValueOnce(mockConversation as any)
      vi.mocked(xmtpService.getMessages).mockResolvedValueOnce(mockMessages as any)

      const { loadMessages } = useChatStore.getState()
      await loadMessages('conv-1')

      const state = useChatStore.getState()
      const messages = state.messages.get('conv-1')
      expect(messages).toBeDefined()
      expect(messages?.length).toBe(1)
      expect(messages?.[0].content).toBe('Hello')
    })

    it('should handle conversation not found', async () => {
      vi.mocked(xmtpService.getConversation).mockResolvedValueOnce(undefined)

      const { loadMessages } = useChatStore.getState()
      await loadMessages('nonexistent')

      const state = useChatStore.getState()
      expect(state.error).toBe('Conversation not found')
    })
  })

  describe('sendMessage', () => {
    it('should not send without selected conversation', async () => {
      const { sendMessage } = useChatStore.getState()
      await sendMessage('Hello')

      expect(xmtpService.sendMessage).not.toHaveBeenCalled()
    })

    it('should send message with optimistic update', async () => {
      const mockConversation = { id: 'conv-1' }
      vi.mocked(xmtpService.getConversation).mockResolvedValue(mockConversation as any)
      vi.mocked(xmtpService.sendMessage).mockResolvedValue('msg-id-123')

      useChatStore.setState({
        selectedConversationId: 'conv-1',
        conversations: [
          { id: 'conv-1', topic: 'topic-1', peerAddress: '0x1', unreadCount: 0, isGroup: false }
        ]
      })

      const { sendMessage } = useChatStore.getState()
      await sendMessage('Hello')

      const state = useChatStore.getState()
      const messages = state.messages.get('conv-1')
      expect(messages).toBeDefined()
      expect(messages?.some((m) => m.content === 'Hello')).toBe(true)
    })
  })

  describe('createDm', () => {
    it('should create DM and add to conversations', async () => {
      const mockConversation = { id: 'new-conv-1' }
      vi.mocked(xmtpService.createDm).mockResolvedValueOnce(mockConversation as any)

      const { createDm } = useChatStore.getState()
      const convId = await createDm('peer-inbox-id')

      expect(convId).toBe('new-conv-1')

      const state = useChatStore.getState()
      expect(state.conversations.length).toBe(1)
      expect(state.selectedConversationId).toBe('new-conv-1')
    })

    it('should handle create DM error', async () => {
      vi.mocked(xmtpService.createDm).mockRejectedValueOnce(new Error('Not on XMTP'))

      const { createDm } = useChatStore.getState()
      await expect(createDm('peer-inbox-id')).rejects.toThrow()

      const state = useChatStore.getState()
      expect(state.error).toBe('Not on XMTP')
    })
  })

  describe('createGroup', () => {
    it('should create group with members', async () => {
      const mockConversation = { id: 'group-conv-1' }
      vi.mocked(xmtpService.createGroup).mockResolvedValueOnce(mockConversation as any)

      const { createGroup } = useChatStore.getState()
      // createGroup now accepts inbox IDs directly (not addresses)
      const convId = await createGroup(['inbox-1', 'inbox-2'], 'Test Group')

      expect(convId).toBe('group-conv-1')

      const state = useChatStore.getState()
      expect(state.conversations.length).toBe(1)
      expect(state.conversations[0].isGroup).toBe(true)
      expect(state.conversations[0].groupName).toBe('Test Group')
    })

    it('should handle no valid members', async () => {
      const { createGroup } = useChatStore.getState()
      // Empty inbox IDs array should throw
      await expect(createGroup([], 'Test')).rejects.toThrow('No valid XMTP members')
    })
  })

  describe('markAsRead', () => {
    it('should reset unread count for conversation', () => {
      useChatStore.setState({
        conversations: [
          { id: 'conv-1', topic: 't1', peerAddress: '0x1', unreadCount: 5, isGroup: false },
          { id: 'conv-2', topic: 't2', peerAddress: '0x2', unreadCount: 3, isGroup: false }
        ],
        unreadTotal: 8
      })

      const { markAsRead } = useChatStore.getState()
      markAsRead('conv-1')

      const state = useChatStore.getState()
      expect(state.conversations[0].unreadCount).toBe(0)
      expect(state.conversations[1].unreadCount).toBe(3)
      expect(state.unreadTotal).toBe(3)
      expect(mockElectronAPI.setBadgeCount).toHaveBeenCalledWith(3)
    })
  })

  describe('clearError', () => {
    it('should clear error state', () => {
      useChatStore.setState({ error: 'Some error' })

      const { clearError } = useChatStore.getState()
      clearError()

      expect(useChatStore.getState().error).toBeNull()
    })
  })
})
