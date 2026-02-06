import type { DecodedMessage } from '@xmtp/browser-sdk'

export type MessageGroupPosition = 'single' | 'first' | 'middle' | 'last'

export interface BlueskyProfile {
  did: string
  handle: string
  displayName?: string
  avatar?: string
  description?: string
  followersCount?: number
  followsCount?: number
}

export interface IdentityMapping {
  blueskyDid: string
  blueskyHandle: string
  xmtpInboxId: string
  verificationSignature: string
  createdAt: number
}

export interface ChatConversation {
  id: string
  topic: string
  peerAddress: string
  peerProfile?: BlueskyProfile
  lastMessage?: string
  lastMessageTime?: number
  unreadCount: number
  isGroup: boolean
  groupName?: string
  groupDescription?: string
  groupImageUrl?: string
  groupMembers?: string[]
  consentState: 'unknown' | 'allowed' | 'denied'
}

export interface ChatMessage {
  id: string
  conversationId: string
  senderAddress: string
  senderProfile?: BlueskyProfile
  content: string
  sentAt: number
  status: 'sending' | 'sent' | 'delivered' | 'failed'
  // System message info (e.g., group membership changes)
  isSystemMessage?: boolean
  systemMessageType?: 'member_added' | 'member_removed' | 'group_updated' | 'unknown'
}

export interface NotificationSettings {
  enabled: boolean
  sound: boolean
  showPreview: boolean
}

export interface AppSettings {
  notifications: NotificationSettings
  theme: 'light' | 'dark' | 'system'
}

export type BuildMode = 'development' | 'beta' | 'production'

// Update info from electron-updater
export interface UpdateInfo {
  version: string
  releaseDate?: string
  releaseNotes?: string
}

export interface UpdateProgress {
  percent: number
  bytesPerSecond: number
  transferred: number
  total: number
}

// IPC channel types
export interface ElectronAPI {
  // Build mode
  getBuildMode: () => Promise<BuildMode>

  // Storage
  secureStore: (key: string, value: string) => Promise<void>
  secureRetrieve: (key: string) => Promise<string | null>
  secureDelete: (key: string) => Promise<void>

  // OAuth
  openOAuthWindow: (url: string) => Promise<{ code: string; state: string; iss?: string } | null>

  // Notifications
  showNotification: (title: string, body: string, options?: { silent?: boolean }) => void

  // App
  setBadgeCount: (count: number) => void
  onOAuthCallback: (callback: (data: { code: string; state: string; iss?: string }) => void) => void
  removeOAuthCallback: () => void

  // Storage diagnostics
  getStorageDiagnostics: () => Promise<{
    userDataPath: string
    secureStorageFiles: string[]
    electronVersion: string
    chromiumVersion: string
    appName: string
    appPath: string
  }>

  // Auto-updater
  updaterCheck: () => Promise<{ success: boolean; updateInfo?: UpdateInfo; error?: string }>
  updaterDownload: () => Promise<{ success: boolean; error?: string }>
  updaterInstall: () => void
  updaterGetBetaOptIn: () => Promise<boolean>
  updaterSetBetaOptIn: (enabled: boolean) => Promise<{ success: boolean }>
  onUpdateChecking: (callback: () => void) => void
  onUpdateAvailable: (callback: (info: UpdateInfo) => void) => void
  onUpdateNotAvailable: (callback: () => void) => void
  onUpdateDownloadProgress: (callback: (progress: UpdateProgress) => void) => void
  onUpdateDownloaded: (callback: (info: UpdateInfo) => void) => void
  onUpdateError: (callback: (message: string) => void) => void
  removeUpdateListeners: () => void
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export type XMTPMessage = DecodedMessage

// XMTP user status for messaging eligibility
export type XmtpUserStatus = 'checking' | 'verified' | 'not-on-chat'
