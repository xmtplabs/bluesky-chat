import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useAuthStore } from './authStore'

// Mock the provider
vi.mock('../provider', () => ({
  provider: {
    restoreSession: vi.fn().mockResolvedValue(null),
    login: vi.fn(),
    loginWithPassword: vi.fn(),
    logout: vi.fn().mockResolvedValue(undefined),
    lookupInboxForIdentity: vi.fn().mockResolvedValue({ found: false, notFound: true }),
    publishInboxBinding: vi.fn().mockResolvedValue(undefined),
    deleteInboxBinding: vi.fn().mockResolvedValue(undefined),
    canPublishIdentity: vi.fn().mockReturnValue(true),
    getProfile: vi.fn().mockResolvedValue(null),
    getProfiles: vi.fn().mockResolvedValue(new Map()),
    searchUsers: vi.fn().mockResolvedValue([]),
  },
  config: {
    name: 'Bluesky',
    loginPlaceholder: 'username',
    loginSuffix: '.bsky.social',
    loginMethods: ['oauth', 'password'],
    mappingServiceUrl: 'https://bluesky-chat-mapping-service.xmtp.workers.dev',
    supportsFollowers: true,
    supportsFollowing: true,
    supportsProfileUpdate: true,
    supportsBlobUpload: true,
    formatHandle: (handle: string) => `@${handle}`,
    profileUrl: (handle: string) => `https://bsky.app/profile/${handle}`,
    passwordHelp: {
      placeholder: 'xxxx-xxxx-xxxx-xxxx',
      url: 'https://bsky.app/settings/app-passwords',
      label: 'Create an app password at',
      linkText: 'bsky.app/settings/app-passwords',
    },
  },
  formatHandle: (handle: string) => `@${handle}`,
  nip46: null,
}))

vi.mock('../services/xmtp', () => ({
  xmtpService: {
    init: vi.fn().mockResolvedValue({
      inboxId: 'mock-inbox-id',
      signWithInstallationKey: vi.fn().mockReturnValue(new Uint8Array([1, 2, 3]))
    }),
    disconnect: vi.fn().mockResolvedValue(undefined)
  },
  logStartupDiagnostics: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('../services/identity', () => ({
  identityService: {
    init: vi.fn().mockResolvedValue(undefined),
    cacheProfile: vi.fn(),
    linkIdentity: vi.fn().mockResolvedValue(undefined),
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
      profile: null,
      isLoggedIn: false,
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

      expect(state.profile).toBeNull()
      expect(state.isLoggedIn).toBe(false)
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
      const { provider } = await import('../provider')
      vi.mocked(provider.restoreSession).mockRejectedValueOnce(new Error('Init failed'))

      const { initializeServices } = useAuthStore.getState()
      await initializeServices()

      const state = useAuthStore.getState()
      expect(state.error).toBe('Init failed')
      expect(state.isLoading).toBe(false)
    })
  })

  describe('loginWithPassword', () => {
    it('should login and set profile', async () => {
      const mockProfile = {
        id: 'did:plc:test123',
        handle: 'test.bsky.social',
        displayName: 'Test User'
      }

      const { provider } = await import('../provider')
      vi.mocked(provider.loginWithPassword!).mockResolvedValueOnce({ profile: mockProfile, id: mockProfile.id })

      const { loginWithPassword } = useAuthStore.getState()
      await loginWithPassword('test.bsky.social', 'password')

      const state = useAuthStore.getState()
      expect(state.profile).toEqual(mockProfile)
      expect(state.isLoggedIn).toBe(true)
      // Note: XMTP connection is now handled separately by ConnectionProviderBridge
      expect(state.isXMTPConnected).toBe(false)
    })

    it('should handle login errors', async () => {
      const { provider } = await import('../provider')
      vi.mocked(provider.loginWithPassword!).mockRejectedValueOnce(
        new Error('Invalid credentials')
      )

      const { loginWithPassword } = useAuthStore.getState()
      await expect(loginWithPassword('test.bsky.social', 'wrong')).rejects.toThrow()

      const state = useAuthStore.getState()
      expect(state.error).toBe('Invalid credentials')
      expect(state.isLoggedIn).toBe(false)
    })
  })

  describe('logout', () => {
    it('should clear all auth state', async () => {
      // Set up logged in state
      useAuthStore.setState({
        profile: { id: 'did:plc:test', handle: 'test.bsky.social' },
        isLoggedIn: true,
        isXMTPConnected: true,
        xmtpAddress: '0xtest',
        xmtpInboxId: 'inbox-1'
      })

      const { logout } = useAuthStore.getState()
      await logout()

      const state = useAuthStore.getState()
      expect(state.profile).toBeNull()
      expect(state.isLoggedIn).toBe(false)
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
