/**
 * Nostr identity provider.
 *
 * Validates npub/hex pubkeys and fetches XMTP inbox bindings from kind 0
 * metadata events on Nostr relays.
 */

import { bech32 } from '@scure/base'
import type { IdentityProviderService } from './identity'

const RELAYS = ['wss://relay.primal.net', 'wss://relay.damus.io']
const RELAY_TIMEOUT_MS = 8_000

/**
 * Decode an npub bech32 string to a 64-char hex pubkey.
 * Returns null if invalid.
 */
function npubToHex(npub: string): string | null {
  try {
    const decoded = bech32.decodeToBytes(npub)
    if (decoded.bytes.length !== 32) return null
    return Array.from(decoded.bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  } catch {
    return null
  }
}

/**
 * Convert a hex pubkey to npub bech32 format.
 */
function hexToNpub(hex: string): string {
  const bytes = new Uint8Array(hex.match(/.{2}/g)!.map((b) => parseInt(b, 16)))
  return bech32.encodeFromBytes('npub', bytes)
}

/**
 * Fetch a kind 0 metadata event from a single relay via WebSocket.
 * CF Workers support outgoing WebSocket connections.
 */
async function fetchKind0FromRelay(
  relayUrl: string,
  hexPubkey: string
): Promise<{ inboxId: string; signature: string } | null> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      try { ws.close() } catch { /* ignore */ }
      resolve(null)
    }, RELAY_TIMEOUT_MS)

    let ws: WebSocket
    try {
      ws = new WebSocket(relayUrl)
    } catch {
      clearTimeout(timeout)
      resolve(null)
      return
    }

    const subId = `xmtp-${hexPubkey.slice(0, 8)}`

    ws.addEventListener('open', () => {
      ws.send(JSON.stringify(['REQ', subId, { kinds: [0], authors: [hexPubkey], limit: 1 }]))
    })

    ws.addEventListener('message', (event) => {
      try {
        const msg = JSON.parse(typeof event.data === 'string' ? event.data : '')
        if (!Array.isArray(msg)) return

        if (msg[0] === 'EVENT' && msg[1] === subId) {
          const eventData = msg[2]
          if (eventData?.kind === 0 && typeof eventData.content === 'string') {
            const metadata = JSON.parse(eventData.content)
            const xmtp = metadata?.xmtp
            if (xmtp?.inboxId && xmtp?.verificationSignature) {
              clearTimeout(timeout)
              ws.send(JSON.stringify(['CLOSE', subId]))
              ws.close()
              resolve({
                inboxId: xmtp.inboxId,
                signature: xmtp.verificationSignature,
              })
              return
            }
          }
        }

        if (msg[0] === 'EOSE' && msg[1] === subId) {
          // No matching event found on this relay
          clearTimeout(timeout)
          ws.close()
          resolve(null)
        }
      } catch {
        // Ignore parse errors
      }
    })

    ws.addEventListener('error', () => {
      clearTimeout(timeout)
      try { ws.close() } catch { /* ignore */ }
      resolve(null)
    })

    ws.addEventListener('close', () => {
      clearTimeout(timeout)
      resolve(null)
    })
  })
}

export class NostrIdentityProvider implements IdentityProviderService {
  isValidIdentity(id: string): boolean {
    if (id.startsWith('npub1')) {
      return npubToHex(id) !== null
    }
    // 64-char hex pubkey
    return /^[a-f0-9]{64}$/i.test(id)
  }

  isValidInboxId(inboxId: string): boolean {
    return /^[a-f0-9]+$/i.test(inboxId)
  }

  async verifyFromSource(npubOrHex: string): Promise<{ inboxId: string; signature: string } | null> {
    let hexPubkey: string

    if (npubOrHex.startsWith('npub1')) {
      const hex = npubToHex(npubOrHex)
      if (!hex) return null
      hexPubkey = hex
    } else {
      hexPubkey = npubOrHex.toLowerCase()
    }

    // Try relays in parallel, return first successful result
    const results = await Promise.all(
      RELAYS.map((relay) => fetchKind0FromRelay(relay, hexPubkey))
    )

    return results.find((r) => r !== null) ?? null
  }
}

export { npubToHex, hexToNpub }
