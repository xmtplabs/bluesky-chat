import { useCallback } from 'react'
import { useAuthStore } from '../stores/authStore'
import { useProfileStore } from '../stores/profileStore'
import { blueskyService } from '../services/bluesky'
import type { BlueskyProfile } from '../types'

export function useBluesky() {
  const {
    blueskyProfile,
    isBlueskyLoggedIn,
    loginWithBluesky,
    loginWithBlueskyPassword,
    logout,
    isLoading: isAuthLoading,
    error: authError
  } = useAuthStore()

  const {
    followers,
    following,
    searchResults,
    xmtpEnabledAddresses,
    isLoading: isProfileLoading,
    isSearching,
    loadFollowers,
    loadMoreFollowers,
    loadFollowing,
    loadMoreFollowing,
    searchUsers,
    checkXMTPEnabled,
    clearSearch,
    followersCursor,
    followingCursor
  } = useProfileStore()

  const getProfile = useCallback(
    async (handleOrDid: string): Promise<BlueskyProfile | null> => {
      return blueskyService.getProfile(handleOrDid)
    },
    []
  )

  return {
    // Auth state
    profile: blueskyProfile,
    isLoggedIn: isBlueskyLoggedIn,
    isLoading: isAuthLoading || isProfileLoading,
    isSearching,
    authError,

    // Auth actions
    login: loginWithBluesky,
    loginWithPassword: loginWithBlueskyPassword,
    logout,

    // Profile actions
    getProfile,

    // Social graph
    followers,
    following,
    loadFollowers,
    loadMoreFollowers,
    loadFollowing,
    loadMoreFollowing,
    hasMoreFollowers: !!followersCursor,
    hasMoreFollowing: !!followingCursor,

    // Search
    searchResults,
    searchUsers,
    clearSearch,

    // XMTP integration
    xmtpEnabledAddresses,
    checkXMTPEnabled
  }
}
