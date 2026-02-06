import { useChat } from './context/ChatContext'
import { useUIStore } from '../../stores/uiStore'
import { UserLockup } from '../shared/UserLockup'
import { Avatar } from '../shared/Avatar'
import { getGroupMemberNames } from '../../utils/format'

/**
 * Chat header component - shows conversation name, avatar, and metadata
 */
export function ChatHeader() {
  const { state, meta } = useChat()
  const { conversation } = state
  const { variant } = meta
  const { openUserProfile, openGroupAdmin } = useUIStore()

  if (!conversation) return null

  const handleProfileClick = () => {
    if (conversation.peerProfile?.did) {
      openUserProfile(conversation.peerProfile.did)
    }
  }

  const handleGroupClick = () => {
    if (conversation.isGroup && conversation.id) {
      openGroupAdmin(conversation.id)
    }
  }

  // For DMs with a profile, use the UserLockup component
  if (variant === 'dm' && conversation.peerProfile) {
    return (
      <div className="h-16 px-6 flex items-center border-b border-[var(--color-border)] bg-[var(--color-surface)] drag-region">
        <div className="no-drag">
          <UserLockup
            profile={conversation.peerProfile}
            onClick={handleProfileClick}
          />
        </div>
      </div>
    )
  }

  // For groups or DMs without profile, render manually
  const displayName = conversation.isGroup
    ? conversation.groupName || getGroupMemberNames(conversation.groupMembers)
    : conversation.peerProfile?.displayName ||
      conversation.peerProfile?.handle ||
      'Unknown'

  return (
    <div className="h-16 px-6 flex items-center border-b border-[var(--color-border)] bg-[var(--color-surface)] drag-region">
      <button
        onClick={handleGroupClick}
        className="no-drag flex items-center gap-3 hover:bg-[var(--color-surface-hover)] -ml-2 px-2 py-1.5 rounded-xl transition-colors"
      >
        <Avatar
          src={conversation.groupImageUrl}
          fallback={displayName}
          variant="group"
          size="md"
        />
        <div className="text-left">
          <h2 className="text-[15px] font-semibold text-[var(--color-text-primary)]">{displayName}</h2>
          <p className="text-[13px] text-[var(--color-text-secondary)] flex items-center gap-1 max-w-[300px]">
            <span className="shrink-0">{conversation.groupMembers?.length || 0} members</span>
            {conversation.groupDescription && (
              <span className="text-[var(--color-text-tertiary)] truncate">· {conversation.groupDescription}</span>
            )}
          </p>
        </div>
      </button>
    </div>
  )
}
