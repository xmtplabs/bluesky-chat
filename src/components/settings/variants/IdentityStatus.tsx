import { useSettings } from '../context/SettingsContext'
import { config, formatHandle } from '../../../provider'

/**
 * Displays the identity <-> inbox link visualization and status.
 */
export function IdentityStatus() {
  const { state, actions, meta } = useSettings()
  const { isChecking, isRepublishing } = state
  const { identityMismatch, signatureInvalid, profile, hasWriteAccess } = meta

  return (
    <div className={`rounded-xl ${
      identityMismatch || signatureInvalid
        ? 'bg-[var(--color-warning)]/8 border border-[var(--color-warning)]/15'
        : 'bg-[var(--color-surface-secondary)]'
    }`}>
      {/* Visualization */}
      <div className="py-4">
        <div className="flex items-center justify-center">
          {/* Provider Identity */}
          <div className="flex flex-col items-center w-16">
            <div className="w-10 h-10 rounded-full bg-[var(--color-bsky-500)] flex items-center justify-center shadow-sm">
              <svg className="w-4.5 h-4.5 text-white" viewBox="0 0 568 501" fill="currentColor">
                <path d="M123.121 33.6637C188.241 82.5526 258.281 181.681 284 234.873C309.719 181.681 379.759 82.5526 444.879 33.6637C507.021 -12.3402 568 -17.5039 568 56.8712C568 79.6693 556.579 231.847 546.321 259.058C527.095 309.364 479.999 321.29 437.635 313.105C373.51 300.482 364.281 354.756 391.635 391.163C464.469 488.789 373.321 596.138 284 501.329C194.679 596.138 103.531 488.789 176.365 391.163C203.719 354.756 194.49 300.482 130.365 313.105C88.0009 321.29 40.9053 309.364 21.6789 259.058C11.4205 231.847 0 79.6693 0 56.8712C0 -17.5039 60.9788 -12.3402 123.121 33.6637Z"/>
              </svg>
            </div>
            <span className="text-[10px] font-medium text-[var(--color-text-secondary)] mt-1.5 text-center truncate max-w-full">
              {profile?.handle ? formatHandle(profile.handle) : config.name}
            </span>
          </div>

          {/* Connection Line with Status */}
          <div className="flex items-center mx-2">
            <div className={`h-px w-4 ${
              identityMismatch || signatureInvalid
                ? 'bg-[var(--color-warning)]'
                : 'bg-[var(--color-border)]'
            }`} />
            <div className={`w-7 h-7 rounded-full flex items-center justify-center ${
              identityMismatch || signatureInvalid
                ? 'bg-[var(--color-warning)]/20'
                : 'bg-[var(--color-success)]/10'
            }`}>
              {isChecking ? (
                <svg className="w-3.5 h-3.5 text-[var(--color-text-tertiary)] animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : identityMismatch || signatureInvalid ? (
                <svg className="w-3.5 h-3.5 text-[var(--color-warning)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5 text-[var(--color-success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            <div className={`h-px w-4 ${
              identityMismatch || signatureInvalid
                ? 'bg-[var(--color-warning)]'
                : 'bg-[var(--color-border)]'
            }`} />
          </div>

          {/* Chat Inbox */}
          <div className="flex flex-col items-center w-16">
            <div className="w-10 h-10 rounded-full bg-[var(--color-surface-tertiary)] flex items-center justify-center shadow-sm border border-[var(--color-border-light)]">
              <svg className="w-4.5 h-4.5 text-[var(--color-text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
              </svg>
            </div>
            <span className="text-[10px] font-medium text-[var(--color-text-secondary)] mt-1.5">
              Inbox
            </span>
          </div>
        </div>
      </div>

      {/* Status-specific content */}
      {identityMismatch ? (
        <div className="px-4 pb-4 border-t border-[var(--color-warning)]/15">
          <p className="text-[12px] font-medium text-[var(--color-warning)] mt-3">
            Different inbox linked to your profile
          </p>
          <p className="text-[11px] text-[var(--color-text-secondary)] mt-1">
            Restore a backup to recover your linked inbox, or update your profile to use this device's inbox.
          </p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => {
                actions.setShowKeyManagement(true)
                actions.setKeyTab('restore')
              }}
              className="flex-1 h-8 flex items-center justify-center gap-2 text-[12px] font-semibold rounded-lg transition-all text-white bg-[var(--color-bsky-500)] hover:bg-[var(--color-bsky-600)] disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[var(--color-bsky-500)] focus:ring-offset-2"
            >
              Restore Backup
            </button>
            {hasWriteAccess && (
              <button
                onClick={actions.republishIdentity}
                disabled={isRepublishing}
                className="flex-1 h-8 flex items-center justify-center gap-2 text-[12px] font-medium rounded-lg transition-all disabled:opacity-50 text-[var(--color-text-secondary)] bg-white/60 hover:bg-white/80 border border-[var(--color-border-light)] focus:outline-none focus:ring-2 focus:ring-[var(--color-bsky-500)] focus:ring-offset-2"
              >
                {isRepublishing ? 'Updating...' : 'Use This Inbox'}
              </button>
            )}
          </div>
          {!hasWriteAccess && (
            <p className="text-[10px] text-[var(--color-text-tertiary)] mt-2">
              Sign in with an App Password to update your profile.
            </p>
          )}
        </div>
      ) : signatureInvalid ? (
        <div className="px-4 pb-4 border-t border-[var(--color-warning)]/15">
          <p className="text-[12px] font-medium text-[var(--color-warning)] mt-3">
            Verification issue
          </p>
          <p className="text-[11px] text-[var(--color-text-secondary)] mt-1">
            Others won't be able to message you until you update.
          </p>
          {hasWriteAccess && (
            <button
              onClick={actions.republishIdentity}
              disabled={isRepublishing}
              className="w-full mt-3 h-8 flex items-center justify-center gap-2 text-[12px] font-semibold rounded-lg transition-all disabled:opacity-50 text-white bg-[var(--color-bsky-500)] hover:bg-[var(--color-bsky-600)] focus:outline-none focus:ring-2 focus:ring-[var(--color-bsky-500)] focus:ring-offset-2"
            >
              {isRepublishing ? 'Fixing...' : 'Fix Now'}
            </button>
          )}
          {!hasWriteAccess && (
            <p className="text-[10px] text-[var(--color-text-tertiary)] mt-2">
              Sign in with an App Password to fix.
            </p>
          )}
        </div>
      ) : (
        <div className="text-center px-3 pb-4">
          <p className="text-[11px] text-[var(--color-text-tertiary)] leading-relaxed">
            Your inbox is cryptographically linked to your {config.name} identity. Secured by XMTP.{' '}
            <a
              href="https://xmtp.org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-bsky-500)] hover:underline"
            >
              Learn more
            </a>
          </p>
        </div>
      )}
    </div>
  )
}
