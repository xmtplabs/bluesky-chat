import { useConversations } from '../../hooks/useConversations'
import type { ChatConversation } from '../../types'
import { Avatar } from '../shared/Avatar'

interface RequestsViewProps {
  onClose: () => void
}

export function RequestsView({ onClose }: RequestsViewProps) {
  const { requests, select, acceptRequest } = useConversations()

  const handleAccept = (conversationId: string) => {
    acceptRequest(conversationId)
    select(conversationId)
    onClose()
  }

  const handleView = (conversationId: string) => {
    select(conversationId)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="requests-title"
        className="bg-[var(--color-surface)] rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col shadow-[var(--shadow-modal)] border border-[var(--color-border)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-[var(--color-border)] flex items-center justify-between">
          <div>
            <h2 id="requests-title" className="text-[17px] font-semibold text-[var(--color-text-primary)]">Message Requests</h2>
            <p className="text-[13px] text-[var(--color-text-secondary)] mt-0.5">
              Messages from people you don't follow
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-2 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] rounded-xl transition-colors duration-200"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Request list */}
        <div className="flex-1 overflow-y-auto">
          {requests.length === 0 ? (
            <div className="p-8 text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--color-surface-secondary)] flex items-center justify-center">
                <svg
                  className="h-8 w-8 text-[var(--color-text-tertiary)]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3 19v-8.93a2 2 0 01.89-1.664l7-4.666a2 2 0 012.22 0l7 4.666A2 2 0 0121 10.07V19M3 19a2 2 0 002 2h14a2 2 0 002-2M3 19l6.75-4.5M21 19l-6.75-4.5M3 10l6.75 4.5M21 10l-6.75 4.5m0 0l-1.14.76a2 2 0 01-2.22 0l-1.14-.76"
                  />
                </svg>
              </div>
              <p className="text-[15px] font-medium text-[var(--color-text-primary)] mb-1">No message requests</p>
              <p className="text-[13px] text-[var(--color-text-secondary)]">
                Messages from people you don't follow will appear here
              </p>
            </div>
          ) : (
            <div className="p-2 space-y-1">
              {requests.map((conversation) => (
                <RequestItem
                  key={conversation.id}
                  conversation={conversation}
                  onAccept={() => handleAccept(conversation.id)}
                  onView={() => handleView(conversation.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface RequestItemProps {
  conversation: ChatConversation
  onAccept: () => void
  onView: () => void
}

function RequestItem({ conversation, onAccept, onView }: RequestItemProps) {
  const displayName = conversation.isGroup
    ? conversation.groupName || 'Group Chat'
    : conversation.peerProfile?.displayName ||
      conversation.peerProfile?.handle ||
      shortenAddress(conversation.peerAddress)

  const avatarUrl = conversation.isGroup ? null : conversation.peerProfile?.avatar

  const timeAgo = conversation.lastMessageTime
    ? formatTimeAgo(conversation.lastMessageTime)
    : ''

  return (
    <div className="p-4 rounded-xl hover:bg-[var(--color-surface-hover)] transition-all duration-200">
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="flex-shrink-0">
          <Avatar
            src={avatarUrl}
            fallback={displayName}
            size="lg"
            variant={conversation.isGroup ? 'group' : 'user'}
          />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <span className="text-[15px] font-semibold text-[var(--color-text-primary)] truncate">
              {displayName}
            </span>
            {timeAgo && (
              <span className="text-[12px] text-[var(--color-text-tertiary)] flex-shrink-0">
                {timeAgo}
              </span>
            )}
          </div>
          {conversation.lastMessage && (
            <p className="text-[13px] text-[var(--color-text-secondary)] truncate leading-snug">
              {conversation.lastMessage}
            </p>
          )}
          {conversation.isGroup && conversation.groupMembers && (
            <p className="text-[12px] text-[var(--color-text-tertiary)] mt-0.5">
              {conversation.groupMembers.length} members
            </p>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={onAccept}
              className="flex-1 py-2 px-4 bg-[var(--color-bsky-500)] hover:bg-[var(--color-bsky-600)] text-white text-[13px] font-semibold rounded-full transition-all duration-200"
            >
              Accept
            </button>
            <button
              onClick={onView}
              className="flex-1 py-2 px-4 bg-[var(--color-surface-secondary)] hover:bg-[var(--color-surface-tertiary)] text-[var(--color-text-primary)] text-[13px] font-medium rounded-full transition-all duration-200 border border-[var(--color-border)]"
            >
              View
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function shortenAddress(address: string): string {
  if (!address) return 'Unknown'
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

function formatTimeAgo(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp

  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  if (hours < 24) return `${hours}h`
  if (days < 7) return `${days}d`

  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric'
  })
}
