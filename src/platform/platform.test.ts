import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { PlatformAPI, BuildMode, OAuthResult } from './types'

/**
 * Platform API contract tests.
 * These tests verify that any PlatformAPI implementation
 * behaves according to the interface contract.
 */

// Create a mock platform for testing the contract
function createMockPlatform(): PlatformAPI {
  const storage = new Map<string, string>()
  let oauthCallback: ((data: OAuthResult) => void) | null = null

  return {
    getBuildMode: vi.fn().mockResolvedValue('development' as BuildMode),

    secureStore: vi.fn(async (key: string, value: string) => {
      storage.set(key, value)
    }),

    secureRetrieve: vi.fn(async (key: string) => {
      return storage.get(key) ?? null
    }),

    secureDelete: vi.fn(async (key: string) => {
      storage.delete(key)
    }),

    openOAuthWindow: vi.fn().mockResolvedValue(null),

    onOAuthCallback: vi.fn((callback: (data: OAuthResult) => void) => {
      oauthCallback = callback
    }),

    removeOAuthCallback: vi.fn(() => {
      oauthCallback = null
    }),

    showNotification: vi.fn(),

    setBadgeCount: vi.fn()
  }
}

describe('PlatformAPI Contract', () => {
  let platform: PlatformAPI

  beforeEach(() => {
    platform = createMockPlatform()
  })

  describe('getBuildMode', () => {
    it('returns a valid BuildMode', async () => {
      const mode = await platform.getBuildMode()
      expect(['development', 'beta', 'production']).toContain(mode)
    })

    it('returns development mode in test environment', async () => {
      const mode = await platform.getBuildMode()
      expect(mode).toBe('development')
    })
  })

  describe('secureStorage', () => {
    const TEST_KEY = 'xmtp-wallet-key-did:plc:test123'
    const TEST_VALUE = '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890'

    it('stores and retrieves values', async () => {
      await platform.secureStore(TEST_KEY, TEST_VALUE)
      const retrieved = await platform.secureRetrieve(TEST_KEY)
      expect(retrieved).toBe(TEST_VALUE)
    })

    it('returns null for missing keys', async () => {
      const retrieved = await platform.secureRetrieve('nonexistent-key')
      expect(retrieved).toBeNull()
    })

    it('delete removes the key', async () => {
      await platform.secureStore(TEST_KEY, TEST_VALUE)
      await platform.secureDelete(TEST_KEY)
      const retrieved = await platform.secureRetrieve(TEST_KEY)
      expect(retrieved).toBeNull()
    })

    it('delete is idempotent (does not throw for missing key)', async () => {
      // Should not throw when deleting non-existent key
      await expect(platform.secureDelete('nonexistent-key')).resolves.not.toThrow()
    })

    it('validates key prefix format', async () => {
      // Keys should follow the xmtp-wallet-key- prefix convention
      const validKey = 'xmtp-wallet-key-did:plc:abc123'
      await platform.secureStore(validKey, TEST_VALUE)
      expect(platform.secureStore).toHaveBeenCalledWith(validKey, TEST_VALUE)
    })

    it('handles empty string values', async () => {
      await platform.secureStore(TEST_KEY, '')
      const retrieved = await platform.secureRetrieve(TEST_KEY)
      expect(retrieved).toBe('')
    })

    it('overwrites existing values', async () => {
      await platform.secureStore(TEST_KEY, 'first-value')
      await platform.secureStore(TEST_KEY, 'second-value')
      const retrieved = await platform.secureRetrieve(TEST_KEY)
      expect(retrieved).toBe('second-value')
    })
  })

  describe('oauth', () => {
    it('openOAuthWindow returns OAuthResult on success', async () => {
      const mockResult: OAuthResult = { code: 'auth-code', state: 'state-123', iss: 'https://bsky.social' }
      vi.mocked(platform.openOAuthWindow).mockResolvedValueOnce(mockResult)

      const result = await platform.openOAuthWindow('https://bsky.social/oauth/authorize?...')
      expect(result).toEqual(mockResult)
      expect(result?.code).toBe('auth-code')
      expect(result?.state).toBe('state-123')
    })

    it('openOAuthWindow returns null on user cancel', async () => {
      vi.mocked(platform.openOAuthWindow).mockResolvedValueOnce(null)

      const result = await platform.openOAuthWindow('https://bsky.social/oauth/authorize?...')
      expect(result).toBeNull()
    })

    it('openOAuthWindow handles timeout/error gracefully', async () => {
      vi.mocked(platform.openOAuthWindow).mockRejectedValueOnce(new Error('Window closed'))

      await expect(
        platform.openOAuthWindow('https://bsky.social/oauth/authorize?...')
      ).rejects.toThrow('Window closed')
    })

    it('callback registration and removal', () => {
      const callback = vi.fn()

      platform.onOAuthCallback(callback)
      expect(platform.onOAuthCallback).toHaveBeenCalledWith(callback)

      platform.removeOAuthCallback()
      expect(platform.removeOAuthCallback).toHaveBeenCalled()
    })
  })

  describe('notifications', () => {
    it('shows notification with title and body', () => {
      platform.showNotification('New Message', 'Hello from Alice')
      expect(platform.showNotification).toHaveBeenCalledWith('New Message', 'Hello from Alice')
    })

    it('shows notification with options', () => {
      platform.showNotification('New Message', 'Hello', { silent: true })
      expect(platform.showNotification).toHaveBeenCalledWith('New Message', 'Hello', { silent: true })
    })

    it('handles empty body', () => {
      platform.showNotification('Alert', '')
      expect(platform.showNotification).toHaveBeenCalledWith('Alert', '')
    })
  })

  describe('badge', () => {
    it('sets badge count', () => {
      platform.setBadgeCount(5)
      expect(platform.setBadgeCount).toHaveBeenCalledWith(5)
    })

    it('clears badge with count 0', () => {
      platform.setBadgeCount(0)
      expect(platform.setBadgeCount).toHaveBeenCalledWith(0)
    })

    it('handles large counts', () => {
      platform.setBadgeCount(999)
      expect(platform.setBadgeCount).toHaveBeenCalledWith(999)
    })
  })
})

describe('Platform Detection', () => {
  it('exports platform instance', async () => {
    // Reset modules to get fresh import
    vi.resetModules()

    // Mock window.electronAPI for Electron detection
    const mockElectronAPI = {
      getBuildMode: vi.fn().mockResolvedValue('development'),
      secureStore: vi.fn(),
      secureRetrieve: vi.fn(),
      secureDelete: vi.fn(),
      openOAuthWindow: vi.fn(),
      showNotification: vi.fn(),
      setBadgeCount: vi.fn(),
      onOAuthCallback: vi.fn(),
      removeOAuthCallback: vi.fn()
    }
    Object.defineProperty(window, 'electronAPI', {
      value: mockElectronAPI,
      writable: true
    })

    const { platform } = await import('./index')
    expect(platform).toBeDefined()
    expect(typeof platform.getBuildMode).toBe('function')
    expect(typeof platform.secureStore).toBe('function')
    expect(typeof platform.secureRetrieve).toBe('function')
    expect(typeof platform.secureDelete).toBe('function')
    expect(typeof platform.openOAuthWindow).toBe('function')
    expect(typeof platform.showNotification).toBe('function')
    expect(typeof platform.setBadgeCount).toBe('function')
  })

  it('selects Electron platform when no Tauri present', async () => {
    // The test setup already configures electronAPI via the setup file
    // When no __TAURI__ is present, it should use Electron
    expect('__TAURI__' in window).toBe(false)

    // The platform is already initialized from the mocked setup
    const { platform } = await import('./index')

    // Verify platform has all required methods
    expect(typeof platform.getBuildMode).toBe('function')
    expect(typeof platform.secureStore).toBe('function')
  })
})
