/**
 * Settings Compound Component
 *
 * Handles the settings view with identity status, backup/restore, and dev tools.
 *
 * Usage:
 * ```tsx
 * import * as Settings from './components/settings/Settings'
 *
 * <Settings.Provider>
 *   <Settings.Header />
 *   <div className="flex-1 overflow-y-auto ...">
 *     <Settings.MessageBanner />
 *     <Settings.IdentityStatus />
 *     <Settings.InboxId />
 *     <Settings.KeyManagement />
 *     <Settings.DevTools />
 *   </div>
 *   <Settings.Footer />
 * </Settings.Provider>
 * ```
 */

export { SettingsProviderBridge as Provider } from './SettingsProviderBridge'

// Variants
export { SettingsHeader as Header } from './variants/SettingsHeader'
export { IdentityStatus } from './variants/IdentityStatus'
export { InboxIdDisplay as InboxId } from './variants/InboxIdDisplay'
export { KeyManagement } from './variants/KeyManagement'
export { SettingsFooter as Footer } from './variants/SettingsFooter'
export { DevTools } from './variants/DevTools'

// Shared components
export { MessageBanner } from './shared/MessageBanner'
export { BackupForm } from './shared/BackupForm'
export { RestoreForm } from './shared/RestoreForm'
export { PasswordStrengthIndicator } from './shared/PasswordStrengthIndicator'

// Context hook
export { useSettings } from './context/SettingsContext'
