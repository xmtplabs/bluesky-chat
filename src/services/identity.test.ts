import { describe, it, expect, beforeEach, vi } from 'vitest'
import { identityService } from './identity'

// Mock the xmtp module
vi.mock('./xmtp', () => ({
  verifyInboxOwnership: vi.fn().mockResolvedValue(true)
}))

describe('IdentityService', () => {
  beforeEach(() => {
    // Clear localStorage mock
    vi.mocked(localStorage.getItem).mockReturnValue(null)
    vi.mocked(localStorage.setItem).mockClear()
  })

  describe('linkIdentity', () => {
    it('should link a Bluesky DID to an XMTP inbox ID', async () => {
      await identityService.init()

      await identityService.linkIdentity(
        'did:plc:abc123',
        'alice.bsky.social',
        'inbox-id-1234',
        'signature-base64'
      )

      const inboxId = identityService.getInboxIdFromDid('did:plc:abc123')
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

      const did = identityService.getDidFromInboxId('inbox-id-1234')
      expect(did).toBe('did:plc:abc123')
    })
  })

  describe('getDidFromInboxId', () => {
    it('should return DID for a known inbox ID', async () => {
      await identityService.init()

      await identityService.linkIdentity(
        'did:plc:xyz789',
        'bob.bsky.social',
        'inbox-xyz',
        'sig-xyz'
      )

      const did = identityService.getDidFromInboxId('inbox-xyz')
      expect(did).toBe('did:plc:xyz789')
    })

    it('should return undefined for unknown inbox ID', async () => {
      await identityService.init()

      const did = identityService.getDidFromInboxId('unknown-inbox')
      expect(did).toBeUndefined()
    })
  })

  describe('cacheProfile', () => {
    it('should cache profiles by DID and handle', async () => {
      await identityService.init()

      const profile = {
        did: 'did:plc:test123',
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
      identityService.cacheProfile({ did: 'did:plc:a', handle: 'a.bsky.social' })

      await identityService.clearAll()

      expect(identityService.getInboxIdFromDid('did:plc:a')).toBeUndefined()
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

  describe('registerIndexedMapping', () => {
    beforeEach(async () => {
      await identityService.init()
      await identityService.clearAll()
    })

    it('should register a new inbox to DID mapping', () => {
      identityService.registerIndexedMapping('inbox-new', 'did:plc:new')

      expect(identityService.getDidFromInboxId('inbox-new')).toBe('did:plc:new')
    })

    it('should persist indexed mappings to localStorage', () => {
      identityService.registerIndexedMapping('inbox-persist', 'did:plc:persist')

      expect(localStorage.setItem).toHaveBeenCalledWith(
        'jetstream-indexer-cache',
        expect.any(String)
      )
    })

    it('should skip save if exact mapping already exists', () => {
      identityService.registerIndexedMapping('inbox-x', 'did:plc:x')
      vi.mocked(localStorage.setItem).mockClear()

      // Register same mapping again
      identityService.registerIndexedMapping('inbox-x', 'did:plc:x')

      // Should not call save for duplicate
      const cacheSaveCalls = vi.mocked(localStorage.setItem).mock.calls.filter(
        (call) => call[0] === 'jetstream-indexer-cache'
      )
      expect(cacheSaveCalls).toHaveLength(0)
    })

    it('should handle DID re-linked to new inbox (cleanup old inbox→DID mapping)', () => {
      // User initially links their DID to inbox-old
      identityService.registerIndexedMapping('inbox-old', 'did:plc:user')
      expect(identityService.getDidFromInboxId('inbox-old')).toBe('did:plc:user')

      // User re-links their DID to inbox-new
      identityService.registerIndexedMapping('inbox-new', 'did:plc:user')

      // New mapping should exist
      expect(identityService.getDidFromInboxId('inbox-new')).toBe('did:plc:user')
      // Old inbox should no longer map to any DID
      expect(identityService.getDidFromInboxId('inbox-old')).toBeUndefined()
    })

    it('should handle inbox re-linked to new DID (cleanup old DID→inbox mapping)', () => {
      // Inbox initially linked to user-a
      identityService.registerIndexedMapping('inbox-shared', 'did:plc:user-a')
      expect(identityService.getDidFromInboxId('inbox-shared')).toBe('did:plc:user-a')

      // Inbox re-linked to user-b (e.g., after key transfer)
      identityService.registerIndexedMapping('inbox-shared', 'did:plc:user-b')

      // Inbox should now map to user-b
      expect(identityService.getDidFromInboxId('inbox-shared')).toBe('did:plc:user-b')
    })
  })

  describe('unregisterIndexedMapping', () => {
    beforeEach(async () => {
      await identityService.init()
      await identityService.clearAll()
    })

    it('should remove an indexed mapping by DID', () => {
      identityService.registerIndexedMapping('inbox-remove', 'did:plc:remove')
      expect(identityService.getDidFromInboxId('inbox-remove')).toBe('did:plc:remove')

      identityService.unregisterIndexedMapping('did:plc:remove')

      expect(identityService.getDidFromInboxId('inbox-remove')).toBeUndefined()
    })

    it('should do nothing for unknown DID', () => {
      // Should not throw
      identityService.unregisterIndexedMapping('did:plc:unknown')
    })

    it('should persist removal to localStorage', () => {
      identityService.registerIndexedMapping('inbox-temp', 'did:plc:temp')
      vi.mocked(localStorage.setItem).mockClear()

      identityService.unregisterIndexedMapping('did:plc:temp')

      expect(localStorage.setItem).toHaveBeenCalledWith(
        'jetstream-indexer-cache',
        expect.any(String)
      )
    })
  })

  describe('resolveDidToInbox', () => {
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

      const inboxId = await identityService.resolveDidToInbox('did:plc:self')
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

      const inboxId = await identityService.resolveDidToInbox('did:plc:peer')

      expect(inboxId).toBe('inbox-peer')
      // Should cache the verified mapping
      expect(identityService.getDidFromInboxId('inbox-peer')).toBe('did:plc:peer')
    })

    it('should return null and clean up stale cache when ATProto record is missing', async () => {
      // Pre-populate cache with stale mapping
      identityService.registerIndexedMapping('inbox-stale', 'did:plc:stale')
      expect(identityService.getDidFromInboxId('inbox-stale')).toBe('did:plc:stale')

      // Mock ATProto returning 404 (record deleted)
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404
      })

      const inboxId = await identityService.resolveDidToInbox('did:plc:stale')

      expect(inboxId).toBeNull()
      // Stale mapping should be cleaned up
      expect(identityService.getDidFromInboxId('inbox-stale')).toBeUndefined()
    })

    it('should return null but preserve cache on network error', async () => {
      // Pre-populate cache with mapping
      identityService.registerIndexedMapping('inbox-cached', 'did:plc:cached')
      expect(identityService.getDidFromInboxId('inbox-cached')).toBe('did:plc:cached')

      // Mock network failure
      global.fetch = vi.fn().mockRejectedValue(new Error('Network error'))

      const inboxId = await identityService.resolveDidToInbox('did:plc:cached')

      expect(inboxId).toBeNull()
      // Cache should be preserved since this was a network error, not a 404
      expect(identityService.getDidFromInboxId('inbox-cached')).toBe('did:plc:cached')
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

      // Mock verification to fail
      const { verifyInboxOwnership } = await import('./xmtp')
      vi.mocked(verifyInboxOwnership).mockResolvedValueOnce(false)

      const inboxId = await identityService.resolveDidToInbox('did:plc:fake')

      expect(inboxId).toBeNull()
    })
  })

  describe('loadIndexedMappings', () => {
    it('should load indexed mappings from localStorage on init', async () => {
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

      expect(identityService.getDidFromInboxId('inbox-cached')).toBe('did:plc:cached')
    })

    it('should merge indexed mappings with identity mappings', async () => {
      // Set up both identity mappings and indexed cache
      const identityMappings = [
        {
          blueskyDid: 'did:plc:self',
          blueskyHandle: 'self.bsky.social',
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
      expect(identityService.getDidFromInboxId('inbox-self')).toBe('did:plc:self')
      expect(identityService.getDidFromInboxId('inbox-peer')).toBe('did:plc:peer')
    })
  })

  describe('removeMapping', () => {
    it('should remove identity mapping and clean up reverse lookup', async () => {
      await identityService.init()
      await identityService.linkIdentity('did:plc:del', 'del.bsky.social', 'inbox-del', 'sig-del')

      expect(identityService.getDidFromInboxId('inbox-del')).toBe('did:plc:del')

      await identityService.removeMapping('did:plc:del')

      expect(identityService.getInboxIdFromDid('did:plc:del')).toBeUndefined()
      expect(identityService.getDidFromInboxId('inbox-del')).toBeUndefined()
    })
  })
})
