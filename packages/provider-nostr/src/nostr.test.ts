import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

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

import { NostrService } from './nostr'

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

  describe('loginWithExtension', () => {
    it('should get pubkey from NIP-07 extension', async () => {
      ;(window as any).nostr = {
        getPublicKey: vi.fn().mockResolvedValue('a'.repeat(64)),
        signEvent: vi.fn(),
      }

      mockPool.get.mockResolvedValue({
        kind: 0,
        content: JSON.stringify({ name: 'alice', picture: 'https://img.com/a.jpg' }),
        pubkey: 'a'.repeat(64),
      })

      const profile = await service.loginWithExtension()
      expect(profile.handle).toBe('alice')
      expect(service.isLoggedIn()).toBe(true)
    })

    it('should throw when no extension is installed', async () => {
      await expect(service.loginWithExtension()).rejects.toThrow('No Nostr extension found')
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

  describe('publishInboxBinding', () => {
    it('should merge xmtp field into existing metadata', async () => {
      ;(window as any).nostr = {
        getPublicKey: vi.fn().mockResolvedValue('a'.repeat(64)),
        signEvent: vi.fn((t: any) => ({ ...t, id: 'id', pubkey: 'a'.repeat(64), sig: 'sig' })),
      }

      // Login first
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

      // Check the signed event content includes merged fields
      // loginWithExtension doesn't call signEvent, so publishInboxBinding's call is at index 0
      const signCall = (window as any).nostr.signEvent.mock.calls[0][0]
      const content = JSON.parse(signCall.content)
      expect(content.name).toBe('alice')
      expect(content.about).toBe('existing bio')
      expect(content.xmtp.inboxId).toBe('inbox-123')
      expect(content.xmtp.verificationSignature).toBe('sig-abc')
    })
  })
})
