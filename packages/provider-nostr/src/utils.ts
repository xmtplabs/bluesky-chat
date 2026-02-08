import { nip19 } from 'nostr-tools'
import type { UserProfile } from '@bluesky-chat/provider-interface'

/**
 * Decode an npub or hex pubkey string into a normalized form.
 */
export function decodeNostrIdentity(
  input: string
): { type: 'npub' | 'hex'; pubkey: string } | null {
  if (!input) return null

  // Try npub decode
  if (input.startsWith('npub1')) {
    try {
      const decoded = nip19.decode(input)
      if (decoded.type === 'npub') {
        return { type: 'npub', pubkey: decoded.data as string }
      }
    } catch {
      return null
    }
  }

  // Try hex (64-char hex string)
  if (/^[0-9a-f]{64}$/i.test(input)) {
    return { type: 'hex', pubkey: input.toLowerCase() }
  }

  return null
}

/**
 * Convert hex pubkey to npub.
 */
export function hexToNpub(hex: string): string {
  return nip19.npubEncode(hex)
}

/**
 * Convert npub to hex pubkey.
 */
export function npubToHex(npub: string): string {
  const decoded = nip19.decode(npub)
  if (decoded.type !== 'npub') throw new Error(`Expected npub, got ${decoded.type}`)
  return decoded.data as string
}

/**
 * Parse kind 0 event content JSON into a UserProfile.
 */
export function parseKind0Content(content: string, hexPubkey: string): UserProfile {
  const npub = hexToNpub(hexPubkey)
  const truncatedNpub = npub.slice(0, 12) + '…'

  let metadata: Record<string, unknown>
  try {
    metadata = JSON.parse(content)
  } catch {
    return { id: npub, handle: truncatedNpub }
  }

  const name = typeof metadata.name === 'string' ? metadata.name : undefined
  const displayName = typeof metadata.display_name === 'string' ? metadata.display_name : undefined
  const nip05 = typeof metadata.nip05 === 'string' ? metadata.nip05 : undefined
  const handle = name || displayName || nip05 || truncatedNpub

  return {
    id: npub,
    handle,
    displayName: typeof metadata.display_name === 'string' ? metadata.display_name : undefined,
    avatar: typeof metadata.picture === 'string' ? metadata.picture : undefined,
    description: typeof metadata.about === 'string' ? metadata.about : undefined,
  }
}

/**
 * Extract the XMTP binding from a kind 0 event's content JSON.
 * Returns null if the xmtp field is missing or malformed.
 */
export function extractXmtpBinding(
  content: string
): { inboxId: string; verificationSignature: string; createdAt?: string } | null {
  let metadata: Record<string, unknown>
  try {
    metadata = JSON.parse(content)
  } catch {
    return null
  }

  const xmtp = metadata.xmtp
  if (!xmtp || typeof xmtp !== 'object') return null

  const binding = xmtp as Record<string, unknown>
  if (typeof binding.inboxId !== 'string' || typeof binding.verificationSignature !== 'string') {
    return null
  }

  return {
    inboxId: binding.inboxId,
    verificationSignature: binding.verificationSignature,
    createdAt: typeof binding.createdAt === 'string' ? binding.createdAt : undefined,
  }
}
