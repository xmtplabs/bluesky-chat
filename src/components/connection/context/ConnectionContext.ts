import { createSafeContext } from '../../../lib/context/createSafeContext'
import type { ContextValue } from '../../../lib/context/types'
import type { UserProfile } from '../../../types'
import type { Hex } from 'viem'

export type ConnectionPhase =
  | 'checking'
  | 'restore-opportunity'
  | 'connecting'
  | 'error'

export interface ConnectionState {
  phase: ConnectionPhase
  error: string | null
  restoredKey: Hex | null
}

export interface ConnectionActions {
  skipRestore: () => void
  restoreFromBackup: (key: Hex) => Promise<void>
  retryConnection: () => void
  clearInstallations: () => Promise<void>
}

export interface ConnectionMeta {
  profile: UserProfile | null
  isRestoring: boolean
  isClearing: boolean
  hasExistingKey: boolean
}

export type ConnectionContextValue = ContextValue<ConnectionState, ConnectionActions, ConnectionMeta>

export const [ConnectionProvider, useConnection, ConnectionContext] =
  createSafeContext<ConnectionContextValue>('Connection')
