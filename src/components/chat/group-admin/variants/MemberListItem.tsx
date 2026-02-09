import { useState, useRef, useEffect } from 'react'
import { useGroupAdmin, type GroupMemberInfo } from '../context/GroupAdminContext'
import { Avatar } from '../../../shared/Avatar'
import { RoleBadge } from '../shared/RoleBadge'
import { xmtpService } from '../../../../services/xmtp'
import { formatHandle } from '../../../../provider'

interface MemberListItemProps {
  member: GroupMemberInfo
}

export function MemberListItem({ member }: MemberListItemProps) {
  const { actions, meta } = useGroupAdmin()
  const { removeMember, promoteToAdmin, demoteFromAdmin, promoteToSuperAdmin, demoteFromSuperAdmin } = actions
  const { currentUserRole, canManageMembers, canManageAdmins } = meta

  const [showMenu, setShowMenu] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 })
  const menuRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const currentInboxId = xmtpService.getInboxId()
  const isSelf = member.inboxId === currentInboxId
  const displayName = member.profile?.displayName || member.profile?.handle || member.inboxId.slice(0, 12) + '...'
  const handle = member.profile?.handle

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setShowMenu(false)
      }
    }

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showMenu])

  // Build menu items based on permissions
  const menuItems: { label: string; action: () => Promise<void>; danger?: boolean }[] = []

  if (canManageMembers && !isSelf) {
    menuItems.push({
      label: 'Remove from group',
      action: async () => {
        await removeMember(member.inboxId)
        setShowMenu(false)
      },
      danger: true
    })
  }

  if (canManageAdmins && member.role === 'member') {
    menuItems.push({
      label: 'Make admin',
      action: async () => {
        await promoteToAdmin(member.inboxId)
        setShowMenu(false)
      }
    })
  }

  if (canManageAdmins && member.role === 'admin') {
    menuItems.push({
      label: 'Remove admin',
      action: async () => {
        await demoteFromAdmin(member.inboxId)
        setShowMenu(false)
      }
    })
  }

  if (currentUserRole === 'super_admin' && member.role === 'admin') {
    menuItems.push({
      label: 'Make owner',
      action: async () => {
        await promoteToSuperAdmin(member.inboxId)
        setShowMenu(false)
      }
    })
  }

  if (currentUserRole === 'super_admin' && member.role === 'super_admin' && !isSelf) {
    menuItems.push({
      label: 'Remove owner',
      action: async () => {
        await demoteFromSuperAdmin(member.inboxId)
        setShowMenu(false)
      }
    })
  }

  const hasActions = menuItems.length > 0

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-[var(--color-surface-hover)] transition-colors">
      <Avatar
        src={member.profile?.avatar}
        fallback={displayName}
        size={44}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-medium text-[var(--color-text-primary)] truncate">
            {displayName}
          </span>
          <RoleBadge role={member.role} />
          {isSelf && (
            <span className="text-[11px] text-[var(--color-text-tertiary)]">
              (you)
            </span>
          )}
        </div>
        {handle && (
          <p className="text-[13px] text-[var(--color-text-secondary)] truncate">
            {formatHandle(handle)}
          </p>
        )}
      </div>

      {hasActions && (
        <div className="relative">
          <button
            ref={buttonRef}
            onClick={() => {
              if (!showMenu && buttonRef.current) {
                const rect = buttonRef.current.getBoundingClientRect()
                setMenuPosition({
                  top: rect.bottom + 4,
                  right: window.innerWidth - rect.right
                })
              }
              setShowMenu(!showMenu)
            }}
            className="p-2 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-secondary)] rounded-full transition-colors"
            aria-label={`Actions for ${displayName}`}
            aria-haspopup="menu"
            aria-expanded={showMenu}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <circle cx="12" cy="6" r="1.5" />
              <circle cx="12" cy="12" r="1.5" />
              <circle cx="12" cy="18" r="1.5" />
            </svg>
          </button>

          {showMenu && (
            <div
              ref={menuRef}
              role="menu"
              aria-label={`Actions for ${displayName}`}
              className="fixed w-44 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-[var(--shadow-lg)] py-1 z-[60]"
              style={{ top: menuPosition.top, right: menuPosition.right }}
            >
              {menuItems.map((item) => (
                <button
                  key={item.label}
                  role="menuitem"
                  onClick={item.action}
                  className={`w-full px-3 py-2 text-left text-[14px] hover:bg-[var(--color-surface-hover)] transition-colors ${
                    item.danger ? 'text-[var(--color-error)]' : 'text-[var(--color-text-primary)]'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
