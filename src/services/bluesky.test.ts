import { describe, it, expect, beforeEach, vi } from 'vitest'

// Create a mock class for AtpAgent
class MockAtpAgent {
  session = {
    did: 'did:plc:test123',
    handle: 'test.bsky.social'
  }

  login = vi.fn().mockResolvedValue({ success: true })
  logout = vi.fn().mockResolvedValue(undefined)
  getProfile = vi.fn().mockResolvedValue({
    data: {
      did: 'did:plc:test123',
      handle: 'test.bsky.social',
      displayName: 'Test User',
      avatar: 'https://example.com/avatar.jpg'
    }
  })
  searchActors = vi.fn().mockResolvedValue({ data: { actors: [] } })
  getFollowers = vi.fn().mockResolvedValue({ data: { followers: [] } })
  getFollows = vi.fn().mockResolvedValue({ data: { follows: [] } })
}

// Mock the @atproto/api module
vi.mock('@atproto/api', () => ({
  AtpAgent: MockAtpAgent
}))

// Mock the @atproto/oauth-client-browser module
vi.mock('@atproto/oauth-client-browser', () => ({
  BrowserOAuthClient: {
    load: vi.fn().mockRejectedValue(new Error('OAuth not available in test environment'))
  },
  buildLoopbackClientId: vi.fn().mockReturnValue('http://localhost?redirect_uri=http%3A%2F%2F127.0.0.1%3A5173%2F')
}))

describe('BlueskyService', () => {
  let blueskyService: typeof import('./bluesky').blueskyService

  beforeEach(async () => {
    vi.clearAllMocks()
    vi.resetModules()
    const module = await import('./bluesky')
    blueskyService = module.blueskyService
  })

  describe('init', () => {
    it('should handle OAuth client initialization failure gracefully', async () => {
      // This should not throw even though OAuth init fails
      await expect(blueskyService.init()).resolves.not.toThrow()
    })

    it('should still allow password login after OAuth init fails', async () => {
      await blueskyService.init()

      // Password login should work even without OAuth
      const profile = await blueskyService.loginWithPassword('test@email.com', 'password')

      expect(profile).toBeDefined()
      expect(profile.did).toBe('did:plc:test123')
      expect(profile.handle).toBe('test.bsky.social')
    })
  })

  describe('loginWithPassword', () => {
    it('should login and return profile', async () => {
      await blueskyService.init()
      const profile = await blueskyService.loginWithPassword('test@email.com', 'password')

      expect(profile).toBeDefined()
      expect(profile.did).toBe('did:plc:test123')
      expect(profile.handle).toBe('test.bsky.social')
      expect(profile.displayName).toBe('Test User')
    })

    it('should work without calling init first', async () => {
      // Password login shouldn't require init
      const profile = await blueskyService.loginWithPassword('test@email.com', 'password')

      expect(profile).toBeDefined()
      expect(profile.did).toBe('did:plc:test123')
    })
  })

  describe('login (OAuth)', () => {
    it('should throw helpful error when OAuth client not initialized', async () => {
      await blueskyService.init() // This will fail OAuth init

      await expect(blueskyService.login('test.bsky.social')).rejects.toThrow(
        'OAuth not available. Please use App Password login instead.'
      )
    })
  })

  describe('isLoggedIn', () => {
    it('should return false before login', async () => {
      expect(blueskyService.isLoggedIn()).toBe(false)
    })

    it('should return true after login', async () => {
      await blueskyService.loginWithPassword('test@email.com', 'password')
      expect(blueskyService.isLoggedIn()).toBe(true)
    })
  })

  describe('getMyProfile', () => {
    it('should return null before login', async () => {
      const profile = await blueskyService.getMyProfile()
      expect(profile).toBeNull()
    })

    it('should return profile after login', async () => {
      await blueskyService.loginWithPassword('test@email.com', 'password')
      const profile = await blueskyService.getMyProfile()

      expect(profile).toBeDefined()
      expect(profile?.handle).toBe('test.bsky.social')
    })
  })

  describe('logout', () => {
    it('should clear session on logout', async () => {
      await blueskyService.loginWithPassword('test@email.com', 'password')
      expect(blueskyService.isLoggedIn()).toBe(true)

      await blueskyService.logout()
      expect(blueskyService.isLoggedIn()).toBe(false)
    })
  })

  describe('getDid and getHandle', () => {
    it('should return undefined before login', () => {
      expect(blueskyService.getDid()).toBeUndefined()
      expect(blueskyService.getHandle()).toBeUndefined()
    })

    it('should return values after login', async () => {
      await blueskyService.loginWithPassword('test@email.com', 'password')

      expect(blueskyService.getDid()).toBe('did:plc:test123')
      expect(blueskyService.getHandle()).toBe('test.bsky.social')
    })
  })
})
