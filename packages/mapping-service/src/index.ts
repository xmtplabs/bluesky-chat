import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { Env, HealthResponse } from './types'
import { rateLimit, adminRateLimit } from './middleware/rateLimit'
import { getTotalMappings } from './services/db'
import lookup from './routes/lookup'
import bulk from './routes/bulk'
import register from './routes/register'
import admin from './routes/admin'

// Re-export Durable Object
export { JetstreamIndexer } from './indexer/jetstream'

const app = new Hono<{ Bindings: Env }>()

// Global middleware
app.use('*', cors())

// Public endpoints - 1000 requests/minute
app.use('/v1/lookup/*', rateLimit())
app.use('/v1/bulk', rateLimit())
app.use('/v1/register', rateLimit())

// Admin endpoints - 100 requests/minute (stricter) + auth check in admin router
app.use('/v1/admin', adminRateLimit())
app.use('/v1/admin/*', adminRateLimit())

// Routes
app.route('/v1/lookup', lookup)
app.route('/v1/bulk', bulk)
app.route('/v1/register', register)
app.route('/v1/admin', admin)

// Health check with stats
app.get('/health', async (c) => {
  try {
    const totalMappings = await getTotalMappings(c.env.DB)

    // Check indexer status
    let indexerConnected = false
    try {
      const indexerId = c.env.JETSTREAM_INDEXER.idFromName('singleton')
      const indexer = c.env.JETSTREAM_INDEXER.get(indexerId)
      const statusResponse = await indexer.fetch(new Request('http://internal/status'))
      const status = (await statusResponse.json()) as { connected: boolean }
      indexerConnected = status.connected
    } catch {
      // Indexer may not be initialized yet
    }

    const response: HealthResponse = {
      status: indexerConnected ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      stats: {
        totalMappings,
        indexerConnected
      }
    }

    return c.json(response)
  } catch (error) {
    return c.json(
      {
        status: 'degraded',
        timestamp: new Date().toISOString(),
        stats: {
          totalMappings: 0,
          indexerConnected: false
        },
        error: error instanceof Error ? error.message : 'Unknown error'
      } satisfies HealthResponse & { error: string },
      500
    )
  }
})

// Indexer endpoints moved to /v1/admin/* for security

// Root endpoint with API info
app.get('/', (c) => {
  return c.json({
    service: 'bluesky-chat-mapping-service',
    version: '1.0.0',
    endpoints: {
      lookup: {
        'GET /v1/lookup/did/:did': 'Forward lookup: DID → InboxId',
        'GET /v1/lookup/inbox/:inboxId': 'Reverse lookup: InboxId → DID'
      },
      bulk: {
        'POST /v1/bulk': 'Bulk lookup (up to 100 identifiers)'
      },
      register: {
        'POST /v1/register': 'Register a new mapping'
      },
      health: {
        'GET /health': 'Health check with stats'
      }
    }
  })
})

// 404 handler
app.notFound((c) => {
  return c.json({ error: 'Not found' }, 404)
})

// Error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err)
  return c.json(
    { error: err instanceof Error ? err.message : 'Internal server error' },
    500
  )
})

export default app
