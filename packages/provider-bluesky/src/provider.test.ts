import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { UserProfile } from '@bluesky-chat/provider-interface'

// vi.hoisted runs before vi.mock hoisting, so these are available inside the factory
const { mockAgent, mockServiceInstance } = vi.hoisted(() => {
  const mockAgent = {
    com: {
      atproto: {
        repo: {
          putRecord: vi.fn().mockResolvedValue(undefined),
          deleteRecord: vi.fn().mockResolvedValue(undefined),
        },
      },
    },
  }

  // We capture the single instance created by the provider module at load time
  const mockServiceInstance = {
    init: vi.fn().mockResolvedValue(undefined),
    login: vi.fn().mockResolvedValue({
      id: 'did:plc:test123',
      handle: 'alice.bsky.social',
      displayName: 'Alice',
    } as UserProfile),
    loginWithPassword: vi.fn().mockResolvedValue({
      id: 'did:plc:test123',
      handle: 'alice.bsky.social',
      displayName: 'Alice',
    } as UserProfile),
    logout: vi.fn().mockResolvedValue(undefined),
    isLoggedIn: vi.fn().mockReturnValue(true),
    getMyProfile: vi.fn().mockResolvedValue({
      id: 'did:plc:test123',
      handle: 'alice.bsky.social',
      displayName: 'Alice',
    } as UserProfile),
    getProfile: vi.fn().mockResolvedValue({
      id: 'did:plc:test123',
      handle: 'alice.bsky.social',
      displayName: 'Alice',
    } as UserProfile),
    searchUsers: vi.fn().mockResolvedValue([]),
    getFollowers: vi.fn().mockResolvedValue({ followers: [], cursor: undefined }),
    getFollowing: vi.fn().mockResolvedValue({ following: [], cursor: undefined }),
    getAllFollowingDids: vi.fn().mockResolvedValue(new Set(['did:plc:friend1'])),
    hasRepoWriteAccess: vi.fn().mockReturnValue(true),
    uploadBlob: vi.fn().mockResolvedValue('https://cdn.bsky.app/img/blob123'),
    updateProfile: vi.fn().mockResolvedValue({
      id: 'did:plc:test123',
      handle: 'alice.bsky.social',
      displayName: 'Updated Alice',
    } as UserProfile),
    getAgent: vi.fn().mockReturnValue(mockAgent),
    getDid: vi.fn().mockReturnValue('did:plc:test123'),
    getHandle: vi.fn().mockReturnValue('alice.bsky.social'),
  }

  return { mockAgent, mockServiceInstance }
})

vi.mock('./bluesky', () => {
  // Must be a real class so `new BlueskyService()` works in provider.ts
  class MockBlueskyService {
    constructor() {
      return mockServiceInstance
    }
  }
  return { BlueskyService: MockBlueskyService }
})

import { provider, config } from './provider'
import { nip46 } from './index'

// ─── 2.1 Config tests ───────────────────────────────────────────────

describe('Bluesky provider config', () => {
  it('config.name should be "Bluesky"', () => {
    expect(config.name).toBe('Bluesky')
  })

  it('config.loginMethods should include oauth and password', () => {
    expect(config.loginMethods).toContain('oauth')
    expect(config.loginMethods).toContain('password')
  })

  it('config.loginSuffix should be ".bsky.social"', () => {
    expect(config.loginSuffix).toBe('.bsky.social')
  })

  it('config.formatHandle should prepend @', () => {
    expect(config.formatHandle('alice.bsky.social')).toBe('@alice.bsky.social')
  })

  it('config.profileUrl should return bsky.app URL', () => {
    expect(config.profileUrl!('alice.bsky.social')).toBe(
      'https://bsky.app/profile/alice.bsky.social'
    )
  })

  it('config.supportsFollowers should be true', () => {
    expect(config.supportsFollowers).toBe(true)
  })

  it('config.supportsFollowing should be true', () => {
    expect(config.supportsFollowing).toBe(true)
  })

  it('config.supportsProfileUpdate should be true', () => {
    expect(config.supportsProfileUpdate).toBe(true)
  })

  it('config.supportsBlobUpload should be true', () => {
    expect(config.supportsBlobUpload).toBe(true)
  })

  it('config.passwordHelp should be defined with correct structure', () => {
    expect(config.passwordHelp).toBeDefined()
    expect(config.passwordHelp!.placeholder).toBe('xxxx-xxxx-xxxx-xxxx')
    expect(config.passwordHelp!.url).toBe('https://bsky.app/settings/app-passwords')
    expect(config.passwordHelp!.label).toBe('Create an app password at')
    expect(config.passwordHelp!.linkText).toBe('bsky.app/settings/app-passwords')
  })

  it('config.loginPlaceholder should be "username"', () => {
    expect(config.loginPlaceholder).toBe('username')
  })

  it('config.mappingServiceUrl should be set', () => {
    expect(config.mappingServiceUrl).toBeTruthy()
    expect(config.mappingServiceUrl).toContain('xmtp.workers.dev')
  })
})

// ─── 2.2 Provider interface compliance ──────────────────────────────

describe('Bluesky provider interface compliance', () => {
  it('should implement all required IdentityProvider methods', () => {
    expect(provider.login).toBeTypeOf('function')
    expect(provider.logout).toBeTypeOf('function')
    expect(provider.restoreSession).toBeTypeOf('function')
    expect(provider.publishInboxBinding).toBeTypeOf('function')
    expect(provider.lookupInboxForIdentity).toBeTypeOf('function')
    expect(provider.deleteInboxBinding).toBeTypeOf('function')
    expect(provider.getProfile).toBeTypeOf('function')
    expect(provider.getProfiles).toBeTypeOf('function')
    expect(provider.searchUsers).toBeTypeOf('function')
  })

  it('should implement all optional methods', () => {
    expect(provider.loginWithPassword).toBeTypeOf('function')
    expect(provider.getFollowers).toBeTypeOf('function')
    expect(provider.getFollowing).toBeTypeOf('function')
    expect(provider.getAllFollowingIds).toBeTypeOf('function')
    expect(provider.canPublishIdentity).toBeTypeOf('function')
    expect(provider.uploadBlob).toBeTypeOf('function')
    expect(provider.updateProfile).toBeTypeOf('function')
  })

  it('nip46 export should be null (Bluesky does not use NIP-46)', () => {
    expect(nip46).toBeNull()
  })
})

// ─── 2.3 Provider adapter logic ─────────────────────────────────────

describe('Bluesky provider adapter logic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Restore default mock return values after clearAllMocks
    mockServiceInstance.isLoggedIn.mockReturnValue(true)
    mockServiceInstance.getMyProfile.mockResolvedValue({
      id: 'did:plc:test123',
      handle: 'alice.bsky.social',
      displayName: 'Alice',
    } as UserProfile)
    mockServiceInstance.login.mockResolvedValue({
      id: 'did:plc:test123',
      handle: 'alice.bsky.social',
      displayName: 'Alice',
    } as UserProfile)
    mockServiceInstance.loginWithPassword.mockResolvedValue({
      id: 'did:plc:test123',
      handle: 'alice.bsky.social',
      displayName: 'Alice',
    } as UserProfile)
    mockServiceInstance.getProfile.mockResolvedValue({
      id: 'did:plc:test123',
      handle: 'alice.bsky.social',
      displayName: 'Alice',
    } as UserProfile)
    mockServiceInstance.getAgent.mockReturnValue(mockAgent)
    mockServiceInstance.getDid.mockReturnValue('did:plc:test123')
    mockServiceInstance.hasRepoWriteAccess.mockReturnValue(true)
    mockServiceInstance.getAllFollowingDids.mockResolvedValue(new Set(['did:plc:friend1']))
    mockServiceInstance.uploadBlob.mockResolvedValue('https://cdn.bsky.app/img/blob123')
    mockServiceInstance.updateProfile.mockResolvedValue({
      id: 'did:plc:test123',
      handle: 'alice.bsky.social',
      displayName: 'Updated Alice',
    } as UserProfile)
  })

  describe('login', () => {
    it('should call service.init() then service.login(), returning { profile, id }', async () => {
      const result = await provider.login('alice.bsky.social')
      expect(mockServiceInstance.init).toHaveBeenCalled()
      expect(mockServiceInstance.login).toHaveBeenCalledWith('alice.bsky.social')
      expect(result).toEqual({
        profile: { id: 'did:plc:test123', handle: 'alice.bsky.social', displayName: 'Alice' },
        id: 'did:plc:test123',
      })
    })
  })

  describe('loginWithPassword', () => {
    it('should call service.loginWithPassword(), returning { profile, id }', async () => {
      const result = await provider.loginWithPassword!('alice.bsky.social', 'app-password')
      expect(mockServiceInstance.loginWithPassword).toHaveBeenCalledWith('alice.bsky.social', 'app-password')
      expect(result).toEqual({
        profile: { id: 'did:plc:test123', handle: 'alice.bsky.social', displayName: 'Alice' },
        id: 'did:plc:test123',
      })
    })
  })

  describe('restoreSession', () => {
    it('should return null when not logged in', async () => {
      mockServiceInstance.isLoggedIn.mockReturnValueOnce(false)
      const result = await provider.restoreSession()
      expect(result).toBeNull()
    })

    it('should return null when getMyProfile returns null', async () => {
      mockServiceInstance.isLoggedIn.mockReturnValueOnce(true)
      mockServiceInstance.getMyProfile.mockResolvedValueOnce(null)
      const result = await provider.restoreSession()
      expect(result).toBeNull()
    })

    it('should return { profile, id } when session exists', async () => {
      mockServiceInstance.isLoggedIn.mockReturnValueOnce(true)
      const result = await provider.restoreSession()
      expect(mockServiceInstance.init).toHaveBeenCalled()
      expect(result).toEqual({
        profile: { id: 'did:plc:test123', handle: 'alice.bsky.social', displayName: 'Alice' },
        id: 'did:plc:test123',
      })
    })
  })

  describe('lookupInboxForIdentity', () => {
    it('should return { found: true, inboxId, verificationSignature } on success', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          value: { id: 'inbox-123', verificationSignature: 'sig-abc' },
        }),
      })

      const result = await provider.lookupInboxForIdentity('did:plc:test123')
      expect(result).toEqual({
        found: true,
        inboxId: 'inbox-123',
        verificationSignature: 'sig-abc',
      })
    })

    it('should return { found: false, notFound: true } on 404', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 404,
      })

      const result = await provider.lookupInboxForIdentity('did:plc:unknown')
      expect(result).toEqual({ found: false, notFound: true })
    })

    it('should return { found: false, notFound: true } on 400', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 400,
      })

      const result = await provider.lookupInboxForIdentity('did:plc:invalid')
      expect(result).toEqual({ found: false, notFound: true })
    })

    it('should return { found: false, notFound: false } on other HTTP errors', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 500,
      })

      const result = await provider.lookupInboxForIdentity('did:plc:test')
      expect(result).toEqual({ found: false, notFound: false })
    })

    it('should return { found: false, notFound: false } on network error', async () => {
      global.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'))

      const result = await provider.lookupInboxForIdentity('did:plc:test')
      expect(result).toEqual({ found: false, notFound: false })
    })

    it('should return { found: false, notFound: true } when record missing required fields', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          value: { id: null, verificationSignature: '' },
        }),
      })

      const result = await provider.lookupInboxForIdentity('did:plc:test')
      expect(result).toEqual({ found: false, notFound: true })
    })
  })

  describe('publishInboxBinding', () => {
    it('should write correct ATProto record shape', async () => {
      await provider.publishInboxBinding('inbox-123', 'sig-abc')
      expect(mockAgent.com.atproto.repo.putRecord).toHaveBeenCalledWith({
        repo: 'did:plc:test123',
        collection: 'org.xmtp.inbox',
        rkey: 'self',
        record: {
          $type: 'org.xmtp.inbox',
          id: 'inbox-123',
          verificationSignature: 'sig-abc',
          createdAt: expect.any(String),
        },
      })
    })
  })

  describe('deleteInboxBinding', () => {
    it('should delete correct record', async () => {
      await provider.deleteInboxBinding()
      expect(mockAgent.com.atproto.repo.deleteRecord).toHaveBeenCalledWith({
        repo: 'did:plc:test123',
        collection: 'org.xmtp.inbox',
        rkey: 'self',
      })
    })
  })

  describe('getProfile', () => {
    it('should delegate to service.getProfile', async () => {
      const result = await provider.getProfile('did:plc:test123')
      expect(mockServiceInstance.getProfile).toHaveBeenCalledWith('did:plc:test123')
      expect(result).toEqual({
        id: 'did:plc:test123',
        handle: 'alice.bsky.social',
        displayName: 'Alice',
      })
    })
  })

  describe('getProfiles', () => {
    it('should fetch in parallel and return Map', async () => {
      const profileA: UserProfile = { id: 'did:plc:a', handle: 'a.bsky.social' }
      const profileB: UserProfile = { id: 'did:plc:b', handle: 'b.bsky.social' }
      mockServiceInstance.getProfile
        .mockResolvedValueOnce(profileA)
        .mockResolvedValueOnce(profileB)

      const result = await provider.getProfiles(['did:plc:a', 'did:plc:b'])
      expect(result).toBeInstanceOf(Map)
      expect(result.size).toBe(2)
      expect(result.get('did:plc:a')).toEqual(profileA)
      expect(result.get('did:plc:b')).toEqual(profileB)
    })

    it('should skip null profiles', async () => {
      mockServiceInstance.getProfile
        .mockResolvedValueOnce({ id: 'did:plc:a', handle: 'a.bsky.social' })
        .mockResolvedValueOnce(null)

      const result = await provider.getProfiles(['did:plc:a', 'did:plc:missing'])
      expect(result.size).toBe(1)
      expect(result.has('did:plc:missing')).toBe(false)
    })
  })

  describe('searchUsers', () => {
    it('should delegate to service.searchUsers', async () => {
      const mockResults: UserProfile[] = [
        { id: 'did:plc:test', handle: 'test.bsky.social' },
      ]
      mockServiceInstance.searchUsers.mockResolvedValueOnce(mockResults)

      const result = await provider.searchUsers('test', 5)
      expect(mockServiceInstance.searchUsers).toHaveBeenCalledWith('test', 5)
      expect(result).toEqual(mockResults)
    })
  })

  describe('getFollowers', () => {
    it('should delegate to service and remap result', async () => {
      const followers: UserProfile[] = [{ id: 'did:plc:f1', handle: 'f1.bsky.social' }]
      mockServiceInstance.getFollowers.mockResolvedValueOnce({ followers, cursor: 'next-cursor' })

      const result = await provider.getFollowers!('did:plc:test123', undefined)
      expect(result).toEqual({ profiles: followers, cursor: 'next-cursor' })
    })
  })

  describe('getFollowing', () => {
    it('should delegate to service and remap result', async () => {
      const following: UserProfile[] = [{ id: 'did:plc:f2', handle: 'f2.bsky.social' }]
      mockServiceInstance.getFollowing.mockResolvedValueOnce({ following, cursor: 'next-cursor' })

      const result = await provider.getFollowing!('did:plc:test123', undefined)
      expect(result).toEqual({ profiles: following, cursor: 'next-cursor' })
    })
  })

  describe('getAllFollowingIds', () => {
    it('should return Set of DIDs', async () => {
      const result = await provider.getAllFollowingIds!('did:plc:test123')
      expect(result).toBeInstanceOf(Set)
      expect(result.has('did:plc:friend1')).toBe(true)
    })
  })

  describe('canPublishIdentity', () => {
    it('should delegate to service.hasRepoWriteAccess', () => {
      expect(provider.canPublishIdentity!()).toBe(true)
      expect(mockServiceInstance.hasRepoWriteAccess).toHaveBeenCalled()
    })
  })

  describe('logout', () => {
    it('should delegate to service.logout', async () => {
      await provider.logout()
      expect(mockServiceInstance.logout).toHaveBeenCalled()
    })
  })

  describe('uploadBlob', () => {
    it('should delegate to service.uploadBlob', async () => {
      const blob = new Blob(['test'], { type: 'image/png' })
      const result = await provider.uploadBlob!(blob)
      expect(mockServiceInstance.uploadBlob).toHaveBeenCalledWith(blob)
      expect(result).toBe('https://cdn.bsky.app/img/blob123')
    })
  })

  describe('updateProfile', () => {
    it('should delegate to service.updateProfile', async () => {
      const updates = { displayName: 'Updated Alice' }
      const result = await provider.updateProfile!(updates)
      expect(mockServiceInstance.updateProfile).toHaveBeenCalledWith(updates)
      expect(result.displayName).toBe('Updated Alice')
    })
  })
})
