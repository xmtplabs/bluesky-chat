import type { ChatConversation } from '../../types'
import { useUIStore } from '../../stores/uiStore'
import { Avatar } from '../shared/Avatar'
import { getGroupMemberNames } from '../../utils/format'

interface ConversationItemProps {
  conversation: ChatConversation
  isSelected: boolean
  onSelect: () => void
}

function shortenAddress(address: string): string {
  if (!address) return 'Unknown'
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function formatTimeAgo(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp

  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  if (hours < 24) return `${hours}h`
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days}d`

  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  })
}

export function ConversationItem({ conversation, isSelected, onSelect }: ConversationItemProps) {
  const { openUserProfile } = useUIStore()

  const handleAvatarClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!conversation.isGroup && conversation.peerProfile?.did) {
      openUserProfile(conversation.peerProfile.did)
    }
  }

  const displayName = conversation.isGroup
    ? conversation.groupName || getGroupMemberNames(conversation.groupMembers)
    : conversation.peerProfile?.displayName ||
      conversation.peerProfile?.handle ||
      shortenAddress(conversation.peerAddress)

  const avatarUrl = conversation.isGroup ? null : conversation.peerProfile?.avatar

  const timeAgo = conversation.lastMessageTime
    ? formatTimeAgo(conversation.lastMessageTime)
    : ''

  const hasUnread = conversation.unreadCount > 0

  return (
    <button
      onClick={onSelect}
      className={`w-full px-3 py-3 flex items-center gap-3 rounded-xl transition-colors text-left ${
        isSelected ? 'bg-[var(--color-surface-selected)]' : 'hover:bg-[var(--color-surface-hover)]'
      }`}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        {!conversation.isGroup && conversation.peerProfile?.did ? (
          <div
            role="button"
            tabIndex={0}
            onClick={handleAvatarClick}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleAvatarClick(e as unknown as React.MouseEvent) } }}
            aria-label="View profile"
            className="focus:outline-none focus:ring-2 focus:ring-[var(--color-bsky-500)] focus:ring-offset-2 rounded-full cursor-pointer"
          >
            <Avatar
              src={avatarUrl}
              fallback={displayName}
              size="lg"
              className="hover:opacity-90 transition-opacity"
            />
          </div>
        ) : (
          <Avatar
            src={avatarUrl}
            fallback={displayName}
            size="lg"
            variant={conversation.isGroup ? 'group' : 'user'}
          />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-[15px] truncate ${hasUnread ? 'font-semibold' : 'font-medium'} text-[var(--color-text-primary)]`}>
            {displayName}
          </span>
          {hasUnread && (
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--color-bsky-500)] flex-shrink-0" />
          )}
        </div>
        {conversation.lastMessage && (
          <p className={`text-[13px] truncate leading-snug mt-0.5 ${
            hasUnread ? 'text-[var(--color-text-secondary)]' : 'text-[var(--color-text-tertiary)]'
          }`}>
            {conversation.lastMessage}
          </p>
        )}
      </div>

      {/* Time */}
      {timeAgo && (
        <span className={`text-[13px] flex-shrink-0 ${
          hasUnread ? 'text-[var(--color-text-secondary)]' : 'text-[var(--color-text-tertiary)]'
        }`}>
          {timeAgo}
        </span>
      )}
    </button>
  )
}
