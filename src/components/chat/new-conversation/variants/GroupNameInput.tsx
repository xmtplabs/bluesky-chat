import { useNewConversation } from '../context/NewConversationContext'

/**
 * Input for group conversation name. Only visible in group mode.
 */
export function GroupNameInput() {
  const { state, actions } = useNewConversation()
  const { mode, groupName } = state

  if (mode !== 'group') return null

  return (
    <div className="px-4 pb-3">
      <input
        type="text"
        value={groupName}
        onChange={(e) => actions.setGroupName(e.target.value)}
        placeholder="Group name (optional)"
        className="w-full px-4 py-2.5 bg-[var(--color-surface-secondary)] rounded-xl text-[14px] text-[var(--color-text-primary)] placeholder-[var(--color-text-tertiary)] focus:outline-none focus:bg-[var(--color-surface-tertiary)] transition-colors"
      />
    </div>
  )
}
