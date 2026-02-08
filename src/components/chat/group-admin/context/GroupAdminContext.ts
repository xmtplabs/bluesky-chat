import { createSafeContext } from '../../../../lib/context/createSafeContext'
import type { ContextValue } from '../../../../lib/context/types'
import type { UserProfile, XmtpUserStatus } from '../../../../types'
import type { Group } from '@xmtp/browser-sdk'

export type MemberRole = 'member' | 'admin' | 'super_admin'
export type EditMode = 'view' | 'edit-metadata' | 'add-member'

export interface GroupMemberInfo {
  inboxId: string
  profile?: UserProfile
  role: MemberRole
}

export interface GroupAdminState {
  editMode: EditMode
  draftName: string
  draftDescription: string
  draftImageFile: Blob | null
  draftImagePreview: string | null
  memberSearchQuery: string
  selectedMembersToAdd: UserProfile[]
  xmtpStatus: Map<string, XmtpUserStatus>
  isSaving: boolean
  isLoadingMembers: boolean
  error: string | null
}

export interface GroupAdminActions {
  setEditMode: (mode: EditMode) => void
  setDraftName: (name: string) => void
  setDraftDescription: (desc: string) => void
  setDraftImage: (file: Blob | null, preview: string | null) => void
  setMemberSearchQuery: (query: string) => void
  toggleMemberToAdd: (profile: UserProfile) => void
  removeMemberToAdd: (did: string) => void
  checkXmtpStatus: (user: UserProfile) => Promise<void>
  saveMetadata: () => Promise<void>
  addMembers: () => Promise<void>
  removeMember: (inboxId: string) => Promise<void>
  promoteToAdmin: (inboxId: string) => Promise<void>
  demoteFromAdmin: (inboxId: string) => Promise<void>
  promoteToSuperAdmin: (inboxId: string) => Promise<void>
  demoteFromSuperAdmin: (inboxId: string) => Promise<void>
  close: () => void
}

export interface GroupAdminMeta {
  group: Group | null
  members: GroupMemberInfo[]
  currentUserRole: MemberRole
  canEditMetadata: boolean
  canManageMembers: boolean
  canManageAdmins: boolean
}

export type GroupAdminContextValue = ContextValue<GroupAdminState, GroupAdminActions, GroupAdminMeta>

export const [GroupAdminProvider, useGroupAdmin, GroupAdminContext] =
  createSafeContext<GroupAdminContextValue>('GroupAdmin')
