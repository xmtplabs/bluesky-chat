import { create } from 'zustand'

type SidebarView = 'conversations' | 'inbox-settings'

interface UIState {
  // Profile viewing
  viewingProfileDid: string | null
  openUserProfile: (did: string) => void
  closeUserProfile: () => void

  // Group admin modal
  groupAdminModalGroupId: string | null
  openGroupAdmin: (groupId: string) => void
  closeGroupAdmin: () => void

  // Sidebar view state
  sidebarView: SidebarView
  setSidebarView: (view: SidebarView) => void
  toggleInboxSettings: () => void

  // Reset all UI state (called on logout)
  reset: () => void
}

export const useUIStore = create<UIState>((set, get) => ({
  viewingProfileDid: null,
  groupAdminModalGroupId: null,
  sidebarView: 'conversations',

  openUserProfile: (did: string) => {
    set({ viewingProfileDid: did })
  },

  closeUserProfile: () => {
    set({ viewingProfileDid: null })
  },

  openGroupAdmin: (groupId: string) => {
    set({ groupAdminModalGroupId: groupId })
  },

  closeGroupAdmin: () => {
    set({ groupAdminModalGroupId: null })
  },

  setSidebarView: (view: SidebarView) => {
    set({ sidebarView: view })
  },

  toggleInboxSettings: () => {
    const current = get().sidebarView
    set({ sidebarView: current === 'inbox-settings' ? 'conversations' : 'inbox-settings' })
  },

  reset: () => {
    set({
      viewingProfileDid: null,
      groupAdminModalGroupId: null,
      sidebarView: 'conversations'
    })
  }
}))
