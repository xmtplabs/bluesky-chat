import electronUpdater from 'electron-updater'
import { app, BrowserWindow, ipcMain } from 'electron'

const { autoUpdater } = electronUpdater
type UpdateInfo = electronUpdater.UpdateInfo
type ProgressInfo = electronUpdater.ProgressInfo

const CHECK_INTERVAL_MS = 60 * 60 * 1000 // 1 hour

let intervalId: NodeJS.Timeout | null = null

/**
 * Register IPC handlers for the updater.
 * Called in all modes so the renderer doesn't get "no handler" errors.
 * In dev mode, returns mock responses since auto-update doesn't work unpackaged.
 */
export function registerUpdaterHandlers(): void {
  ipcMain.handle('updater:check', async () => {
    if (!app.isPackaged) {
      return { success: true, updateInfo: null, dev: true }
    }
    try {
      const result = await autoUpdater.checkForUpdates()
      return { success: true, updateInfo: result?.updateInfo }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  })

  ipcMain.handle('updater:download', async () => {
    if (!app.isPackaged) {
      return { success: false, error: 'Auto-update not available in development mode' }
    }
    try {
      await autoUpdater.downloadUpdate()
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Download failed' }
    }
  })

  ipcMain.handle('updater:install', () => {
    if (!app.isPackaged) {
      return
    }
    autoUpdater.quitAndInstall()
  })
}

/**
 * Initialize auto-updater with event forwarding and scheduled checks.
 * Only called for packaged builds.
 */
export function initAutoUpdater(mainWindow: BrowserWindow): void {
  // Disable auto-download - let user choose when to download
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true

  // Forward events to renderer
  autoUpdater.on('checking-for-update', () => {
    mainWindow.webContents.send('update-checking')
  })

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    mainWindow.webContents.send('update-available', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes
    })
  })

  autoUpdater.on('update-not-available', () => {
    mainWindow.webContents.send('update-not-available')
  })

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    mainWindow.webContents.send('update-download-progress', {
      percent: progress.percent,
      bytesPerSecond: progress.bytesPerSecond,
      transferred: progress.transferred,
      total: progress.total
    })
  })

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    mainWindow.webContents.send('update-downloaded', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes
    })
  })

  autoUpdater.on('error', (error: Error) => {
    // Only send errors for user-initiated actions, not background checks
    mainWindow.webContents.send('update-error', error.message)
  })

  // Initial check (silent - errors are swallowed)
  autoUpdater.checkForUpdates().catch(() => {
    // Silently ignore errors on background checks
  })

  // Hourly background checks
  intervalId = setInterval(() => {
    autoUpdater.checkForUpdates().catch(() => {
      // Silently ignore errors on background checks
    })
  }, CHECK_INTERVAL_MS)
}

export function stopAutoUpdater(): void {
  if (intervalId) {
    clearInterval(intervalId)
    intervalId = null
  }
}
