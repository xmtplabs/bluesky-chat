import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools/pure'
import { BunkerSigner, createNostrConnectURI } from 'nostr-tools/nip46'
import { SimplePool } from 'nostr-tools/pool'
import { getConversationKey, decrypt, encrypt } from 'nostr-tools/nip44'
import { toDataURL } from 'qrcode'

const NIP46_SESSION_KEY = 'nostr_nip46_session'
const NIP46_RELAY = 'wss://relay.nsec.app'

/** Hex-encode a Uint8Array */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Decode hex string to Uint8Array */
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16)
  }
  return bytes
}

interface Nip46Session {
  clientSecretKeyHex: string
  bunkerPubkey: string
  relays: string[]
  userPubkey?: string  // User's actual pubkey (differs from bunkerPubkey for services like Primal)
}

// ── Active signer ────────────────────────────────────────

let activeBunkerSigner: BunkerSigner | null = null

export function getActiveBunkerSigner(): BunkerSigner | null {
  return activeBunkerSigner
}

// ── NIP-46 QR Code Flow ──────────────────────────────────

/**
 * Generate a QR code data URL from a nostrconnect:// URI.
 */
export async function generateQrDataUrl(uri: string): Promise<string> {
  return toDataURL(uri, {
    width: 280,
    margin: 2,
    color: { dark: '#000000', light: '#ffffff' },
    errorCorrectionLevel: 'M',
  })
}

/**
 * Start a NIP-46 Nostr Connect flow.
 * Generates an ephemeral keypair, creates a nostrconnect:// URI,
 * and waits for a bunker app (Amber, Nostrudel, etc.) to connect.
 *
 * @param relays - Additional relays to use alongside the NIP-46 relay
 * @param onQrDataUrl - Called with the QR code image data URL for display
 * @returns Promise that resolves with hex pubkey on successful connection, plus an abort function
 */
export function startNip46Connect(
  relays: string[],
  onQrDataUrl: (dataUrl: string) => void,
  onConnected?: () => void,
): { promise: Promise<string>; abort: () => void } {
  const clientSecretKey = generateSecretKey()
  const clientPubkey = getPublicKey(clientSecretKey)
  const connectRelays = [NIP46_RELAY, ...relays.filter((r) => r !== NIP46_RELAY)]
  const secret = bytesToHex(generateSecretKey()).slice(0, 16)

  const uri = createNostrConnectURI({
    clientPubkey,
    relays: connectRelays,
    secret,
    perms: ['get_public_key', 'sign_event:0', 'sign_event:3'],
    name: 'Nostr Chat',
  })

  console.log('[NIP-46] Connect URI created, relays:', connectRelays)

  // Generate QR data URL and pass to callback (fire-and-forget)
  generateQrDataUrl(uri).then((dataUrl) => {
    onQrDataUrl(dataUrl)
  }).catch((err) => {
    console.error('[NIP-46] Failed to generate QR data URL:', err)
  })

  const abortController = new AbortController()

  // ── Race-the-background: send get_public_key the instant the connect ACK arrives ──
  //
  // Mobile signers (Primal) go to background after the user approves the connect.
  // By the time fromURI() resolves and we send RPCs, the bunker is already silent.
  //
  // Fix: set up our own subscription BEFORE fromURI(). When we see the connect ACK,
  // we immediately fire a get_public_key RPC while the signer is still in the foreground.
  // We also retry every 3s in case the mobile signer wakes up later.
  let discoveredUserPubkey: string | null = null
  let retryInterval: ReturnType<typeof setInterval> | null = null
  const earlyPool = new SimplePool()

  // Helper to send get_public_key RPC via our early pool
  const rpcRequestId = Math.random().toString(36).slice(2, 10)
  const fireGetPublicKeyRpc = (targetPubkey: string) => {
    const request = JSON.stringify({ id: rpcRequestId, method: 'get_public_key', params: [] })
    const ck = getConversationKey(clientSecretKey, targetPubkey)
    const encrypted = encrypt(request, ck)
    const rpcEvent = finalizeEvent({
      kind: 24133,
      created_at: Math.floor(Date.now() / 1000),
      content: encrypted,
      tags: [['p', targetPubkey]],
    }, clientSecretKey)
    earlyPool.publish(connectRelays, rpcEvent)
  }

  const earlySub = earlyPool.subscribe(
    connectRelays,
    {
      kinds: [24133],
      '#p': [clientPubkey],
      since: Math.floor(Date.now() / 1000) - 10,
    },
    {
      onevent: (event) => {
        try {
          const convKey = getConversationKey(clientSecretKey, event.pubkey)
          const decrypted = decrypt(event.content, convKey)
          const parsed = JSON.parse(decrypted)

          // Is this the connect ACK? (result matches our secret)
          if (parsed.result === secret) {
            console.log('[NIP-46] Connect ACK from', event.pubkey.slice(0, 12),
              '— response:', JSON.stringify(parsed))

            // Fire get_public_key RPC immediately while the signer is still active
            fireGetPublicKeyRpc(event.pubkey)

            // Retry every 3s in case the signer wakes up later (mobile background)
            const bunkerPk = event.pubkey
            retryInterval = setInterval(() => {
              if (discoveredUserPubkey) {
                clearInterval(retryInterval!)
                retryInterval = null
                return
              }
              console.log('[NIP-46] Retrying get_public_key RPC...')
              fireGetPublicKeyRpc(bunkerPk)
            }, 3000)
            return
          }

          // Any response with a 64-char hex result = get_public_key response.
          // We match broadly (not just our request ID) to also catch responses
          // to BunkerSigner's own RPCs routed through different subscriptions.
          if (!discoveredUserPubkey && parsed.result && typeof parsed.result === 'string'
              && /^[0-9a-f]{64}$/.test(parsed.result)) {
            console.log('[NIP-46] Pubkey discovered:', parsed.result,
              'from:', event.pubkey.slice(0, 12))
            discoveredUserPubkey = parsed.result
          }
        } catch {
          // Not for us or can't decrypt — ignore
        }
      },
    },
  )

  const promise = (async () => {
    const signer = await BunkerSigner.fromURI(
      clientSecretKey,
      uri,
      {},
      abortController.signal,
    )
    const bunkerPubkey = signer.bp.pubkey
    console.log('[NIP-46] Signer connected, bunker key:', bunkerPubkey.slice(0, 12))

    // Notify UI that the signer approved the connection.
    onConnected?.()

    // ── Strategy 1: Early RPC (already in-flight from the connect ACK handler) ──
    // Wait up to 5s — this is the fastest path for responsive signers.
    // Includes one retry at 3s if the first attempt was missed.
    if (!discoveredUserPubkey) {
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (discoveredUserPubkey) { clearInterval(check); resolve() }
        }, 100)
        setTimeout(() => { clearInterval(check); resolve() }, 5000)
      })
    }

    // ── Strategy 2: Try BunkerSigner's own getPublicKey + signEvent in parallel ──
    // The signer's subscription is now set up. Some bunkers need more time or only
    // respond to standard BunkerSigner RPCs (not our hand-crafted early ones).
    // signEvent is tried because the signed event's pubkey field = user's actual key.
    if (!discoveredUserPubkey) {
      console.log('[NIP-46] Early RPC timed out. Trying signer RPCs (10s)...')
      const pk = await discoverPubkeyViaSigner(signer, 10_000)
      if (pk) {
        console.log('[NIP-46] Signer RPC returned user pubkey:', pk.slice(0, 12))
        discoveredUserPubkey = pk
      }
    }

    // Clean up early subscription and retry timer
    if (retryInterval) { clearInterval(retryInterval); retryInterval = null }
    earlySub.close()
    try { earlyPool.close(connectRelays) } catch { /* ignore */ }

    const hexPubkey = discoveredUserPubkey ?? bunkerPubkey
    console.log('[NIP-46] User pubkey:', hexPubkey,
      discoveredUserPubkey ? '(via RPC)' : '(bunker key fallback)')

    // Persist session for restore
    const session: Nip46Session = {
      clientSecretKeyHex: bytesToHex(clientSecretKey),
      bunkerPubkey,
      relays: connectRelays,
      ...(discoveredUserPubkey ? { userPubkey: discoveredUserPubkey } : {}),
    }
    localStorage.setItem(NIP46_SESSION_KEY, JSON.stringify(session))

    activeBunkerSigner = signer
    return hexPubkey
  })()

  return {
    promise,
    abort: () => {
      abortController.abort()
      if (retryInterval) { clearInterval(retryInterval); retryInterval = null }
      earlySub.close()
      try { earlyPool.close(connectRelays) } catch { /* ignore */ }
    },
  }
}

/**
 * Try to discover the user's actual pubkey via BunkerSigner RPCs.
 * Races getPublicKey() against signEvent() (the signed event's pubkey = user's key).
 * Returns the first valid hex pubkey, or null on timeout.
 */
function discoverPubkeyViaSigner(signer: BunkerSigner, timeoutMs: number): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    let resolved = false
    const done = (pubkey: string | null) => {
      if (resolved) return
      resolved = true
      resolve(pubkey)
    }

    setTimeout(() => done(null), timeoutMs)

    // Method A: getPublicKey — the standard NIP-46 way
    signer.getPublicKey()
      .then((pk) => {
        if (/^[0-9a-f]{64}$/.test(pk)) {
          console.log('[NIP-46] getPublicKey() succeeded:', pk.slice(0, 12))
          done(pk)
        }
      })
      .catch(() => {})

    // Method B: signEvent — sign a dummy event and extract pubkey from the result.
    // We use kind 0 (metadata) since we already requested sign_event:0 permission.
    // The event is never published; we only inspect the signed event's pubkey field.
    signer.signEvent({
      kind: 0,
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
      content: '{}',
    })
      .then((signed) => {
        const pk = (signed as { pubkey?: string }).pubkey
        if (pk && /^[0-9a-f]{64}$/.test(pk)) {
          console.log('[NIP-46] signEvent() revealed user pubkey:', pk.slice(0, 12))
          done(pk)
        }
      })
      .catch(() => {})
  })
}

// ── NIP-07 Extension Flow ────────────────────────────────

/**
 * Login using a NIP-07 browser extension (Alby, nos2x, etc.).
 * Returns the hex pubkey from the extension.
 */
export async function loginWithExtension(): Promise<string> {
  if (!window.nostr) {
    throw new Error('No Nostr browser extension found. Install Alby, nos2x, or similar.')
  }
  const hexPubkey = await window.nostr.getPublicKey()
  activeBunkerSigner = null // Extension handles signing via window.nostr
  return hexPubkey
}

// ── Session Persistence ──────────────────────────────────

/**
 * Restore a previous NIP-46 session from localStorage.
 * Recreates the BunkerSigner and verifies the connection.
 * Returns the hex pubkey or null if no session / session invalid.
 */
export async function restoreNip46Session(): Promise<string | null> {
  const raw = localStorage.getItem(NIP46_SESSION_KEY)
  if (!raw) return null

  try {
    const session: Nip46Session = JSON.parse(raw)
    const clientSecretKey = hexToBytes(session.clientSecretKeyHex)

    const signer = BunkerSigner.fromBunker(clientSecretKey, {
      pubkey: session.bunkerPubkey,
      relays: session.relays,
      secret: null,
    })

    // Verify the connection is still alive; fall back to cached key if signer is offline
    let hexPubkey: string | null = null
    try {
      hexPubkey = await Promise.race([
        signer.getPublicKey(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Session restore timeout')), 3000),
        ),
      ])
    } catch {
      // Bunker offline (mobile signer backgrounded) — use cached pubkey
      hexPubkey = session.userPubkey ?? session.bunkerPubkey
      console.log('[NIP-46] Session restore: signer offline, using cached key')
    }
    activeBunkerSigner = signer
    return hexPubkey
  } catch (err) {
    // Session invalid or bunker unreachable — clear it
    console.warn('[NIP-46] Session restore failed:', err)
    localStorage.removeItem(NIP46_SESSION_KEY)
    return null
  }
}

/**
 * Clear the stored NIP-46 session and close the active signer.
 */
export async function clearNip46Session(): Promise<void> {
  localStorage.removeItem(NIP46_SESSION_KEY)
  if (activeBunkerSigner) {
    await activeBunkerSigner.close().catch(() => {})
    activeBunkerSigner = null
  }
}
