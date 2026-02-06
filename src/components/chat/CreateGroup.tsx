import { useState, useEffect } from 'react'
import { useBluesky } from '../../hooks/useBluesky'
import { useXMTP } from '../../hooks/useXMTP'
import { resolveUsersToInboxIds } from '../../utils/resolveUsers'
import { getErrorMessage } from '../../utils/errors'
import type { BlueskyProfile } from '../../types'
import { Avatar } from '../shared/Avatar'

interface CreateGroupProps {
  onClose: () => void
}

export function CreateGroup({ onClose }: CreateGroupProps) {
  const [groupName, setGroupName] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedUsers, setSelectedUsers] = useState<BlueskyProfile[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isCreating, setIsCreating] = useState(false)

  const {
    searchResults,
    followers,
    searchUsers,
    loadFollowers,
    isSearching,
    clearSearch
  } = useBluesky()

  const { createGroup, canMessage } = useXMTP()

  useEffect(() => {
    loadFollowers()
  }, [])

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

  const handleToggleUser = (user: BlueskyProfile) => {
    setSelectedUsers((prev) => {
      const exists = prev.some((u) => u.did === user.did)
      if (exists) {
        return prev.filter((u) => u.did !== user.did)
      }
      if (prev.length >= 250) {
        setError('Maximum 250 members allowed')
        return prev
      }
      return [...prev, user]
    })
    setError(null)
  }

  const handleRemoveUser = (did: string) => {
    setSelectedUsers((prev) => prev.filter((u) => u.did !== did))
  }

  const handleCreateGroup = async () => {
    if (selectedUsers.length < 1) {
      setError('Select at least one member')
      return
    }

    setIsCreating(true)
    setError(null)

    try {
      const { inboxIds, unresolvedNames } = await resolveUsersToInboxIds(selectedUsers)

      if (unresolvedNames.length > 0) {
        setError(`Not on chat yet: ${unresolvedNames.join(', ')}`)
        setIsCreating(false)
        return
      }

      if (inboxIds.length === 0) {
        setError('No members available for chat')
        setIsCreating(false)
        return
      }

      await createGroup(inboxIds, groupName.trim() || undefined)
      onClose()
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to create group'))
    } finally {
      setIsCreating(false)
    }
  }

  const displayList = searchQuery.trim() ? searchResults : followers

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-group-title"
        className="bg-[var(--color-surface)] rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col shadow-[var(--shadow-modal)] border border-[var(--color-border)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between">
          <h2 id="create-group-title" className="text-[17px] font-semibold text-[var(--color-text-primary)]">Create Group</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] rounded-xl transition-colors duration-200"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Group name */}
        <div className="p-4 border-b border-[var(--color-border-light)]">
          <input
            type="text"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Group name (optional)"
            className="w-full px-4 py-3 bg-[var(--color-surface-secondary)] border border-[var(--color-border-light)] rounded-xl text-[15px] text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-bsky-500)] focus:border-transparent transition-all duration-200"
          />
        </div>

        {/* Selected members */}
        {selectedUsers.length > 0 && (
          <div className="p-4 border-b border-[var(--color-border-light)] bg-[var(--color-surface-secondary)]">
            <div className="flex flex-wrap gap-2">
              {selectedUsers.map((user) => (
                <div
                  key={user.did}
                  className="flex items-center gap-2 pl-1 pr-2 py-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-full"
                >
                  <Avatar
                    src={user.avatar}
                    fallback={user.displayName || user.handle}
                    size={24}
                  />
                  <span className="text-[13px] font-medium text-[var(--color-text-primary)]">
                    {user.displayName || user.handle}
                  </span>
                  <button
                    onClick={() => handleRemoveUser(user.did)}
                    className="p-0.5 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] rounded-full transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Search */}
        <div className="p-4 border-b border-[var(--color-border-light)]">
          <div className="relative">
            <svg
              className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--color-text-tertiary)]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search members to add..."
              autoComplete="off"
              aria-label="Search members to add"
              className="w-full pl-11 pr-4 py-3 bg-[var(--color-surface-secondary)] border border-[var(--color-border-light)] rounded-xl text-[15px] text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-bsky-500)] focus:border-transparent transition-colors duration-200"
            />
          </div>
        </div>

        {/* User list */}
        <div className="flex-1 overflow-y-auto">
          {isSearching ? (
            <div className="space-y-1 p-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 p-3 rounded-xl animate-pulse">
                  <div className="w-11 h-11 rounded-full bg-[var(--color-surface-tertiary)]" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-[var(--color-surface-tertiary)] rounded-lg w-2/5" />
                    <div className="h-3 bg-[var(--color-surface-tertiary)] rounded-lg w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : displayList.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-[15px] text-[var(--color-text-secondary)]">
                {searchQuery.trim()
                  ? 'No users found'
                  : 'Search for users to add to the group'}
              </p>
            </div>
          ) : (
            <div className="p-2">
              {!searchQuery.trim() && (
                <div className="px-3 py-2 text-[12px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">
                  Your Followers
                </div>
              )}
              <div className="space-y-0.5">
                {displayList.map((user) => {
                  const isSelected = selectedUsers.some((u) => u.did === user.did)

                  return (
                    <button
                      key={user.did}
                      onClick={() => handleToggleUser(user)}
                      className={`w-full p-3 flex items-center gap-3 rounded-xl transition-all duration-200 text-left ${
                        isSelected
                          ? 'bg-[var(--color-surface-selected)]'
                          : 'hover:bg-[var(--color-surface-hover)]'
                      }`}
                    >
                      <Avatar
                        src={user.avatar}
                        fallback={user.displayName || user.handle}
                        size={44}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-[15px] font-medium text-[var(--color-text-primary)] truncate">
                          {user.displayName || user.handle}
                        </p>
                        <p className="text-[13px] text-[var(--color-text-secondary)] truncate">
                          @{user.handle}
                        </p>
                      </div>
                      <div
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
                          isSelected
                            ? 'bg-[var(--color-bsky-500)] border-[var(--color-bsky-500)]'
                            : 'border-[var(--color-border)]'
                        }`}
                      >
                        {isSelected && (
                          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[var(--color-border)] space-y-3 bg-[var(--color-surface-secondary)]">
          {error && (
            <div className="p-3 bg-[var(--color-error-light)] border border-[var(--color-error)]/20 rounded-xl text-[var(--color-error)] text-[13px]">
              {error}
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-[13px] text-[var(--color-text-secondary)]">
              {selectedUsers.length} member{selectedUsers.length !== 1 ? 's' : ''} selected
            </span>
            <button
              onClick={handleCreateGroup}
              disabled={selectedUsers.length < 1 || isCreating}
              className={`py-2.5 px-6 text-[15px] font-semibold rounded-full transition-all duration-200 ${
                selectedUsers.length >= 1 && !isCreating
                  ? 'bg-[var(--color-bsky-500)] hover:bg-[var(--color-bsky-600)] text-white shadow-sm hover:shadow-md'
                  : 'bg-[var(--color-surface-tertiary)] text-[var(--color-text-disabled)] cursor-not-allowed'
              }`}
            >
              {isCreating ? 'Creating...' : 'Create Group'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
