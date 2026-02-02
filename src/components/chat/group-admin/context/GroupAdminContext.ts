import { createSafeContext } from '../../../../lib/context/createSafeContext'
import type { ContextValue } from '../../../../lib/context/types'
import type { BlueskyProfile } from '../../../../types'
import type { Group } from '@xmtp/browser-sdk'

export type MemberRole = 'member' | 'admin' | 'super_admin'
export type EditMode = 'view' | 'edit-metadata' | 'add-member'

export interface GroupMemberInfo {
  inboxId: string
  profile?: BlueskyProfile
  role: MemberRole
}

export interface GroupAdminState {
  editMode: EditMode
  draftName: string
  draftDescription: string
  draftImageFile: Blob | null
  draftImagePreview: string | null
  memberSearchQuery: string
  selectedMembersToAdd: BlueskyProfile[]
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
  toggleMemberToAdd: (profile: BlueskyProfile) => void
  removeMemberToAdd: (did: string) => void
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
