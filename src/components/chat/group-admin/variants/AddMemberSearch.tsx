import { useState, useEffect } from 'react'
import { useGroupAdmin } from '../context/GroupAdminContext'
import { useIdentity } from '../../../../hooks/useIdentity'
import { config, formatHandle } from '../../../../provider'
import { Avatar } from '../../../shared/Avatar'

export function AddMemberSearch() {
  const { state, actions, meta } = useGroupAdmin()
  const { editMode, memberSearchQuery, selectedMembersToAdd, xmtpStatus } = state
  const { setMemberSearchQuery, toggleMemberToAdd, removeMemberToAdd, checkXmtpStatus } = actions
  const { members } = meta

  const {
    searchResults,
    followers,
    searchUsers,
    loadFollowers,
    isSearching,
    clearSearch
  } = useIdentity()

  const [hasLoadedFollowers, setHasLoadedFollowers] = useState(false)

  // Load followers on mount (only if provider supports it)
  useEffect(() => {
    if (editMode === 'add-member' && !hasLoadedFollowers && config.supportsFollowers) {
      loadFollowers()
      setHasLoadedFollowers(true)
    }
  }, [editMode, hasLoadedFollowers, loadFollowers])

  // Search users when query changes
  useEffect(() => {
    if (editMode !== 'add-member') return

    const timer = setTimeout(() => {
      if (memberSearchQuery.trim()) {
        searchUsers(memberSearchQuery)
      } else {
        clearSearch()
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [memberSearchQuery, editMode, searchUsers, clearSearch])

  // Check XMTP status for displayed users
  // Identity service handles caching and dedup, so calling for every user on each run is safe
  useEffect(() => {
    if (editMode !== 'add-member') return

    const displayList = memberSearchQuery.trim() ? searchResults : followers
    displayList.forEach(user => {
      checkXmtpStatus(user)
    })
  }, [editMode, followers, searchResults, memberSearchQuery, checkXmtpStatus])

  if (editMode !== 'add-member') {
    return null
  }

  // Filter out existing members using a Set of known member DIDs for O(1) lookup
  const existingMemberDids = new Set(
    members.map((m) => m.profile?.id).filter((did): did is string => !!did)
  )
  const displayList = (memberSearchQuery.trim() ? searchResults : followers).filter(
    (user) => !existingMemberDids.has(user.id)
  )

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Selected members chips */}
      {selectedMembersToAdd.length > 0 && (
        <div className="px-4 py-3 border-b border-[var(--color-border-light)] bg-[var(--color-surface-secondary)]">
          <div className="flex flex-wrap gap-2">
            {selectedMembersToAdd.map((user) => (
              <div
                key={user.id}
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
                  onClick={() => removeMemberToAdd(user.id)}
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

      {/* Search input */}
      <div className="px-4 py-3 border-b border-[var(--color-border-light)]">
        <div className="relative">
          <label htmlFor="member-search" className="sr-only">Search members to add</label>
          <svg
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--color-text-tertiary)]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            id="member-search"
            type="text"
            value={memberSearchQuery}
            onChange={(e) => setMemberSearchQuery(e.target.value)}
            placeholder="Search members to add..."
            autoComplete="off"
            autoFocus
            className="w-full pl-11 pr-4 py-3 bg-[var(--color-surface-secondary)] border border-[var(--color-border-light)] rounded-xl text-[15px] text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-bsky-500)] focus:border-transparent transition-colors"
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
              {memberSearchQuery.trim()
                ? 'No users found'
                : 'Search for users to add to the group'}
            </p>
          </div>
        ) : (
          <div className="p-2">
            {!memberSearchQuery.trim() && (
              <div className="px-3 py-2 text-[12px] font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">
                Your Followers
              </div>
            )}
            <div className="space-y-0.5">
              {displayList.map((user) => {
                const isSelected = selectedMembersToAdd.some((u) => u.id === user.id)
                const status = xmtpStatus.get(user.id)
                const canMessage = status === 'verified'
                const isChecking = status === 'checking' || status === undefined

                return (
                  <button
                    key={user.id}
                    onClick={() => toggleMemberToAdd(user)}
                    disabled={!canMessage}
                    className={`w-full p-3 flex items-center gap-3 rounded-xl transition-all text-left ${
                      !canMessage
                        ? 'opacity-50 cursor-not-allowed'
                        : isSelected
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
                        {formatHandle(user.handle)}
                      </p>
                    </div>
                    {isChecking ? (
                      <div className="w-4 h-4 rounded-full border-2 border-[var(--color-text-tertiary)] border-t-transparent animate-spin" />
                    ) : canMessage ? (
                      <div
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
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
                    ) : status === 'not-on-chat' ? (
                      <span className="text-[11px] text-[var(--color-text-tertiary)]">Not on chat</span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
