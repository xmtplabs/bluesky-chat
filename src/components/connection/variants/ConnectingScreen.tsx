import { useConnection } from '../context/ConnectionContext'

/**
 * Displayed while connecting to XMTP network.
 */
export function ConnectingScreen() {
  const { state, actions, meta } = useConnection()

  // Error state with retry option
  if (state.phase === 'error' && state.error) {
    // Check for installation limit error
    const isInstallationLimit = state.error.includes('installations')

    return (
      <div className="h-screen flex items-center justify-center bg-white">
        <div className="text-center max-w-md px-4">
          {isInstallationLimit ? (
            <>
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-amber-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <p className="text-black font-medium">Too many installations</p>
              <p className="mt-2 text-[#666] text-sm">
                You've reached the maximum of 10 installations.
                Clear old installations to continue.
              </p>
              <button
                onClick={actions.clearInstallations}
                disabled={meta.isClearing}
                className="mt-4 px-4 py-2 bg-[#007AFF] text-white rounded-lg font-medium hover:bg-[#0056b3] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {meta.isClearing ? 'Clearing...' : 'Clear Installations'}
              </button>
              <p className="mt-3 text-[#999] text-xs">
                This will sign out all other devices using this account
              </p>
            </>
          ) : (
            <>
              <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[var(--color-error-light)] flex items-center justify-center">
                <svg className="w-6 h-6 text-[var(--color-error)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <p className="text-black font-medium">Connection failed</p>
              <p className="mt-2 text-[#666] text-sm">{state.error}</p>
              <button
                onClick={actions.retryConnection}
                className="mt-4 px-4 py-2 bg-[#007AFF] text-white rounded-lg font-medium hover:bg-[#0056b3] transition-colors"
              >
                Try Again
              </button>
            </>
          )}
        </div>
      </div>
    )
  }

  // Normal connecting state
  return (
    <div className="h-screen flex items-center justify-center bg-white">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#007AFF] mx-auto" />
        <p className="mt-4 text-black font-medium">Connecting to XMTP...</p>
        <p className="mt-2 text-[#666] text-sm">
          Setting up your encrypted messaging connection
        </p>
      </div>
    </div>
  )
}
