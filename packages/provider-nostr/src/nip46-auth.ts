import { generateSecretKey, getPublicKey, finalizeEvent } from 'nostr-tools/pure'
import { BunkerSigner, createNostrConnectURI } from 'nostr-tools/nip46'
import { SimplePool } from 'nostr-tools/pool'
import { getConversationKey, decrypt, encrypt } from 'nostr-tools/nip44'
import { toDataURL } from 'qrcode'

const NIP46_SESSION_KEY = 'nostr_nip46_session'
const NIP46_RELAYS = ['wss://relay.primal.net']
const PUBKEY_TIMEOUT = 8_000

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
  userPubkey?: string
}

// ── Active signer ────────────────────────────────────────

let activeBunkerSigner: BunkerSigner | null = null

export function getActiveBunkerSigner(): BunkerSigner | null {
  return activeBunkerSigner
}

// ── Shared pool ──────────────────────────────────────────

let sharedPool: SimplePool | null = null

function getOrCreatePool(): SimplePool {
  if (!sharedPool) sharedPool = new SimplePool()
  return sharedPool
}

// ── NIP-46 QR Code Flow ──────────────────────────────────

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
 *
 * We handle the connect handshake ourselves (not via fromURI) so we can
 * call getPublicKey immediately — fromURI has a 1s switchRelays delay.
 * We also keep our subscription open to catch responses from BOTH our
 * manual RPC and BunkerSigner's internal RPC, for diagnostics.
 */
export function startNip46Connect(
  _relays: string[],
  onQrDataUrl: (dataUrl: string) => void,
  onConnected?: () => void,
  onPubkeyReady?: (hexPubkey: string) => void,
): { promise: Promise<string>; abort: () => void } {
  const clientSecretKey = generateSecretKey()
  const clientPubkey = getPublicKey(clientSecretKey)
  const secret = bytesToHex(generateSecretKey()).slice(0, 16)
  const pool = getOrCreatePool()

  const uri = createNostrConnectURI({
    clientPubkey,
    relays: NIP46_RELAYS,
    secret,
    perms: ['get_public_key', 'sign_event:0', 'sign_event:3'],
    name: 'Nostr Chat',
  })

  console.log('[NIP-46] Connect URI created, relays:', NIP46_RELAYS)

  generateQrDataUrl(uri).then(onQrDataUrl).catch((err) => {
    console.error('[NIP-46] Failed to generate QR data URL:', err)
  })

  let aborted = false
  let discoveredPubkey: string | null = null
  let rejectPromise: ((reason: Error) => void) | null = null
  let activeSub: ReturnType<SimplePool['subscribe']> | null = null
  let activeSigner: BunkerSigner | null = null
  let activeCheck: ReturnType<typeof setInterval> | null = null
  let activeTimeout: ReturnType<typeof setTimeout> | null = null

  const promise = new Promise<string>((resolve, reject) => {
    rejectPromise = reject
    // Single subscription handles both ACK and subsequent RPC responses.
    // We never close it until pubkey is discovered or we give up.
    const sub = pool.subscribe(
      NIP46_RELAYS,
      {
        kinds: [24133],
        '#p': [clientPubkey],
        since: Math.floor(Date.now() / 1000) - 10,
      },
      {
        onevent: async (event) => {
          if (aborted) return

          let parsed: Record<string, unknown>
          try {
            const ck = getConversationKey(clientSecretKey, event.pubkey)
            parsed = JSON.parse(decrypt(event.content, ck))
          } catch {
            console.log('[NIP-46] Received event from', event.pubkey.slice(0, 12),
              '(could not decrypt)')
            return
          }

          console.log('[NIP-46] Decrypted event from', event.pubkey.slice(0, 12),
            ':', JSON.stringify(parsed).slice(0, 200))

          // ── Connect ACK ──
          if (parsed.result === secret) {
            // Ignore duplicate ACKs (relay replay, etc.)
            if (activeTimeout) return
            const bunkerPubkey = event.pubkey
            console.log('[NIP-46] Connect ACK received, bunker:', bunkerPubkey.slice(0, 12))
            onConnected?.()

            // Create signer via fromBunker (synchronous, no relay switch delay)
            const signer = BunkerSigner.fromBunker(clientSecretKey, {
              pubkey: bunkerPubkey,
              relays: NIP46_RELAYS,
              secret,
            }, { pool })
            activeSigner = signer

            // Fire manual get_public_key RPC via our own subscription too.
            // This way both our sub AND the signer's internal sub can catch the response.
            const rpcId = Math.random().toString(36).slice(2, 10)
            const rpcRequest = JSON.stringify({ id: rpcId, method: 'get_public_key', params: [] })
            const ck = getConversationKey(clientSecretKey, bunkerPubkey)
            const rpcEvent = finalizeEvent({
              kind: 24133,
              created_at: Math.floor(Date.now() / 1000),
              content: encrypt(rpcRequest, ck),
              tags: [['p', bunkerPubkey]],
            }, clientSecretKey)
            console.log('[NIP-46] Publishing manual get_public_key RPC (id:', rpcId, ')')
            pool.publish(NIP46_RELAYS, rpcEvent)

            // Also try via BunkerSigner's own getPublicKey
            console.log('[NIP-46] Also calling signer.getPublicKey()...')
            signer.getPublicKey()
              .then((pk) => {
                console.log('[NIP-46] signer.getPublicKey() resolved:', pk?.slice(0, 12))
                if (!discoveredPubkey && pk && /^[0-9a-f]{64}$/.test(pk)) {
                  discoveredPubkey = pk
                }
              })
              .catch((err) => {
                console.warn('[NIP-46] signer.getPublicKey() rejected:', err)
              })

            // Wait for pubkey discovery with timeout
            const timeout = setTimeout(() => {
              if (!discoveredPubkey) {
                clearInterval(check)
                console.warn('[NIP-46] Pubkey discovery timed out after', PUBKEY_TIMEOUT, 'ms')
                const hexPubkey = bunkerPubkey
                console.log('[NIP-46] Using bunker key fallback:', hexPubkey.slice(0, 12))
                sub.close()
                persistSession(clientSecretKey, bunkerPubkey, null)
                activeBunkerSigner = signer
                resolve(hexPubkey)
              }
            }, PUBKEY_TIMEOUT)
            activeTimeout = timeout

            // If pubkey was already discovered by a response handler below, resolve now
            const check = setInterval(() => {
              if (discoveredPubkey) {
                clearInterval(check)
                clearTimeout(timeout)
                const hexPubkey = discoveredPubkey
                console.log('[NIP-46] Pubkey discovered:', hexPubkey.slice(0, 12))
                onPubkeyReady?.(hexPubkey)
                sub.close()
                persistSession(clientSecretKey, bunkerPubkey, hexPubkey)
                activeBunkerSigner = signer
                resolve(hexPubkey)
              }
            }, 100)
            activeCheck = check
            return
          }

          // ── Any other RPC response (after ACK) ──
          if (discoveredPubkey) return // Already found

          // Method A: get_public_key response — 64-char hex
          if (parsed.result && typeof parsed.result === 'string'
              && /^[0-9a-f]{64}$/.test(parsed.result as string)) {
            console.log('[NIP-46] Pubkey via get_public_key response:', (parsed.result as string).slice(0, 12))
            discoveredPubkey = parsed.result as string
            return
          }

          // Method B: sign_event response — JSON signed event with .pubkey
          if (parsed.result && typeof parsed.result === 'string') {
            try {
              const signed = JSON.parse(parsed.result as string)
              if (signed.pubkey && /^[0-9a-f]{64}$/.test(signed.pubkey)) {
                console.log('[NIP-46] Pubkey via sign_event response:', signed.pubkey.slice(0, 12))
                discoveredPubkey = signed.pubkey
              }
            } catch { /* not a signed event */ }
          }
        },
      },
    )
    activeSub = sub
  })

  return {
    promise,
    abort: () => {
      aborted = true
      if (activeCheck) clearInterval(activeCheck)
      if (activeTimeout) clearTimeout(activeTimeout)
      activeSub?.close()
      activeSigner?.close().catch(() => {})
      rejectPromise?.(new Error('NIP-46 connect aborted'))
    },
  }
}

function persistSession(clientSecretKey: Uint8Array, bunkerPubkey: string, userPubkey: string | null) {
  const session: Nip46Session = {
    clientSecretKeyHex: bytesToHex(clientSecretKey),
    bunkerPubkey,
    relays: NIP46_RELAYS,
    ...(userPubkey ? { userPubkey } : {}),
  }
  localStorage.setItem(NIP46_SESSION_KEY, JSON.stringify(session))
}

// ── NIP-07 Extension Flow ────────────────────────────────

export async function loginWithExtension(): Promise<string> {
  if (!window.nostr) {
    throw new Error('No Nostr browser extension found. Install Alby, nos2x, or similar.')
  }
  const hexPubkey = await window.nostr.getPublicKey()
  if (activeBunkerSigner) {
    await activeBunkerSigner.close().catch(() => {})
    activeBunkerSigner = null
  }
  return hexPubkey
}

// ── Session Persistence ──────────────────────────────────

export async function restoreNip46Session(): Promise<string | null> {
  const raw = localStorage.getItem(NIP46_SESSION_KEY)
  if (!raw) return null

  try {
    const session: Nip46Session = JSON.parse(raw)
    const clientSecretKey = hexToBytes(session.clientSecretKeyHex)

    if (activeBunkerSigner) {
      await activeBunkerSigner.close().catch(() => {})
      activeBunkerSigner = null
    }

    const signer = BunkerSigner.fromBunker(clientSecretKey, {
      pubkey: session.bunkerPubkey,
      relays: session.relays,
      secret: null,
    }, { pool: getOrCreatePool() })

    let hexPubkey: string | null = null
    try {
      hexPubkey = await Promise.race([
        signer.getPublicKey(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Session restore timeout')), 3000),
        ),
      ])
    } catch {
      hexPubkey = session.userPubkey ?? session.bunkerPubkey
      console.log('[NIP-46] Session restore: signer offline, using cached key')
    }
    activeBunkerSigner = signer
    return hexPubkey
  } catch (err) {
    console.warn('[NIP-46] Session restore failed:', err)
    localStorage.removeItem(NIP46_SESSION_KEY)
    return null
  }
}

export async function clearNip46Session(): Promise<void> {
  localStorage.removeItem(NIP46_SESSION_KEY)
  if (activeBunkerSigner) {
    await activeBunkerSigner.close().catch(() => {})
    activeBunkerSigner = null
  }
}
