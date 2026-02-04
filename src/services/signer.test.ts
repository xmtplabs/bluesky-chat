import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mockPlatformAPI } from '../test/setup'
import { IdentifierKind } from '@xmtp/browser-sdk'

// Mock viem before importing signer
vi.mock('viem/accounts', () => ({
  privateKeyToAccount: vi.fn((key: string) => ({
    address: '0x1234567890abcdef1234567890abcdef12345678',
    signMessage: vi.fn().mockResolvedValue('0xmocksignature')
  })),
  generatePrivateKey: vi.fn(() => '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890')
}))

vi.mock('viem', () => ({
  toBytes: vi.fn((hex: string) => new Uint8Array([1, 2, 3, 4]))
}))

const TEST_DID = 'did:plc:test123'

describe('Signer Service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getOrCreatePrivateKey', () => {
    it('should return existing key from secure storage', async () => {
      const existingKey = '0xexistingkey1234567890abcdef1234567890abcdef1234567890abcdef12345678'
      vi.mocked(mockPlatformAPI.secureRetrieve).mockResolvedValueOnce(existingKey)

      const { getOrCreatePrivateKey } = await import('./signer')
      const key = await getOrCreatePrivateKey(TEST_DID)

      expect(key).toBe(existingKey)
      expect(mockPlatformAPI.secureRetrieve).toHaveBeenCalledWith(`xmtp-wallet-key-${TEST_DID}`)
      expect(mockPlatformAPI.secureStore).not.toHaveBeenCalled()
    })

    it('should generate and store new key if none exists', async () => {
      vi.mocked(mockPlatformAPI.secureRetrieve).mockResolvedValueOnce(null)

      const { getOrCreatePrivateKey } = await import('./signer')
      const key = await getOrCreatePrivateKey(TEST_DID)

      expect(key).toBe('0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890')
      expect(mockPlatformAPI.secureStore).toHaveBeenCalledWith(
        `xmtp-wallet-key-${TEST_DID}`,
        '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'
      )
    })

    it('should use different keys for different DIDs', async () => {
      const did1 = 'did:plc:user1'
      const did2 = 'did:plc:user2'

      vi.mocked(mockPlatformAPI.secureRetrieve).mockResolvedValue(null)

      const { getOrCreatePrivateKey } = await import('./signer')
      await getOrCreatePrivateKey(did1)
      await getOrCreatePrivateKey(did2)

      expect(mockPlatformAPI.secureRetrieve).toHaveBeenCalledWith(`xmtp-wallet-key-${did1}`)
      expect(mockPlatformAPI.secureRetrieve).toHaveBeenCalledWith(`xmtp-wallet-key-${did2}`)
    })
  })

  describe('createXMTPSigner', () => {
    it('should create a valid XMTP signer', async () => {
      const { createXMTPSigner } = await import('./signer')
      const signer = createXMTPSigner('0xtest1234567890abcdef1234567890abcdef1234567890abcdef1234567890')

      expect(signer.type).toBe('EOA')

      const identifier = await signer.getIdentifier()
      expect(identifier.identifier).toBe('0x1234567890abcdef1234567890abcdef12345678')
      expect(identifier.identifierKind).toBe(IdentifierKind.Ethereum)
    })

    it('should sign messages correctly', async () => {
      const { createXMTPSigner } = await import('./signer')
      const signer = createXMTPSigner('0xtest1234567890abcdef1234567890abcdef1234567890abcdef1234567890')

      const signature = await signer.signMessage('test message')
      expect(signature).toBeInstanceOf(Uint8Array)
    })
  })

  describe('getAddressFromPrivateKey', () => {
    it('should return lowercase address', async () => {
      const { getAddressFromPrivateKey } = await import('./signer')
      const address = getAddressFromPrivateKey('0xtest1234567890abcdef1234567890abcdef1234567890abcdef1234567890')

      expect(address).toBe('0x1234567890abcdef1234567890abcdef12345678')
    })
  })

  describe('clearPrivateKey', () => {
    it('should delete key from secure storage', async () => {
      const { clearPrivateKey } = await import('./signer')
      await clearPrivateKey(TEST_DID)

      expect(mockPlatformAPI.secureDelete).toHaveBeenCalledWith(`xmtp-wallet-key-${TEST_DID}`)
    })
  })

  describe('hasExistingKey', () => {
    it('should return true when key exists', async () => {
      vi.mocked(mockPlatformAPI.secureRetrieve).mockResolvedValueOnce('some-key')

      const { hasExistingKey } = await import('./signer')
      const result = await hasExistingKey(TEST_DID)

      expect(result).toBe(true)
      expect(mockPlatformAPI.secureRetrieve).toHaveBeenCalledWith(`xmtp-wallet-key-${TEST_DID}`)
    })

    it('should return false when key does not exist', async () => {
      vi.mocked(mockPlatformAPI.secureRetrieve).mockResolvedValueOnce(null)

      const { hasExistingKey } = await import('./signer')
      const result = await hasExistingKey(TEST_DID)

      expect(result).toBe(false)
    })

    it('should return false on error', async () => {
      vi.mocked(mockPlatformAPI.secureRetrieve).mockRejectedValueOnce(new Error('Storage error'))

      const { hasExistingKey } = await import('./signer')
      const result = await hasExistingKey(TEST_DID)

      expect(result).toBe(false)
    })
  })
})
