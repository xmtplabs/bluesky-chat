import { useNewConversation, type XmtpUserStatus } from '../context/NewConversationContext'
import { Avatar } from '../../../shared/Avatar'
import type { UserProfile } from '../../../../types'

interface UserListItemProps {
  user: UserProfile
}

/**
 * Individual user row in the user list.
 */
export function UserListItem({ user }: UserListItemProps) {
  const { state, actions } = useNewConversation()
  const { mode, selectedUsers, xmtpStatus } = state

  const isSelected = selectedUsers.some((u) => u.id === user.id)
  const status = xmtpStatus.get(user.id)
  const canMessage = status === 'verified'
  const isChecking = status === 'checking' || status === undefined

  return (
    <button
      onClick={() => actions.selectUser(user)}
      disabled={!canMessage}
      className={`w-full p-3 flex items-center gap-3 rounded-xl transition-all duration-200 text-left ${
        !canMessage
          ? 'opacity-50 cursor-not-allowed'
          : isSelected
            ? 'bg-[var(--color-surface-selected)]'
            : 'hover:bg-[var(--color-surface-hover)]'
      }`}
    >
      <Avatar src={user.avatar} fallback={user.displayName || user.handle} size="md" />
      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-medium text-[var(--color-text-primary)] truncate">
          {user.displayName || user.handle}
        </p>
        <p className="text-[12px] text-[var(--color-text-secondary)] truncate">
          @{user.handle}
        </p>
      </div>

      <UserStatusIndicator
        status={status}
        isSelected={isSelected}
        isChecking={isChecking}
        canMessage={canMessage}
        mode={mode}
      />
    </button>
  )
}

interface UserStatusIndicatorProps {
  status: XmtpUserStatus | undefined
  isSelected: boolean
  isChecking: boolean
  canMessage: boolean
  mode: 'dm' | 'group'
}

function UserStatusIndicator({ status, isSelected, isChecking, canMessage, mode }: UserStatusIndicatorProps) {
  if (isChecking) {
    return (
      <div className="w-4 h-4 rounded-full border-2 border-[var(--color-text-tertiary)] border-t-transparent animate-spin" />
    )
  }

  if (canMessage) {
    if (mode === 'group') {
      return (
        <div
          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-200 ${
            isSelected
              ? 'bg-[var(--color-bsky-500)] border-[var(--color-bsky-500)]'
              : 'border-[var(--color-border)]'
          }`}
        >
          {isSelected && (
            <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      )
    }

    if (isSelected) {
      return (
        <div className="w-5 h-5 rounded-full bg-[var(--color-bsky-500)] flex items-center justify-center">
          <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      )
    }

    return null
  }

  if (status === 'not-on-chat') {
    return (
      <span className="text-[11px] text-[var(--color-text-tertiary)]">Not on chat</span>
    )
  }

  return null
}
