/**
 * Tauri platform implementation.
 * Implements PlatformAPI using Tauri IPC commands and events.
 */

import type { PlatformAPI, OAuthResult, NotificationOptions, BuildMode } from './types'

// Types for Tauri APIs
type InvokeFn = <T>(cmd: string, args?: Record<string, unknown>) => Promise<T>
type ListenFn = <T>(event: string, handler: (event: { payload: T }) => void) => Promise<UnlistenFn>
type UnlistenFn = () => void

// Cached Tauri functions
let cachedInvoke: InvokeFn | null = null
let cachedListen: ListenFn | null = null

// OAuth callback state
let oauthUnlisten: UnlistenFn | null = null

/**
 * Dynamically import Tauri's invoke function.
 */
async function getTauriInvoke(): Promise<InvokeFn | null> {
  if (cachedInvoke) return cachedInvoke

  try {
    const core = await import('@tauri-apps/api/core' as string)
    cachedInvoke = core.invoke as InvokeFn
    return cachedInvoke
  } catch {
    return null
  }
}

/**
 * Dynamically import Tauri's event listen function.
 */
async function getTauriListen(): Promise<ListenFn | null> {
  if (cachedListen) return cachedListen

  try {
    const event = await import('@tauri-apps/api/event' as string)
    cachedListen = event.listen as ListenFn
    return cachedListen
  } catch {
    return null
  }
}

/**
 * Tauri implementation of the PlatformAPI.
 */
export const tauriPlatform: PlatformAPI = {
  async getBuildMode(): Promise<BuildMode> {
    const invoke = await getTauriInvoke()
    if (!invoke) return 'development'
    return invoke<string>('get_build_mode') as Promise<BuildMode>
  },

  async secureStore(key: string, value: string): Promise<void> {
    const invoke = await getTauriInvoke()
    if (!invoke) throw new Error('Tauri not available')
    return invoke('secure_store', { key, value })
  },

  async secureRetrieve(key: string): Promise<string | null> {
    const invoke = await getTauriInvoke()
    if (!invoke) return null
    return invoke<string | null>('secure_retrieve', { key })
  },

  async secureDelete(key: string): Promise<void> {
    const invoke = await getTauriInvoke()
    if (!invoke) throw new Error('Tauri not available')
    return invoke('secure_delete', { key })
  },

  async openOAuthWindow(url: string): Promise<OAuthResult | null> {
    const invoke = await getTauriInvoke()
    const listen = await getTauriListen()
    if (!invoke || !listen) return null

    console.log('[Tauri OAuth] Setting up callback listener...')

    // Set up the listener BEFORE opening the window
    let unlisten: UnlistenFn | null = null
    const callbackPromise = new Promise<OAuthResult | null>((resolve) => {
      // Set up listener and store the unlisten function
      listen<OAuthResult>('oauth-callback', (event) => {
        console.log('[Tauri OAuth] Received callback event:', event.payload)
        resolve(event.payload)
      }).then((unlistenFn) => {
        unlisten = unlistenFn
        console.log('[Tauri OAuth] Listener registered successfully')
      })

      // Timeout after 5 minutes (user might take a while to log in)
      setTimeout(() => {
        console.log('[Tauri OAuth] Timeout reached')
        resolve(null)
      }, 5 * 60 * 1000)
    })

    // Small delay to ensure listener is registered
    await new Promise((r) => setTimeout(r, 100))

    console.log('[Tauri OAuth] Opening OAuth window...')
    // Open the OAuth URL in popup window
    await invoke('open_oauth_window', { url })
    console.log('[Tauri OAuth] Window opened, waiting for callback...')

    // Wait for the callback
    const result = await callbackPromise

    // Clean up listener
    if (unlisten) {
      unlisten()
    }

    return result
  },

  onOAuthCallback(callback: (data: OAuthResult) => void): void {
    // Remove any existing listener
    if (oauthUnlisten) {
      oauthUnlisten()
      oauthUnlisten = null
    }

    getTauriListen().then((listen) => {
      if (listen) {
        listen<OAuthResult>('oauth-callback', (event) => {
          callback(event.payload)
        }).then((unlisten) => {
          oauthUnlisten = unlisten
        })
      }
    })
  },

  removeOAuthCallback(): void {
    if (oauthUnlisten) {
      oauthUnlisten()
      oauthUnlisten = null
    }
  },

  showNotification(title: string, body: string, options?: NotificationOptions): void {
    getTauriInvoke().then((invoke) => {
      if (invoke) {
        invoke('show_notification', {
          title,
          body,
          silent: options?.silent ?? false,
        }).catch((err) => {
          console.error('Failed to show notification:', err)
          fallbackWebNotification(title, body)
        })
      } else {
        fallbackWebNotification(title, body)
      }
    })
  },

  setBadgeCount(count: number): void {
    getTauriInvoke().then((invoke) => {
      if (invoke) {
        invoke('set_badge_count', { count }).catch((err) => {
          console.error('Failed to set badge count:', err)
        })
      }
    })
  },
}

/**
 * Fallback to web Notification API if Tauri notifications fail.
 */
function fallbackWebNotification(title: string, body: string): void {
  if ('Notification' in window && Notification.permission === 'granted') {
    new Notification(title, { body })
  }
}
