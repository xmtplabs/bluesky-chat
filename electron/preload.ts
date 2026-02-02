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

  // Dev tools panel toggle (from menu)
  onToggleDevToolsPanel: (callback: () => void) => {
    ipcRenderer.on('toggle-dev-tools-panel', () => callback())
  },

  removeToggleDevToolsPanel: () => {
    ipcRenderer.removeAllListeners('toggle-dev-tools-panel')
  }
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
