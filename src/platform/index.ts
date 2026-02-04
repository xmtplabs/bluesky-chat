/**
 * Platform detection and export.
 * Automatically selects the appropriate platform implementation
 * based on the runtime environment.
 */

import type { PlatformAPI } from './types'
import { electronPlatform } from './electron'
import { tauriPlatform } from './tauri'

// Re-export types for convenience
export type { PlatformAPI, BuildMode, OAuthResult, NotificationOptions } from './types'

/**
 * Detect if running in Tauri environment.
 * Tauri 2.x injects __TAURI_INTERNALS__ into the window object.
 */
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/**
 * The platform API instance for the current runtime.
 * Automatically selects Tauri or Electron based on environment.
 */
export const platform: PlatformAPI = isTauri() ? tauriPlatform : electronPlatform
