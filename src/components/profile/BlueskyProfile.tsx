import { useBluesky } from '../../hooks/useBluesky'
import { useAuthStore } from '../../stores/authStore'
import { Avatar } from '../shared/Avatar'

export function BlueskyProfile() {
  const { profile } = useBluesky()
  const { xmtpAddress, xmtpInboxId } = useAuthStore()

  if (!profile) return null

  return (
    <div className="p-6 bg-white rounded-xl border border-gray-200 space-y-6">
      {/* Profile header */}
      <div className="flex items-center space-x-4">
        <Avatar
          src={profile.avatar}
          fallback={profile.displayName || profile.handle}
          size="xl"
        />
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            {profile.displayName || profile.handle}
          </h2>
          <p className="text-gray-500">@{profile.handle}</p>
        </div>
      </div>

      {/* Bio */}
      {profile.description && (
        <p className="text-gray-600 whitespace-pre-wrap">{profile.description}</p>
      )}

      {/* Stats */}
      <div className="flex space-x-6">
        {profile.followersCount !== undefined && (
          <div>
            <span className="font-bold text-gray-900">{formatNumber(profile.followersCount)}</span>
            <span className="text-gray-500 ml-1">followers</span>
          </div>
        )}
        {profile.followsCount !== undefined && (
          <div>
            <span className="font-bold text-gray-900">{formatNumber(profile.followsCount)}</span>
            <span className="text-gray-500 ml-1">following</span>
          </div>
        )}
      </div>

      {/* XMTP Info */}
      <div className="pt-4 border-t border-gray-200 space-y-2">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
          XMTP Connection
        </h3>
        <div className="space-y-1 font-mono text-sm">
          <div className="flex items-center space-x-2">
            <span className="text-gray-400">Address:</span>
            <span className="text-gray-600 truncate">{xmtpAddress}</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-gray-400">Inbox ID:</span>
            <span className="text-gray-600 truncate">{xmtpInboxId}</span>
          </div>
        </div>
      </div>

      {/* DID */}
      <div className="pt-4 border-t border-gray-200 space-y-2">
        <h3 className="text-sm font-medium text-gray-500 uppercase tracking-wider">
          Bluesky Identity
        </h3>
        <div className="font-mono text-sm text-gray-600 break-all">
          {profile.did}
        </div>
      </div>
    </div>
  )
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`
  }
  return String(num)
}
