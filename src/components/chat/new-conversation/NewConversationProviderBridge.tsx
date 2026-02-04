import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react'
import {
  NewConversationProvider,
  type NewConversationContextValue,
  type ConversationMode,
  type ListMode,
  type XmtpUserStatus
} from './context/NewConversationContext'
import { useBluesky } from '../../../hooks/useBluesky'
import { useXMTP } from '../../../hooks/useXMTP'
import { useChatStore } from '../../../stores/chatStore'
import { useAuthStore } from '../../../stores/authStore'
import { identityService } from '../../../services/identity'
import type { BlueskyProfile } from '../../../types'

interface NewConversationProviderBridgeProps {
  children: ReactNode
  onClose: () => void
}

/**
 * Bridges useBluesky and useXMTP hooks to the NewConversation context.
 * Manages conversation mode, user selection, and XMTP status checking.
 */
export function NewConversationProviderBridge({ children, onClose }: NewConversationProviderBridgeProps) {
  const [mode, setModeState] = useState<ConversationMode>('dm')
  const [listMode, setListMode] = useState<ListMode>('following')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedUsers, setSelectedUsers] = useState<BlueskyProfile[]>([])
  const [groupName, setGroupName] = useState('')
  const [xmtpStatus, setXmtpStatus] = useState<Map<string, XmtpUserStatus>>(new Map())
  const [isCreating, setIsCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    searchResults,
    followers,
    following,
    searchUsers,
    loadFollowers,
    loadFollowing,
    isSearching,
    clearSearch
  } = useBluesky()

  const { createDm, createGroup } = useXMTP()
  const { conversations, selectConversation } = useChatStore()
  const { blueskyProfile: currentUser } = useAuthStore()

  // Check XMTP status for a user (identity service handles caching and deduping)
  const checkXmtpStatus = useCallback(async (user: BlueskyProfile) => {
    // Show checking state immediately
    setXmtpStatus(prev => {
      if (prev.get(user.did) === 'checking' || prev.get(user.did) === 'verified' || prev.get(user.did) === 'not-on-chat') {
        return prev // Don't flash "checking" if we already have a status
      }
      return new Map(prev).set(user.did, 'checking')
    })

    const status = await identityService.checkXmtpStatus(user.did)
    setXmtpStatus(prev => new Map(prev).set(user.did, status))
  }, [])

  // Load following and followers on mount
  useEffect(() => {
    loadFollowing()
    loadFollowers()
  }, [])

  // Check XMTP status for displayed users
  useEffect(() => {
    const currentList = listMode === 'following' ? following : followers
    const displayList = searchQuery.trim() ? searchResults : currentList
    displayList.forEach(user => {
      checkXmtpStatus(user)
    })
  }, [followers, following, searchResults, searchQuery, listMode, checkXmtpStatus])

  // Search users when query changes
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.trim()) {
        searchUsers(searchQuery)
      } else {
        clearSearch()
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [searchQuery])

  const setMode = useCallback((newMode: ConversationMode) => {
    setModeState(newMode)
    setSelectedUsers([])
    setError(null)
    setGroupName('')
  }, [])

  const selectUser = useCallback((user: BlueskyProfile) => {
    const status = xmtpStatus.get(user.did)
    const isAlreadySelected = selectedUsers.some((u) => u.did === user.did)
    const canMessage = status === 'verified'

    if (!isAlreadySelected && !canMessage) return

    if (mode === 'dm') {
      // Check if we already have a DM with this user
      // Match by DID if profile is populated, or by inbox ID as fallback
      // (handles case where conversation exists but peerProfile wasn't resolved)
      const userInboxId = identityService.getInboxIdFromDid(user.did)
      const existingConv = conversations.find((c) => {
        if (c.isGroup) return false
        if (c.peerProfile?.did === user.did) return true
        if (userInboxId && c.peerAddress === userInboxId) return true
        return false
      })
      if (existingConv) {
        // Navigate to existing conversation instead of starting new one
        selectConversation(existingConv.id)
        onClose()
        return
      }

      if (isAlreadySelected) {
        setSelectedUsers([])
      } else {
        setSelectedUsers([user])
      }
    } else {
      setSelectedUsers((prev) => {
        if (isAlreadySelected) {
          return prev.filter((u) => u.did !== user.did)
        }
        if (prev.length >= 250) {
          setError('Maximum 250 members allowed')
          return prev
        }
        return [...prev, user]
      })
    }
    setError(null)
  }, [mode, selectedUsers, xmtpStatus, conversations, selectConversation, onClose])

  const removeUser = useCallback((did: string) => {
    setSelectedUsers((prev) => prev.filter((u) => u.did !== did))
  }, [])

  const startConversation = useCallback(async () => {
    if (selectedUsers.length === 0) return

    setError(null)
    setIsCreating(true)

    try {
      if (mode === 'dm') {
        const selectedUser = selectedUsers[0]
        let inboxId = identityService.getInboxIdFromDid(selectedUser.did)
        if (!inboxId) {
          inboxId = await identityService.resolveDidToInbox(selectedUser.did) || undefined
        }

        if (!inboxId) {
          setError('This user hasn\'t set up chat yet')
          setIsCreating(false)
          return
        }

        await createDm(inboxId, selectedUser)
      } else {
        const inboxIds: string[] = []
        const usersWithoutXMTP: string[] = []

        for (const user of selectedUsers) {
          let inboxId = identityService.getInboxIdFromDid(user.did)
          if (!inboxId) {
            inboxId = await identityService.resolveDidToInbox(user.did) || undefined
          }
          if (inboxId) {
            inboxIds.push(inboxId)
          } else {
            usersWithoutXMTP.push(user.displayName || user.handle)
          }
        }

        if (usersWithoutXMTP.length > 0) {
          setError(`Not on chat yet: ${usersWithoutXMTP.join(', ')}`)
          setIsCreating(false)
          return
        }

        await createGroup(inboxIds, groupName.trim() || undefined)
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start conversation')
    } finally {
      setIsCreating(false)
    }
  }, [mode, selectedUsers, groupName, createDm, createGroup, onClose])

  // Computed values
  const currentList = listMode === 'following' ? following : followers

  const sortedList = useMemo(() => {
    const statusPriority = (status: XmtpUserStatus | undefined): number => {
      if (status === 'verified') return 0
      if (status === 'checking') return 1
      return 2
    }
    return [...currentList].sort((a, b) => {
      return statusPriority(xmtpStatus.get(a.did)) - statusPriority(xmtpStatus.get(b.did))
    })
  }, [currentList, xmtpStatus])

  // Filter out the current user from the list (can't message yourself)
  const baseList = searchQuery.trim() ? searchResults : sortedList
  const displayList = currentUser ? baseList.filter((u) => u.did !== currentUser.did) : baseList
  const canCreate = selectedUsers.length >= 1

  const contextValue: NewConversationContextValue = useMemo(() => ({
    state: {
      mode,
      listMode,
      searchQuery,
      selectedUsers,
      groupName,
      xmtpStatus,
      isCreating,
      error
    },
    actions: {
      setMode,
      setListMode,
      setSearchQuery,
      selectUser,
      removeUser,
      setGroupName,
      startConversation,
      close: onClose
    },
    meta: {
      followers,
      following,
      searchResults,
      isSearching,
      displayList,
      canCreate
    }
  }), [
    mode,
    listMode,
    searchQuery,
    selectedUsers,
    groupName,
    xmtpStatus,
    isCreating,
    error,
    setMode,
    setListMode,
    selectUser,
    removeUser,
    startConversation,
    onClose,
    followers,
    following,
    searchResults,
    isSearching,
    displayList,
    canCreate
  ])

  return (
    <NewConversationProvider value={contextValue}>
      {children}
    </NewConversationProvider>
  )
}
