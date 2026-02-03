import { useConversation } from './context/ConversationContext'
import { VirtualList } from '../shared/VirtualList'
import { ConversationItem } from './ConversationItem'
import { useAuthStore } from '../../stores/authStore'
import { getLastKnownConversationCount } from '../../stores/chatStore'

/**
 * Loading skeleton for conversations
 */
function ConversationListLoading() {
  return (
    <div className="px-2 py-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-3 animate-pulse">
          <div className="w-12 h-12 rounded-full bg-[var(--color-surface-tertiary)]" />
          <div className="flex-1 space-y-2">
            <div className="h-4 bg-[var(--color-surface-tertiary)] rounded w-2/5" />
            <div className="h-3 bg-[var(--color-surface-tertiary)] rounded w-3/4" />
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Check if user is known to have zero conversations based on their last session.
 */
function useIsKnownEmpty(): boolean {
  const did = useAuthStore((s) => s.blueskyProfile?.did)
  if (!did) return false
  return getLastKnownConversationCount(did) === 0
}

/**
 * Empty state for conversations
 */
function ConversationListEmpty() {
  const { state } = useConversation()
  const { filter, searchQuery } = state

  return (
    <div className="px-6 py-12 text-center">
      <p className="text-[14px] text-[var(--color-text-secondary)]">
        {searchQuery.trim()
          ? 'No conversations found'
          : filter === 'requests'
            ? 'No message requests'
            : 'No conversations yet'}
      </p>
    </div>
  )
}

/**
 * Conversation list using context
 */
export function ConversationListView() {
  const { state, actions, meta } = useConversation()
  const { conversations, selectedId } = state
  const { select } = actions
  const { isLoading } = meta
  const isKnownEmpty = useIsKnownEmpty()

  // Show skeletons while loading, unless we know the user has no conversations
  // (e.g., they just created a fresh XMTP installation by skipping restore)
  if (isLoading && conversations.length === 0 && !isKnownEmpty) {
    return <ConversationListLoading />
  }

  if (conversations.length === 0) {
    return <ConversationListEmpty />
  }

  return (
    <VirtualList
      items={conversations}
      getItemKey={(conv) => conv.id}
      estimateSize={72}
      overscan={5}
      itemClassName="px-2"
      renderItem={(conversation, index) => {
        const isFirst = index === 0
        const isLast = index === conversations.length - 1
        const content = (
          <ConversationItem
            conversation={conversation}
            isSelected={conversation.id === selectedId}
            onSelect={() => select(conversation.id)}
          />
        )

        // Add vertical padding for first/last items since absolute positioning ignores container padding
        if (isFirst || isLast) {
          return (
            <div className={`${isFirst ? 'pt-1' : ''} ${isLast ? 'pb-1' : ''}`}>
              {content}
            </div>
          )
        }

        return content
      }}
    />
  )
}
