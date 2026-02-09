import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock nip46-auth before any imports that use it
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

// Mock nostr-tools modules
vi.mock('nostr-tools/pool', () => {
  class MockSimplePool {
    get = vi.fn()
    querySync = vi.fn()
    publish = vi.fn(() => [Promise.resolve('ok')])
  }
  return { SimplePool: MockSimplePool }
})

vi.mock('nostr-tools/pure', () => ({
  getPublicKey: vi.fn(() => 'a'.repeat(64)),
  finalizeEvent: vi.fn((template: any) => ({
    ...template,
    id: 'event-id',
    pubkey: 'a'.repeat(64),
    sig: 'sig',
  })),
  generateSecretKey: vi.fn(() => new Uint8Array(32)),
}))

vi.mock('nostr-tools', () => ({
  nip19: {
    decode: vi.fn((input: string) => {
      if (input.startsWith('nsec1')) return { type: 'nsec', data: new Uint8Array(32) }
      if (input.startsWith('npub1')) return { type: 'npub', data: 'a'.repeat(64) }
      throw new Error('invalid')
    }),
    npubEncode: vi.fn(() => 'npub1mock'),
  },
}))

vi.mock('nostr-tools/nip46', () => ({
  createNostrConnectURI: vi.fn(() => 'nostrconnect://abc123'),
  BunkerSigner: {
    fromURI: vi.fn(),
    fromBunker: vi.fn(),
  },
}))

import { NostrService } from './nostr'
import { clearNip46Session, restoreNip46Session } from './nip46-auth'

describe('NostrService', () => {
  let service: NostrService
  let mockPool: any

  beforeEach(() => {
    service = new NostrService(['wss://test-relay'])
    // Access the pool instance created in the constructor
    mockPool = (service as any).pool
    localStorage.clear()
  })

  afterEach(() => {
    delete (window as any).nostr
  })

  describe('loginViaNip46', () => {
    it('should call onQrUri and fetch profile on successful connect', async () => {
      mockPool.get.mockResolvedValue({
        kind: 0,
        content: JSON.stringify({ name: 'alice', picture: 'https://img.com/a.jpg' }),
        pubkey: 'a'.repeat(64),
      })

      const onQrUri = vi.fn()
      const profile = await service.loginViaNip46(onQrUri)
      expect(profile.handle).toBe('alice')
      expect(service.isLoggedIn()).toBe(true)
    })
  })

  describe('loginWithExtension', () => {
    it('should login via NIP-07 extension and fetch profile', async () => {
      mockPool.get.mockResolvedValue({
        kind: 0,
        content: JSON.stringify({ name: 'bob' }),
        pubkey: 'a'.repeat(64),
      })

      const profile = await service.loginWithExtension()
      expect(profile.handle).toBe('bob')
      expect(service.isLoggedIn()).toBe(true)
    })
  })

  describe('restoreSession', () => {
    it('should return null when no NIP-46 session exists and no extension', async () => {
      const result = await service.restoreSession()
      expect(result).toBeNull()
    })

    it('should restore from NIP-46 session', async () => {
      vi.mocked(restoreNip46Session).mockResolvedValueOnce('a'.repeat(64))

      mockPool.get.mockResolvedValue({
        kind: 0,
        content: JSON.stringify({ name: 'alice' }),
        pubkey: 'a'.repeat(64),
      })

      const profile = await service.restoreSession()
      expect(profile).not.toBeNull()
      expect(profile!.handle).toBe('alice')
      expect(service.isLoggedIn()).toBe(true)
    })

    it('should fall back to extension when NIP-46 session fails', async () => {
      vi.mocked(restoreNip46Session).mockResolvedValueOnce(null)
      ;(window as any).nostr = {
        getPublicKey: vi.fn().mockResolvedValue('a'.repeat(64)),
        signEvent: vi.fn(),
      }

      mockPool.get.mockResolvedValue({
        kind: 0,
        content: JSON.stringify({ name: 'alice' }),
        pubkey: 'a'.repeat(64),
      })

      const profile = await service.restoreSession()
      expect(profile).not.toBeNull()
      expect(profile!.handle).toBe('alice')
    })
  })

  describe('logout', () => {
    it('should call clearNip46Session and clear state', async () => {
      mockPool.get.mockResolvedValue({
        kind: 0,
        content: JSON.stringify({ name: 'alice' }),
        pubkey: 'a'.repeat(64),
      })

      await service.loginWithExtension()
      expect(service.isLoggedIn()).toBe(true)

      await service.logout()
      expect(service.isLoggedIn()).toBe(false)
      expect(clearNip46Session).toHaveBeenCalled()
    })
  })

  describe('lookupInboxBinding', () => {
    it('should return binding when xmtp field exists in kind 0', async () => {
      mockPool.get.mockResolvedValue({
        kind: 0,
        content: JSON.stringify({
          name: 'alice',
          xmtp: {
            inboxId: 'inbox-123',
            verificationSignature: 'sig-abc',
            createdAt: '2025-01-01T00:00:00Z',
          },
        }),
        pubkey: 'a'.repeat(64),
      })

      const result = await service.lookupInboxBinding('npub1test')
      expect(result.found).toBe(true)
      if (result.found) {
        expect(result.inboxId).toBe('inbox-123')
        expect(result.verificationSignature).toBe('sig-abc')
      }
    })

    it('should return not found when kind 0 has no xmtp field', async () => {
      mockPool.get.mockResolvedValue({
        kind: 0,
        content: JSON.stringify({ name: 'alice' }),
        pubkey: 'a'.repeat(64),
      })

      const result = await service.lookupInboxBinding('npub1test')
      expect(result.found).toBe(false)
    })

    it('should return not found when no kind 0 event exists', async () => {
      mockPool.get.mockResolvedValue(null)

      const result = await service.lookupInboxBinding('npub1test')
      expect(result.found).toBe(false)
      if (!result.found) expect(result.notFound).toBe(true)
    })
  })

  describe('binding round-trip', () => {
    it('should publish xmtp binding to kind 0 and look it up again', async () => {
      // Setup: login via extension so we can sign
      ;(window as any).nostr = {
        getPublicKey: vi.fn().mockResolvedValue('a'.repeat(64)),
        signEvent: vi.fn((t: any) => ({ ...t, id: 'id', pubkey: 'a'.repeat(64), sig: 'sig' })),
      }

      mockPool.get.mockResolvedValue({
        kind: 0,
        content: JSON.stringify({ name: 'alice' }),
        pubkey: 'a'.repeat(64),
      })
      await service.loginWithExtension()

      // Publish: merge xmtp into kind 0
      mockPool.get.mockResolvedValue({
        kind: 0,
        content: JSON.stringify({ name: 'alice', about: 'bio' }),
        pubkey: 'a'.repeat(64),
      })
      await service.publishInboxBinding('inbox-abc123', 'c2lnbmF0dXJl')

      // Verify the signed event has correct structure per HackMD spec
      const signCall = (window as any).nostr.signEvent.mock.calls.at(-1)[0]
      const metadata = JSON.parse(signCall.content)
      expect(metadata.name).toBe('alice')
      expect(metadata.about).toBe('bio')
      expect(metadata.xmtp).toEqual({
        inboxId: 'inbox-abc123',
        verificationSignature: 'c2lnbmF0dXJl',
        createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      })

      // Lookup: should find the binding from a kind 0 event containing the xmtp field
      mockPool.get.mockResolvedValue({
        kind: 0,
        content: signCall.content,
        pubkey: 'a'.repeat(64),
      })
      const result = await service.lookupInboxBinding('npub1mock')
      expect(result.found).toBe(true)
      if (result.found) {
        expect(result.inboxId).toBe('inbox-abc123')
        expect(result.verificationSignature).toBe('c2lnbmF0dXJl')
      }
    })
  })

  describe('publishInboxBinding', () => {
    it('should merge xmtp field into existing metadata', async () => {
      ;(window as any).nostr = {
        getPublicKey: vi.fn().mockResolvedValue('a'.repeat(64)),
        signEvent: vi.fn((t: any) => ({ ...t, id: 'id', pubkey: 'a'.repeat(64), sig: 'sig' })),
      }

      // Login via extension first
      mockPool.get.mockResolvedValue({
        kind: 0,
        content: JSON.stringify({ name: 'alice' }),
        pubkey: 'a'.repeat(64),
      })
      await service.loginWithExtension()

      // Now publish binding — get should return existing metadata
      mockPool.get.mockResolvedValue({
        kind: 0,
        content: JSON.stringify({ name: 'alice', about: 'existing bio' }),
        pubkey: 'a'.repeat(64),
      })

      await service.publishInboxBinding('inbox-123', 'sig-abc')

      const signCall = (window as any).nostr.signEvent.mock.calls[0][0]
      const content = JSON.parse(signCall.content)
      expect(content.name).toBe('alice')
      expect(content.about).toBe('existing bio')
      expect(content.xmtp.inboxId).toBe('inbox-123')
      expect(content.xmtp.verificationSignature).toBe('sig-abc')
    })
  })
})
