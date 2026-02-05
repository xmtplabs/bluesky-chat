import electronUpdater from 'electron-updater'
import { app, BrowserWindow, ipcMain } from 'electron'
import * as fs from 'fs'
import * as path from 'path'

const { autoUpdater } = electronUpdater
type UpdateInfo = electronUpdater.UpdateInfo
type ProgressInfo = electronUpdater.ProgressInfo

const CHECK_INTERVAL_MS = 60 * 60 * 1000 // 1 hour

let intervalId: NodeJS.Timeout | null = null
let isUserInitiatedCheck = false

// Settings persistence
const settingsPath = path.join(app.getPath('userData'), 'updater-settings.json')

function loadBetaOptIn(): boolean {
  try {
    if (fs.existsSync(settingsPath)) {
      const data = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
      return data.betaOptIn === true
    }
  } catch {
    // Ignore errors, default to false
  }
  return false
}

function saveBetaOptIn(enabled: boolean): void {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify({ betaOptIn: enabled }), 'utf-8')
  } catch {
    // Ignore errors
  }
}

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
      isUserInitiatedCheck = true
      const result = await autoUpdater.checkForUpdates()
      return { success: true, updateInfo: result?.updateInfo }
    } catch (error) {
      // Treat 404 (release not found) as "no update available"
      const message = error instanceof Error ? error.message : 'Unknown error'
      if (message.includes('404')) {
        return { success: true, updateInfo: null }
      }
      return { success: false, error: message }
    } finally {
      isUserInitiatedCheck = false
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

  ipcMain.handle('updater:getBetaOptIn', () => {
    return loadBetaOptIn()
  })

  ipcMain.handle('updater:setBetaOptIn', (_, enabled: boolean) => {
    saveBetaOptIn(enabled)
    autoUpdater.allowPrerelease = enabled
    return { success: true }
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
  // Allow prerelease/beta updates based on user preference
  autoUpdater.allowPrerelease = loadBetaOptIn()

  // Forward events to renderer
  autoUpdater.on('checking-for-update', () => {
    if (!mainWindow?.isDestroyed()) {
      mainWindow.webContents.send('update-checking')
    }
  })

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    if (!mainWindow?.isDestroyed()) {
      mainWindow.webContents.send('update-available', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes
      })
    }
  })

  autoUpdater.on('update-not-available', () => {
    if (!mainWindow?.isDestroyed()) {
      mainWindow.webContents.send('update-not-available')
    }
  })

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    if (!mainWindow?.isDestroyed()) {
      mainWindow.webContents.send('update-download-progress', {
        percent: progress.percent,
        bytesPerSecond: progress.bytesPerSecond,
        transferred: progress.transferred,
        total: progress.total
      })
    }
  })

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    if (!mainWindow?.isDestroyed()) {
      mainWindow.webContents.send('update-downloaded', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes
      })
    }
  })

  autoUpdater.on('error', (error: Error) => {
    // Only send errors for user-initiated actions, not background checks
    // Also ignore 404 errors (release not found = no update available)
    if (!mainWindow?.isDestroyed() && isUserInitiatedCheck && !error.message.includes('404')) {
      mainWindow.webContents.send('update-error', error.message)
    }
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
