/**
 * Extract a human-readable error message from an unknown error value.
 */
export function getErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}
