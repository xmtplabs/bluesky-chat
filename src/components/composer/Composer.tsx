/**
 * Composer Compound Component
 *
 * Usage:
 * ```tsx
 * import { Composer } from './components/composer/Composer'
 *
 * <Composer.Provider onSend={handleSend} isSending={isSending}>
 *   <div className="flex items-end gap-3">
 *     <Composer.TextArea />
 *     <Composer.SendButton />
 *   </div>
 * </Composer.Provider>
 * ```
 */

export { ComposerProviderBridge as Provider } from './ComposerProviderBridge'
export { ComposerTextArea as TextArea } from './ComposerTextArea'
export { ComposerSendButton as SendButton } from './ComposerSendButton'

// Context hook
export { useComposer } from './context/ComposerContext'
