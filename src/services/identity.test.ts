import { describe, it, expect, beforeEach, vi } from 'vitest'
import { identityService } from './identity'

// Mock the xmtp module
vi.mock('./xmtp', () => ({
  verifyInboxOwnership: vi.fn().mockResolvedValue({ verified: true })
}))

// Mock the mappingBackend module - backend is unavailable in tests
vi.mock('./mappingBackend', () => ({
  mappingBackend: {
    isAvailable: vi.fn().mockReturnValue(false),
    lookupByDid: vi.fn().mockResolvedValue(null),
    lookupByInbox: vi.fn().mockResolvedValue(null),
    bulkLookupByDid: vi.fn().mockResolvedValue({ mappings: [], notFound: [] }),
    bulkLookupByInbox: vi.fn().mockResolvedValue({ mappings: [], notFound: [] }),
    registerMapping: vi.fn().mockResolvedValue(true)
  }
}))

describe('IdentityService', () => {
  beforeEach(() => {
    // Clear localStorage mock
    vi.mocked(localStorage.getItem).mockReturnValue(null)
    vi.mocked(localStorage.setItem).mockClear()
  })

  describe('linkIdentity', () => {
    it('should link an identity ID to an XMTP inbox ID', async () => {
      await identityService.init()

      await identityService.linkIdentity(
        'did:plc:abc123',
        'alice.bsky.social',
        'inbox-id-1234',
        'signature-base64'
      )

      const inboxId = identityService.getInboxIdFromId('did:plc:abc123')
      expect(inboxId).toBe('inbox-id-1234')
    })

    it('should enable reverse lookup from inbox ID to DID', async () => {
      await identityService.init()

      await identityService.linkIdentity(
        'did:plc:abc123',
        'alice.bsky.social',
        'inbox-id-1234',
        'signature-base64'
      )

      const did = identityService.getIdFromInboxId('inbox-id-1234')
      expect(did).toBe('did:plc:abc123')
    })
  })

  describe('getIdFromInboxId', () => {
    it('should return DID for a known inbox ID', async () => {
      await identityService.init()

      await identityService.linkIdentity(
        'did:plc:xyz789',
        'bob.bsky.social',
        'inbox-xyz',
        'sig-xyz'
      )

      const did = identityService.getIdFromInboxId('inbox-xyz')
      expect(did).toBe('did:plc:xyz789')
    })

    it('should return undefined for unknown inbox ID', async () => {
      await identityService.init()

      const did = identityService.getIdFromInboxId('unknown-inbox')
      expect(did).toBeUndefined()
    })
  })

  describe('cacheProfile', () => {
    it('should cache profiles by DID and handle', async () => {
      await identityService.init()

      const profile = {
        id: 'did:plc:test123',
        handle: 'test.bsky.social',
        displayName: 'Test User',
        avatar: 'https://example.com/avatar.jpg'
      }

      identityService.cacheProfile(profile)

      expect(identityService.getCachedProfile('did:plc:test123')).toEqual(profile)
      expect(identityService.getCachedProfile('test.bsky.social')).toEqual(profile)
    })
  })

  describe('clearAll', () => {
    it('should clear all mappings and cache', async () => {
      await identityService.init()

      await identityService.linkIdentity('did:plc:a', 'a.bsky.social', 'inbox-a', 'sig-a')
      identityService.cacheProfile({ id: 'did:plc:a', handle: 'a.bsky.social' })

      await identityService.clearAll()

      expect(identityService.getInboxIdFromId('did:plc:a')).toBeUndefined()
      expect(identityService.getCachedProfile('did:plc:a')).toBeUndefined()
    })
  })

  describe('getHandleFromInboxId', () => {
    it('should return handle for a known inbox ID', async () => {
      await identityService.init()

      await identityService.linkIdentity(
        'did:plc:test',
        'test.bsky.social',
        'inbox-test',
        'sig-test'
      )

      const handle = identityService.getHandleFromInboxId('inbox-test')
      expect(handle).toBe('test.bsky.social')
    })
  })

  describe('getAllKnownInboxIds', () => {
    it('should return all inbox IDs', async () => {
      await identityService.init()
      await identityService.clearAll()

      await identityService.linkIdentity('did:plc:a', 'a.bsky.social', 'inbox-a', 'sig-a')
      await identityService.linkIdentity('did:plc:b', 'b.bsky.social', 'inbox-b', 'sig-b')

      const inboxIds = identityService.getAllKnownInboxIds()
      expect(inboxIds).toContain('inbox-a')
      expect(inboxIds).toContain('inbox-b')
      expect(inboxIds).toHaveLength(2)
    })
  })

  describe('cacheMapping', () => {
    beforeEach(async () => {
      await identityService.init()
      await identityService.clearAll()
    })

    it('should register a new inbox to DID mapping', () => {
      identityService.cacheMapping('inbox-new', 'did:plc:new')

      expect(identityService.getIdFromInboxId('inbox-new')).toBe('did:plc:new')
    })

    it('should persist cached mappings to localStorage', () => {
      identityService.cacheMapping('inbox-persist', 'did:plc:persist')

      expect(localStorage.setItem).toHaveBeenCalledWith(
        'jetstream-indexer-cache',
        expect.any(String)
      )
    })

    it('should skip save if exact mapping already exists', () => {
      identityService.cacheMapping('inbox-x', 'did:plc:x')
      vi.mocked(localStorage.setItem).mockClear()

      // Register same mapping again
      identityService.cacheMapping('inbox-x', 'did:plc:x')

      // Should not call save for duplicate
      const cacheSaveCalls = vi.mocked(localStorage.setItem).mock.calls.filter(
        (call) => call[0] === 'jetstream-indexer-cache'
      )
      expect(cacheSaveCalls).toHaveLength(0)
    })

    it('should handle DID re-linked to new inbox (cleanup old inbox→DID mapping)', () => {
      // User initially links their DID to inbox-old
      identityService.cacheMapping('inbox-old', 'did:plc:user')
      expect(identityService.getIdFromInboxId('inbox-old')).toBe('did:plc:user')

      // User re-links their DID to inbox-new
      identityService.cacheMapping('inbox-new', 'did:plc:user')

      // New mapping should exist
      expect(identityService.getIdFromInboxId('inbox-new')).toBe('did:plc:user')
      // Old inbox should no longer map to any DID
      expect(identityService.getIdFromInboxId('inbox-old')).toBeUndefined()
    })

    it('should handle inbox re-linked to new DID (cleanup old DID→inbox mapping)', () => {
      // Inbox initially linked to user-a
      identityService.cacheMapping('inbox-shared', 'did:plc:user-a')
      expect(identityService.getIdFromInboxId('inbox-shared')).toBe('did:plc:user-a')

      // Inbox re-linked to user-b (e.g., after key transfer)
      identityService.cacheMapping('inbox-shared', 'did:plc:user-b')

      // Inbox should now map to user-b
      expect(identityService.getIdFromInboxId('inbox-shared')).toBe('did:plc:user-b')
    })
  })

  describe('uncacheMapping', () => {
    beforeEach(async () => {
      await identityService.init()
      await identityService.clearAll()
    })

    it('should remove a cached mapping by DID', () => {
      identityService.cacheMapping('inbox-remove', 'did:plc:remove')
      expect(identityService.getIdFromInboxId('inbox-remove')).toBe('did:plc:remove')

      identityService.uncacheMapping('did:plc:remove')

      expect(identityService.getIdFromInboxId('inbox-remove')).toBeUndefined()
    })

    it('should do nothing for unknown DID', () => {
      // Should not throw
      identityService.uncacheMapping('did:plc:unknown')
    })

    it('should persist removal to localStorage', () => {
      identityService.cacheMapping('inbox-temp', 'did:plc:temp')
      vi.mocked(localStorage.setItem).mockClear()

      identityService.uncacheMapping('did:plc:temp')

      expect(localStorage.setItem).toHaveBeenCalledWith(
        'jetstream-indexer-cache',
        expect.any(String)
      )
    })
  })

  describe('resolveIdToInbox', () => {
    beforeEach(async () => {
      vi.mocked(localStorage.getItem).mockReturnValue(null)
      await identityService.init()
      await identityService.clearAll()
      vi.clearAllMocks()
    })

    it('should return cached inbox for own linked identity', async () => {
      await identityService.linkIdentity(
        'did:plc:self',
        'self.bsky.social',
        'inbox-self',
        'sig-self'
      )

      const inboxId = await identityService.resolveIdToInbox('did:plc:self')
      expect(inboxId).toBe('inbox-self')
    })

    it('should verify and cache mapping from ATProto lookup', async () => {
      // Mock fetch for ATProto lookup
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            value: {
              id: 'inbox-peer',
              verificationSignature: 'valid-sig'
            }
          })
      })

      const inboxId = await identityService.resolveIdToInbox('did:plc:peer')

      expect(inboxId).toBe('inbox-peer')
      // Should cache the verified mapping
      expect(identityService.getIdFromInboxId('inbox-peer')).toBe('did:plc:peer')
    })

    it('should return null and clean up stale cache when ATProto record is missing', async () => {
      // Pre-populate cache with stale mapping
      identityService.cacheMapping('inbox-stale', 'did:plc:stale')
      expect(identityService.getIdFromInboxId('inbox-stale')).toBe('did:plc:stale')

      // Mock ATProto returning 404 (record deleted)
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404
      })

      const inboxId = await identityService.resolveIdToInbox('did:plc:stale')

      expect(inboxId).toBeNull()
      // Stale mapping should be cleaned up
      expect(identityService.getIdFromInboxId('inbox-stale')).toBeUndefined()
    })

    it('should return null but preserve cache on network error', async () => {
      // Pre-populate cache with mapping
      identityService.cacheMapping('inbox-cached', 'did:plc:cached')
      expect(identityService.getIdFromInboxId('inbox-cached')).toBe('did:plc:cached')

      // Mock network failure
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

      const inboxId = await identityService.resolveIdToInbox('did:plc:cached')

      expect(inboxId).toBeNull()
      // Cache should be preserved since this was a network error, not a 404
      expect(identityService.getIdFromInboxId('inbox-cached')).toBe('did:plc:cached')
    })

    it('should return null when signature verification fails', async () => {
      // Mock fetch with valid response
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            value: {
              id: 'inbox-fake',
              verificationSignature: 'invalid-sig'
            }
          })
      })

      // Mock verification to fail definitively
      const { verifyInboxOwnership } = await import('./xmtp')
      vi.mocked(verifyInboxOwnership).mockResolvedValueOnce({ verified: false, definitive: true })

      const inboxId = await identityService.resolveIdToInbox('did:plc:fake')

      expect(inboxId).toBeNull()
    })

    it('should clean up stale cache when signature verification fails definitively', async () => {
      // Pre-populate cache with stale mapping
      identityService.cacheMapping('inbox-compromised', 'did:plc:compromised')
      expect(identityService.getIdFromInboxId('inbox-compromised')).toBe('did:plc:compromised')

      // Mock fetch with valid response but different inbox ID
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            value: {
              id: 'inbox-compromised',
              verificationSignature: 'bad-sig'
            }
          })
      })

      // Mock verification to fail definitively
      const { verifyInboxOwnership } = await import('./xmtp')
      vi.mocked(verifyInboxOwnership).mockResolvedValueOnce({ verified: false, definitive: true })

      const inboxId = await identityService.resolveIdToInbox('did:plc:compromised')

      expect(inboxId).toBeNull()
      // Stale mapping should be cleaned up
      expect(identityService.getIdFromInboxId('inbox-compromised')).toBeUndefined()
      expect(identityService.getInboxIdFromId('did:plc:compromised')).toBeUndefined()
    })

    it('should preserve cache when verification fails due to network error', async () => {
      // Pre-populate cache with valid mapping
      identityService.cacheMapping('inbox-valid', 'did:plc:valid')
      expect(identityService.getIdFromInboxId('inbox-valid')).toBe('did:plc:valid')

      // Mock fetch with valid response
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            value: {
              id: 'inbox-valid',
              verificationSignature: 'good-sig'
            }
          })
      })

      // Mock verification to fail due to network error (not definitive)
      const { verifyInboxOwnership } = await import('./xmtp')
      vi.mocked(verifyInboxOwnership).mockResolvedValueOnce({ verified: false, definitive: false })

      const inboxId = await identityService.resolveIdToInbox('did:plc:valid')

      expect(inboxId).toBeNull()
      // Cache should be preserved despite verification failure
      expect(identityService.getIdFromInboxId('inbox-valid')).toBe('did:plc:valid')
      expect(identityService.getInboxIdFromId('did:plc:valid')).toBe('inbox-valid')
    })
  })

  describe('loadCachedMappings', () => {
    it('should load cached mappings from localStorage on init', async () => {
      const cachedData = {
        inboxToDid: { 'inbox-cached': 'did:plc:cached' },
        didToInbox: { 'did:plc:cached': 'inbox-cached' }
      }
      vi.mocked(localStorage.getItem).mockImplementation((key) => {
        if (key === 'jetstream-indexer-cache') {
          return JSON.stringify(cachedData)
        }
        return null
      })

      await identityService.init()

      expect(identityService.getIdFromInboxId('inbox-cached')).toBe('did:plc:cached')
    })

    it('should merge cached mappings with identity mappings', async () => {
      // Set up both identity mappings and cached mappings
      const identityMappings = [
        {
          identityId: 'did:plc:self',
          identityHandle: 'self.bsky.social',
          xmtpInboxId: 'inbox-self',
          verificationSignature: 'sig-self',
          createdAt: Date.now()
        }
      ]
      const indexedCache = {
        inboxToDid: { 'inbox-peer': 'did:plc:peer' },
        didToInbox: { 'did:plc:peer': 'inbox-peer' }
      }

      vi.mocked(localStorage.getItem).mockImplementation((key) => {
        if (key === 'identity-mappings') {
          return JSON.stringify(identityMappings)
        }
        if (key === 'jetstream-indexer-cache') {
          return JSON.stringify(indexedCache)
        }
        return null
      })

      await identityService.init()

      // Both should be available
      expect(identityService.getIdFromInboxId('inbox-self')).toBe('did:plc:self')
      expect(identityService.getIdFromInboxId('inbox-peer')).toBe('did:plc:peer')
    })
  })

  describe('removeMapping', () => {
    it('should remove identity mapping and clean up reverse lookup', async () => {
      await identityService.init()
      await identityService.linkIdentity('did:plc:del', 'del.bsky.social', 'inbox-del', 'sig-del')

      expect(identityService.getIdFromInboxId('inbox-del')).toBe('did:plc:del')

      await identityService.removeMapping('did:plc:del')

      expect(identityService.getInboxIdFromId('did:plc:del')).toBeUndefined()
      expect(identityService.getIdFromInboxId('inbox-del')).toBeUndefined()
    })
  })
})
