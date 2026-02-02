/**
 * Generic context value interface following Vercel's state/actions/meta pattern.
 * This provides a consistent structure for all compound component contexts.
 */
export interface ContextValue<TState, TActions, TMeta = object> {
  state: TState
  actions: TActions
  meta: TMeta
}
