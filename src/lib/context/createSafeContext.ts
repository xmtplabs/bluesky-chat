import { createContext, use } from 'react'

/**
 * Creates a type-safe context with a custom hook using React 19's use() API.
 * Throws a helpful error when used outside its provider.
 */
export function createSafeContext<T>(name: string) {
  const Context = createContext<T | null>(null)
  Context.displayName = name

  function useContextValue(): T {
    const value = use(Context)
    if (value === null) {
      throw new Error(`use${name} must be used within a ${name}Provider`)
    }
    return value
  }

  return [Context.Provider, useContextValue, Context] as const
}
