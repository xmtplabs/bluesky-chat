import { useState, useMemo } from 'react'
import { useGroupAdmin } from '../context/GroupAdminContext'
import { Avatar } from '../../../shared/Avatar'
import { xmtpService } from '../../../../services/xmtp'

const MAX_NAME_LENGTH = 64
const MAX_DESCRIPTION_LENGTH = 256

export function MetadataSection() {
  const { state, actions, meta } = useGroupAdmin()
  const { editMode, draftName, draftDescription, draftImagePreview } = state
  const { setDraftName, setDraftDescription, setDraftImage } = actions
  const { group, members } = meta

  const [showImageUrlInput, setShowImageUrlInput] = useState(false)
  const [imageUrlInput, setImageUrlInput] = useState('')
  const [imageUrlError, setImageUrlError] = useState('')

  const isEditing = editMode === 'edit-metadata'
  const currentImageUrl = draftImagePreview || group?.imageUrl

  // Generate fallback name from member profiles (excluding self)
  const fallbackName = useMemo(() => {
    const myInboxId = xmtpService.getInboxId()
    const otherMembers = members.filter((m) => m.inboxId !== myInboxId)
    if (otherMembers.length === 0) return 'Group Chat'

    const names = otherMembers
      .slice(0, 3)
      .map((m) => m.profile?.displayName || m.profile?.handle || m.inboxId.slice(0, 8))

    const remaining = otherMembers.length - names.length
    if (remaining > 0) {
      return `${names.join(', ')} +${remaining}`
    }
    return names.join(', ')
  }, [members])

  const displayName = group?.name || fallbackName

  const handleAvatarClick = () => {
    if (isEditing) {
      setImageUrlInput(currentImageUrl || '')
      setImageUrlError('')
      setShowImageUrlInput(true)
    }
  }

  const handleImageUrlSubmit = () => {
    const url = imageUrlInput.trim()
    if (!url) {
      setShowImageUrlInput(false)
      return
    }

    // Validate URL format
    try {
      const parsed = new URL(url)
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        setImageUrlError('URL must use http or https')
        return
      }
    } catch {
      setImageUrlError('Please enter a valid URL')
      return
    }

    setImageUrlError('')
    setDraftImage(null, url)
    setShowImageUrlInput(false)
  }

  const handleImageUrlCancel = () => {
    setShowImageUrlInput(false)
    setImageUrlInput('')
    setImageUrlError('')
  }

  if (editMode === 'add-member') {
    return null
  }

  return (
    <div className="pt-6 pb-4 px-6">
      {/* Avatar */}
      <div className="flex justify-center">
        <button
          onClick={handleAvatarClick}
          disabled={!isEditing}
          className={`relative group ${isEditing ? 'cursor-pointer' : 'cursor-default'}`}
          aria-label={isEditing ? 'Change group image' : undefined}
        >
          <div className="rounded-full ring-4 ring-[var(--color-surface)] shadow-[var(--shadow-lg)] overflow-hidden">
            <Avatar
              src={currentImageUrl}
              fallback={displayName}
              variant="group"
              size="2xl"
            />
          </div>
          {isEditing && (
            <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                </svg>
              </div>
            </div>
          )}
        </button>
      </div>

      {/* Image URL input popup */}
      {showImageUrlInput && (
        <div className="mt-4 p-3 bg-[var(--color-surface-secondary)] rounded-xl border border-[var(--color-border)]">
          <label className="block text-[12px] font-medium text-[var(--color-text-secondary)] mb-1.5">
            Image URL
          </label>
          <input
            type="url"
            value={imageUrlInput}
            onChange={(e) => {
              setImageUrlInput(e.target.value)
              if (imageUrlError) setImageUrlError('')
            }}
            placeholder="https://example.com/image.jpg"
            className="w-full h-10 px-3 bg-[var(--color-surface)] border border-[var(--color-border-light)] rounded-lg text-[14px] text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-bsky-500)] focus:ring-2 focus:ring-[var(--color-bsky-500)]/20 transition-all"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleImageUrlSubmit()
              if (e.key === 'Escape') handleImageUrlCancel()
            }}
          />
          {imageUrlError && (
            <p className="mt-1.5 text-[12px] text-red-500">{imageUrlError}</p>
          )}
          <div className="flex gap-2 mt-2">
            <button
              onClick={handleImageUrlCancel}
              className="flex-1 h-8 text-[13px] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleImageUrlSubmit}
              className="flex-1 h-8 text-[13px] text-white bg-[var(--color-bsky-500)] hover:bg-[var(--color-bsky-600)] rounded-lg transition-colors"
            >
              Set Image
            </button>
          </div>
        </div>
      )}

      {/* Info / Edit fields */}
      {isEditing ? (
        <div className="mt-5 space-y-4">
          {/* Name input */}
          <div>
            <label className="block text-[13px] font-medium text-[var(--color-text-secondary)] mb-1.5">
              Group Name
            </label>
            <div className="relative">
              <input
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                placeholder="Enter group name"
                className="w-full h-11 px-3 pr-14 bg-[var(--color-surface-secondary)] border border-[var(--color-border-light)] rounded-xl text-[15px] text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-bsky-500)] focus:ring-2 focus:ring-[var(--color-bsky-500)]/20 transition-all"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-[var(--color-text-tertiary)] tabular-nums">
                {draftName.length}/{MAX_NAME_LENGTH}
              </span>
            </div>
          </div>

          {/* Description input */}
          <div>
            <label className="block text-[13px] font-medium text-[var(--color-text-secondary)] mb-1.5">
              Description
            </label>
            <div className="relative">
              <textarea
                value={draftDescription}
                onChange={(e) => setDraftDescription(e.target.value)}
                placeholder="What's this group about?"
                rows={3}
                className="w-full px-3 py-2.5 pr-14 bg-[var(--color-surface-secondary)] border border-[var(--color-border-light)] rounded-xl text-[15px] text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-bsky-500)] focus:ring-2 focus:ring-[var(--color-bsky-500)]/20 transition-all resize-none leading-relaxed"
              />
              <span className="absolute right-3 bottom-2.5 text-[11px] text-[var(--color-text-tertiary)] tabular-nums">
                {draftDescription.length}/{MAX_DESCRIPTION_LENGTH}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="mt-4 text-center">
          <h2 className="text-[20px] font-bold text-[var(--color-text-primary)]">
            {displayName}
          </h2>
          {group?.description && (
            <p className="mt-2 text-[15px] text-[var(--color-text-secondary)] leading-relaxed">
              {group.description}
            </p>
          )}
          <p className="mt-2 text-[13px] text-[var(--color-text-tertiary)]">
            {members.length} member{members.length !== 1 ? 's' : ''}
          </p>
        </div>
      )}
    </div>
  )
}
