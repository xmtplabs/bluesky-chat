/**
 * Connection Compound Component
 *
 * Handles the XMTP connection flow with restore opportunity for new users.
 *
 * Usage:
 * ```tsx
 * import { Connection } from './components/connection/Connection'
 *
 * <Connection.Provider>
 *   {phase === 'checking' && <Connection.Checking />}
 *   {phase === 'restore-opportunity' && <Connection.RestoreOpportunity />}
 *   {phase === 'connecting' && <Connection.Connecting />}
 * </Connection.Provider>
 * ```
 */

export { ConnectionProviderBridge as Provider } from './ConnectionProviderBridge'
export { CheckingConnection as Checking } from './variants/CheckingConnection'
export { RestoreOpportunity } from './variants/RestoreOpportunity'
export { ConnectingScreen as Connecting } from './variants/ConnectingScreen'

// Context hook
export { useConnection } from './context/ConnectionContext'
