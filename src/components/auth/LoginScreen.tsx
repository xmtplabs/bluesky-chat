import { useState, useEffect, useCallback } from 'react'
import { useIdentity } from '../../hooks/useIdentity'
import { config, nip46 } from '../../provider'
import type { Nip46Helpers } from '../../provider'
import { useAuthStore } from '../../stores/authStore'
import { identityService } from '../../services/identity'
import type { UserProfile } from '../../types'

// At runtime, nip46 is the real helpers object (Nostr) or null (Bluesky).
// TypeScript sees null from the default tsconfig path, so we cast here.
const nip46Helpers = nip46 as Nip46Helpers | null

export function LoginScreen() {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const { login, loginWithPassword, isLoading, authError } = useIdentity()

  const hasOAuth = config.loginMethods.includes('oauth')
  const hasPassword = config.loginMethods.includes('password')
  const hasNip46Qr = config.loginMethods.includes('nip46-qr')

  const handlePrimarySubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (showPasswordForm && hasPassword) {
        await loginWithPassword(identifier, password)
      } else {
        await login(identifier)
      }
    } catch {
      // Error handled in store
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-surface)] px-4 py-8">
      <div className="w-full max-w-[400px]">
        {/* Header — driven by config.name */}
        <div className="text-center mb-8">
          <h1 className="text-[28px] font-bold text-[var(--color-text-primary)] mb-2">
            {config.name} Chat
          </h1>
          <p className="text-[15px] text-[var(--color-text-secondary)]">
            Private group chats and DMs for {config.name}.
          </p>
        </div>

        <div className="bg-[var(--color-surface)] rounded-2xl p-8 shadow-[var(--shadow-lg)] border border-[var(--color-border)]">
          {hasNip46Qr && nip46Helpers ? (
            <Nip46LoginButton />
          ) : (
            /* OAuth / password form path (Bluesky, etc.) */
            <form onSubmit={handlePrimarySubmit} className="space-y-5">
              {/* Username/identifier input */}
              <div>
                <label htmlFor="identifier" className="block text-[14px] font-medium text-[var(--color-text-primary)] mb-2">
                  {showPasswordForm ? 'Handle or Email' : `${config.name} Username`}
                </label>
                {!showPasswordForm && config.loginSuffix ? (
                  <div className="flex items-center bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-[var(--color-bsky-500)] focus-within:border-transparent transition-all duration-200">
                    <input
                      id="identifier"
                      type="text"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      placeholder={config.loginPlaceholder}
                      required
                      autoComplete="username"
                      className="flex-1 px-4 py-3 bg-transparent text-[16px] text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none"
                    />
                    <span className="px-4 py-3 text-[16px] text-[var(--color-text-tertiary)] select-none bg-[var(--color-surface-secondary)] border-l border-[var(--color-border)]">
                      {config.loginSuffix}
                    </span>
                  </div>
                ) : (
                  <input
                    id="identifier"
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder={showPasswordForm ? 'you@email.com or handle' : config.loginPlaceholder}
                    required
                    autoComplete="username"
                    className="w-full px-4 py-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl text-[16px] text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-bsky-500)] focus:border-transparent transition-colors duration-200"
                  />
                )}
                {!showPasswordForm && config.loginSuffix && (
                  <p className="mt-2 text-[12px] text-[var(--color-text-secondary)]">
                    Or enter your full custom domain handle
                  </p>
                )}
              </div>

              {/* Password field (only for password login) */}
              {showPasswordForm && (
                <div>
                  <label htmlFor="password" className="block text-[14px] font-medium text-[var(--color-text-primary)] mb-2">
                    App Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={config.passwordHelp?.placeholder ?? 'password'}
                    required
                    autoComplete="current-password"
                    className="w-full px-4 py-3 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl text-[16px] text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-bsky-500)] focus:border-transparent transition-colors duration-200"
                  />
                  {config.passwordHelp && (
                    <p className="mt-2 text-[12px] text-[var(--color-text-secondary)]">
                      {config.passwordHelp.label}{' '}
                      <a
                        href={config.passwordHelp.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[var(--color-bsky-500)] hover:text-[var(--color-bsky-600)] transition-colors"
                      >
                        {config.passwordHelp.linkText}
                      </a>
                    </p>
                  )}
                </div>
              )}

              {/* Error */}
              {authError && (
                <div className="p-3 bg-[var(--color-error-light)] border border-[var(--color-error)]/20 rounded-xl text-[var(--color-error)] text-[14px]">
                  {authError}
                </div>
              )}

              {/* Submit button */}
              <button
                type="submit"
                disabled={isLoading}
                className={`w-full py-3.5 px-4 text-[16px] font-semibold rounded-full transition-all duration-200 flex items-center justify-center gap-2 ${
                  isLoading
                    ? 'bg-[var(--color-bsky-300)] text-white cursor-not-allowed'
                    : 'bg-[var(--color-bsky-500)] hover:bg-[var(--color-bsky-600)] text-white shadow-sm hover:shadow-md'
                }`}
              >
                {isLoading ? (
                  <>
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    {showPasswordForm ? 'Signing in...' : 'Connecting...'}
                  </>
                ) : (
                  showPasswordForm ? 'Sign In' : `Sign in with ${config.name}`
                )}
              </button>

              {/* Toggle between login methods */}
              {hasOAuth && hasPassword && (
                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setShowPasswordForm(!showPasswordForm)}
                    className="text-[14px] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] underline underline-offset-2 transition-colors"
                  >
                    {showPasswordForm ? 'Back to OAuth sign in' : 'Use App Password instead'}
                  </button>
                </div>
              )}
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="mt-6 text-center text-[var(--color-text-tertiary)]">
          <div className="flex items-center justify-center gap-1.5">
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
            <span className="text-[13px]">
              End-to-end encrypted · Secured by XMTP ·{' '}
              <a
                href="https://xmtp.org"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[var(--color-text-secondary)] transition-colors underline underline-offset-2"
              >
                Learn more
              </a>
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── NIP-46 Button + Modal ───────────────────────────────────

function Nip46LoginButton() {
  const [showModal, setShowModal] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [signerConnected, setSignerConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connectError, setConnectError] = useState<string | null>(null)
  const { isLoading } = useIdentity()

  const completeLogin = useCallback((profile: UserProfile) => {
    useAuthStore.setState({
      profile,
      isLoggedIn: true,
      isLoading: false,
      error: null,
    })
    identityService.cacheProfile(profile)
  }, [])

  // Start NIP-46 flow on button click (not in useEffect — avoids StrictMode double-execution)
  const handleOpenModal = () => {
    if (!nip46Helpers) return
    setConnectError(null)
    setQrDataUrl(null)
    setSignerConnected(false)
    setShowModal(true)

    console.log('[LoginScreen] Starting NIP-46 connect flow...')
    nip46Helpers.startConnect(
      (dataUrl) => {
        console.log('[LoginScreen] Received QR data URL')
        setQrDataUrl(dataUrl)
      },
      () => {
        console.log('[LoginScreen] Signer connected, waiting for approval...')
        setSignerConnected(true)
      },
      (identityId) => {
        // Pubkey discovered while the mobile signer is still in the foreground.
        // Start XMTP init NOW so that by the time the binding needs to be signed,
        // the inbox ID is already available and the signer is still responsive.
        console.log('[LoginScreen] Identity ready, pre-starting XMTP init for:', identityId)
        useAuthStore.setState({ profile: { id: identityId, handle: identityId.slice(0, 16) + '…' } })
        useAuthStore.getState().connectXMTP().catch((err) => {
          console.warn('[LoginScreen] Early XMTP init failed (will retry later):', err)
        })
      },
    ).then(
      (profile) => {
        console.log('[LoginScreen] NIP-46 connect resolved:', profile)
        setShowModal(false)
        completeLogin(profile)
      },
      (err: unknown) => {
        console.error('[LoginScreen] NIP-46 connect rejected:', err)
        const message = err instanceof Error ? err.message : 'Connection failed'
        if (!message.includes('abort')) {
          setConnectError(message)
        }
      },
    )
  }

  const handleCloseModal = () => {
    setShowModal(false)
    nip46Helpers?.cancelConnect()
  }

  const handleExtensionLogin = async () => {
    if (!nip46Helpers) return
    setError(null)
    if (!nip46Helpers.hasExtension()) {
      setError('No Nostr browser extension found. Install Alby, nos2x, or similar.')
      return
    }
    try {
      const profile = await nip46Helpers.loginWithExtension()
      completeLogin(profile)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Extension login failed')
    }
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="p-3 bg-[var(--color-error-light)] border border-[var(--color-error)]/20 rounded-xl text-[var(--color-error)] text-[14px]">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handleOpenModal}
        disabled={isLoading}
        className={`w-full py-3.5 px-4 text-[16px] font-semibold rounded-full transition-all duration-200 flex items-center justify-center gap-2 ${
          isLoading
            ? 'bg-[var(--color-bsky-300)] text-white cursor-not-allowed'
            : 'bg-[var(--color-bsky-500)] hover:bg-[var(--color-bsky-600)] text-white shadow-sm hover:shadow-md'
        }`}
      >
        Sign in with Nostr Connect
      </button>

      <div className="text-center">
        <button
          type="button"
          onClick={handleExtensionLogin}
          disabled={isLoading}
          className="text-[14px] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] underline underline-offset-2 transition-colors"
        >
          Use Browser Extension instead
        </button>
      </div>

      {showModal && (
        <Nip46QrModal
          qrDataUrl={qrDataUrl}
          signerConnected={signerConnected}
          error={connectError}
          onClose={handleCloseModal}
        />
      )}
    </div>
  )
}

// ── QR Code Modal ──────────────────────────────────────────

function Nip46QrModal({
  qrDataUrl,
  signerConnected,
  error,
  onClose,
}: {
  qrDataUrl: string | null
  signerConnected: boolean
  error: string | null
  onClose: () => void
}) {
  // Close on Escape
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-[var(--color-surface)] rounded-2xl p-8 shadow-[var(--shadow-lg)] border border-[var(--color-border)] w-full max-w-[380px] relative">
        {/* Close button */}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-[var(--color-text-tertiary)] hover:text-[var(--color-text-primary)] transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="space-y-5">
          <div className="text-center">
            <h2 className="text-[18px] font-semibold text-[var(--color-text-primary)] mb-1">
              Nostr Connect
            </h2>
            <p className="text-[14px] text-[var(--color-text-secondary)]">
              {signerConnected
                ? 'Connected! Finishing sign-in...'
                : 'Scan and approve in your signer app'}
            </p>
          </div>

          {/* QR Code (hidden once signer connects) */}
          {!signerConnected && (
            <div className="flex justify-center">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="Nostr Connect QR Code"
                  className="rounded-xl"
                  width={280}
                  height={280}
                />
              ) : (
                <div className="w-[280px] h-[280px] rounded-xl bg-[var(--color-surface-secondary)] flex items-center justify-center">
                  <Spinner className="w-8 h-8" />
                </div>
              )}
            </div>
          )}

          {/* Status spinner */}
          {!error && (
            <p className="text-[13px] text-[var(--color-text-tertiary)] text-center flex items-center justify-center gap-2">
              <Spinner className="w-4 h-4" />
              {signerConnected ? 'Connecting to your account...' : 'Waiting for connection...'}
            </p>
          )}

          {/* Error */}
          {error && (
            <div className="p-3 bg-[var(--color-error-light)] border border-[var(--color-error)]/20 rounded-xl text-[var(--color-error)] text-[14px]">
              {error}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg className={`animate-spin text-[var(--color-text-tertiary)] ${className ?? ''}`} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  )
}
