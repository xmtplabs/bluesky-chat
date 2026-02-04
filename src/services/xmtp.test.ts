import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock the XMTP browser SDK
vi.mock('@xmtp/browser-sdk', () => {
  const mockClient = {
    inboxId: 'mock-inbox-id',
    accountIdentifier: {
      identifier: '0xmockaddress',
      identifierKind: 0 // IdentifierKind.Ethereum
    },
    conversations: {
      sync: vi.fn().mockResolvedValue(undefined),
      syncAll: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([]),
      createDm: vi.fn(),
      createDmWithIdentifier: vi.fn(),
      createGroup: vi.fn(),
      getConversationById: vi.fn(),
      streamAllMessages: vi.fn(),
      stream: vi.fn()
    },
    fetchInboxIdByIdentifier: vi.fn(),
    close: vi.fn()
  }

  return {
    Client: {
      create: vi.fn().mockResolvedValue(mockClient),
      canMessage: vi.fn().mockResolvedValue(new Map([['0xpeeraddress', true]]))
    },
    IdentifierKind: {
      Ethereum: 0
    },
    ConversationType: {
      Dm: 0,
      Group: 1
    },
    __mockClient: mockClient // Export for test access
  }
})

describe('XMTPService', () => {
  let xmtpService: typeof import('./xmtp').xmtpService
  let mockClient: any

  beforeEach(async () => {
    vi.clearAllMocks()
    // Reset module to get fresh instance
    vi.resetModules()
    const module = await import('./xmtp')
    xmtpService = module.xmtpService

    const sdkMock = await import('@xmtp/browser-sdk')
    mockClient = (sdkMock as any).__mockClient
  })

  const createMockSigner = () => ({
    type: 'EOA' as const,
    getIdentifier: () => ({
      identifier: '0xtest',
      identifierKind: 0
    }),
    signMessage: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]))
  })

  describe('init', () => {
    it('should initialize client with signer', async () => {
      const client = await xmtpService.init(createMockSigner())
      expect(client).toBe(mockClient)
    })
  })

  describe('getInboxId', () => {
    it('should return inbox ID after init', async () => {
      await xmtpService.init(createMockSigner())
      expect(xmtpService.getInboxId()).toBe('mock-inbox-id')
    })

    it('should return undefined before init', async () => {
      expect(xmtpService.getInboxId()).toBeUndefined()
    })
  })

  describe('getConversations', () => {
    it('should throw if not initialized', async () => {
      await expect(xmtpService.getConversations()).rejects.toThrow('XMTP client not initialized')
    })

    it('should return conversations after init', async () => {
      const mockConversations = [
        { id: 'conv-1', topic: 'topic-1' },
        { id: 'conv-2', topic: 'topic-2' }
      ]
      mockClient.conversations.list.mockResolvedValueOnce(mockConversations)

      await xmtpService.init(createMockSigner())
      const conversations = await xmtpService.getConversations()

      expect(mockClient.conversations.syncAll).toHaveBeenCalled()
      expect(conversations).toEqual(mockConversations)
    })
  })

  describe('createDmByAddress', () => {
    it('should create DM with peer address', async () => {
      const mockConversation = { id: 'new-conv', topic: 'new-topic' }
      mockClient.conversations.createDmWithIdentifier.mockResolvedValueOnce(mockConversation)

      await xmtpService.init(createMockSigner())
      const conversation = await xmtpService.createDmByAddress('0xPeerAddress')

      expect(mockClient.conversations.createDmWithIdentifier).toHaveBeenCalledWith({
        identifier: '0xpeeraddress', // lowercase
        identifierKind: 0 // IdentifierKind.Ethereum
      })
      expect(conversation).toEqual(mockConversation)
    })
  })

  describe('disconnect', () => {
    it('should close client and clear state', async () => {
      await xmtpService.init(createMockSigner())
      await xmtpService.disconnect()

      expect(mockClient.close).toHaveBeenCalled()
      expect(xmtpService.getClient()).toBeNull()
    })
  })

  describe('isGroup', () => {
    it('should return true for group conversations', async () => {
      // ConversationType.Group = 1
      const group = { id: 'group-1', name: 'Test Group', metadata: { conversationType: 1 } }
      expect(xmtpService.isGroup(group as any)).toBe(true)
    })

    it('should return false for DM conversations', async () => {
      // ConversationType.Dm = 0
      const dm = { id: 'dm-1', metadata: { conversationType: 0 } }
      expect(xmtpService.isGroup(dm as any)).toBe(false)
    })
  })
})
