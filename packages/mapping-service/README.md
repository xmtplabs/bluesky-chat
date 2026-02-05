# DID↔InboxId Mapping Service

A Cloudflare Workers backend service that provides a global cache of Bluesky DID to XMTP InboxId mappings.

## Overview

This service eliminates the need for each bluesky-chat client to run its own Jetstream indexer by providing:

- **Centralized indexing** via Jetstream Durable Object (single WebSocket connection)
- **Fast lookups** for all clients via edge-deployed API
- **Reduced load** on ATProto infrastructure
- **Bulk lookups** for efficient conversation list loading

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Cloudflare Workers                        │
│  ┌─────────────────┐    ┌──────────────────────────────┐    │
│  │  API Worker     │    │  Jetstream Durable Object    │    │
│  │  (Hono)         │    │  (WebSocket indexer)         │    │
│  └────────┬────────┘    └──────────────┬───────────────┘    │
│           │                            │                     │
│           └────────────┬───────────────┘                     │
│                        │                                     │
│                  ┌─────▼─────┐                               │
│                  │    D1     │                               │
│                  │ (SQLite)  │                               │
│                  └───────────┘                               │
└─────────────────────────────────────────────────────────────┘
```

## API Endpoints

### Public Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/lookup/did/:did` | GET | Forward lookup: DID → InboxId |
| `/v1/lookup/inbox/:inboxId` | GET | Reverse lookup: InboxId → DID |
| `/v1/bulk` | POST | Bulk lookup (up to 100 identifiers) |
| `/v1/register` | POST | Register mapping (verifies against ATProto) |
| `/health` | GET | Health check with stats |

### Admin Endpoints (require `X-Admin-Key` header)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v1/admin/indexer/status` | GET | Get indexer connection status |
| `/v1/admin/indexer/reconnect` | POST | Force indexer reconnection |
| `/v1/admin/backfill` | POST | Backfill specific DIDs |
| `/v1/admin/stats` | GET | Detailed database statistics |

## Deployment

### 1. Create the D1 Database

```bash
cd packages/mapping-service
pnpm run db:create
```

This outputs a database ID. Copy it.

### 2. Update wrangler.toml

Replace `YOUR_DATABASE_ID_HERE` with the database ID from step 1:

```toml
[[d1_databases]]
binding = "DB"
database_name = "bluesky-chat-mappings"
database_id = "your-actual-database-id"
```

### 3. Apply the Schema

```bash
# Apply to remote database
pnpm run db:migrate -- --remote
```

### 4. Set the Admin Secret

```bash
wrangler secret put ADMIN_KEY
# Enter a secure random string when prompted
```

### 5. Deploy

```bash
pnpm run deploy
```

The Jetstream indexer starts automatically on first request. Verify it's connected:

```bash
curl https://your-worker.workers.dev/v1/admin/indexer/status \
  -H "X-Admin-Key: your-admin-key"
```

### 6. Backfill Known Users (Optional)

The Jetstream indexer captures new records automatically. To pre-populate the cache with known users:

```bash
# Set environment variables
export BACKEND_URL=https://your-worker.workers.dev
export ADMIN_KEY=your-admin-key

# Backfill specific DIDs from a file (one DID per line)
pnpm backfill -- --from-file known-users.txt

# Or a single DID
pnpm backfill -- --did did:plc:xyz123
```

## Client Integration

The Electron app automatically uses the backend when `VITE_MAPPING_BACKEND_URL` is set:

```bash
# In .env.local
VITE_MAPPING_BACKEND_URL=https://your-worker.workers.dev
```

The client implements:
- **Backend → Local cache → ATProto** fallback chain
- **Request deduplication** for concurrent lookups
- **Exponential backoff** on rate limits (429)
- **Circuit breaker** after repeated failures
- **Client-side verification** of all mappings (this service is a cache, not an authority)

## Rate Limiting

- **Public endpoints**: 1000 requests/minute per IP
- **Admin endpoints**: 100 requests/minute per IP
- **429 Response**: Includes `Retry-After` header
- Uses Cloudflare's native rate limiting (global, not per-isolate)

## Security Model

**This service is a cache, not an authority.** ATProto is the source of truth.

- **Clients must verify** all mappings independently before trusting them
- **Register endpoint** only caches mappings that already exist on ATProto
- **Public endpoints** are read-only lookups
- **Admin endpoints** require `X-Admin-Key` header with timing-safe comparison
- **Rate limiting** uses Cloudflare's global rate limiting to prevent abuse

## Local Development

```bash
# Install dependencies
pnpm install

# Run locally (uses local D1)
pnpm run dev

# Apply schema to local database
pnpm run db:migrate:local

# Run tests
pnpm test
```

## Scripts

| Script | Description |
|--------|-------------|
| `pnpm run dev` | Run locally with Wrangler |
| `pnpm run deploy` | Deploy to Cloudflare Workers |
| `pnpm run db:create` | Create D1 database |
| `pnpm run db:migrate` | Apply schema to remote DB |
| `pnpm run db:migrate:local` | Apply schema to local DB |
| `pnpm backfill` | Backfill known DIDs |
| `pnpm test` | Run tests |
| `pnpm typecheck` | Type check |
