import {
  Client,
  type Signer,
  type DecodedMessage,
  type Identifier,
  type GroupMember,
  type Group,
  type Dm,
  type AsyncStreamProxy,
  IdentifierKind,
  ConversationType,
  ConsentState
} from '@xmtp/browser-sdk'
import {
  verifySignedWithPublicKey as verifySignedWithPublicKeyBinding
} from '@xmtp/wasm-bindings'

// Use production network for built distributions, dev for development
const XMTP_ENV = import.meta.env.MODE === 'production' ? 'production' : 'dev'

// Verbose logging is enabled in dev and beta builds (same rule as devTools)
let verboseLogging = import.meta.env.DEV // Default to true in dev, will be updated

// Initialize verbose logging flag from build mode
async function initVerboseLogging(): Promise<void> {
  try {
    const buildMode = await window.electronAPI?.getBuildMode?.()
    verboseLogging = buildMode !== 'production'
  } catch {
    // Fall back to DEV check if electronAPI not available
    verboseLogging = import.meta.env.DEV
  }
}

// Initialize on load
initVerboseLogging()

// Helper for conditional logging (exported for use in other files)
export function verboseLog(...args: unknown[]): void {
  if (verboseLogging) console.log(...args)
}

export function verboseWarn(...args: unknown[]): void {
  if (verboseLogging) console.warn(...args)
}

export function verboseError(...args: unknown[]): void {
  if (verboseLogging) console.error(...args)
}

export function verboseGroup(label: string): void {
  if (verboseLogging) console.group(label)
}

export function verboseGroupEnd(): void {
  if (verboseLogging) console.groupEnd()
}

verboseLog(`XMTP environment: ${XMTP_ENV}`)

// Installation diagnostic storage keys (per-inbox to support multi-user)
const INSTALLATION_HISTORY_KEY = 'xmtp-installation-history'
const SESSION_ACTIVE_KEY = 'xmtp-session-active'
const SESSION_START_KEY = 'xmtp-session-start'
const LAST_ORIGIN_KEY = 'xmtp-last-origin'

// Per-inbox keys (we append inbox ID when we have it)
function getPerInboxKey(baseKey: string, inboxId: string): string {
  return `${baseKey}-${inboxId}`
}

const LAST_INSTALLATION_ID_KEY = 'xmtp-last-installation-id'
const LAST_INBOX_ID_KEY = 'xmtp-last-inbox-id'
const LAST_ENV_KEY = 'xmtp-last-env'

interface InstallationDiagnostics {
  timestamp: string
  installationId: string
  inboxId: string
  env: string
  isNewInstallation: boolean
  reason: string
  details: {
    previousInstallationId: string | null
    previousInboxId: string | null
    previousEnv: string | null
    indexedDbExists: boolean
    indexedDbName: string | null
    privateKeyExists: boolean
    signerAddress: string
  }
}

/**
 * Check if an IndexedDB database exists for the current environment
 */
async function checkIndexedDbExists(): Promise<{ exists: boolean; dbName: string | null }> {
  try {
    const databases = await indexedDB.databases()
    const dbPrefix = `xmtp-${XMTP_ENV}-`
    const xmtpDb = databases.find((db) => db.name?.startsWith(dbPrefix))
    return {
      exists: !!xmtpDb,
      dbName: xmtpDb?.name ?? null
    }
  } catch (error) {
    verboseWarn('Could not check IndexedDB:', error)
    return { exists: false, dbName: null }
  }
}

/**
 * Check OPFS (Origin Private File System) for XMTP database files.
 * The XMTP browser SDK stores its SQLite database in OPFS, not IndexedDB.
 */
async function checkOpfsFiles(): Promise<{ available: boolean; files: string[]; error?: string }> {
  try {
    if (!navigator.storage?.getDirectory) {
      return { available: false, files: [], error: 'OPFS API not available' }
    }
    const root = await navigator.storage.getDirectory()
    const files: string[] = []
    // @ts-expect-error - entries() exists on FileSystemDirectoryHandle but TS types may lag
    for await (const [name] of root.entries()) {
      files.push(name)
    }
    return { available: true, files }
  } catch (error) {
    return { available: false, files: [], error: String(error) }
  }
}

/**
 * Check the StorageManager persistence status
 */
async function checkStoragePersistence(): Promise<{ persisted: boolean; estimate?: { usage: number; quota: number } }> {
  try {
    const persisted = await navigator.storage?.persisted?.() ?? false
    const estimate = await navigator.storage?.estimate?.()
    return {
      persisted,
      estimate: estimate ? { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 } : undefined
    }
  } catch {
    return { persisted: false }
  }
}

const PERSISTENCE_MARKER_KEY = 'xmtp-persistence-marker'
const PERSISTENCE_MARKER_VERSION_KEY = 'xmtp-persistence-marker-version'
const IDB_PERSISTENCE_DB = 'xmtp-persistence-test'
const OPFS_PERSISTENCE_MARKER = '.xmtp-persistence-marker'

/**
 * Check if OPFS data survived from the previous session.
 * Writes a small marker file to OPFS that we check on the next launch.
 * This is independent of the XMTP SDK — it tests raw OPFS persistence.
 */
async function checkOpfsPersistence(): Promise<{ survived: boolean; previousTimestamp: string | null; writeError?: string }> {
  try {
    if (!navigator.storage?.getDirectory) {
      return { survived: false, previousTimestamp: null, writeError: 'OPFS API not available' }
    }
    const root = await navigator.storage.getDirectory()

    // Read previous marker
    let previousTimestamp: string | null = null
    try {
      const markerHandle = await root.getFileHandle(OPFS_PERSISTENCE_MARKER, { create: false })
      const file = await markerHandle.getFile()
      previousTimestamp = await file.text()
    } catch {
      // File doesn't exist — first launch or data was lost
    }

    // Write new marker for next launch
    try {
      const markerHandle = await root.getFileHandle(OPFS_PERSISTENCE_MARKER, { create: true })
      const writable = await markerHandle.createWritable()
      await writable.write(new Date().toISOString())
      await writable.close()
    } catch (writeErr) {
      return { survived: previousTimestamp !== null, previousTimestamp, writeError: String(writeErr) }
    }

    return { survived: previousTimestamp !== null, previousTimestamp }
  } catch (error) {
    return { survived: false, previousTimestamp: null, writeError: String(error) }
  }
}
const IDB_PERSISTENCE_STORE = 'markers'

/**
 * Check if localStorage survived from the previous session.
 * Writes a marker that we check on the next launch.
 */
function checkLocalStoragePersistence(): { survived: boolean; previousTimestamp: string | null; previousVersion: string | null } {
  const previousTimestamp = localStorage.getItem(PERSISTENCE_MARKER_KEY)
  const previousVersion = localStorage.getItem(PERSISTENCE_MARKER_VERSION_KEY)

  // Write new marker for next launch
  localStorage.setItem(PERSISTENCE_MARKER_KEY, new Date().toISOString())
  const currentVersion = import.meta.env.VITE_APP_VERSION ?? 'unknown'
  localStorage.setItem(PERSISTENCE_MARKER_VERSION_KEY, currentVersion)

  return {
    survived: previousTimestamp !== null,
    previousTimestamp,
    previousVersion
  }
}

/**
 * Check if IndexedDB data survived from the previous session.
 * Uses a dedicated test database to avoid interfering with app data.
 */
async function checkIndexedDbPersistence(): Promise<{ survived: boolean; previousTimestamp: string | null }> {
  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(IDB_PERSISTENCE_DB, 1)

      request.onupgradeneeded = () => {
        const db = request.result
        if (!db.objectStoreNames.contains(IDB_PERSISTENCE_STORE)) {
          db.createObjectStore(IDB_PERSISTENCE_STORE)
        }
      }

      request.onsuccess = () => {
        const db = request.result
        // Read previous marker
        const readTx = db.transaction(IDB_PERSISTENCE_STORE, 'readonly')
        const store = readTx.objectStore(IDB_PERSISTENCE_STORE)
        const getReq = store.get('timestamp')

        getReq.onsuccess = () => {
          const previousTimestamp = getReq.result ?? null

          // Write new marker
          const writeTx = db.transaction(IDB_PERSISTENCE_STORE, 'readwrite')
          const writeStore = writeTx.objectStore(IDB_PERSISTENCE_STORE)
          writeStore.put(new Date().toISOString(), 'timestamp')

          writeTx.oncomplete = () => {
            db.close()
            resolve({ survived: previousTimestamp !== null, previousTimestamp })
          }
          writeTx.onerror = () => {
            db.close()
            resolve({ survived: previousTimestamp !== null, previousTimestamp })
          }
        }

        getReq.onerror = () => {
          db.close()
          resolve({ survived: false, previousTimestamp: null })
        }
      }

      request.onerror = () => {
        resolve({ survived: false, previousTimestamp: null })
      }
    } catch {
      resolve({ survived: false, previousTimestamp: null })
    }
  })
}

/**
 * Get previous installation info from localStorage for a specific inbox
 * Uses per-inbox keys so multi-user doesn't cause false "new installation" warnings
 */
function getPreviousInstallationInfo(inboxId?: string): {
  installationId: string | null
  inboxId: string | null
  env: string | null
} {
  // If we have an inbox ID, use per-inbox keys
  if (inboxId) {
    return {
      installationId: localStorage.getItem(getPerInboxKey(LAST_INSTALLATION_ID_KEY, inboxId)),
      inboxId: inboxId,
      env: localStorage.getItem(getPerInboxKey(LAST_ENV_KEY, inboxId))
    }
  }
  // Fallback to global keys for startup diagnostics (before we know the inbox)
  return {
    installationId: localStorage.getItem(LAST_INSTALLATION_ID_KEY),
    inboxId: localStorage.getItem(LAST_INBOX_ID_KEY),
    env: localStorage.getItem(LAST_ENV_KEY)
  }
}

/**
 * Save current installation info to localStorage (both per-inbox and global)
 */
function saveInstallationInfo(installationId: string, inboxId: string): void {
  // Save per-inbox (for accurate multi-user tracking)
  localStorage.setItem(getPerInboxKey(LAST_INSTALLATION_ID_KEY, inboxId), installationId)
  localStorage.setItem(getPerInboxKey(LAST_ENV_KEY, inboxId), XMTP_ENV)

  // Also save global (for startup diagnostics before we know the inbox)
  localStorage.setItem(LAST_INSTALLATION_ID_KEY, installationId)
  localStorage.setItem(LAST_INBOX_ID_KEY, inboxId)
  localStorage.setItem(LAST_ENV_KEY, XMTP_ENV)
}

/**
 * Log installation diagnostics to console and localStorage history
 */
function logInstallationDiagnostics(diagnostics: InstallationDiagnostics): void {
  const prefix = diagnostics.isNewInstallation
    ? '🚨 NEW XMTP INSTALLATION CREATED'
    : '✅ XMTP INSTALLATION REUSED (this is normal)'

  verboseGroup(prefix)
  verboseLog('Timestamp:', diagnostics.timestamp)
  verboseLog('Installation ID:', diagnostics.installationId)
  verboseLog('Inbox ID:', diagnostics.inboxId)
  verboseLog('Environment:', diagnostics.env)

  if (diagnostics.isNewInstallation) {
    verboseWarn('⚠️ REASON:', diagnostics.reason)
    verboseLog('Details:', diagnostics.details)

    // Extra warning for common issues
    if (diagnostics.details.previousEnv && diagnostics.details.previousEnv !== diagnostics.env) {
      verboseError(
        `🔴 ENVIRONMENT MISMATCH: Was "${diagnostics.details.previousEnv}", now "${diagnostics.env}". ` +
        'This creates a new installation and loses conversation history!'
      )
    }
    if (!diagnostics.details.indexedDbExists) {
      verboseError(
        '🔴 INDEXEDDB MISSING: No existing database found. ' +
        'This could be due to browser data clearing or first run in this environment.'
      )
    }
  } else {
    verboseLog('👍 Conversation history preserved - same installation as before')
  }
  verboseGroupEnd()

  // Save to history (keep last 20 entries)
  try {
    const historyJson = localStorage.getItem(INSTALLATION_HISTORY_KEY)
    const history: InstallationDiagnostics[] = historyJson ? JSON.parse(historyJson) : []
    history.unshift(diagnostics)
    if (history.length > 20) history.pop()
    localStorage.setItem(INSTALLATION_HISTORY_KEY, JSON.stringify(history))
  } catch (error) {
    verboseWarn('Could not save installation history:', error)
  }
}

/**
 * Get installation history for debugging
 */
export function getInstallationHistory(): InstallationDiagnostics[] {
  try {
    const historyJson = localStorage.getItem(INSTALLATION_HISTORY_KEY)
    return historyJson ? JSON.parse(historyJson) : []
  } catch {
    return []
  }
}

/**
 * Print installation history to console (call from dev tools)
 */
export function printInstallationHistory(): void {
  const history = getInstallationHistory()
  console.group('XMTP Installation History')
  if (history.length === 0) {
    console.log('No installation history found')
  } else {
    history.forEach((entry, index) => {
      const icon = entry.isNewInstallation ? '🚨' : '✅'
      console.group(`${icon} ${index + 1}. ${entry.timestamp}`)
      console.log('Installation ID:', entry.installationId)
      console.log('Inbox ID:', entry.inboxId)
      console.log('Environment:', entry.env)
      console.log('New Installation:', entry.isNewInstallation)
      if (entry.isNewInstallation) {
        console.log('Reason:', entry.reason)
        console.log('Details:', entry.details)
      }
      console.groupEnd()
    })
  }
  console.groupEnd()
}

/**
 * Check if the previous session ended gracefully
 */
function checkPreviousSessionState(): { wasActive: boolean; startTime: string | null } {
  const wasActive = localStorage.getItem(SESSION_ACTIVE_KEY) === 'true'
  const startTime = localStorage.getItem(SESSION_START_KEY)
  return { wasActive, startTime }
}

/**
 * Mark session as active (called on init)
 */
function markSessionActive(): void {
  localStorage.setItem(SESSION_ACTIVE_KEY, 'true')
  localStorage.setItem(SESSION_START_KEY, new Date().toISOString())
}

/**
 * Mark session as cleanly ended (called on disconnect)
 */
function markSessionEnded(): void {
  localStorage.setItem(SESSION_ACTIVE_KEY, 'false')
}

/**
 * Log startup diagnostics - call this early in app startup.
 * Now checks OPFS, localStorage persistence, storage quotas, and main process info.
 */
export async function logStartupDiagnostics(): Promise<void> {
  const previousSession = checkPreviousSessionState()
  const previousInfo = getPreviousInstallationInfo()
  const currentOrigin = typeof window !== 'undefined' ? window.location.origin : 'unknown'
  const previousOrigin = localStorage.getItem(LAST_ORIGIN_KEY)

  // Save current origin for next comparison
  localStorage.setItem(LAST_ORIGIN_KEY, currentOrigin)

  // ── Section 1: Basic info (verbose — detail only needed for debugging) ──
  verboseGroup('XMTP STARTUP DIAGNOSTICS')
  verboseLog('Timestamp:', new Date().toISOString())
  verboseLog('Environment:', XMTP_ENV)
  verboseLog('Build mode:', import.meta.env.MODE)
  verboseLog('Current origin:', currentOrigin)
  verboseLog('Current URL:', typeof window !== 'undefined' ? window.location.href : 'unknown')
  verboseLog('Previous origin:', previousOrigin || 'none (FIRST LAUNCH OR STORAGE WIPED)')

  // ── Section 2: Persistence checks (always log — critical for diagnosing issues) ──
  const persistenceCheck = checkLocalStoragePersistence()
  if (!persistenceCheck.survived) {
    console.error('[xmtp] localStorage DID NOT SURVIVE from previous session')
  }

  const idbCheck = await checkIndexedDbPersistence()
  if (!idbCheck.survived) {
    console.error('[xmtp] IndexedDB DID NOT SURVIVE from previous session')
  }

  const opfsCheck = await checkOpfsPersistence()
  if (opfsCheck.writeError) {
    console.error('[xmtp] OPFS WRITE FAILED:', opfsCheck.writeError)
  } else if (!opfsCheck.survived) {
    verboseLog('[xmtp] OPFS marker did not survive (first launch or data lost)')
  }

  // Log summary line always (one line, not a wall of text)
  const ls = persistenceCheck.survived ? 'OK' : 'LOST'
  const idb = idbCheck.survived ? 'OK' : 'LOST'
  const opfs = opfsCheck.writeError ? 'ERROR' : opfsCheck.survived ? 'OK' : 'NEW'
  console.log(`[xmtp] Storage persistence: localStorage=${ls} IndexedDB=${idb} OPFS=${opfs}`)

  // ── Section 3: Origin change (always log — this causes data loss) ──
  if (previousOrigin && previousOrigin !== currentOrigin) {
    console.error('[xmtp] ORIGIN CHANGED:', previousOrigin, '->', currentOrigin, '— storage will be lost!')
  }

  // ── Section 4+: Detailed info (verbose only) ──
  const opfsResult = await checkOpfsFiles()
  if (opfsResult.available && opfsResult.files.length > 0) {
    verboseLog('OPFS files:', opfsResult.files.join(', '))
  }

  try {
    const databases = await indexedDB.databases()
    verboseLog('IndexedDB databases:', databases.map(db => `${db.name} (v${db.version})`).join(', ') || 'none')
  } catch {
    // ignore
  }

  const storageInfo = await checkStoragePersistence()
  verboseLog('Storage persisted:', storageInfo.persisted)
  if (storageInfo.estimate) {
    verboseLog(`Storage usage: ${(storageInfo.estimate.usage / 1024 / 1024).toFixed(1)} MB / ${(storageInfo.estimate.quota / 1024 / 1024).toFixed(0)} MB`)
  }

  try {
    const diag = await window.electronAPI?.getStorageDiagnostics?.()
    if (diag) {
      verboseLog('userData:', diag.userDataPath)
      verboseLog('Electron:', diag.electronVersion, '/ Chromium:', diag.chromiumVersion)
      verboseLog('Secure storage files:', diag.secureStorageFiles.length > 0
        ? diag.secureStorageFiles.join(', ')
        : 'NONE')
    }
  } catch {
    // ignore
  }

  if (previousSession.wasActive) {
    verboseWarn('Previous session did not end gracefully (started:', previousSession.startTime, ')')
  }

  verboseLog('Previous installation:', previousInfo.installationId?.slice(0, 16) + '...' || 'none')
  verboseLog('Previous inbox:', previousInfo.inboxId?.slice(0, 16) + '...' || 'none')
  verboseLog('Previous env:', previousInfo.env || 'none')

  if (previousInfo.env && previousInfo.env !== XMTP_ENV) {
    console.error('[xmtp] Environment mismatch:', previousInfo.env, '->', XMTP_ENV)
  }

  verboseGroupEnd()
}

// Expose to window for easy debugging
if (typeof window !== 'undefined') {
  (window as unknown as {
    xmtpDiagnostics: {
      getHistory: typeof getInstallationHistory
      printHistory: typeof printInstallationHistory
      logStartup: typeof logStartupDiagnostics
      checkOpfs: typeof checkOpfsFiles
      checkOpfsPersistence: typeof checkOpfsPersistence
      checkPersistence: typeof checkStoragePersistence
    }
  }).xmtpDiagnostics = {
    getHistory: getInstallationHistory,
    printHistory: printInstallationHistory,
    logStartup: logStartupDiagnostics,
    checkOpfs: checkOpfsFiles,
    checkOpfsPersistence: checkOpfsPersistence,
    checkPersistence: checkStoragePersistence
  }

  // Try to mark session as ended on window close
  // This won't work for hard kills but helps with normal closes
  window.addEventListener('beforeunload', () => {
    verboseLog('🔌 BEFOREUNLOAD: Marking session as ended')
    markSessionEnded()
  })

  // Also listen for visibility change to hidden (app backgrounded/closed)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      // Don't mark as ended yet, just log
      verboseLog('👁️ VISIBILITY: App hidden/backgrounded')
    }
  })
}

// The SDK uses different types for Group and DM conversations
type XMTPConversation = Group | Dm

export type MessageCallback = (message: DecodedMessage) => void
export type ConversationCallback = (conversation: XMTPConversation) => void

// Reconnection delay when a stream ends unexpectedly
const STREAM_RECONNECT_DELAY_MS = 5000

class XMTPService {
  private client: Client | null = null
  private messageStream: AsyncStreamProxy<DecodedMessage> | null = null
  private conversationStream: AsyncStreamProxy<XMTPConversation> | null = null
  private streamingEnabled = false
  private messageCallback: MessageCallback | null = null
  private conversationCallback: ConversationCallback | null = null
  private reconnectTimeouts: Map<'message' | 'conversation', ReturnType<typeof setTimeout>> = new Map()

  async init(signer: Signer): Promise<Client> {
    verboseLog('XMTPService.init: Creating client with signer...')
    const signerIdentifierResult = signer.getIdentifier()
    // Handle both sync and async getIdentifier
    const signerIdentifier = signerIdentifierResult instanceof Promise
      ? await signerIdentifierResult
      : signerIdentifierResult
    verboseLog('Signer identifier:', signerIdentifier)

    // Gather pre-creation diagnostics (we don't know inbox ID yet)
    const indexedDbInfo = await checkIndexedDbExists()
    const signerAddress = signerIdentifier.identifier

    verboseLog('Pre-creation diagnostics:', {
      currentEnv: XMTP_ENV,
      indexedDbExists: indexedDbInfo.exists,
      indexedDbName: indexedDbInfo.dbName
    })

    try {
      // Use default dbPath which persists in IndexedDB.
      // The browser-sdk stores the database in IndexedDB automatically.
      // This ensures the same installation is reused across app restarts,
      // avoiding the 10-installation limit per inbox.
      this.client = await Client.create(signer, {
        env: XMTP_ENV
      })

      const newInstallationId = this.client.installationId ?? 'unknown'
      const newInboxId = this.client.inboxId ?? 'unknown'

      // Now that we know the inbox ID, get per-inbox previous info
      // This ensures switching users doesn't cause false "new installation" warnings
      const previousInfo = getPreviousInstallationInfo(newInboxId)

      // Determine if this is a new installation and why
      let isNewInstallation = false
      let reason = 'Installation reused successfully'

      if (!previousInfo.installationId) {
        isNewInstallation = true
        reason = 'First installation for this inbox (no previous installation recorded)'
      } else if (previousInfo.installationId !== newInstallationId) {
        isNewInstallation = true

        // Determine the reason
        if (previousInfo.env !== XMTP_ENV) {
          reason = `Environment changed from "${previousInfo.env}" to "${XMTP_ENV}"`
        } else if (!indexedDbInfo.exists) {
          reason = 'IndexedDB database was missing (cleared or first run in this env)'
        } else {
          reason = 'Installation ID changed for unknown reason (SDK created new installation)'
        }
      }

      // Log diagnostics
      const diagnostics: InstallationDiagnostics = {
        timestamp: new Date().toISOString(),
        installationId: newInstallationId,
        inboxId: newInboxId,
        env: XMTP_ENV,
        isNewInstallation,
        reason,
        details: {
          previousInstallationId: previousInfo.installationId,
          previousInboxId: previousInfo.inboxId,
          previousEnv: previousInfo.env,
          indexedDbExists: indexedDbInfo.exists,
          indexedDbName: indexedDbInfo.dbName,
          privateKeyExists: true, // We got here, so key exists
          signerAddress
        }
      }

      logInstallationDiagnostics(diagnostics)

      // Verify OPFS has the database file after client creation
      const expectedDbFile = `xmtp-${XMTP_ENV}-${newInboxId}.db3`
      const postConnectOpfs = await checkOpfsFiles()
      if (postConnectOpfs.available) {
        const hasDb = postConnectOpfs.files.some(f => f === expectedDbFile)
        if (hasDb) {
          verboseLog(`OPFS: Database file confirmed: ${expectedDbFile}`)
        } else {
          verboseWarn(`OPFS: Expected "${expectedDbFile}" not found. Files:`,
            postConnectOpfs.files.length > 0 ? postConnectOpfs.files.join(', ') : 'NONE')
        }
      } else {
        console.error('[xmtp] OPFS not available after client creation:', postConnectOpfs.error)
      }

      // Save current installation info for next comparison
      saveInstallationInfo(newInstallationId, newInboxId)

      // Mark session as active for crash detection
      markSessionActive()

      return this.client
    } catch (error) {
      verboseError('XMTPService.init: Client creation failed:', error)
      verboseError('Error type:', error?.constructor?.name)
      verboseError('Error message:', error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  getClient(): Client | null {
    return this.client
  }

  getInboxId(): string | undefined {
    return this.client?.inboxId
  }

  getAccountIdentifier(): Identifier | undefined {
    return this.client?.accountIdentifier
  }

  async getConversations(): Promise<XMTPConversation[]> {
    if (!this.client) throw new Error('XMTP client not initialized')

    // Use syncAll() instead of sync() to ensure we get:
    // - New welcomes (conversations created by others)
    // - Conversations synced from other installations of the same inbox
    // - Preference updates
    // Pass empty array to sync all consent states (allowed, unknown, denied)
    await this.client.conversations.syncAll([])
    const conversations = await this.client.conversations.list()
    return conversations
  }

  async createDm(peerInboxId: string): Promise<XMTPConversation> {
    if (!this.client) throw new Error('XMTP client not initialized')

    const conversation = await this.client.conversations.createDm(peerInboxId)
    return conversation
  }

  async createDmByAddress(peerAddress: string): Promise<XMTPConversation> {
    if (!this.client) throw new Error('XMTP client not initialized')

    const identifier: Identifier = {
      identifier: peerAddress.toLowerCase(),
      identifierKind: IdentifierKind.Ethereum
    }

    // Check if they can receive messages
    const canMessageResult = await Client.canMessage([identifier], XMTP_ENV)
    if (!canMessageResult.get(peerAddress.toLowerCase())) {
      throw new Error('Peer is not registered on XMTP')
    }

    // Create DM by identifier
    const conversation = await this.client.conversations.createDmWithIdentifier(identifier)
    return conversation
  }

  async createGroup(
    memberInboxIds: string[],
    options?: { name?: string; description?: string }
  ): Promise<XMTPConversation> {
    if (!this.client) throw new Error('XMTP client not initialized')

    const conversation = await this.client.conversations.createGroup(memberInboxIds, {
      groupName: options?.name,
      groupDescription: options?.description
    })

    return conversation
  }

  async getConversation(conversationId: string): Promise<XMTPConversation | undefined> {
    if (!this.client) throw new Error('XMTP client not initialized')

    const conversation = await this.client.conversations.getConversationById(conversationId)
    return conversation
  }

  async getMessages(conversation: XMTPConversation): Promise<DecodedMessage[]> {
    // Try to sync, but don't fail if sync has issues (e.g., forward secrecy errors)
    // Messages that were already received via stream will still be in the local DB
    try {
      await conversation.sync()
    } catch (syncError) {
      verboseWarn('Conversation sync had issues, loading existing messages:', syncError)
    }
    const messages = await conversation.messages()
    return messages
  }

  async sendMessage(conversation: XMTPConversation, content: string): Promise<string> {
    const messageId = await conversation.sendText(content)
    await conversation.publishMessages()
    return messageId
  }

  /**
   * Start streaming messages. Automatically reconnects if the stream ends unexpectedly.
   */
  async streamMessages(callback: MessageCallback): Promise<void> {
    if (!this.client) throw new Error('XMTP client not initialized')

    // Stop existing stream if any
    await this.stopStream('message')

    this.messageCallback = callback
    this.streamingEnabled = true
    await this.runMessageStream()
  }

  /**
   * Start streaming conversations (welcomes). Automatically reconnects if the stream ends unexpectedly.
   */
  async streamConversations(callback: ConversationCallback): Promise<void> {
    if (!this.client) throw new Error('XMTP client not initialized')

    // Stop existing stream if any
    await this.stopStream('conversation')

    this.conversationCallback = callback
    this.streamingEnabled = true
    await this.runConversationStream()
  }

  /**
   * Stop all streams and disable auto-reconnection.
   */
  async stopStreaming(): Promise<void> {
    // Disable streaming first to prevent onEnd callbacks from scheduling reconnects
    this.streamingEnabled = false
    this.messageCallback = null
    this.conversationCallback = null

    // Clear any pending reconnect timeouts
    this.reconnectTimeouts.forEach(clearTimeout)
    this.reconnectTimeouts.clear()

    await Promise.all([this.stopStream('message'), this.stopStream('conversation')])
  }

  /**
   * Internal: Stop a specific stream.
   */
  private async stopStream(type: 'message' | 'conversation'): Promise<void> {
    const stream = type === 'message' ? this.messageStream : this.conversationStream

    if (stream && !stream.isDone) {
      await stream.end()
    }

    if (type === 'message') {
      this.messageStream = null
    } else {
      this.conversationStream = null
    }
  }

  /**
   * Internal: Run the message stream with error handling and reconnection.
   */
  private async runMessageStream(): Promise<void> {
    if (!this.client || !this.streamingEnabled || !this.messageCallback) return

    const callback = this.messageCallback

    try {
      // Stream messages for allowed and unknown consent states
      // This ensures we see new message requests while filtering out denied/spam
      const stream = await this.client.conversations.streamAllMessages({
        consentStates: [ConsentState.Allowed, ConsentState.Unknown],
        onError: (error) => verboseError('Message stream error:', error),
        onEnd: () => {
          verboseLog('Message stream ended')
          this.scheduleReconnect('message')
        }
      })

      this.messageStream = stream

      for await (const message of stream) {
        if (stream.isDone || !this.streamingEnabled) break
        callback(message)
      }
    } catch (error) {
      verboseError('Message stream iteration error:', error)
      this.scheduleReconnect('message')
    }
  }

  /**
   * Internal: Run the conversation stream with error handling and reconnection.
   */
  private async runConversationStream(): Promise<void> {
    if (!this.client || !this.streamingEnabled || !this.conversationCallback) return

    const callback = this.conversationCallback

    try {
      const stream = await this.client.conversations.stream({
        onError: (error) => verboseError('Conversation stream error:', error),
        onEnd: () => {
          verboseLog('Conversation stream ended')
          this.scheduleReconnect('conversation')
        }
      })

      this.conversationStream = stream

      for await (const conversation of stream) {
        if (stream.isDone || !this.streamingEnabled) break
        callback(conversation)
      }
    } catch (error) {
      verboseError('Conversation stream iteration error:', error)
      this.scheduleReconnect('conversation')
    }
  }

  /**
   * Internal: Schedule a stream reconnection after a delay.
   */
  private scheduleReconnect(type: 'message' | 'conversation'): void {
    if (!this.streamingEnabled || !this.client) return

    const callback = type === 'message' ? this.messageCallback : this.conversationCallback
    if (!callback) return

    // Clear any existing reconnect timeout for this stream type
    const existingTimeout = this.reconnectTimeouts.get(type)
    if (existingTimeout) clearTimeout(existingTimeout)

    verboseLog(`${type} stream ended unexpectedly, reconnecting in ${STREAM_RECONNECT_DELAY_MS / 1000}s...`)

    const timeoutId = setTimeout(() => {
      this.reconnectTimeouts.delete(type)

      if (!this.streamingEnabled || !this.client) return

      if (type === 'message' && this.messageCallback) {
        this.runMessageStream()
      } else if (type === 'conversation' && this.conversationCallback) {
        this.runConversationStream()
      }
    }, STREAM_RECONNECT_DELAY_MS)

    this.reconnectTimeouts.set(type, timeoutId)
  }

  async canMessage(addresses: string[]): Promise<Map<string, boolean>> {
    const identifiers: Identifier[] = addresses.map((addr) => ({
      identifier: addr.toLowerCase(),
      identifierKind: IdentifierKind.Ethereum
    }))

    return Client.canMessage(identifiers, XMTP_ENV)
  }

  async findInboxIdByAddress(address: string): Promise<string | null> {
    if (!this.client) throw new Error('XMTP client not initialized')

    const identifier: Identifier = {
      identifier: address.toLowerCase(),
      identifierKind: IdentifierKind.Ethereum
    }

    const inboxId = await this.client.fetchInboxIdByIdentifier(identifier)
    return inboxId || null
  }

  async getMembers(conversation: XMTPConversation): Promise<GroupMember[]> {
    return conversation.members()
  }

  isGroup(conversation: XMTPConversation): conversation is Group {
    // Use the SDK's native conversationType from metadata
    return conversation.metadata?.conversationType === ConversationType.Group
  }

  getGroupName(conversation: XMTPConversation): string | undefined {
    if (this.isGroup(conversation)) {
      return conversation.name
    }
    return undefined
  }

  getGroupDescription(conversation: XMTPConversation): string | undefined {
    if (this.isGroup(conversation)) {
      return conversation.description
    }
    return undefined
  }

  getGroupImageUrl(conversation: XMTPConversation): string | undefined {
    if (this.isGroup(conversation)) {
      return conversation.imageUrl
    }
    return undefined
  }

  // Group admin methods

  async updateGroupName(group: Group, name: string): Promise<void> {
    await group.updateName(name)
  }

  async updateGroupDescription(group: Group, description: string): Promise<void> {
    await group.updateDescription(description)
  }

  async updateGroupImageUrl(group: Group, imageUrl: string): Promise<void> {
    await group.updateImageUrl(imageUrl)
  }

  async addGroupMembers(group: Group, inboxIds: string[]): Promise<void> {
    await group.addMembers(inboxIds)
  }

  async removeGroupMembers(group: Group, inboxIds: string[]): Promise<void> {
    await group.removeMembers(inboxIds)
  }

  async addGroupAdmin(group: Group, inboxId: string): Promise<void> {
    await group.addAdmin(inboxId)
  }

  async removeGroupAdmin(group: Group, inboxId: string): Promise<void> {
    await group.removeAdmin(inboxId)
  }

  async addGroupSuperAdmin(group: Group, inboxId: string): Promise<void> {
    await group.addSuperAdmin(inboxId)
  }

  async removeGroupSuperAdmin(group: Group, inboxId: string): Promise<void> {
    await group.removeSuperAdmin(inboxId)
  }

  async getGroupAdmins(group: Group): Promise<string[]> {
    return group.listAdmins()
  }

  async getGroupSuperAdmins(group: Group): Promise<string[]> {
    return group.listSuperAdmins()
  }

  async isGroupAdmin(group: Group, inboxId: string): Promise<boolean> {
    return group.isAdmin(inboxId)
  }

  async isGroupSuperAdmin(group: Group, inboxId: string): Promise<boolean> {
    return group.isSuperAdmin(inboxId)
  }

  async disconnect(): Promise<void> {
    verboseLog('🔌 XMTP DISCONNECT: Graceful shutdown initiated')
    await this.stopStreaming()
    if (this.client) {
      this.client.close()
    }
    this.client = null
    // Mark session as cleanly ended
    markSessionEnded()
    verboseLog('🔌 XMTP DISCONNECT: Session marked as ended gracefully')
  }

  /**
   * Get the current installation ID
   */
  getInstallationId(): string | undefined {
    return this.client?.installationId
  }

  /**
   * Get the number of active installations for the current inbox.
   * XMTP has a limit of 10 installations per inbox.
   */
  async getInstallationCount(): Promise<number> {
    if (!this.client?.inboxId) return 0

    try {
      const inboxStates = await Client.fetchInboxStates([this.client.inboxId], XMTP_ENV)
      if (!inboxStates || inboxStates.length === 0) {
        return 0
      }
      return inboxStates[0].installations.length
    } catch (error) {
      verboseError('Failed to get installation count:', error)
      return 0
    }
  }

  /**
   * Revoke all other installations except the current one.
   * Use this if you've hit the 10-installation limit.
   */
  async revokeAllOtherInstallations(): Promise<void> {
    if (!this.client) {
      throw new Error('XMTP client not initialized')
    }

    verboseLog('Revoking all other installations...')
    await this.client.revokeAllOtherInstallations()
    verboseLog('All other installations revoked')
  }

  async setConsentState(conversationId: string, state: ConsentState): Promise<void> {
    const conv = await this.getConversation(conversationId)
    if (!conv) throw new Error('Conversation not found')
    await conv.updateConsentState(state)
  }
}

export const xmtpService = new XMTPService()
export type { XMTPConversation, GroupMember }
export { Client, ConsentState }

/**
 * Convert base64 string to Uint8Array (browser-compatible)
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

/**
 * Result of inbox ownership verification.
 * - { verified: true } - Signature verified by an installation
 * - { verified: false, definitive: true } - Signature definitively invalid (inbox found, no installation verified it)
 * - { verified: false, definitive: false } - Couldn't verify due to network/other errors
 */
export type VerifyInboxOwnershipResult = { verified: true } | { verified: false; definitive: boolean }

/**
 * Verify that a signature was created by an installation key belonging to the given inbox.
 * Used to verify the cryptographic binding between a Bluesky DID and XMTP inbox.
 * Uses static verification - no client instance required.
 */
export async function verifyInboxOwnership(
  inboxId: string,
  did: string,
  signature: string
): Promise<VerifyInboxOwnershipResult> {
  verboseLog('Verifying inbox ownership:', { inboxId: inboxId.slice(0, 16) + '...', did })

  try {
    const inboxStates = await Client.fetchInboxStates([inboxId], XMTP_ENV)
    if (!inboxStates || inboxStates.length === 0) {
      // Inbox doesn't exist on this XMTP network - this is a definitive failure
      // Common causes: inbox was deleted, or ATProto record points to wrong env (dev vs prod)
      console.warn(`[xmtp] Inbox ${inboxId.slice(0, 16)}... not found on ${XMTP_ENV} network`)
      return { verified: false, definitive: true }
    }

    const inboxState = inboxStates[0]
    const signatureBytes = base64ToUint8Array(signature)
    verboseLog(`Checking ${inboxState.installations.length} installations for valid signature`)

    // Check if any installation key in the inbox can verify the signature
    for (let i = 0; i < inboxState.installations.length; i++) {
      const installation = inboxState.installations[i]
      try {
        // Use static verification from wasm-bindings (throws on invalid)
        verifySignedWithPublicKeyBinding(did, signatureBytes, installation.bytes)
        verboseLog(`Signature verified by installation ${i}`)
        return { verified: true }
      } catch {
        // Signature didn't match this installation, try next
      }
    }
    // We successfully fetched inbox state but no installation verified the signature
    // This is a definitive verification failure
    verboseWarn('No installation could verify the signature')
    return { verified: false, definitive: true }
  } catch (error) {
    // Network or other error - not a definitive failure
    verboseError('Error verifying inbox ownership:', error)
    return { verified: false, definitive: false }
  }
}
