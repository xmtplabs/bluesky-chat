import type { ChatMessage, MessageGroupPosition } from '../../types'
import { useUIStore } from '../../stores/uiStore'

interface MessageBubbleProps {
  message: ChatMessage
  isOwn: boolean
  showAvatar: boolean
  avatar?: string
  groupPosition: MessageGroupPosition
  showTimestamp?: boolean
  isGroupChat?: boolean
}

function getBubbleRadius(isOwn: boolean, pos: MessageGroupPosition): string {
  // Own messages: tail on right side
  if (isOwn) {
    if (pos === 'single') return 'rounded-2xl rounded-br-md'
    if (pos === 'first') return 'rounded-2xl rounded-br-md'
    if (pos === 'middle') return 'rounded-2xl rounded-r-md'
    return 'rounded-2xl rounded-tr-md' // last
  }
  // Peer messages: tail on left side
  if (pos === 'single') return 'rounded-2xl rounded-bl-md'
  if (pos === 'first') return 'rounded-2xl rounded-bl-md'
  if (pos === 'middle') return 'rounded-2xl rounded-l-md'
  return 'rounded-2xl rounded-tl-md' // last
}

export function MessageBubble({ message, isOwn, showAvatar, avatar, groupPosition, showTimestamp = true, isGroupChat = false }: MessageBubbleProps) {
  const { openUserProfile } = useUIStore()
  const time = new Date(message.sentAt).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit'
  })

  const handleAvatarClick = () => {
    if (message.senderProfile?.did) {
      openUserProfile(message.senderProfile.did)
    }
  }

  const isAvatarClickable = !isOwn && showAvatar && message.senderProfile?.did

  const senderName = !isOwn && isGroupChat && showAvatar
    ? (message.senderProfile?.displayName || message.senderProfile?.handle)
    : undefined

  return (
    <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex flex-col max-w-[75%] ${isOwn ? 'items-end' : 'items-start'}`}>
        {senderName && (
          <span className="text-[12px] font-medium text-[var(--color-text-secondary)] ml-10 mb-0.5 truncate max-w-full">
            {senderName}
          </span>
        )}
        <div className={`flex items-end gap-2 ${isOwn ? 'flex-row-reverse' : ''}`}>
          {!isOwn && showAvatar && (
            <div className="flex-shrink-0 mb-1">
              {isAvatarClickable ? (
                <button
                  onClick={handleAvatarClick}
                  aria-label="View profile"
                  className="focus:outline-none focus:ring-2 focus:ring-[var(--color-bsky-500)] focus:ring-offset-2 rounded-full"
                >
                  {avatar ? (
                    <img src={avatar} alt="" width={32} height={32} className="w-8 h-8 rounded-full hover:opacity-80 transition-opacity" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-[var(--color-surface-tertiary)] hover:opacity-80 transition-opacity" />
                  )}
                </button>
              ) : avatar ? (
                <img src={avatar} alt="" width={32} height={32} className="w-8 h-8 rounded-full" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-[var(--color-surface-tertiary)]" />
              )}
            </div>
          )}
          {!isOwn && !showAvatar && isGroupChat && <div className="w-8" />}

          <div
            className={`px-4 py-2.5 ${getBubbleRadius(isOwn, groupPosition)} ${
              isOwn
                ? 'bg-[var(--color-message-own)] text-[var(--color-message-own-text)]'
                : 'bg-[var(--color-message-peer)] text-[var(--color-message-peer-text)]'
            }`}
          >
            <p className="text-[15px] whitespace-pre-wrap break-words leading-relaxed">{message.content}</p>
          </div>
        </div>

        {/* Timestamp and status outside bubble */}
        {showTimestamp && (
          <div
            className={`flex items-center gap-1.5 mt-1 text-[var(--color-text-tertiary)] ${
              isOwn ? 'mr-0' : isGroupChat ? 'ml-10' : ''
            }`}
          >
            <span className="text-[11px]">{time}</span>
            {isOwn && message.status === 'sending' && (
              <span aria-label="Sending">
                <svg className="w-3 h-3 animate-pulse" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                  <circle cx="10" cy="10" r="5" />
                </svg>
              </span>
            )}
            {isOwn && message.status === 'sent' && (
              <span aria-label="Sent">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </span>
            )}
            {isOwn && message.status === 'failed' && (
              <span aria-label="Failed to send">
                <svg className="w-3.5 h-3.5 text-[var(--color-error)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
