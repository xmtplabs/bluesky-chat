/**
 * Password-based encryption/decryption using Web Crypto API
 * Uses PBKDF2 for key derivation and AES-GCM for encryption
 */

const PBKDF2_ITERATIONS = 100000
const SALT_LENGTH = 16
const IV_LENGTH = 12

/**
 * Encrypt data with a password using PBKDF2 + AES-GCM
 * Returns base64-encoded string containing salt + iv + ciphertext
 */
export async function encryptWithPassword(data: string, password: string): Promise<string> {
  const encoder = new TextEncoder()
  const dataBytes = encoder.encode(data)
  const passwordBytes = encoder.encode(password)

  // Generate random salt and IV
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH))
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))

  // Derive key from password using PBKDF2
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordBytes,
    'PBKDF2',
    false,
    ['deriveKey']
  )

  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  )

  // Encrypt the data
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    dataBytes
  )

  // Combine salt + iv + ciphertext
  const combined = new Uint8Array(SALT_LENGTH + IV_LENGTH + encrypted.byteLength)
  combined.set(salt, 0)
  combined.set(iv, SALT_LENGTH)
  combined.set(new Uint8Array(encrypted), SALT_LENGTH + IV_LENGTH)

  // Return as base64
  return btoa(String.fromCharCode(...combined))
}

/**
 * Decrypt data that was encrypted with encryptWithPassword
 * Takes base64-encoded string, returns original plaintext
 */
export async function decryptWithPassword(encryptedBase64: string, password: string): Promise<string> {
  const encoder = new TextEncoder()
  const passwordBytes = encoder.encode(password)

  // Decode base64
  const combined = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0))

  // Extract salt, iv, and ciphertext
  const salt = combined.slice(0, SALT_LENGTH)
  const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH)
  const ciphertext = combined.slice(SALT_LENGTH + IV_LENGTH)

  // Derive key from password using PBKDF2
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    passwordBytes,
    'PBKDF2',
    false,
    ['deriveKey']
  )

  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  )

  // Decrypt the data
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  )

  // Return as string
  const decoder = new TextDecoder()
  return decoder.decode(decrypted)
}
