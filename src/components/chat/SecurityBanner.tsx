/**
 * Security banner - shows "Secured by XMTP" at conversation start
 */
export function SecurityBanner() {
  return (
    <div className="flex justify-center py-4">
      <div className="flex items-center gap-1.5 text-[var(--color-text-tertiary)]">
        <svg
          className="w-3 h-3"
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
        <span className="text-[12px]">
          End-to-end encrypted ·{' '}
          <a
            href="https://xmtp.org"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[var(--color-text-secondary)] transition-colors"
          >
            Secured by XMTP
          </a>
        </span>
      </div>
    </div>
  )
}
