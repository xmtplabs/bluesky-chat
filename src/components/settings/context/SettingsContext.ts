import { createSafeContext } from '../../../lib/context/createSafeContext'
import type { ContextValue } from '../../../lib/context/types'
import type { BlueskyProfile } from '../../../types'

export interface SettingsState {
  error: string | null
  success: string | null
  showKeyManagement: boolean
  keyTab: 'backup' | 'restore'
  isRepublishing: boolean
  isChecking: boolean
}

export interface SettingsActions {
  setError: (error: string | null) => void
  setSuccess: (success: string | null) => void
  setShowKeyManagement: (show: boolean) => void
  setKeyTab: (tab: 'backup' | 'restore') => void
  republishIdentity: () => Promise<void>
  checkIdentityStatus: () => Promise<void>
  close: () => void
  logout: () => Promise<void>
}

export interface SettingsMeta {
  blueskyProfile: BlueskyProfile | null
  xmtpInboxId: string | null
  identityMismatch: boolean
  signatureInvalid: boolean
  publishedInboxId: string | null
  hasWriteAccess: boolean
}

export type SettingsContextValue = ContextValue<SettingsState, SettingsActions, SettingsMeta>

export const [SettingsProvider, useSettings, SettingsContext] =
  createSafeContext<SettingsContextValue>('Settings')
