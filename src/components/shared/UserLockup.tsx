import type { BlueskyProfile } from '../../types'
import { Avatar } from './Avatar'

interface UserLockupProps {
  profile: BlueskyProfile
  onClick?: () => void
  size?: 'sm' | 'md'
}

/**
 * User "lockup" component - avatar + name + handle
 * Used in ChatHeader, Sidebar, and anywhere we display a user identity
 */
export function UserLockup({ profile, onClick, size = 'md' }: UserLockupProps) {
  const displayName = profile.displayName || profile.handle
  const nameSize = size === 'sm' ? 'text-[14px]' : 'text-[15px]'
  const handleSize = size === 'sm' ? 'text-[12px]' : 'text-[13px]'

  const content = (
    <>
      <Avatar
        src={profile.avatar}
        fallback={displayName}
        size={size === 'sm' ? 'sm' : 'md'}
      />
      <div className="text-left min-w-0">
        <p className={`${nameSize} font-semibold text-[var(--color-text-primary)] truncate`}>
          {displayName}
        </p>
        <p className={`${handleSize} text-[var(--color-text-secondary)] truncate`}>
          @{profile.handle}
        </p>
      </div>
    </>
  )

  if (onClick) {
    return (
      <button
        onClick={onClick}
        className="flex items-center gap-3 hover:opacity-80 transition-opacity"
        aria-label="View profile"
      >
        {content}
      </button>
    )
  }

  return <div className="flex items-center gap-3">{content}</div>
}
