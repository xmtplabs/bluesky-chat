import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock NostrService before importing provider
vi.mock('./nostr', () => {
  class MockNostrService {
    loginWithExtension = vi.fn().mockResolvedValue({
      id: 'npub1test',
      handle: 'alice',
      displayName: 'Alice',
    })
    loginWithNsec = vi.fn().mockResolvedValue({
      id: 'npub1test',
      handle: 'alice',
      displayName: 'Alice',
    })
    logout = vi.fn().mockResolvedValue(undefined)
    restoreSession = vi.fn().mockResolvedValue(null)
    getNpub = vi.fn().mockReturnValue('npub1test')
    getProfile = vi.fn().mockResolvedValue({
      id: 'npub1test',
      handle: 'alice',
    })
    getProfiles = vi.fn().mockResolvedValue(new Map())
    searchUsers = vi.fn().mockResolvedValue([])
    publishInboxBinding = vi.fn().mockResolvedValue(undefined)
    lookupInboxBinding = vi.fn().mockResolvedValue({ found: false, notFound: true })
    deleteInboxBinding = vi.fn().mockResolvedValue(undefined)
    getFollowing = vi.fn().mockResolvedValue([])
    fetchProfile = vi.fn()
  }
  return { NostrService: MockNostrService }
})

import { provider, config } from './provider'

describe('Nostr provider adapter', () => {
  it('should export provider implementing IdentityProvider', () => {
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

  it('should export config with correct Nostr values', () => {
    expect(config.name).toBe('Nostr')
    expect(config.loginPlaceholder).toMatch(/npub/)
    expect(config.loginSuffix).toBeUndefined()
    expect(config.loginMethods).toContain('extension')
    expect(config.loginMethods).toContain('nsec')
    expect(config.supportsBlobUpload).toBe(false)
  })

  it('login should delegate to NostrService.loginWithExtension', async () => {
    const result = await provider.login('npub1test')
    expect(result.profile.id).toBe('npub1test')
    expect(result.id).toBe('npub1test')
  })
})
