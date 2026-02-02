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
})
