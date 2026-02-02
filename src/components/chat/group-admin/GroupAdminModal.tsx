import { useCallback, useEffect, useRef } from 'react'
import { GroupAdminProviderBridge } from './GroupAdminProviderBridge'
import { Header } from './variants/Header'
import { MetadataSection } from './variants/MetadataSection'
import { MemberList } from './variants/MemberList'
import { AddMemberSearch } from './variants/AddMemberSearch'
import { Footer } from './variants/Footer'

interface GroupAdminModalProps {
  groupId: string
  onClose: () => void
}

export function GroupAdminModal({ groupId, onClose }: GroupAdminModalProps) {
  const modalRef = useRef<HTMLDivElement>(null)

  // Handle escape key and focus trap
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
        return
      }

      // Focus trap
      if (e.key === 'Tab' && modalRef.current) {
        const focusableElements = modalRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        const firstElement = focusableElements[0]
        const lastElement = focusableElements[focusableElements.length - 1]

        if (e.shiftKey && document.activeElement === firstElement) {
          e.preventDefault()
          lastElement?.focus()
        } else if (!e.shiftKey && document.activeElement === lastElement) {
          e.preventDefault()
          firstElement?.focus()
        }
      }
    }

    // Focus first element on mount
    const focusableElements = modalRef.current?.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    focusableElements?.[0]?.focus()

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }, [onClose])

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="group-admin-title"
        className="bg-[var(--color-surface)] rounded-2xl w-full max-w-[400px] max-h-[85vh] flex flex-col shadow-[var(--shadow-modal)] overflow-hidden animate-[slideUp_200ms_ease-out]"
        onClick={(e) => e.stopPropagation()}
      >
        <GroupAdminProviderBridge groupId={groupId} onClose={onClose}>
          <Header />
          <div className="flex-1 overflow-y-auto min-h-0">
            <MetadataSection />
            <MemberList />
            <AddMemberSearch />
          </div>
          <Footer />
        </GroupAdminProviderBridge>
      </div>
    </div>
  )
}
