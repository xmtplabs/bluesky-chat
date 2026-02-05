import type { Context, Next, MiddlewareHandler } from 'hono'
import type { Env } from '../types'

interface RateLimitState {
  count: number
  resetAt: number
}

// In-memory rate limit storage (per-isolate)
// In production, this could use Durable Objects for global consistency
const rateLimits = new Map<string, RateLimitState>()

// Configuration
const LIMIT_PER_MINUTE = 1000
const WINDOW_MS = 60 * 1000 // 1 minute

function getClientIP(c: Context): string {
  // Cloudflare provides the real client IP in CF-Connecting-IP header
  return (
    c.req.header('CF-Connecting-IP') ??
    c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ??
    c.req.header('X-Real-IP') ??
    '127.0.0.1'
  )
}

function cleanupOldEntries(): void {
  const now = Date.now()
  for (const [key, state] of rateLimits) {
    if (state.resetAt < now) {
      rateLimits.delete(key)
    }
  }
}

export function rateLimit(): MiddlewareHandler<{ Bindings: Env }> {
  // Periodic cleanup to prevent memory leaks
  let lastCleanup = Date.now()

  return async (c: Context<{ Bindings: Env }>, next: Next) => {
    const now = Date.now()

    // Cleanup old entries every 5 minutes
    if (now - lastCleanup > 5 * 60 * 1000) {
      cleanupOldEntries()
      lastCleanup = now
    }

    const clientIP = getClientIP(c)
    const key = `rate:${clientIP}`

    let state = rateLimits.get(key)

    // Initialize or reset if window expired
    if (!state || state.resetAt < now) {
      state = {
        count: 0,
        resetAt: now + WINDOW_MS
      }
    }

    // Increment count
    state.count++
    rateLimits.set(key, state)

    // Calculate remaining and reset timestamp
    const remaining = Math.max(0, LIMIT_PER_MINUTE - state.count)
    const resetTimestamp = Math.ceil(state.resetAt / 1000)

    // Set rate limit headers on all responses
    c.header('X-RateLimit-Limit', LIMIT_PER_MINUTE.toString())
    c.header('X-RateLimit-Remaining', remaining.toString())
    c.header('X-RateLimit-Reset', resetTimestamp.toString())

    // Check if over limit
    if (state.count > LIMIT_PER_MINUTE) {
      const retryAfter = Math.ceil((state.resetAt - now) / 1000)
      c.header('Retry-After', retryAfter.toString())

      return c.json(
        {
          error: 'RATE_LIMITED',
          retryAfter
        },
        429
      )
    }

    await next()
  }
}
