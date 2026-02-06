import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react'
import {
  GroupAdminProvider,
  type GroupAdminContextValue,
  type GroupMemberInfo,
  type MemberRole,
  type EditMode
} from './context/GroupAdminContext'
import { xmtpService } from '../../../services/xmtp'
import { blueskyService } from '../../../services/bluesky'
import { identityService } from '../../../services/identity'
import { useChatStore } from '../../../stores/chatStore'
import { useXmtpStatusChecker } from '../../../hooks/useXmtpStatusChecker'
import { resolveUsersToInboxIds } from '../../../utils/resolveUsers'
import { getErrorMessage } from '../../../utils/errors'
import type { BlueskyProfile } from '../../../types'
import type { Group } from '@xmtp/browser-sdk'

const MAX_NAME_LENGTH = 64
const MAX_DESCRIPTION_LENGTH = 256
const MAX_IMAGE_SIZE = 1024 * 1024 // 1MB

interface GroupAdminProviderBridgeProps {
  children: ReactNode
  groupId: string
  onClose: () => void
}

export function GroupAdminProviderBridge({ children, groupId, onClose }: GroupAdminProviderBridgeProps) {
  const { loadConversations, loadMessages } = useChatStore()

  // Group state
  const [group, setGroup] = useState<Group | null>(null)
  const [members, setMembers] = useState<GroupMemberInfo[]>([])
  const [currentUserRole, setCurrentUserRole] = useState<MemberRole>('member')
  const [isLoadingMembers, setIsLoadingMembers] = useState(true)

  // Edit state
  const [editMode, setEditMode] = useState<EditMode>('view')
  const [draftName, setDraftName] = useState('')
  const [draftDescription, setDraftDescription] = useState('')
  const [draftImageFile, setDraftImageFile] = useState<Blob | null>(null)
  const [draftImagePreview, setDraftImagePreview] = useState<string | null>(null)
  const [memberSearchQuery, setMemberSearchQuery] = useState('')
  const [selectedMembersToAdd, setSelectedMembersToAdd] = useState<BlueskyProfile[]>([])
  const { xmtpStatus, checkXmtpStatus } = useXmtpStatusChecker()
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load group and members
  useEffect(() => {
    let cancelled = false

    async function loadGroup() {
      setIsLoadingMembers(true)
      setError(null)

      try {
        const conversation = await xmtpService.getConversation(groupId)
        if (cancelled) return

        if (!conversation || !xmtpService.isGroup(conversation)) {
          setError('Group not found')
          setIsLoadingMembers(false)
          return
        }

        const groupConv = conversation as Group
        setGroup(groupConv)

        // Initialize draft values from current group state
        setDraftName(groupConv.name || '')
        setDraftDescription(groupConv.description || '')

        // Load members
        await loadMembers(groupConv)
      } catch (err) {
        if (cancelled) return
        console.error('Failed to load group:', err)
        setError('Failed to load group')
      } finally {
        if (!cancelled) {
          setIsLoadingMembers(false)
        }
      }
    }

    loadGroup()

    return () => {
      cancelled = true
    }
  }, [groupId])

  const loadMembers = useCallback(async (groupConv: Group) => {
    try {
      const groupMembers = await groupConv.members()
      const admins = await xmtpService.getGroupAdmins(groupConv)
      const superAdmins = await xmtpService.getGroupSuperAdmins(groupConv)
      const currentInboxId = xmtpService.getInboxId()

      // Determine current user's role
      if (currentInboxId) {
        if (superAdmins.includes(currentInboxId)) {
          setCurrentUserRole('super_admin')
        } else if (admins.includes(currentInboxId)) {
          setCurrentUserRole('admin')
        } else {
          setCurrentUserRole('member')
        }
      }

      // Build member info with profiles
      const memberInfos: GroupMemberInfo[] = await Promise.all(
        groupMembers.map(async (member) => {
          let role: MemberRole = 'member'
          if (superAdmins.includes(member.inboxId)) {
            role = 'super_admin'
          } else if (admins.includes(member.inboxId)) {
            role = 'admin'
          }

          // Try to resolve profile (check local cache, then backend)
          let profile: BlueskyProfile | undefined
          const did = await identityService.resolveInboxToDid(member.inboxId)
          if (did) {
            profile = identityService.getCachedProfile(did) || undefined
            if (!profile) {
              try {
                profile = (await blueskyService.getProfile(did)) || undefined
                if (profile) {
                  identityService.cacheProfile(profile)
                }
              } catch {
                // Profile fetch failed, continue without it
              }
            }
          }

          return {
            inboxId: member.inboxId,
            profile,
            role
          }
        })
      )

      // Sort: super admins first, then admins, then members
      memberInfos.sort((a, b) => {
        const roleOrder = { super_admin: 0, admin: 1, member: 2 }
        return roleOrder[a.role] - roleOrder[b.role]
      })

      setMembers(memberInfos)
    } catch (err) {
      console.error('Failed to load members:', err)
    }
  }, [])

  const handleSetEditMode = useCallback((mode: EditMode) => {
    setEditMode(mode)
    setError(null)
    if (mode === 'view') {
      // Reset drafts when exiting edit mode
      if (group) {
        setDraftName(group.name || '')
        setDraftDescription(group.description || '')
      }
      setDraftImageFile(null)
      setDraftImagePreview(null)
      setMemberSearchQuery('')
      setSelectedMembersToAdd([])
    }
  }, [group])

  const handleSetDraftName = useCallback((name: string) => {
    setDraftName(name.slice(0, MAX_NAME_LENGTH))
  }, [])

  const handleSetDraftDescription = useCallback((desc: string) => {
    setDraftDescription(desc.slice(0, MAX_DESCRIPTION_LENGTH))
  }, [])

  const handleSetDraftImage = useCallback((file: Blob | null, preview: string | null) => {
    if (file && file.size > MAX_IMAGE_SIZE) {
      setError('Image must be smaller than 1MB')
      return
    }
    setDraftImageFile(file)
    setDraftImagePreview(preview)
    setError(null)
  }, [])

  const handleToggleMemberToAdd = useCallback((profile: BlueskyProfile) => {
    // Guard is handled by the UI (disabled={!canMessage}), so only use functional updates
    setSelectedMembersToAdd((prev) => {
      const exists = prev.some((u) => u.did === profile.did)
      if (exists) {
        return prev.filter((u) => u.did !== profile.did)
      }
      if (prev.length >= 250) {
        setError('Maximum 250 members can be added at once')
        return prev
      }
      return [...prev, profile]
    })
    setError(null)
  }, [])

  const handleRemoveMemberToAdd = useCallback((did: string) => {
    setSelectedMembersToAdd((prev) => prev.filter((u) => u.did !== did))
  }, [])

  const handleSaveMetadata = useCallback(async () => {
    if (!group) return

    setIsSaving(true)
    setError(null)

    try {
      // Update name if changed
      if (draftName !== (group.name || '')) {
        await xmtpService.updateGroupName(group, draftName.trim())
      }

      // Update description if changed
      if (draftDescription !== (group.description || '')) {
        await xmtpService.updateGroupDescription(group, draftDescription.trim())
      }

      // Update image if changed - use data URL directly since Bluesky CDN
      // requires blobs to be anchored to records
      if (draftImageFile && draftImagePreview) {
        await xmtpService.updateGroupImageUrl(group, draftImagePreview)
      }

      // Reload conversations to reflect changes in sidebar
      await loadConversations()

      // Reload group to get updated values
      const updatedConversation = await xmtpService.getConversation(groupId)
      if (updatedConversation && xmtpService.isGroup(updatedConversation)) {
        setGroup(updatedConversation as Group)
      }

      setEditMode('view')
      setDraftImageFile(null)
      setDraftImagePreview(null)
    } catch (err) {
      console.error('Failed to save metadata:', err)
      setError(getErrorMessage(err, 'Failed to save changes'))
    } finally {
      setIsSaving(false)
    }
  }, [group, draftName, draftDescription, draftImageFile, draftImagePreview, groupId, loadConversations])

  const handleAddMembers = useCallback(async () => {
    if (!group || selectedMembersToAdd.length === 0) return

    setIsSaving(true)
    setError(null)

    try {
      const { inboxIds, unresolvedNames } = await resolveUsersToInboxIds(selectedMembersToAdd)

      if (unresolvedNames.length > 0) {
        setError(`Not on chat yet: ${unresolvedNames.join(', ')}`)
        setIsSaving(false)
        return
      }

      await xmtpService.addGroupMembers(group, inboxIds)

      // Reload members
      await loadMembers(group)

      // Reload conversations and messages so the system message appears with correct names
      await loadConversations()
      await loadMessages(groupId)

      setEditMode('view')
      setSelectedMembersToAdd([])
      setMemberSearchQuery('')
    } catch (err) {
      console.error('Failed to add members:', err)
      setError(getErrorMessage(err, 'Failed to add members'))
    } finally {
      setIsSaving(false)
    }
  }, [group, groupId, selectedMembersToAdd, loadMembers, loadConversations, loadMessages])

  const handleRemoveMember = useCallback(async (inboxId: string) => {
    if (!group) return

    setError(null)

    try {
      await xmtpService.removeGroupMembers(group, [inboxId])
      await loadMembers(group)
      await loadConversations()
    } catch (err) {
      console.error('Failed to remove member:', err)
      setError(getErrorMessage(err, 'Failed to remove member'))
    }
  }, [group, loadMembers, loadConversations])

  const handlePromoteToAdmin = useCallback(async (inboxId: string) => {
    if (!group) return

    setError(null)

    try {
      await xmtpService.addGroupAdmin(group, inboxId)
      await loadMembers(group)
    } catch (err) {
      console.error('Failed to promote to admin:', err)
      setError(getErrorMessage(err, 'Failed to promote to admin'))
    }
  }, [group, loadMembers])

  const handleDemoteFromAdmin = useCallback(async (inboxId: string) => {
    if (!group) return

    setError(null)

    try {
      await xmtpService.removeGroupAdmin(group, inboxId)
      await loadMembers(group)
    } catch (err) {
      console.error('Failed to demote from admin:', err)
      setError(getErrorMessage(err, 'Failed to demote from admin'))
    }
  }, [group, loadMembers])

  const handlePromoteToSuperAdmin = useCallback(async (inboxId: string) => {
    if (!group) return

    setError(null)

    try {
      await xmtpService.addGroupSuperAdmin(group, inboxId)
      await loadMembers(group)
    } catch (err) {
      console.error('Failed to promote to super admin:', err)
      setError(getErrorMessage(err, 'Failed to promote to super admin'))
    }
  }, [group, loadMembers])

  const handleDemoteFromSuperAdmin = useCallback(async (inboxId: string) => {
    if (!group) return

    setError(null)

    try {
      await xmtpService.removeGroupSuperAdmin(group, inboxId)
      await loadMembers(group)
    } catch (err) {
      console.error('Failed to demote from super admin:', err)
      setError(getErrorMessage(err, 'Failed to demote from super admin'))
    }
  }, [group, loadMembers])

  // Computed permissions
  const canEditMetadata = currentUserRole === 'admin' || currentUserRole === 'super_admin'
  const canManageMembers = currentUserRole === 'admin' || currentUserRole === 'super_admin'
  const canManageAdmins = currentUserRole === 'super_admin'

  const contextValue: GroupAdminContextValue = useMemo(() => ({
    state: {
      editMode,
      draftName,
      draftDescription,
      draftImageFile,
      draftImagePreview,
      memberSearchQuery,
      selectedMembersToAdd,
      xmtpStatus,
      isSaving,
      isLoadingMembers,
      error
    },
    actions: {
      setEditMode: handleSetEditMode,
      setDraftName: handleSetDraftName,
      setDraftDescription: handleSetDraftDescription,
      setDraftImage: handleSetDraftImage,
      setMemberSearchQuery,
      toggleMemberToAdd: handleToggleMemberToAdd,
      removeMemberToAdd: handleRemoveMemberToAdd,
      checkXmtpStatus,
      saveMetadata: handleSaveMetadata,
      addMembers: handleAddMembers,
      removeMember: handleRemoveMember,
      promoteToAdmin: handlePromoteToAdmin,
      demoteFromAdmin: handleDemoteFromAdmin,
      promoteToSuperAdmin: handlePromoteToSuperAdmin,
      demoteFromSuperAdmin: handleDemoteFromSuperAdmin,
      close: onClose
    },
    meta: {
      group,
      members,
      currentUserRole,
      canEditMetadata,
      canManageMembers,
      canManageAdmins
    }
  }), [
    editMode,
    draftName,
    draftDescription,
    draftImageFile,
    draftImagePreview,
    memberSearchQuery,
    selectedMembersToAdd,
    xmtpStatus,
    isSaving,
    isLoadingMembers,
    error,
    handleSetEditMode,
    handleSetDraftName,
    handleSetDraftDescription,
    handleSetDraftImage,
    handleToggleMemberToAdd,
    handleRemoveMemberToAdd,
    checkXmtpStatus,
    handleSaveMetadata,
    handleAddMembers,
    handleRemoveMember,
    handlePromoteToAdmin,
    handleDemoteFromAdmin,
    handlePromoteToSuperAdmin,
    handleDemoteFromSuperAdmin,
    onClose,
    group,
    members,
    currentUserRole,
    canEditMetadata,
    canManageMembers,
    canManageAdmins
  ])

  return (
    <GroupAdminProvider value={contextValue}>
      {children}
    </GroupAdminProvider>
  )
}
