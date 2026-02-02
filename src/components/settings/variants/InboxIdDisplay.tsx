import { useState } from 'react'
import { useSettings } from '../context/SettingsContext'

function truncateId(id: string, chars = 8): string {
  if (id.length <= chars * 2 + 3) return id
  return `${id.slice(0, chars)}...${id.slice(-chars)}`
}

/**
 * Displays and allows copying the inbox ID.
 */
export function InboxIdDisplay() {
  const { actions, meta } = useSettings()
  const { xmtpInboxId, publishedInboxId } = meta
  const [copied, setCopied] = useState(false)

  const handleCopyInboxId = async () => {
    if (!xmtpInboxId) return
    try {
      await navigator.clipboard.writeText(xmtpInboxId)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      actions.setError('Failed to copy to clipboard')
    }
  }

  return (
    <>
      <button
        onClick={handleCopyInboxId}
        disabled={!xmtpInboxId}
        className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-[var(--color-surface-secondary)] transition-colors group disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className="text-[12px] text-[var(--color-text-secondary)]">Inbox ID</span>
        <div className="flex items-center gap-2">
          <code className="text-[11px] text-[var(--color-text-tertiary)] font-mono group-hover:text-[var(--color-text-secondary)] transition-colors">
            {xmtpInboxId ? truncateId(xmtpInboxId, 6) : 'Not connected'}
          </code>
          {xmtpInboxId && (
            copied ? (
              <svg className="w-3.5 h-3.5 text-[var(--color-success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5 text-[var(--color-text-tertiary)] group-hover:text-[var(--color-text-secondary)] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            )
          )}
        </div>
      </button>

      {publishedInboxId && publishedInboxId !== xmtpInboxId && (
        <div className="flex items-center justify-between px-3 py-2">
          <span className="text-[12px] text-[var(--color-text-secondary)]">Published ID</span>
          <code className="text-[11px] text-[var(--color-warning)] font-mono">
            {truncateId(publishedInboxId, 6)}
          </code>
        </div>
      )}
    </>
  )
}
