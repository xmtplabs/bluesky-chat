import { create } from 'zustand'
import type { UserProfile } from '../types'
import { provider } from '../provider'
import { useAuthStore } from './authStore'
import { identityService } from '../services/identity'
import { xmtpService } from '../services/xmtp'

interface ProfileState {
  followers: UserProfile[]
  following: UserProfile[]
  followingDids: Set<string>
  searchResults: UserProfile[]
  xmtpEnabledAddresses: Map<string, boolean>
  isLoading: boolean
  isSearching: boolean
  isLoadingFollowingDids: boolean
  error: string | null
  followersCursor?: string
  followingCursor?: string

  // Actions
  loadFollowers: () => Promise<void>
  loadMoreFollowers: () => Promise<void>
  loadFollowing: () => Promise<void>
  loadMoreFollowing: () => Promise<void>
  loadAllFollowingDids: () => Promise<void>
  searchUsers: (query: string) => Promise<void>
  checkXMTPEnabled: (addresses: string[]) => Promise<void>
  clearSearch: () => void
  clearError: () => void
  reset: () => void
}

export const useProfileStore = create<ProfileState>((set, get) => ({
  followers: [],
  following: [],
  followingDids: new Set(),
  searchResults: [],
  xmtpEnabledAddresses: new Map(),
  isLoading: false,
  isSearching: false,
  isLoadingFollowingDids: false,
  error: null,
  followersCursor: undefined,
  followingCursor: undefined,

  loadFollowers: async () => {
    set({ isLoading: true, error: null, followers: [] })

    try {
      const currentDid = useAuthStore.getState().profile?.id
      if (!currentDid || !provider.getFollowers) return
      const { profiles: followers, cursor } = await provider.getFollowers(currentDid)

      // Cache profiles
      followers.forEach((f) => identityService.cacheProfile(f))

      set({ followers, followersCursor: cursor })
    } catch (error) {
      console.error('Failed to load followers:', error)
      set({ error: error instanceof Error ? error.message : 'Failed to load followers' })
    } finally {
      set({ isLoading: false })
    }
  },

  loadMoreFollowers: async () => {
    const { followersCursor, followers } = get()
    if (!followersCursor) return

    set({ isLoading: true })

    try {
      const currentDid = useAuthStore.getState().profile?.id
      if (!currentDid || !provider.getFollowers) return
      const { profiles: moreFollowers, cursor } = await provider.getFollowers(
        currentDid,
        followersCursor
      )

      moreFollowers.forEach((f) => identityService.cacheProfile(f))

      set({
        followers: [...followers, ...moreFollowers],
        followersCursor: cursor
      })
    } catch (error) {
      console.error('Failed to load more followers:', error)
    } finally {
      set({ isLoading: false })
    }
  },

  loadFollowing: async () => {
    set({ isLoading: true, error: null, following: [] })

    try {
      const currentDid = useAuthStore.getState().profile?.id
      if (!currentDid || !provider.getFollowing) return
      const { profiles: following, cursor } = await provider.getFollowing(currentDid)

      following.forEach((f) => identityService.cacheProfile(f))

      set({ following, followingCursor: cursor })
    } catch (error) {
      console.error('Failed to load following:', error)
      set({ error: error instanceof Error ? error.message : 'Failed to load following' })
    } finally {
      set({ isLoading: false })
    }
  },

  loadMoreFollowing: async () => {
    const { followingCursor, following } = get()
    if (!followingCursor) return

    set({ isLoading: true })

    try {
      const currentDid = useAuthStore.getState().profile?.id
      if (!currentDid || !provider.getFollowing) return
      const { profiles: moreFollowing, cursor } = await provider.getFollowing(
        currentDid,
        followingCursor
      )

      moreFollowing.forEach((f) => identityService.cacheProfile(f))

      set({
        following: [...following, ...moreFollowing],
        followingCursor: cursor
      })
    } catch (error) {
      console.error('Failed to load more following:', error)
    } finally {
      set({ isLoading: false })
    }
  },

  loadAllFollowingDids: async () => {
    // Only load if we don't have any yet
    if (get().followingDids.size > 0 || get().isLoadingFollowingDids) return

    set({ isLoadingFollowingDids: true })

    try {
      const currentDid = useAuthStore.getState().profile?.id
      if (!currentDid || !provider.getAllFollowingIds) return
      const allDids = await provider.getAllFollowingIds(currentDid)
      set({ followingDids: allDids })
    } catch (error) {
      console.error('Failed to load all following DIDs:', error)
    } finally {
      set({ isLoadingFollowingDids: false })
    }
  },

  searchUsers: async (query: string) => {
    if (!query.trim()) {
      set({ searchResults: [] })
      return
    }

    set({ isSearching: true, error: null })

    try {
      const results = await provider.searchUsers(query)

      results.forEach((r) => identityService.cacheProfile(r))

      set({ searchResults: results })
    } catch (error) {
      console.error('Failed to search users:', error)
      set({ error: error instanceof Error ? error.message : 'Failed to search users' })
    } finally {
      set({ isSearching: false })
    }
  },

  checkXMTPEnabled: async (addresses: string[]) => {
    try {
      const results = await xmtpService.canMessage(addresses)
      const current = new Map(get().xmtpEnabledAddresses)

      results.forEach((enabled, address) => {
        current.set(address, enabled)
      })

      set({ xmtpEnabledAddresses: current })
    } catch (error) {
      console.error('Failed to check XMTP enabled:', error)
    }
  },

  clearSearch: () => set({ searchResults: [] }),

  clearError: () => set({ error: null }),

  reset: () => {
    set({
      followers: [],
      following: [],
      followingDids: new Set(),
      searchResults: [],
      xmtpEnabledAddresses: new Map(),
      isLoading: false,
      isSearching: false,
      isLoadingFollowingDids: false,
      error: null,
      followersCursor: undefined,
      followingCursor: undefined
    })
  }
}))
