import { useEffect } from 'react'
import { useBluesky } from '../../hooks/useBluesky'
import type { BlueskyProfile } from '../../types'
import { Avatar } from '../shared/Avatar'

interface FollowerListProps {
  type: 'followers' | 'following'
  onSelectUser?: (user: BlueskyProfile) => void
}

export function FollowerList({ type, onSelectUser }: FollowerListProps) {
  const {
    followers,
    following,
    loadFollowers,
    loadMoreFollowers,
    loadFollowing,
    loadMoreFollowing,
    hasMoreFollowers,
    hasMoreFollowing,
    isLoading
  } = useBluesky()

  useEffect(() => {
    if (type === 'followers') {
      loadFollowers()
    } else {
      loadFollowing()
    }
  }, [type])

  const users = type === 'followers' ? followers : following
  const loadMore = type === 'followers' ? loadMoreFollowers : loadMoreFollowing
  const hasMore = type === 'followers' ? hasMoreFollowers : hasMoreFollowing

  if (isLoading && users.length === 0) {
    return (
      <div className="animate-pulse space-y-3 p-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gray-200" />
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 rounded w-1/2" />
              <div className="h-3 bg-gray-200 rounded w-1/3" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (users.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        <p>No {type} yet</p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-gray-200">
      {users.map((user) => (
        <button
          key={user.did}
          onClick={() => onSelectUser?.(user)}
          className="w-full p-3 flex items-center space-x-3 hover:bg-gray-50 transition-colors text-left"
        >
          <Avatar
            src={user.avatar}
            fallback={user.displayName || user.handle}
            size="lg"
          />
          <div className="flex-1 min-w-0">
            <p className="font-medium text-black truncate">
              {user.displayName || user.handle}
            </p>
            <p className="text-sm text-gray-500 truncate">@{user.handle}</p>
            {user.description && (
              <p className="text-xs text-gray-400 truncate mt-1">{user.description}</p>
            )}
          </div>
        </button>
      ))}

      {hasMore && (
        <div className="p-4">
          <button
            onClick={loadMore}
            disabled={isLoading}
            className="w-full py-2 px-4 bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 text-black text-sm font-medium rounded-full transition-colors"
          >
            {isLoading ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}
    </div>
  )
}
