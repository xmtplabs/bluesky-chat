import type { Context, MiddlewareHandler } from 'hono'
import type { Env } from '../types'

/**
 * Extract client IP from request headers.
 * Cloudflare provides the real client IP in CF-Connecting-IP header.
 */
function getClientIP(c: Context): string {
  return (
    c.req.header('CF-Connecting-IP') ??
    c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ??
    c.req.header('X-Real-IP') ??
    '127.0.0.1'
  )
}

/**
 * Rate limiting middleware using Cloudflare's native rate limiting binding.
 *
 * This provides global (not per-isolate) rate limiting that cannot be bypassed
 * by distributing requests across Worker isolates.
 *
 * @see https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
 */
export function rateLimit(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    const clientIP = getClientIP(c)

    const { success } = await c.env.RATE_LIMITER.limit({ key: clientIP })

    if (!success) {
      c.header('Retry-After', '60')
      return c.json({ error: 'RATE_LIMITED', retryAfter: 60 }, 429)
    }

    await next()
  }
}

/**
 * Stricter rate limiting for admin endpoints.
 * Applies a lower limit (100/min vs 1000/min) to protect admin operations.
 */
export function adminRateLimit(): MiddlewareHandler<{ Bindings: Env }> {
  return async (c, next) => {
    const clientIP = getClientIP(c)

    const { success } = await c.env.ADMIN_RATE_LIMITER.limit({ key: clientIP })

    if (!success) {
      c.header('Retry-After', '60')
      return c.json({ error: 'RATE_LIMITED', retryAfter: 60 }, 429)
    }

    await next()
  }
}
