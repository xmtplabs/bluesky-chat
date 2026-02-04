/**
 * Utility script to manage XMTP installations.
 * Run from browser dev console after the app loads:
 *
 *   import('/src/utils/revoke-installations.ts').then(m => m.checkInstallations())
 *   import('/src/utils/revoke-installations.ts').then(m => m.revokeAllInstallations())
 */

import { Client, type Signer, IdentifierKind } from '@xmtp/browser-sdk'
import { privateKeyToAccount } from 'viem/accounts'
import { toBytes, type Hex } from 'viem'
import { platform } from '../platform'

const WALLET_KEY = 'xmtp-wallet-private-key'
const ENV = 'production' as const

async function getPrivateKey(): Promise<Hex | null> {
  const key = await platform.secureRetrieve(WALLET_KEY)
  return key as Hex | null
}

function createSigner(privateKey: Hex): Signer {
  const account = privateKeyToAccount(privateKey)

  return {
    type: 'EOA',
    getIdentifier: () => ({
      identifier: account.address.toLowerCase(),
      identifierKind: IdentifierKind.Ethereum
    }),
    signMessage: async (message: string): Promise<Uint8Array> => {
      const signature = await account.signMessage({ message })
      return toBytes(signature)
    }
  }
}

/**
 * Get inbox ID without creating a new installation
 * Uses the static canMessage method which doesn't register
 */
async function getInboxIdFromAddress(address: string): Promise<string | null> {
  // We need to fetch the inbox ID for this address
  // The only way without creating a client is to use an existing client or fetch from network
  // For now, we'll need to create a client with dbPath: null (in-memory)
  // This might fail if we're at the limit, but it's worth trying
  return null
}

/**
 * Check current installation count and list all installations
 * This version uses static methods that don't require creating a client
 */
export async function checkInstallations(): Promise<void> {
  console.log('🔍 Checking XMTP installations...\n')

  const privateKey = await getPrivateKey()
  if (!privateKey) {
    console.error('❌ No private key found in secure storage')
    return
  }

  const signer = createSigner(privateKey)
  const identifierResult = signer.getIdentifier()
  const identifier =
    identifierResult instanceof Promise ? await identifierResult : identifierResult
  console.log('📧 Address:', identifier.identifier)

  // Try to get inbox ID from existing database first
  // Check IndexedDB for existing XMTP databases
  const databases = await indexedDB.databases()
  const xmtpDb = databases.find((db) => db.name?.startsWith('xmtp-production-'))
  if (xmtpDb?.name) {
    const inboxId = xmtpDb.name.replace('xmtp-production-', '').replace('.db3', '')
    console.log('📥 Found existing inbox ID from DB:', inboxId)

    // Fetch inbox state using static method with explicit environment
    try {
      const inboxStates = await Client.fetchInboxStates([inboxId], ENV)
      if (inboxStates && inboxStates.length > 0) {
        const state = inboxStates[0]
        const installations = state.installations

        console.log(`\n📊 Active installations: ${installations.length}/10\n`)

        installations.forEach((inst, i) => {
          const idHex = Array.from(inst.bytes.slice(0, 8))
            .map((b) => b.toString(16).padStart(2, '0'))
            .join('')
          console.log(`  ${i + 1}. Installation: ${idHex}...`)
        })

        if (installations.length >= 10) {
          console.log('\n⚠️  You have hit the installation limit!')
          console.log('   Run revokeAllInstallations() to clear them.')
        }

        console.log('\n✅ Done')
        return
      }
    } catch (error) {
      console.error('Failed to fetch inbox state:', error)
    }
  }

  console.log('⚠️ No existing database found, need to create client...')
  console.log('   If you are at the limit, use revokeAllInstallations() instead.')
}

/**
 * Revoke ALL installations using static method (doesn't require creating a client)
 * Use this when you've hit the installation limit and can't create a new client
 */
export async function revokeAllInstallations(): Promise<void> {
  console.log('🗑️  Revoking ALL XMTP installations...\n')

  const privateKey = await getPrivateKey()
  if (!privateKey) {
    console.error('❌ No private key found in secure storage')
    return
  }

  const signer = createSigner(privateKey)
  const identifierResult = signer.getIdentifier()
  const identifier =
    identifierResult instanceof Promise ? await identifierResult : identifierResult
  console.log('📧 Address:', identifier.identifier)

  // Try to get inbox ID from existing database
  const databases = await indexedDB.databases()
  const xmtpDb = databases.find((db) => db.name?.startsWith('xmtp-production-'))

  let inboxId: string | null = null

  if (xmtpDb?.name) {
    inboxId = xmtpDb.name.replace('xmtp-production-', '').replace('.db3', '')
    console.log('📥 Found existing inbox ID from DB:', inboxId)
  } else {
    // Need to query the network for the inbox ID
    console.log('🔄 No local DB found, querying network for inbox ID...')
    try {
      // Create minimal client just to get inbox ID
      const tempClient = await Client.create(signer, {
        env: ENV,
        dbPath: null
      })
      inboxId = tempClient.inboxId ?? null
      tempClient.close()
    } catch (error) {
      console.error('❌ Cannot determine inbox ID:', error)
      console.log('\n💡 Try providing your inbox ID manually:')
      console.log('   revokeAllInstallationsForInbox("your-inbox-id")')
      return
    }
  }

  if (!inboxId) {
    console.error('❌ Could not determine inbox ID')
    return
  }

  console.log('📥 Inbox ID:', inboxId)

  // Fetch all installations using static method with explicit environment
  console.log('🔄 Fetching installations...')
  const inboxStates = await Client.fetchInboxStates([inboxId], ENV)
  if (!inboxStates || inboxStates.length === 0) {
    console.log('❌ No inbox state found')
    return
  }

  const installations = inboxStates[0].installations
  console.log(`📊 Found ${installations.length} installations to revoke`)

  if (installations.length === 0) {
    console.log('✅ No installations to revoke')
    return
  }

  // Revoke all installations using static method with explicit environment
  const installationBytes = installations.map((i) => i.bytes)

  console.log('🔄 Revoking installations...')
  await Client.revokeInstallations(signer, inboxId, installationBytes, ENV)

  console.log('\n✅ All installations revoked!')
  console.log('   Next login will create a fresh installation.')

  // Clean up local IndexedDB
  if (xmtpDb?.name) {
    console.log('🧹 Cleaning up local database...')
    indexedDB.deleteDatabase(xmtpDb.name)
    console.log('   Local database deleted.')
  }
}

/**
 * Revoke all installations for a specific inbox ID
 * Use this if automatic inbox ID detection fails
 */
export async function revokeAllInstallationsForInbox(inboxId: string): Promise<void> {
  console.log(`🗑️  Revoking ALL installations for inbox: ${inboxId}\n`)

  const privateKey = await getPrivateKey()
  if (!privateKey) {
    console.error('❌ No private key found in secure storage')
    return
  }

  const signer = createSigner(privateKey)

  // Fetch all installations
  console.log('🔄 Fetching installations...')
  const inboxStates = await Client.fetchInboxStates([inboxId], ENV)
  if (!inboxStates || inboxStates.length === 0) {
    console.log('❌ No inbox state found')
    return
  }

  const installations = inboxStates[0].installations
  console.log(`📊 Found ${installations.length} installations to revoke`)

  if (installations.length === 0) {
    console.log('✅ No installations to revoke')
    return
  }

  // Revoke all
  const installationBytes = installations.map((i) => i.bytes)
  console.log('🔄 Revoking installations...')
  await Client.revokeInstallations(signer, inboxId, installationBytes, ENV)

  console.log('\n✅ All installations revoked!')
}

/**
 * Keep current installation, revoke all others
 */
export async function revokeOtherInstallations(): Promise<void> {
  console.log('🗑️  Revoking other XMTP installations (keeping current)...\n')

  const privateKey = await getPrivateKey()
  if (!privateKey) {
    console.error('❌ No private key found in secure storage')
    return
  }

  const signer = createSigner(privateKey)
  const identifierResult = signer.getIdentifier()
  const identifier =
    identifierResult instanceof Promise ? await identifierResult : identifierResult
  console.log('📧 Address:', identifier.identifier)

  // Create client with persistent database
  console.log('🔄 Creating client...')
  const client = await Client.create(signer, {
    env: ENV
  })

  const inboxId = client.inboxId
  if (!inboxId) {
    console.error('❌ No inbox ID')
    client.close()
    return
  }

  console.log('📥 Inbox ID:', inboxId)
  console.log('🔑 Current Installation:', client.installationId)

  // Check count before
  const beforeStates = await Client.fetchInboxStates([inboxId], ENV)
  const beforeCount = beforeStates?.[0]?.installations.length ?? 0
  console.log(`📊 Installations before: ${beforeCount}`)

  // Revoke others
  console.log('🔄 Revoking other installations...')
  await client.revokeAllOtherInstallations()

  // Check count after
  const afterStates = await Client.fetchInboxStates([inboxId], ENV)
  const afterCount = afterStates?.[0]?.installations.length ?? 0
  console.log(`📊 Installations after: ${afterCount}`)

  client.close()
  console.log('\n✅ Done! Only current installation remains.')
}

// Export for console access (dev only)
if (import.meta.env.DEV) {
  ;(window as unknown as Record<string, unknown>).xmtpTools = {
    checkInstallations,
    revokeAllInstallations,
    revokeAllInstallationsForInbox,
    revokeOtherInstallations
  }

  console.log('🛠️  XMTP Tools loaded. Available commands:')
  console.log('   xmtpTools.checkInstallations()')
  console.log('   xmtpTools.revokeOtherInstallations()')
  console.log('   xmtpTools.revokeAllInstallations()')
  console.log('   xmtpTools.revokeAllInstallationsForInbox("inbox-id")')
}
