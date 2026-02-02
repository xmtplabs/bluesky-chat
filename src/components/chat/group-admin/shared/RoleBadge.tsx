import type { MemberRole } from '../context/GroupAdminContext'

interface RoleBadgeProps {
  role: MemberRole
}

export function RoleBadge({ role }: RoleBadgeProps) {
  if (role === 'member') return null

  const isSuperAdmin = role === 'super_admin'

  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${
        isSuperAdmin
          ? 'bg-[var(--color-bsky-100)] text-[var(--color-bsky-600)]'
          : 'bg-[var(--color-surface-tertiary)] text-[var(--color-text-secondary)]'
      }`}
    >
      {isSuperAdmin ? 'Owner' : 'Admin'}
    </span>
  )
}
