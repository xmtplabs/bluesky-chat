import { useMemo } from 'react'
import { useChat } from './context/ChatContext'
import { VirtualList } from '../shared/VirtualList'
import { SecurityBanner } from './SecurityBanner'
import { DateDivider } from './DateDivider'
import { MessageBubble } from './MessageBubble'
import { SystemMessage } from './SystemMessage'
import { ChatMessagesEmpty, ChatMessagesLoading } from './ChatEmpty'
import type { ChatMessage, MessageGroupPosition } from '../../types'

type MessageListItem =
  | { type: 'security-banner' }
  | { type: 'date-divider'; timestamp: number }
  | { type: 'message'; message: ChatMessage; isOwn: boolean; showAvatar: boolean; showSenderName: boolean; groupPosition: MessageGroupPosition; showTimestamp: boolean; isGroupChat: boolean }

function canGroupMessages(current: ChatMessage, other: ChatMessage | null): boolean {
  if (!other) return false
  if (current.senderAddress !== other.senderAddress) return false
  if (current.isSystemMessage || other.isSystemMessage) return false
  // Break on different dates
  if (new Date(current.sentAt).toDateString() !== new Date(other.sentAt).toDateString()) return false
  // Break on >5 min gap
  if (Math.abs(current.sentAt - other.sentAt) > 5 * 60 * 1000) return false
  return true
}

function getGroupPosition(messages: ChatMessage[], index: number): MessageGroupPosition {
  const current = messages[index]
  const prev = index > 0 ? messages[index - 1] : null
  const next = index < messages.length - 1 ? messages[index + 1] : null
  const withPrev = canGroupMessages(current, prev)
  const withNext = canGroupMessages(current, next)
  if (!withPrev && !withNext) return 'single'
  if (!withPrev && withNext) return 'first'
  if (withPrev && withNext) return 'middle'
  return 'last'
}

function shouldShowDateDivider(currentMessage: ChatMessage, prevMessage: ChatMessage | null): boolean {
  if (!prevMessage) return true

  const currentDate = new Date(currentMessage.sentAt).toDateString()
  const prevDate = new Date(prevMessage.sentAt).toDateString()

  return currentDate !== prevDate
}

/**
 * Message list component - renders virtualized list of messages
 */
export function ChatMessageList() {
  const { state, meta } = useChat()
  const { messages, isLoading, conversation } = state
  const { inboxId, myProfile } = meta

  // Pre-process messages into flat list for virtualization
  const listItems = useMemo(() => {
    const items: MessageListItem[] = [{ type: 'security-banner' }]

    messages.forEach((message, index) => {
      const prevMessage = index > 0 ? messages[index - 1] : null

      if (shouldShowDateDivider(message, prevMessage)) {
        items.push({ type: 'date-divider', timestamp: message.sentAt })
      }

      const isOwn = message.senderAddress === inboxId
      const groupPosition = getGroupPosition(messages, index)
      const isGroupChat = !!conversation?.isGroup
      // Show avatar at bottom of group, sender name at top
      const showAvatar = !isOwn && isGroupChat && (groupPosition === 'last' || groupPosition === 'single')
      const showSenderName = !isOwn && isGroupChat && (groupPosition === 'first' || groupPosition === 'single')
      const showTimestamp = groupPosition === 'last' || groupPosition === 'single'

      items.push({ type: 'message', message, isOwn, showAvatar, showSenderName, groupPosition, showTimestamp, isGroupChat })
    })

    return items
  }, [messages, inboxId])

  if (isLoading && messages.length === 0) {
    return <ChatMessagesLoading />
  }

  if (messages.length === 0) {
    return <ChatMessagesEmpty />
  }

  return (
    <VirtualList
      items={listItems}
      getItemKey={(item, index) =>
        item.type === 'security-banner' ? 'security-banner' :
        item.type === 'date-divider' ? `date-${item.timestamp}` :
        item.message.id
      }
      estimateSize={80}
      followOutput="always"
      overscan={10}
      itemClassName="px-4"
      renderItem={(item, index) => {
        const isFirst = index === 0
        const isLast = index === listItems.length - 1

        // Determine spacing: tight (mb-1) for grouped messages, normal (mb-3) otherwise
        const spacingClass = item.type === 'message' && (item.groupPosition === 'first' || item.groupPosition === 'middle')
          ? 'mb-1'
          : 'mb-3'

        const content = (() => {
          if (item.type === 'security-banner') return <SecurityBanner />
          if (item.type === 'date-divider') return <DateDivider timestamp={item.timestamp} />
          if (item.message.isSystemMessage) return <SystemMessage message={item.message} />
          return (
            <MessageBubble
              message={item.message}
              isOwn={item.isOwn}
              showAvatar={item.showAvatar}
              showSenderName={item.showSenderName}
              avatar={item.isOwn ? myProfile?.avatar : (item.isGroupChat ? item.message.senderProfile?.avatar : conversation?.peerProfile?.avatar)}
              groupPosition={item.groupPosition}
              showTimestamp={item.showTimestamp}
              isGroupChat={item.isGroupChat}
            />
          )
        })()

        // Add vertical padding for first/last items since absolute positioning ignores container padding
        const paddingClass = `${isFirst ? 'pt-4' : ''} ${isLast ? 'pb-1' : ''}`

        return (
          <div className={`${spacingClass} ${paddingClass}`.trim()}>
            {content}
          </div>
        )
      }}
    />
  )
}
