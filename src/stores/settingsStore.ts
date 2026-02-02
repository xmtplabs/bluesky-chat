import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { AppSettings, NotificationSettings } from '../types'

interface SettingsState extends AppSettings {
  // Actions
  setNotificationsEnabled: (enabled: boolean) => void
  setNotificationSound: (enabled: boolean) => void
  setShowPreview: (enabled: boolean) => void
  setTheme: (theme: 'light' | 'dark' | 'system') => void
  resetSettings: () => void
}

const defaultSettings: AppSettings = {
  notifications: {
    enabled: true,
    sound: true,
    showPreview: true
  },
  theme: 'dark'
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaultSettings,

      setNotificationsEnabled: (enabled: boolean) =>
        set((state) => ({
          notifications: { ...state.notifications, enabled }
        })),

      setNotificationSound: (enabled: boolean) =>
        set((state) => ({
          notifications: { ...state.notifications, sound: enabled }
        })),

      setShowPreview: (enabled: boolean) =>
        set((state) => ({
          notifications: { ...state.notifications, showPreview: enabled }
        })),

      setTheme: (theme: 'light' | 'dark' | 'system') => set({ theme }),

      resetSettings: () => set(defaultSettings)
    }),
    {
      name: 'bluesky-chat-settings',
      storage: createJSONStorage(() => localStorage)
    }
  )
)
