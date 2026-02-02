import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock Electron API
const mockElectronAPI = {
  secureStore: vi.fn().mockResolvedValue(undefined),
  secureRetrieve: vi.fn().mockResolvedValue(null),
  secureDelete: vi.fn().mockResolvedValue(undefined),
  openOAuthWindow: vi.fn().mockResolvedValue(null),
  showNotification: vi.fn(),
  setBadgeCount: vi.fn(),
  onOAuthCallback: vi.fn(),
  removeOAuthCallback: vi.fn()
}

// Set up window.electronAPI
Object.defineProperty(window, 'electronAPI', {
  value: mockElectronAPI,
  writable: true
})

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
export { mockElectronAPI, localStorageMock }
