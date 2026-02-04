import '@testing-library/jest-dom'
import { vi } from 'vitest'
import type { PlatformAPI, BuildMode, OAuthResult } from '../platform/types'

// Mock Electron API (for backward compatibility with existing tests)
const mockElectronAPI = {
  secureStore: vi.fn().mockResolvedValue(undefined),
  secureRetrieve: vi.fn().mockResolvedValue(null),
  secureDelete: vi.fn().mockResolvedValue(undefined),
  openOAuthWindow: vi.fn().mockResolvedValue(null),
  showNotification: vi.fn(),
  setBadgeCount: vi.fn(),
  onOAuthCallback: vi.fn(),
  removeOAuthCallback: vi.fn(),
  getBuildMode: vi.fn().mockResolvedValue('development' as BuildMode)
}

// Set up window.electronAPI
Object.defineProperty(window, 'electronAPI', {
  value: mockElectronAPI,
  writable: true
})

// Create mock platform API that mirrors electronAPI
const mockPlatformAPI: PlatformAPI = {
  getBuildMode: vi.fn().mockResolvedValue('development' as BuildMode),
  secureStore: vi.fn().mockResolvedValue(undefined),
  secureRetrieve: vi.fn().mockResolvedValue(null),
  secureDelete: vi.fn().mockResolvedValue(undefined),
  openOAuthWindow: vi.fn().mockResolvedValue(null),
  onOAuthCallback: vi.fn(),
  removeOAuthCallback: vi.fn(),
  showNotification: vi.fn(),
  setBadgeCount: vi.fn()
}

// Mock the platform module
vi.mock('../platform', () => ({
  platform: mockPlatformAPI
}))

// Also mock the absolute path import
vi.mock('../platform/index', () => ({
  platform: mockPlatformAPI
}))

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn()
}
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
})

// Export for use in tests
export { mockElectronAPI, mockPlatformAPI, localStorageMock }
