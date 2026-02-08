import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react'
import {
  NewConversationProvider,
  type NewConversationContextValue,
  type ConversationMode,
  type ListMode,
  type XmtpUserStatus
} from './context/NewConversationContext'
import { useIdentity } from '../../../hooks/useIdentity'
import { config } from '../../../provider'
import { useXMTP } from '../../../hooks/useXMTP'
import { useChatStore } from '../../../stores/chatStore'
import { useAuthStore } from '../../../stores/authStore'
import { identityService } from '../../../services/identity'
import { useXmtpStatusChecker } from '../../../hooks/useXmtpStatusChecker'
import { resolveUsersToInboxIds } from '../../../utils/resolveUsers'
import { getErrorMessage } from '../../../utils/errors'
import type { UserProfile } from '../../../types'

interface NewConversationProviderBridgeProps {
  children: ReactNode
  onClose: () => void
}

/**
 * Bridges useIdentity and useXMTP hooks to the NewConversation context.
 * Manages conversation mode, user selection, and XMTP status checking.
 */
export function NewConversationProviderBridge({ children, onClose }: NewConversationProviderBridgeProps) {
  const [mode, setModeState] = useState<ConversationMode>('dm')
  const [listMode, setListMode] = useState<ListMode>('following')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedUsers, setSelectedUsers] = useState<UserProfile[]>([])
  const [groupName, setGroupName] = useState('')
  const { xmtpStatus, checkXmtpStatus } = useXmtpStatusChecker()
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
  } = useIdentity()

  const { createDm, createGroup } = useXMTP()
  const { conversations, selectConversation } = useChatStore()
  const { profile: currentUser } = useAuthStore()

  // Load following and followers on mount (only if provider supports it)
  useEffect(() => {
    if (config.supportsFollowing) loadFollowing()
    if (config.supportsFollowers) loadFollowers()
  }, [])

  // Check XMTP status for displayed users
  // Identity service handles caching and dedup, so calling for every user on each run is safe
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

  const selectUser = useCallback((user: UserProfile) => {
    const status = xmtpStatus.get(user.id)
    const isAlreadySelected = selectedUsers.some((u) => u.id === user.id)
    const canMessage = status === 'verified'

    if (!isAlreadySelected && !canMessage) return

    if (mode === 'dm') {
      // Check if we already have a DM with this user
      // Match by DID if profile is populated, or by inbox ID as fallback
      // (handles case where conversation exists but peerProfile wasn't resolved)
      const userInboxId = identityService.getInboxIdFromId(user.id)
      const existingConv = conversations.find((c) => {
        if (c.isGroup) return false
        if (c.peerProfile?.id === user.id) return true
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
          return prev.filter((u) => u.id !== user.id)
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
    setSelectedUsers((prev) => prev.filter((u) => u.id !== did))
  }, [])

  const startConversation = useCallback(async () => {
    if (selectedUsers.length === 0) return

    setError(null)
    setIsCreating(true)

    try {
      if (mode === 'dm') {
        const selectedUser = selectedUsers[0]
        const inboxId = await identityService.resolveIdToInboxCached(selectedUser.id)

        if (!inboxId) {
          setError('This user hasn\'t set up chat yet')
          setIsCreating(false)
          return
        }

        await createDm(inboxId, selectedUser)
      } else {
        const { inboxIds, unresolvedNames } = await resolveUsersToInboxIds(selectedUsers)

        if (unresolvedNames.length > 0) {
          setError(`Not on chat yet: ${unresolvedNames.join(', ')}`)
          setIsCreating(false)
          return
        }

        await createGroup(inboxIds, groupName.trim() || undefined)
      }
      onClose()
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to start conversation'))
    } finally {
      setIsCreating(false)
    }
  }, [mode, selectedUsers, groupName, createDm, createGroup, onClose])

  // Computed values
  const currentList = listMode === 'following' ? following : followers

  const sortedList = useMemo(() => {
    const statusPriority = (status: XmtpUserStatus | undefined): number => {
      if (status === 'verified') return 0
      if (status === 'checking' || status === undefined) return 1
      return 2
    }
    return [...currentList].sort((a, b) => {
      return statusPriority(xmtpStatus.get(a.id)) - statusPriority(xmtpStatus.get(b.id))
    })
  }, [currentList, xmtpStatus])

  // Filter out the current user from the list (can't message yourself)
  const baseList = searchQuery.trim() ? searchResults : sortedList
  const displayList = currentUser ? baseList.filter((u) => u.id !== currentUser.id) : baseList
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
