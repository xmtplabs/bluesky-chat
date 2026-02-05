import { useEffect, useState } from 'react'
import { useAuthStore } from './stores/authStore'
import { useUIStore } from './stores/uiStore'
import { BlueskyLogin } from './components/auth/BlueskyLogin'
import { Sidebar } from './components/layout/Sidebar'
import { ChatView } from './components/chat/ChatView'
import { ErrorBoundary } from './components/shared/ErrorBoundary'
import { UserProfileModal } from './components/profile/UserProfileModal'
import { GroupAdminModal } from './components/chat/group-admin'
import { IdentityMismatchBanner } from './components/auth/IdentityMismatchBanner'
import { BackupPromptBanner } from './components/onboarding/BackupPromptBanner'
import { UpdateBanner } from './components/updates/UpdateBanner'
import * as Connection from './components/connection/Connection'

export default function App() {
  const [isInitializing, setIsInitializing] = useState(true)
  const { isBlueskyLoggedIn, isXMTPConnected, initializeServices } = useAuthStore()
  const { viewingProfileDid, groupAdminModalGroupId, closeGroupAdmin } = useUIStore()

  useEffect(() => {
    const init = async () => {
      try {
        await initializeServices()
      } catch (error) {
        console.error('Failed to initialize:', error)
      } finally {
        setIsInitializing(false)
      }
    }

    init()
  }, [])

  if (isInitializing) {
    return (
      <div className="h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#007AFF] mx-auto" />
          <p className="mt-4 text-[#666]">Initializing...</p>
        </div>
      </div>
    )
  }

  if (!isBlueskyLoggedIn) {
    return <BlueskyLogin />
  }

  if (!isXMTPConnected) {
    return (
      <Connection.Provider>
        <ConnectionFlow />
      </Connection.Provider>
    )
  }

  return (
    <ErrorBoundary>
      <div className="h-screen flex bg-white">
        <Sidebar />
        <main className="flex-1 flex flex-col min-w-0">
          <UpdateBanner />
          <IdentityMismatchBanner />
          <BackupPromptBanner />
          <ChatView />
        </main>
      </div>
      {viewingProfileDid && <UserProfileModal />}
      {groupAdminModalGroupId && (
        <GroupAdminModal groupId={groupAdminModalGroupId} onClose={closeGroupAdmin} />
      )}
    </ErrorBoundary>
  )
}

/**
 * Orchestrates which Connection variant to show based on phase.
 */
function ConnectionFlow() {
  const { state } = Connection.useConnection()

  switch (state.phase) {
    case 'checking':
      return <Connection.Checking />
    case 'restore-opportunity':
      return <Connection.RestoreOpportunity />
    case 'connecting':
    case 'error':
      return <Connection.Connecting />
  }
}
