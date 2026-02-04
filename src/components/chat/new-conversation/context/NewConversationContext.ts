import { createSafeContext } from '../../../../lib/context/createSafeContext'
import type { ContextValue } from '../../../../lib/context/types'
import type { BlueskyProfile, XmtpUserStatus } from '../../../../types'

export type ConversationMode = 'dm' | 'group'
export type ListMode = 'following' | 'followers'
export type { XmtpUserStatus }

export interface NewConversationState {
  mode: ConversationMode
  listMode: ListMode
  searchQuery: string
  selectedUsers: BlueskyProfile[]
  groupName: string
  xmtpStatus: Map<string, XmtpUserStatus>
  isCreating: boolean
  error: string | null
}

export interface NewConversationActions {
  setMode: (mode: ConversationMode) => void
  setListMode: (mode: ListMode) => void
  setSearchQuery: (query: string) => void
  selectUser: (user: BlueskyProfile) => void
  removeUser: (did: string) => void
  setGroupName: (name: string) => void
  startConversation: () => Promise<void>
  close: () => void
}

export interface NewConversationMeta {
  followers: BlueskyProfile[]
  following: BlueskyProfile[]
  searchResults: BlueskyProfile[]
  isSearching: boolean
  displayList: BlueskyProfile[]
  canCreate: boolean
}

export type NewConversationContextValue = ContextValue<NewConversationState, NewConversationActions, NewConversationMeta>

export const [NewConversationProvider, useNewConversation, NewConversationContext] =
  createSafeContext<NewConversationContextValue>('NewConversation')
