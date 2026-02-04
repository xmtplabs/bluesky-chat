import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAuthStore } from './authStore'

// Mock the services
vi.mock('../services/bluesky', () => ({
  blueskyService: {
    init: vi.fn().mockResolvedValue(undefined),
    isLoggedIn: vi.fn().mockReturnValue(false),
    login: vi.fn(),
    loginWithPassword: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
    getMyProfile: vi.fn(),
    getAgent: vi.fn().mockReturnValue(null),
    hasRepoWriteAccess: vi.fn().mockReturnValue(true)
  }
}))

vi.mock('../services/xmtp', () => ({
  xmtpService: {
    init: vi.fn().mockResolvedValue({
      inboxId: 'mock-inbox-id',
      signWithInstallationKey: vi.fn().mockReturnValue(new Uint8Array([1, 2, 3]))
    }),
    disconnect: vi.fn().mockResolvedValue(undefined)
  },
  logStartupDiagnostics: vi.fn()
}))

vi.mock('../services/identity', () => ({
  identityService: {
    init: vi.fn().mockResolvedValue(undefined),
    cacheProfile: vi.fn(),
    linkIdentity: vi.fn().mockResolvedValue(undefined),
    publishIdentityToATProto: vi.fn().mockResolvedValue(undefined),
    lookupInboxForDid: vi.fn().mockResolvedValue({ found: false, notFound: true }),
    verifyIdentityBinding: vi.fn().mockResolvedValue({ verified: true }),
    clearProfileCache: vi.fn(),
    clearStatusCache: vi.fn()
  }
}))

vi.mock('../services/indexer', () => ({
  indexerService: {
    connect: vi.fn(),
    disconnect: vi.fn()
  }
}))

vi.mock('../services/signer', () => ({
  getOrCreatePrivateKey: vi
    .fn()
    .mockResolvedValue('0xtest1234567890abcdef1234567890abcdef1234567890abcdef1234567890'),
  createXMTPSigner: vi.fn().mockReturnValue({
    type: 'EOA',
    getIdentifier: () => ({ identifier: '0xmockaddress', identifierKind: 0 }),
    signMessage: vi.fn()
  }),
  getAddressFromPrivateKey: vi.fn().mockReturnValue('0xmockaddress'),
  signDidWithInstallationKey: vi.fn().mockReturnValue('mock-signature-base64'),
  hasExistingKey: vi.fn().mockReturnValue(false)
}))

// Mock the other stores that authStore depends on
vi.mock('./profileStore', () => ({
  useProfileStore: {
    getState: vi.fn().mockReturnValue({
      reset: vi.fn(),
      loadAllFollowingDids: vi.fn()
    })
  }
}))

vi.mock('./chatStore', () => ({
  useChatStore: {
    getState: vi.fn().mockReturnValue({
      reset: vi.fn()
    })
  }
}))

vi.mock('./uiStore', () => ({
  useUIStore: {
    getState: vi.fn().mockReturnValue({
      reset: vi.fn()
    })
  }
}))

describe('AuthStore', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset store state
    useAuthStore.setState({
      blueskyProfile: null,
      isBlueskyLoggedIn: false,
      isXMTPConnected: false,
      xmtpAddress: null,
      xmtpInboxId: null,
      isLoading: false,
      error: null
    })
  })

  describe('initial state', () => {
    it('should have correct initial values', () => {
      const state = useAuthStore.getState()

      expect(state.blueskyProfile).toBeNull()
      expect(state.isBlueskyLoggedIn).toBe(false)
      expect(state.isXMTPConnected).toBe(false)
      expect(state.xmtpAddress).toBeNull()
      expect(state.xmtpInboxId).toBeNull()
      expect(state.isLoading).toBe(false)
      expect(state.error).toBeNull()
    })
  })

  describe('initializeServices', () => {
    it('should initialize services and set loading state', async () => {
      const { initializeServices } = useAuthStore.getState()
      await initializeServices()

      const state = useAuthStore.getState()
      expect(state.isLoading).toBe(false)
      expect(state.error).toBeNull()
    })

    it('should handle errors gracefully', async () => {
      const { blueskyService } = await import('../services/bluesky')
      vi.mocked(blueskyService.init).mockRejectedValueOnce(new Error('Init failed'))

      const { initializeServices } = useAuthStore.getState()
      await initializeServices()

      const state = useAuthStore.getState()
      expect(state.error).toBe('Init failed')
      expect(state.isLoading).toBe(false)
    })
  })

  describe('loginWithBlueskyPassword', () => {
    it('should login to Bluesky and set profile', async () => {
      const mockProfile = {
        did: 'did:plc:test123',
        handle: 'test.bsky.social',
        displayName: 'Test User'
      }

      const { blueskyService } = await import('../services/bluesky')
      vi.mocked(blueskyService.loginWithPassword).mockResolvedValueOnce(mockProfile)

      const { loginWithBlueskyPassword } = useAuthStore.getState()
      await loginWithBlueskyPassword('test.bsky.social', 'password')

      const state = useAuthStore.getState()
      expect(state.blueskyProfile).toEqual(mockProfile)
      expect(state.isBlueskyLoggedIn).toBe(true)
      // Note: XMTP connection is now handled separately by ConnectionProviderBridge
      expect(state.isXMTPConnected).toBe(false)
    })

    it('should handle login errors', async () => {
      const { blueskyService } = await import('../services/bluesky')
      vi.mocked(blueskyService.loginWithPassword).mockRejectedValueOnce(
        new Error('Invalid credentials')
      )

      const { loginWithBlueskyPassword } = useAuthStore.getState()
      await expect(loginWithBlueskyPassword('test.bsky.social', 'wrong')).rejects.toThrow()

      const state = useAuthStore.getState()
      expect(state.error).toBe('Invalid credentials')
      expect(state.isBlueskyLoggedIn).toBe(false)
    })
  })

  describe('logout', () => {
    it('should clear all auth state', async () => {
      // Set up logged in state
      useAuthStore.setState({
        blueskyProfile: { did: 'did:plc:test', handle: 'test.bsky.social' },
        isBlueskyLoggedIn: true,
        isXMTPConnected: true,
        xmtpAddress: '0xtest',
        xmtpInboxId: 'inbox-1'
      })

      const { logout } = useAuthStore.getState()
      await logout()

      const state = useAuthStore.getState()
      expect(state.blueskyProfile).toBeNull()
      expect(state.isBlueskyLoggedIn).toBe(false)
      expect(state.isXMTPConnected).toBe(false)
      expect(state.xmtpAddress).toBeNull()
      expect(state.xmtpInboxId).toBeNull()
    })
  })

  describe('clearError', () => {
    it('should clear error state', () => {
      useAuthStore.setState({ error: 'Some error' })

      const { clearError } = useAuthStore.getState()
      clearError()

      expect(useAuthStore.getState().error).toBeNull()
    })
  })
})
