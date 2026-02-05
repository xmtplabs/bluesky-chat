import { create } from 'zustand'
import type { UpdateInfo, UpdateProgress } from '../types'

type UpdaterStatus = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'error'

interface UpdaterState {
  status: UpdaterStatus
  updateInfo: UpdateInfo | null
  downloadProgress: UpdateProgress | null
  error: string | null
  dismissed: boolean

  // Actions
  setStatus: (status: UpdaterStatus) => void
  setUpdateInfo: (info: UpdateInfo | null) => void
  setDownloadProgress: (progress: UpdateProgress | null) => void
  setError: (error: string | null) => void
  dismiss: () => void
  reset: () => void
}

export const useUpdaterStore = create<UpdaterState>((set) => ({
  status: 'idle',
  updateInfo: null,
  downloadProgress: null,
  error: null,
  dismissed: false,

  setStatus: (status) => set({ status, error: status === 'error' ? undefined : null }),
  setUpdateInfo: (updateInfo) => set({ updateInfo }),
  setDownloadProgress: (downloadProgress) => set({ downloadProgress }),
  setError: (error) => set({ error, status: error ? 'error' : 'idle' }),
  dismiss: () => set({ dismissed: true }),
  reset: () => set({
    status: 'idle',
    updateInfo: null,
    downloadProgress: null,
    error: null,
    dismissed: false
  })
}))

// Initialize listeners when the module loads
export function initUpdaterListeners(): void {
  const api = window.electronAPI
  if (!api?.onUpdateChecking) return

  api.onUpdateChecking(() => {
    useUpdaterStore.getState().setStatus('checking')
  })

  api.onUpdateAvailable((info) => {
    useUpdaterStore.setState({
      status: 'available',
      updateInfo: info,
      dismissed: false // Reset dismissed when new update is found
    })
  })

  api.onUpdateNotAvailable(() => {
    useUpdaterStore.getState().setStatus('idle')
  })

  api.onUpdateDownloadProgress((progress) => {
    useUpdaterStore.setState({
      status: 'downloading',
      downloadProgress: progress
    })
  })

  api.onUpdateDownloaded((info) => {
    useUpdaterStore.setState({
      status: 'ready',
      updateInfo: info,
      downloadProgress: null
    })
  })

  api.onUpdateError((message) => {
    useUpdaterStore.setState({
      status: 'error',
      error: message
    })
  })
}

// Cleanup listeners
export function cleanupUpdaterListeners(): void {
  window.electronAPI?.removeUpdateListeners?.()
}

// Actions that call electron API
export async function checkForUpdates(): Promise<void> {
  const api = window.electronAPI
  if (!api?.updaterCheck) return

  useUpdaterStore.getState().setStatus('checking')

  try {
    // Run check with minimum visible duration
    const [result] = await Promise.all([
      api.updaterCheck(),
      new Promise(resolve => setTimeout(resolve, 800))
    ])

    if (!result.success && result.error) {
      useUpdaterStore.getState().setError(result.error)
    } else if (!result.updateInfo) {
      // No update available (or dev mode) - set back to idle
      useUpdaterStore.getState().setStatus('idle')
    }
    // If updateInfo exists, the 'update-available' event will handle it
  } catch {
    useUpdaterStore.getState().setError('Failed to check for updates')
  }
}

export async function downloadUpdate(): Promise<void> {
  const api = window.electronAPI
  if (!api?.updaterDownload) return

  useUpdaterStore.getState().setStatus('downloading')

  try {
    // Run download with minimum visible duration to prevent flicker on immediate failure
    const [result] = await Promise.all([
      api.updaterDownload(),
      new Promise(resolve => setTimeout(resolve, 500))
    ])

    if (!result.success && result.error) {
      useUpdaterStore.getState().setError(result.error)
    }
  } catch {
    useUpdaterStore.getState().setError('Failed to download update')
  }
}

export function installUpdate(): void {
  window.electronAPI?.updaterInstall?.()
}
