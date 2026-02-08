import { useState, useRef, useEffect } from 'react'
import { useSettings } from '../context/SettingsContext'
import { importPrivateKey } from '../../../services/signer'
import { decryptWithPassword } from '../../../services/crypto'
import type { Hex } from 'viem'

/**
 * Restore form for importing encrypted key backups.
 */
export function RestoreForm() {
  const { state, actions, meta } = useSettings()

  const [importPassword, setImportPassword] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [importComplete, setImportComplete] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dropZoneRef = useRef<HTMLDivElement>(null)

  // Reset state when key management section closes or tab changes
  useEffect(() => {
    if (!state.showKeyManagement || state.keyTab !== 'restore') {
      setImportPassword('')
      setImportComplete(false)
      setSelectedFile(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }, [state.showKeyManagement, state.keyTab])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setSelectedFile(file)
      actions.setError(null)
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
      actions.setError(null)
    } else if (file) {
      actions.setError('Please select a .json backup file')
    }
  }

  const handleImportKey = async () => {
    if (!meta.profile?.id || !selectedFile || !importPassword) return

    setIsImporting(true)
    actions.setError(null)
    try {
      if (selectedFile.size > 10240) {
        actions.setError('Backup file is too large')
        return
      }

      const fileContent = await selectedFile.text()
      let backup: { version?: number; type?: string; encryptedKey?: string }

      try {
        backup = JSON.parse(fileContent)
      } catch {
        actions.setError('Invalid backup file format')
        return
      }

      if (backup.type !== 'xmtp-identity-backup' || !backup.encryptedKey) {
        actions.setError('This file is not a valid XMTP identity backup')
        return
      }

      const decryptedKey = await decryptWithPassword(backup.encryptedKey, importPassword)
      setImportPassword('')

      if (!decryptedKey.startsWith('0x') || decryptedKey.length !== 66) {
        actions.setError('Invalid backup file or wrong password')
        return
      }

      await importPrivateKey(meta.profile.id, decryptedKey as Hex)
      setImportComplete(true)
      setSelectedFile(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to import key'
      if (message.includes('decrypt') || message.includes('tag')) {
        actions.setError('Wrong password or corrupted data')
      } else {
        actions.setError(message)
      }
    } finally {
      setIsImporting(false)
    }
  }

  if (importComplete) {
    return (
      <div className="space-y-3 py-2">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-[var(--color-success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-[13px] text-[var(--color-text-secondary)]">Identity restored</span>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="w-full h-10 flex items-center justify-center text-[14px] font-semibold bg-[var(--color-bsky-500)] text-white hover:bg-[var(--color-bsky-600)] rounded-lg transition-colors"
        >
          Restart Now
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-[12px] text-[var(--color-text-tertiary)]">
        Restore from a backup file. This replaces the current key.
      </p>
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
        value={importPassword}
        onChange={(e) => setImportPassword(e.target.value)}
        placeholder="Backup password"
        className="w-full px-3 py-2 bg-[var(--color-surface-secondary)] border border-[var(--color-border-light)] rounded-lg text-[13px] text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:border-[var(--color-bsky-500)] focus:ring-2 focus:ring-[var(--color-bsky-500)]/20 transition-all"
      />
      <button
        onClick={handleImportKey}
        disabled={isImporting || !selectedFile || !importPassword}
        className="w-full h-10 flex items-center justify-center text-[14px] font-semibold bg-[var(--color-bsky-500)] text-white hover:bg-[var(--color-bsky-600)] rounded-lg transition-colors disabled:opacity-50"
      >
        {isImporting ? 'Restoring...' : 'Restore from Backup'}
      </button>
    </div>
  )
}
