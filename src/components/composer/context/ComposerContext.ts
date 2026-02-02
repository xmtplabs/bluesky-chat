import { createSafeContext } from '../../../lib/context/createSafeContext'
import type { ContextValue } from '../../../lib/context/types'

export interface ComposerState {
  message: string
  isSending: boolean
  canSend: boolean
}

export interface ComposerActions {
  setMessage: (message: string) => void
  send: () => Promise<void>
  clear: () => void
}

export interface ComposerMeta {
  placeholder: string
  maxLength?: number
}

export type ComposerContextValue = ContextValue<ComposerState, ComposerActions, ComposerMeta>

export const [ComposerProvider, useComposer, ComposerContext] = createSafeContext<ComposerContextValue>('Composer')
