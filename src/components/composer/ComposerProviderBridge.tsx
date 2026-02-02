import { useState, useMemo, useCallback, type ReactNode } from 'react'
import { ComposerProvider, type ComposerContextValue } from './context/ComposerContext'

interface ComposerProviderBridgeProps {
  children: ReactNode
  onSend: (message: string) => Promise<void>
  isSending?: boolean
  placeholder?: string
  maxLength?: number
}

/**
 * Bridges local state and send callback to the Composer context.
 */
export function ComposerProviderBridge({
  children,
  onSend,
  isSending = false,
  placeholder = 'Type a message...',
  maxLength
}: ComposerProviderBridgeProps) {
  const [message, setMessage] = useState('')

  const canSend = message.trim().length > 0 && !isSending

  const handleSend = useCallback(async () => {
    const trimmed = message.trim()
    if (!trimmed || isSending) return

    setMessage('')
    await onSend(trimmed)
  }, [message, isSending, onSend])

  const handleClear = useCallback(() => {
    setMessage('')
  }, [])

  const contextValue: ComposerContextValue = useMemo(() => ({
    state: {
      message,
      isSending,
      canSend
    },
    actions: {
      setMessage,
      send: handleSend,
      clear: handleClear
    },
    meta: {
      placeholder,
      maxLength
    }
  }), [message, isSending, canSend, handleSend, handleClear, placeholder, maxLength])

  return (
    <ComposerProvider value={contextValue}>
      {children}
    </ComposerProvider>
  )
}
