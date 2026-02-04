/**
 * Platform abstraction types for cross-platform support (Electron, Tauri).
 * This interface defines the contract that both platform implementations must satisfy.
 */

export type BuildMode = 'development' | 'beta' | 'production'

export interface OAuthResult {
  code: string
  state: string
  iss?: string
}

export interface NotificationOptions {
  silent?: boolean
}

/**
 * Platform API interface for native capabilities.
 * Implementations exist for Electron (electron.ts) and Tauri (tauri.ts).
 */
export interface PlatformAPI {
  // Build mode detection
  getBuildMode(): Promise<BuildMode>

  // Secure storage (OS keychain)
  secureStore(key: string, value: string): Promise<void>
  secureRetrieve(key: string): Promise<string | null>
  secureDelete(key: string): Promise<void>

  // OAuth flow
  openOAuthWindow(url: string): Promise<OAuthResult | null>
  onOAuthCallback(callback: (data: OAuthResult) => void): void
  removeOAuthCallback(): void

  // Notifications
  showNotification(title: string, body: string, options?: NotificationOptions): void

  // App badge
  setBadgeCount(count: number): void
}
