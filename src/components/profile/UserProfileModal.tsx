import { useState, useEffect, useCallback, useRef } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useAuthStore } from '../../stores/authStore'
import { useChatStore } from '../../stores/chatStore'
import { provider, config, formatHandle } from '../../provider'
import { identityService } from '../../services/identity'
import type { UserProfile } from '../../types'
import { Avatar } from '../../components/shared/Avatar'

const MAX_DISPLAY_NAME_LENGTH = 64
const MAX_BIO_LENGTH = 256
const MAX_AVATAR_SIZE = 1024 * 1024 // 1MB

function formatNumber(num: number): string {
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(1)}M`
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`
  }
  return String(num)
}

export function UserProfileModal() {
  const { viewingProfileDid, closeUserProfile } = useUIStore()
  const { profile: currentUserProfile, updateUserProfile, isXMTPConnected } = useAuthStore()
  const { createDm, conversations, selectConversation } = useChatStore()

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [xmtpStatus, setXmtpStatus] = useState<'checking' | 'available' | 'unavailable'>('checking')
  const [inboxId, setInboxId] = useState<string | null>(null)
  const [isStartingChat, setIsStartingChat] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(false)
  const [editDisplayName, setEditDisplayName] = useState('')
  const [editBio, setEditBio] = useState('')
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [avatarFile, setAvatarFile] = useState<Blob | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const modalRef = useRef<HTMLDivElement>(null)

  const isOwnProfile = viewingProfileDid === currentUserProfile?.id

  // Fetch profile data
  useEffect(() => {
    if (!viewingProfileDid) return

    async function fetchProfile() {
      setIsLoading(true)
      setError(null)

      try {
        const fetchedProfile = await provider.getProfile(viewingProfileDid!)
        if (fetchedProfile) {
          setProfile(fetchedProfile)
          identityService.cacheProfile(fetchedProfile)
        } else {
          setError('Profile not found')
        }
      } catch (err) {
        console.error('Failed to fetch profile:', err)
        setError('Failed to load profile')
      } finally {
        setIsLoading(false)
      }
    }

    fetchProfile()
  }, [viewingProfileDid])

  // Check XMTP status
  useEffect(() => {
    if (!viewingProfileDid) {
      setXmtpStatus('checking')
      return
    }

    async function checkXmtpStatus() {
      setXmtpStatus('checking')

      try {
        // Resolve DID to inbox ID (fetches, verifies signature, and caches mapping)
        const resolvedInboxId = await identityService.resolveIdToInbox(viewingProfileDid!)
        if (resolvedInboxId) {
          setInboxId(resolvedInboxId)
          setXmtpStatus('available')
        } else if (isOwnProfile && isXMTPConnected) {
          // Own profile with no published record - still "available" locally
          setXmtpStatus('available')
        } else {
          setXmtpStatus('unavailable')
        }
      } catch (err) {
        console.error('Failed to check XMTP status:', err)
        if (isOwnProfile && isXMTPConnected) {
          // If fetch fails but we're connected, assume available
          setXmtpStatus('available')
        } else {
          setXmtpStatus('unavailable')
        }
      }
    }

    checkXmtpStatus()
  }, [viewingProfileDid, isOwnProfile, isXMTPConnected])

  // Initialize edit form when entering edit mode
  useEffect(() => {
    if (isEditMode && profile) {
      setEditDisplayName(profile.displayName || '')
      setEditBio(profile.description || '')
      setAvatarPreview(null)
      setAvatarFile(null)
      setSaveError(null)
    }
  }, [isEditMode, profile])

  // Focus trap and escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isEditMode) {
          setIsEditMode(false)
        } else {
          closeUserProfile()
        }
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [closeUserProfile, isEditMode])

  const handleClose = useCallback(() => {
    setIsEditMode(false)
    closeUserProfile()
  }, [closeUserProfile])

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose()
    }
  }, [handleClose])

  const handleSendMessage = async () => {
    if (!profile || !inboxId) return

    setIsStartingChat(true)
    try {
      // Match by DID if profile is populated, or by inbox ID as fallback
      const existingConversation = conversations.find((c) => {
        if (c.isGroup) return false
        if (c.peerProfile?.id === profile.id) return true
        if (inboxId && c.peerAddress === inboxId) return true
        return false
      })

      if (existingConversation) {
        selectConversation(existingConversation.id)
      } else {
        await createDm(inboxId, profile)
      }
      handleClose()
    } catch (err) {
      console.error('Failed to start conversation:', err)
      setError('Failed to start conversation')
    } finally {
      setIsStartingChat(false)
    }
  }

  const handleAvatarClick = () => {
    if (isEditMode) {
      fileInputRef.current?.click()
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setSaveError('Please select an image file')
      return
    }

    if (file.size > MAX_AVATAR_SIZE) {
      setSaveError('Image must be smaller than 1MB')
      return
    }

    setSaveError(null)
    setAvatarFile(file)

    const reader = new FileReader()
    reader.onload = () => {
      setAvatarPreview(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  const handleSave = async () => {
    if (!profile) return

    setIsSaving(true)
    setSaveError(null)

    try {
      await updateUserProfile({
        displayName: editDisplayName.trim(),
        description: editBio.trim(),
        avatar: avatarFile || undefined
      })

      const updatedProfile = await provider.getProfile(viewingProfileDid!)
      if (updatedProfile) {
        setProfile(updatedProfile)
      }

      setIsEditMode(false)
    } catch (err) {
      console.error('Failed to update profile:', err)
      setSaveError(err instanceof Error ? err.message : 'Failed to save changes')
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancelEdit = () => {
    setIsEditMode(false)
    setAvatarPreview(null)
    setAvatarFile(null)
    setSaveError(null)
  }

  if (!viewingProfileDid) return null

  const avatarSrc = avatarPreview || profile?.avatar
  const displayName = profile?.displayName || profile?.handle || ''

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-profile-title"
        className="bg-[var(--color-surface)] rounded-2xl w-full max-w-[360px] shadow-[var(--shadow-modal)] overflow-hidden animate-[slideUp_200ms_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header bar */}
        <div className="relative h-12 flex items-center justify-between px-4 border-b border-[var(--color-border-light)]">
          {isEditMode ? (
            <>
              <button
                onClick={handleCancelEdit}
                className="text-[15px] text-[var(--color-bsky-500)] hover:text-[var(--color-bsky-600)] transition-colors font-medium"
              >
                Cancel
              </button>
              <span className="absolute left-1/2 -translate-x-1/2 text-[15px] font-semibold text-[var(--color-text-primary)]">
                Edit Profile
              </span>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="text-[15px] text-[var(--color-bsky-500)] hover:text-[var(--color-bsky-600)] transition-colors font-semibold disabled:opacity-50"
              >
                {isSaving ? 'Saving' : 'Done'}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleClose}
                aria-label="Close"
                className="w-8 h-8 -ml-1 flex items-center justify-center text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] rounded-full transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <span className="absolute left-1/2 -translate-x-1/2 text-[15px] font-semibold text-[var(--color-text-primary)]">
                Profile
              </span>
              {isOwnProfile ? (
                <button
                  onClick={() => setIsEditMode(true)}
                  className="text-[15px] text-[var(--color-bsky-500)] hover:text-[var(--color-bsky-600)] transition-colors font-medium"
                >
                  Edit
                </button>
              ) : (
                <div className="w-8" />
              )}
            </>
          )}
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(85vh-48px)]">
          {isLoading ? (
            <div className="px-6 py-8 flex flex-col items-center">
              <div className="w-24 h-24 rounded-full bg-[var(--color-surface-secondary)] animate-pulse" />
              <div className="mt-4 h-6 w-32 bg-[var(--color-surface-secondary)] rounded-lg animate-pulse" />
              <div className="mt-2 h-4 w-24 bg-[var(--color-surface-secondary)] rounded-lg animate-pulse" />
            </div>
          ) : error ? (
            <div className="px-6 py-12 text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[var(--color-error-light)] flex items-center justify-center">
                <svg className="w-6 h-6 text-[var(--color-error)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <p className="text-[15px] text-[var(--color-text-secondary)]">{error}</p>
            </div>
          ) : profile ? (
            <>
              {/* Avatar section */}
              <div className="pt-6 pb-4 flex flex-col items-center">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <button
                  onClick={handleAvatarClick}
                  disabled={!isEditMode}
                  className={`relative group ${isEditMode ? 'cursor-pointer' : 'cursor-default'}`}
                  aria-label={isEditMode ? 'Change avatar' : undefined}
                >
                  <div className="rounded-full ring-4 ring-[var(--color-surface)] shadow-[var(--shadow-lg)] overflow-hidden">
                    <Avatar
                      src={avatarSrc}
                      fallback={displayName}
                      size="2xl"
                    />
                  </div>
                  {isEditMode && (
                    <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                        <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                    </div>
                  )}
                </button>
              </div>

              {/* Profile info */}
              <div className="px-6 pb-5">
                {isEditMode ? (
                  <div className="space-y-4">
                    {/* Display name input */}
                    <div>
                      <label className="block text-[13px] font-medium text-[var(--color-text-secondary)] mb-1.5">
                        Name
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={editDisplayName}
                          onChange={(e) => setEditDisplayName(e.target.value.slice(0, MAX_DISPLAY_NAME_LENGTH))}
                          placeholder="Display name"
                          className="w-full h-11 px-3 bg-[var(--color-surface-secondary)] border border-[var(--color-border-light)] rounded-xl text-[15px] text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-bsky-500)] focus:ring-2 focus:ring-[var(--color-bsky-500)]/20 transition-all"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[var(--color-text-tertiary)] tabular-nums">
                          {editDisplayName.length}/{MAX_DISPLAY_NAME_LENGTH}
                        </span>
                      </div>
                    </div>

                    {/* Bio input */}
                    <div>
                      <label className="block text-[13px] font-medium text-[var(--color-text-secondary)] mb-1.5">
                        Bio
                      </label>
                      <div className="relative">
                        <textarea
                          value={editBio}
                          onChange={(e) => setEditBio(e.target.value.slice(0, MAX_BIO_LENGTH))}
                          placeholder="Write something about yourself"
                          rows={3}
                          className="w-full px-3 py-2.5 bg-[var(--color-surface-secondary)] border border-[var(--color-border-light)] rounded-xl text-[15px] text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-bsky-500)] focus:ring-2 focus:ring-[var(--color-bsky-500)]/20 transition-all resize-none leading-relaxed"
                        />
                        <span className="absolute right-3 bottom-2.5 text-[11px] text-[var(--color-text-tertiary)] tabular-nums">
                          {editBio.length}/{MAX_BIO_LENGTH}
                        </span>
                      </div>
                    </div>

                    {saveError && (
                      <div className="px-3 py-2 bg-[var(--color-error-light)] rounded-lg">
                        <p className="text-[13px] text-[var(--color-error)]">{saveError}</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    {/* Name and handle */}
                    <div className="text-center">
                      <h2 id="user-profile-title" className="text-[20px] font-bold text-[var(--color-text-primary)]">
                        {displayName}
                      </h2>
                      <p className="mt-0.5 text-[15px] text-[var(--color-text-secondary)]">
                        {formatHandle(profile.handle)}
                      </p>
                    </div>

                    {/* Bio */}
                    {profile.description && (
                      <p className="mt-3 text-[15px] text-[var(--color-text-primary)] text-center leading-relaxed whitespace-pre-wrap">
                        {profile.description}
                      </p>
                    )}

                    {/* Stats */}
                    {(profile.followersCount !== undefined || profile.followsCount !== undefined) && (
                      <div className="mt-4 flex justify-center gap-5">
                        {profile.followersCount !== undefined && (
                          <div className="text-center">
                            <span className="text-[17px] font-semibold text-[var(--color-text-primary)] tabular-nums">
                              {formatNumber(profile.followersCount)}
                            </span>
                            <span className="ml-1 text-[15px] text-[var(--color-text-secondary)]">followers</span>
                          </div>
                        )}
                        {profile.followsCount !== undefined && (
                          <div className="text-center">
                            <span className="text-[17px] font-semibold text-[var(--color-text-primary)] tabular-nums">
                              {formatNumber(profile.followsCount)}
                            </span>
                            <span className="ml-1 text-[15px] text-[var(--color-text-secondary)]">following</span>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* XMTP Status */}
              {!isEditMode && !isOwnProfile && xmtpStatus === 'unavailable' && (
                <div className="mx-6 mb-4 text-center">
                  <span className="text-[13px] text-[var(--color-text-tertiary)]">Not on chat</span>
                </div>
              )}

              {/* Actions */}
              {!isEditMode && (
                <div className="px-6 pb-6 space-y-2">
                  {!isOwnProfile && xmtpStatus === 'available' && (
                    <button
                      onClick={handleSendMessage}
                      disabled={isStartingChat}
                      className="w-full h-11 flex items-center justify-center gap-2 text-[15px] font-semibold rounded-xl bg-[var(--color-bsky-500)] text-white hover:bg-[var(--color-bsky-600)] active:bg-[var(--color-bsky-700)] disabled:opacity-50 transition-colors"
                    >
                      {isStartingChat ? (
                        <>
                          <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                          Starting...
                        </>
                      ) : (
                        'Message'
                      )}
                    </button>
                  )}
                  {config.profileUrl && (
                    <a
                      href={config.profileUrl(profile.handle)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`w-full h-11 flex items-center justify-center gap-2 text-[15px] font-medium rounded-xl transition-colors ${
                        !isOwnProfile && xmtpStatus === 'available'
                          ? 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-secondary)]'
                          : 'bg-[var(--color-surface-secondary)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-tertiary)]'
                      }`}
                    >
                      View Profile
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                      </svg>
                    </a>
                  )}
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}
