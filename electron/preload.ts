import { contextBridge, ipcRenderer } from 'electron'
import type { ElectronAPI } from '../src/types'

const electronAPI: ElectronAPI = {
  // Build mode
  getBuildMode: () => ipcRenderer.invoke('get-build-mode'),
  // Secure storage
  secureStore: (key: string, value: string) => ipcRenderer.invoke('secure-store', key, value),
  secureRetrieve: (key: string) => ipcRenderer.invoke('secure-retrieve', key),
  secureDelete: (key: string) => ipcRenderer.invoke('secure-delete', key),

  // OAuth
  openOAuthWindow: (url: string) => ipcRenderer.invoke('open-oauth-window', url),

  // Notifications
  showNotification: (title: string, body: string, options?: { silent?: boolean }) => {
    ipcRenderer.send('show-notification', title, body, options)
  },

  // App
  setBadgeCount: (count: number) => {
    ipcRenderer.send('set-badge-count', count)
  },

  // OAuth callback listener
  onOAuthCallback: (callback: (data: { code: string; state: string; iss?: string }) => void) => {
    ipcRenderer.on('oauth-callback', (_, data) => callback(data))
  },

  removeOAuthCallback: () => {
    ipcRenderer.removeAllListeners('oauth-callback')
  },

  // Auto-updater
  updaterCheck: () => ipcRenderer.invoke('updater:check'),
  updaterDownload: () => ipcRenderer.invoke('updater:download'),
  updaterInstall: () => ipcRenderer.invoke('updater:install'),
  onUpdateChecking: (callback: () => void) => {
    ipcRenderer.on('update-checking', () => callback())
  },
  onUpdateAvailable: (callback: (info: { version: string; releaseDate?: string; releaseNotes?: string }) => void) => {
    ipcRenderer.on('update-available', (_, info) => callback(info))
  },
  onUpdateNotAvailable: (callback: () => void) => {
    ipcRenderer.on('update-not-available', () => callback())
  },
  onUpdateDownloadProgress: (callback: (progress: { percent: number; bytesPerSecond: number; transferred: number; total: number }) => void) => {
    ipcRenderer.on('update-download-progress', (_, progress) => callback(progress))
  },
  onUpdateDownloaded: (callback: (info: { version: string; releaseDate?: string; releaseNotes?: string }) => void) => {
    ipcRenderer.on('update-downloaded', (_, info) => callback(info))
  },
  onUpdateError: (callback: (message: string) => void) => {
    ipcRenderer.on('update-error', (_, msg) => callback(msg))
  },
  removeUpdateListeners: () => {
    ipcRenderer.removeAllListeners('update-checking')
    ipcRenderer.removeAllListeners('update-available')
    ipcRenderer.removeAllListeners('update-not-available')
    ipcRenderer.removeAllListeners('update-download-progress')
    ipcRenderer.removeAllListeners('update-downloaded')
    ipcRenderer.removeAllListeners('update-error')
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
