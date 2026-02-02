import { app, BrowserWindow, ipcMain, Notification, shell, nativeImage } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'

const iconPath = join(__dirname, '../../build/icon.png')
import { SecureStorage } from './services/storage'

let mainWindow: BrowserWindow | null = null
let authWindow: BrowserWindow | null = null
const secureStorage = new SecureStorage()

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    icon: iconPath,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 15, y: 15 },
    backgroundColor: '#111827',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createAuthWindow(url: string): Promise<{ code: string; state: string; iss?: string } | null> {
  return new Promise((resolve) => {
    let resolved = false
    let pollInterval: NodeJS.Timeout | null = null

    authWindow = new BrowserWindow({
      width: 600,
      height: 700,
      parent: mainWindow!,
      modal: true,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    })

    const cleanup = () => {
      if (pollInterval) {
        clearInterval(pollInterval)
        pollInterval = null
      }
    }

    authWindow.once('ready-to-show', () => {
      authWindow?.show()
    })

    // Parse OAuth params from either query string or hash fragment
    const getOAuthParams = (parsedUrl: URL): { code: string; state: string; iss?: string } | null => {
      // Check query string first
      let code = parsedUrl.searchParams.get('code')
      let state = parsedUrl.searchParams.get('state')
      let iss = parsedUrl.searchParams.get('iss')

      // If not in query string, check hash fragment (Bluesky uses fragment mode)
      if (!code || !state) {
        const hash = parsedUrl.hash.startsWith('#') ? parsedUrl.hash.slice(1) : parsedUrl.hash
        if (hash) {
          const hashParams = new URLSearchParams(hash)
          code = hashParams.get('code')
          state = hashParams.get('state')
          iss = hashParams.get('iss')
        }
      }

      if (code && state) {
        return { code, state, iss: iss || undefined }
      }
      return null
    }

    // Check if URL is an OAuth callback with code and state
    const isOAuthCallback = (parsedUrl: URL): boolean => {
      const isLoopback =
        parsedUrl.hostname === '127.0.0.1' ||
        parsedUrl.hostname === 'localhost' ||
        parsedUrl.hostname === '[::1]' ||
        parsedUrl.protocol === 'bluesky-chat:'

      return isLoopback && getOAuthParams(parsedUrl) !== null
    }

    // Handle OAuth redirect
    const handleOAuthCallback = (parsedUrl: URL) => {
      if (resolved) return // Prevent double-resolution

      const params = getOAuthParams(parsedUrl)
      if (params) {
        resolved = true
        cleanup()
        resolve(params)
        if (authWindow && !authWindow.isDestroyed()) {
          authWindow.close()
        }
        authWindow = null
      }
    }

    // Check current URL for OAuth params
    const checkCurrentUrl = () => {
      if (resolved || !authWindow || authWindow.isDestroyed()) return

      try {
        const currentUrl = authWindow.webContents.getURL()
        if (currentUrl) {
          const parsedUrl = new URL(currentUrl)
          if (isOAuthCallback(parsedUrl)) {
            handleOAuthCallback(parsedUrl)
          }
        }
      } catch (e) {
        // Ignore parse errors
      }
    }

    // Poll URL every 100ms as a reliable fallback
    pollInterval = setInterval(checkCurrentUrl, 100)

    // Also use event-based detection for faster response
    authWindow.webContents.on('will-redirect', (event, redirectUrl) => {
      try {
        const parsedUrl = new URL(redirectUrl)
        if (isOAuthCallback(parsedUrl)) {
          event.preventDefault()
          handleOAuthCallback(parsedUrl)
        }
      } catch (e) {
        console.error('Failed to parse redirect URL:', e)
      }
    })

    authWindow.webContents.on('will-navigate', (event, navUrl) => {
      try {
        const parsedUrl = new URL(navUrl)
        if (isOAuthCallback(parsedUrl)) {
          event.preventDefault()
          handleOAuthCallback(parsedUrl)
        }
      } catch (e) {
        console.error('Failed to parse navigate URL:', e)
      }
    })

    authWindow.webContents.on('did-navigate', () => {
      checkCurrentUrl()
    })

    authWindow.webContents.on('did-finish-load', () => {
      checkCurrentUrl()
    })

    // Handle window close without auth
    authWindow.on('closed', () => {
      cleanup()
      authWindow = null
      if (!resolved) {
        resolve(null)
      }
    })

    authWindow.loadURL(url)
  })
}

// App lifecycle
app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.bluesky.chat')

  // Set dock icon on macOS
  if (process.platform === 'darwin') {
    const icon = nativeImage.createFromPath(iconPath)
    app.dock.setIcon(icon)
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  setupIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Register custom protocol for OAuth callback
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('bluesky-chat', process.execPath, [process.argv[1]])
  }
} else {
  app.setAsDefaultProtocolClient('bluesky-chat')
}

// IPC Handlers
function setupIpcHandlers(): void {
  // Secure storage - only allow XMTP wallet keys
  const ALLOWED_STORAGE_KEY_PREFIX = 'xmtp-wallet-key-'

  ipcMain.handle('secure-store', async (_, key: string, value: string) => {
    if (typeof key !== 'string' || !key.startsWith(ALLOWED_STORAGE_KEY_PREFIX)) {
      throw new Error('Invalid storage key')
    }
    if (typeof value !== 'string' || value.length > 200) {
      throw new Error('Invalid storage value')
    }
    return secureStorage.store(key, value)
  })

  ipcMain.handle('secure-retrieve', async (_, key: string) => {
    if (typeof key !== 'string' || !key.startsWith(ALLOWED_STORAGE_KEY_PREFIX)) {
      throw new Error('Invalid storage key')
    }
    return secureStorage.retrieve(key)
  })

  ipcMain.handle('secure-delete', async (_, key: string) => {
    if (typeof key !== 'string' || !key.startsWith(ALLOWED_STORAGE_KEY_PREFIX)) {
      throw new Error('Invalid storage key')
    }
    return secureStorage.delete(key)
  })

  // OAuth
  ipcMain.handle('open-oauth-window', async (_, url: string) => {
    // Validate OAuth URL is from allowed Bluesky domains
    try {
      const parsed = new URL(url)
      const isAllowed = parsed.hostname === 'bsky.social' ||
                        parsed.hostname.endsWith('.bsky.social') ||
                        parsed.hostname === 'bsky.app' ||
                        parsed.hostname.endsWith('.bsky.app')
      if (!isAllowed) {
        throw new Error(`OAuth URL not from allowed domain: ${parsed.hostname}`)
      }
    } catch (e) {
      if (e instanceof Error && e.message.includes('OAuth URL not from allowed')) {
        throw e
      }
      throw new Error('Invalid OAuth URL')
    }
    return createAuthWindow(url)
  })

  // Notifications
  ipcMain.on('show-notification', (_, title: string, body: string, options?: { silent?: boolean }) => {
    if (Notification.isSupported()) {
      const notification = new Notification({
        title,
        body,
        silent: options?.silent ?? false
      })
      notification.show()

      notification.on('click', () => {
        mainWindow?.focus()
      })
    }
  })

  // Badge count
  ipcMain.on('set-badge-count', (_, count: number) => {
    if (process.platform === 'darwin') {
      app.dock.setBadge(count > 0 ? String(count) : '')
    }
  })
}
