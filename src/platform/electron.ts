/**
 * Electron platform implementation.
 * Wraps window.electronAPI calls to conform to the PlatformAPI interface.
 */

import type { PlatformAPI, OAuthResult, NotificationOptions, BuildMode } from './types'

/**
 * Electron implementation of the PlatformAPI.
 * Forwards all calls to the preload-exposed electronAPI.
 */
export const electronPlatform: PlatformAPI = {
  getBuildMode(): Promise<BuildMode> {
    return window.electronAPI.getBuildMode()
  },

  secureStore(key: string, value: string): Promise<void> {
    return window.electronAPI.secureStore(key, value)
  },

  secureRetrieve(key: string): Promise<string | null> {
    return window.electronAPI.secureRetrieve(key)
  },

  secureDelete(key: string): Promise<void> {
    return window.electronAPI.secureDelete(key)
  },

  openOAuthWindow(url: string): Promise<OAuthResult | null> {
    return window.electronAPI.openOAuthWindow(url)
  },

  onOAuthCallback(callback: (data: OAuthResult) => void): void {
    window.electronAPI.onOAuthCallback(callback)
  },

  removeOAuthCallback(): void {
    window.electronAPI.removeOAuthCallback()
  },

  showNotification(title: string, body: string, options?: NotificationOptions): void {
    window.electronAPI.showNotification(title, body, options)
  },

  setBadgeCount(count: number): void {
    window.electronAPI.setBadgeCount(count)
  }
}
