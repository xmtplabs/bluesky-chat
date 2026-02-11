import { useState } from 'react'
import { useIdentity } from '../../hooks/useIdentity'
import { useConversations } from '../../hooks/useConversations'
import { PrimaryInbox } from '../conversation/variants/PrimaryInbox'
import { NewConversation } from '../chat/NewConversation'
import { RequestsView } from '../chat/RequestsView'
import { UserLockup } from '../shared/UserLockup'
import { InboxSettingsView } from '../settings/InboxSettingsView'
import { useUIStore } from '../../stores/uiStore'
import { useAuthStore } from '../../stores/authStore'
import { config } from '../../provider'

type Modal = 'new-conversation' | 'requests' | null

const isMac = window.electronAPI?.platform === 'darwin'

export function Sidebar() {
  const [modal, setModal] = useState<Modal>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const { profile } = useIdentity()
  const { requestCount } = useConversations()
  const { openUserProfile, sidebarView, toggleInboxSettings } = useUIStore()
  const { identityMismatch, signatureInvalid } = useAuthStore()

  // Show inbox settings view when active
  if (sidebarView === 'inbox-settings') {
    return (
      <nav aria-label="Inbox settings" className="w-80 bg-[var(--color-surface)] flex flex-col h-full border-r border-[var(--color-border)]">
        {/* Traffic light spacer (macOS only) */}
        {isMac && (
          <div className="drag-region pt-3 flex-shrink-0">
            <div className="h-6" />
          </div>
        )}
        <div className="flex-1 min-h-0">
          <InboxSettingsView />
        </div>
      </nav>
    )
  }

  return (
    <nav aria-label="Conversations" className="w-80 bg-[var(--color-surface)] flex flex-col h-full border-r border-[var(--color-border)]">
      {/* Header */}
      <div className="drag-region pt-3 pb-2 px-4">
        {/* Traffic light spacer (macOS only) */}
        {isMac && <div className="h-6" />}

        {/* Title row */}
        <div className="no-drag flex items-start justify-between">
          <div>
            <h1 className="text-[22px] font-bold text-[var(--color-text-primary)]">{config.name} Chat</h1>
            <p className="text-[11px] text-[var(--color-text-tertiary)]">Secured by XMTP</p>
          </div>
          <button
            onClick={() => setModal('new-conversation')}
            className="p-1.5 text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] rounded-lg transition-colors"
            aria-label="New conversation"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
            </svg>
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-4 pb-3">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-tertiary)]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search"
            aria-label="Search conversations"
            autoComplete="off"
            className="w-full pl-9 pr-4 py-2 bg-[var(--color-surface-secondary)] rounded-xl text-[14px] text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:bg-[var(--color-surface-tertiary)] transition-colors"
          />
        </div>
      </div>

      {/* Chat requests row */}
      {requestCount > 0 && (
        <div className="px-2">
          <button
            onClick={() => setModal('requests')}
            className="w-full px-3 py-3 flex items-center gap-3 hover:bg-[var(--color-surface-hover)] rounded-xl transition-colors"
          >
            <div className="w-12 h-12 rounded-full bg-[var(--color-surface-secondary)] flex items-center justify-center">
              <svg className="w-6 h-6 text-[var(--color-text-primary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
            </div>
            <div className="flex-1 text-left">
              <p className="text-[15px] font-medium text-[var(--color-text-primary)]">Chat requests</p>
              <p className="text-[13px] text-[var(--color-text-secondary)]">
                {requestCount} message request{requestCount !== 1 ? 's' : ''}
              </p>
            </div>
            <svg className="w-5 h-5 text-[var(--color-text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        </div>
      )}

      {/* Conversation list - using new compound component */}
      <div className="flex-1 min-h-0 flex flex-col">
        <PrimaryInbox searchQuery={searchQuery} />
      </div>

      {/* Fade overlay for conversation list */}
      <div className="h-6 -mt-6 bg-gradient-to-t from-[var(--color-surface)] to-transparent pointer-events-none" />

      {/* Bottom bar with user profile and settings */}
      <div className="h-16 px-4 flex items-center justify-between bg-[var(--color-surface)]">
        {/* User profile button */}
        {profile && (
          <UserLockup
            profile={profile}
            onClick={() => openUserProfile(profile.id)}
          />
        )}

        {/* Settings button - direct toggle to inbox settings view */}
        <button
          onClick={toggleInboxSettings}
          className="relative p-2 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)] rounded-lg transition-colors"
          aria-label="Manage inbox"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {/* Warning indicator */}
          {(identityMismatch || signatureInvalid) && (
            <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-amber-500" />
          )}
        </button>
      </div>

      {/* Modals */}
      {modal === 'new-conversation' && <NewConversation onClose={() => setModal(null)} />}
      {modal === 'requests' && <RequestsView onClose={() => setModal(null)} />}
    </nav>
  )
}
