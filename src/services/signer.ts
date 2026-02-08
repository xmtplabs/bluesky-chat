import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts'
import { toBytes, type Hex } from 'viem'
import type { Signer, Identifier, Client } from '@xmtp/browser-sdk'
import { IdentifierKind } from '@xmtp/browser-sdk'
import { verboseLog, verboseWarn } from './xmtp'

const WALLET_KEY_PREFIX = 'xmtp-wallet-key-'

/**
 * Get the storage key for a specific identity ID.
 * Each identity gets its own XMTP identity.
 */
function getStorageKey(did: string): string {
  return `${WALLET_KEY_PREFIX}${did}`
}

/**
 * Get or create a private key for a specific identity ID.
 * Each DID has its own XMTP identity to prevent cross-account issues.
 */
export async function getOrCreatePrivateKey(did: string): Promise<Hex> {
  const storageKey = getStorageKey(did)

  // Try to retrieve existing key for this DID
  const existingKey = await window.electronAPI.secureRetrieve(storageKey)

  if (existingKey) {
    const address = getAddressFromPrivateKey(existingKey as Hex)
    verboseLog('🔑 XMTP Key: REUSING existing key for DID:', did)
    verboseLog('   Address:', address)
    return existingKey as Hex
  }

  // Generate new key for this DID
  verboseWarn('🆕 XMTP Key: CREATING NEW key for DID:', did)
  verboseWarn('   ⚠️ This will create a new XMTP installation!')
  const newKey = generatePrivateKey()
  const address = getAddressFromPrivateKey(newKey)
  verboseWarn('   New Address:', address)

  // Store securely with DID-specific key
  await window.electronAPI.secureStore(storageKey, newKey)

  return newKey
}

export function createXMTPSigner(privateKey: Hex): Signer {
  const account = privateKeyToAccount(privateKey)

  const accountIdentifier: Identifier = {
    identifier: account.address.toLowerCase(),
    identifierKind: IdentifierKind.Ethereum
  }

  return {
    type: 'EOA',
    getIdentifier: () => accountIdentifier,
    signMessage: async (message: string): Promise<Uint8Array> => {
      const signature = await account.signMessage({ message })
      return toBytes(signature)
    }
  }
}

export function getAddressFromPrivateKey(privateKey: Hex): string {
  const account = privateKeyToAccount(privateKey)
  return account.address.toLowerCase()
}

export async function exportPrivateKey(did: string): Promise<Hex | null> {
  const storageKey = getStorageKey(did)
  const key = await window.electronAPI.secureRetrieve(storageKey)
  return key as Hex | null
}

export async function importPrivateKey(did: string, privateKey: Hex): Promise<void> {
  // Validate the key by trying to create an account
  try {
    privateKeyToAccount(privateKey)
  } catch {
    throw new Error('Invalid private key')
  }

  const storageKey = getStorageKey(did)
  await window.electronAPI.secureStore(storageKey, privateKey)
}

export async function clearPrivateKey(did: string): Promise<void> {
  const storageKey = getStorageKey(did)
  await window.electronAPI.secureDelete(storageKey)
}

/**
 * Check if a private key exists for a specific identity ID.
 */
export async function hasExistingKey(did: string): Promise<boolean> {
  try {
    const storageKey = getStorageKey(did)
    const existingKey = await window.electronAPI.secureRetrieve(storageKey)
    return existingKey !== null
  } catch (err) {
    console.error('Failed to check for existing key:', err)
    return false
  }
}

/**
 * Convert Uint8Array to base64 string (browser-compatible)
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  const binary = Array.from(bytes, (b) => String.fromCharCode(b)).join('')
  return btoa(binary)
}

/**
 * Sign a DID using the XMTP client's installation key.
 * This creates the cryptographic binding between the identity ID and XMTP inbox.
 */
export async function signDidWithInstallationKey(client: Client, did: string): Promise<string> {
  const signatureBytes = await client.signWithInstallationKey(did)
  return uint8ArrayToBase64(signatureBytes)
}
