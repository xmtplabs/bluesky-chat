import { useState, useRef } from 'react'
import type { Hex } from 'viem'
import { decryptWithPassword } from '../../services/crypto'

const MAX_BACKUP_FILE_SIZE = 10 * 1024 // 10KB

interface RestorePromptProps {
  onRestore: (key: Hex) => Promise<void>
  isRestoring: boolean
  error: string | null
}

/**
 * Inline restore form with file selection and password input.
 */
export function RestorePrompt({ onRestore, isRestoring, error }: RestorePromptProps) {
  const [password, setPassword] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)

  const displayError = error || localError

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      setLocalError(null)
    }
  }

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (dropZoneRef.current && !dropZoneRef.current.contains(e.relatedTarget as Node)) {
      setIsDragging(false)
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file && file.name.endsWith('.json')) {
      setSelectedFile(file)
      setLocalError(null)
    } else if (file) {
      setLocalError('Please select a .json backup file')
    }
  }

  const handleRestore = async () => {
    if (!selectedFile || !password) return

    setLocalError(null)

    try {
      if (selectedFile.size > MAX_BACKUP_FILE_SIZE) {
        setLocalError('Backup file is too large')
        return
      }

      const fileContent = await selectedFile.text()
      let backup: { version?: number; type?: string; encryptedKey?: string }

      try {
        backup = JSON.parse(fileContent)
      } catch {
        setLocalError('Invalid backup file format')
        return
      }

      if (backup.type !== 'xmtp-identity-backup' || !backup.encryptedKey) {
        setLocalError('This file is not a valid XMTP identity backup')
        return
      }

      const decryptedKey = await decryptWithPassword(backup.encryptedKey, password)

      if (!decryptedKey.startsWith('0x') || decryptedKey.length !== 66) {
        setLocalError('Invalid backup file or wrong password')
        return
      }

      await onRestore(decryptedKey as Hex)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to restore'
      if (message.includes('decrypt') || message.includes('tag')) {
        setLocalError('Wrong password or corrupted data')
      } else {
        setLocalError(message)
      }
    }
  }

  return (
    <div className="space-y-3">
      {displayError && (
        <div
          role="alert"
          aria-live="polite"
          className="flex items-start gap-2 px-3 py-2 bg-[var(--color-error-light)] border border-[var(--color-error)]/20 rounded-lg"
        >
          <svg className="w-4 h-4 text-[var(--color-error)] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <p className="text-[13px] text-[var(--color-error)]">{displayError}</p>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileSelect}
        className="hidden"
      />

      <div
        ref={dropZoneRef}
        role="button"
        tabIndex={0}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            fileInputRef.current?.click()
          }
        }}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`w-full px-3 py-3 rounded-lg text-[12px] cursor-pointer transition-all flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-[var(--color-bsky-500)]/50 ${
          isDragging
            ? 'bg-[var(--color-bsky-500)]/10 border-2 border-dashed border-[var(--color-bsky-500)]'
            : selectedFile
              ? 'bg-[var(--color-success-light)] border border-[var(--color-success)]/30'
              : 'bg-[var(--color-surface-secondary)] border border-dashed border-[var(--color-border)] hover:border-[var(--color-bsky-500)]'
        }`}
      >
        {selectedFile ? (
          <>
            <svg className="w-4 h-4 text-[var(--color-success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-[var(--color-text-primary)] font-medium truncate">{selectedFile.name}</span>
          </>
        ) : isDragging ? (
          <span className="text-[var(--color-bsky-500)] font-medium">Drop file here</span>
        ) : (
          <span className="text-[var(--color-text-secondary)]">Choose backup file or drag here</span>
        )}
      </div>

      <input
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Backup password"
        className="w-full px-3 py-2 bg-[var(--color-surface-secondary)] border border-[var(--color-border-light)] rounded-lg text-[13px] text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-bsky-500)] focus:ring-2 focus:ring-[var(--color-bsky-500)]/20 transition-all"
      />

      <button
        onClick={handleRestore}
        disabled={isRestoring || !selectedFile || !password}
        className="w-full h-10 flex items-center justify-center text-[14px] font-semibold bg-[var(--color-bsky-500)] text-white hover:bg-[var(--color-bsky-600)] rounded-lg transition-colors disabled:opacity-50"
      >
        {isRestoring ? (
          <>
            <svg className="w-4 h-4 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Restoring...
          </>
        ) : (
          'Restore from Backup'
        )}
      </button>
    </div>
  )
}
