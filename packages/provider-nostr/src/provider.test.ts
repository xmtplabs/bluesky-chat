import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock nip46-auth before any imports
vi.mock('./nip46-auth', () => ({
  startNip46Connect: vi.fn(() => ({
    promise: Promise.resolve('a'.repeat(64)),
    abort: vi.fn(),
  })),
  loginWithExtension: vi.fn().mockResolvedValue('a'.repeat(64)),
  restoreNip46Session: vi.fn().mockResolvedValue(null),
  clearNip46Session: vi.fn().mockResolvedValue(undefined),
  getActiveBunkerSigner: vi.fn().mockReturnValue(null),
}))

// Mock NostrService before importing provider
vi.mock('./nostr', () => {
  class MockNostrService {
    loginViaNip46 = vi.fn().mockResolvedValue({
      id: 'npub1test', handle: 'alice', displayName: 'Alice',
    })
    cancelNip46 = vi.fn()
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
    isLoggedIn = vi.fn().mockReturnValue(true)
    getFollowing = vi.fn().mockResolvedValue([])
    fetchProfile = vi.fn()
  }
  return { NostrService: MockNostrService }
})

import { provider, config, nip46 } from './provider'

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

  it('should export config with nip46-qr method', () => {
    expect(config.name).toBe('Nostr')
    expect(config.loginPlaceholder).toMatch(/npub/)
    expect(config.loginSuffix).toBeUndefined()
    expect(config.loginMethods).toContain('nip46-qr')
    expect(config.supportsBlobUpload).toBe(false)
  })

  it('should export nip46 helpers', () => {
    expect(nip46.startConnect).toBeTypeOf('function')
    expect(nip46.cancelConnect).toBeTypeOf('function')
    expect(nip46.hasExtension).toBeTypeOf('function')
    expect(nip46.loginWithExtension).toBeTypeOf('function')
  })

  it('should report publish capability via canPublishIdentity', () => {
    // After the mock NostrService is constructed, the provider delegates to it.
    // The mock always has a logged-in state, so canPublishIdentity should be true.
    expect(provider.canPublishIdentity).toBeTypeOf('function')
    expect(provider.canPublishIdentity!()).toBe(true)
  })

  it('nip46.startConnect should delegate to NostrService.loginViaNip46', async () => {
    const onQrUri = vi.fn()
    const result = await nip46.startConnect(onQrUri)
    expect(result.id).toBe('npub1test')
  })
})
