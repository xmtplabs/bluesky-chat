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
| `/v1/admin/indexer/start` | POST | Start/initialize the indexer |
| `/v1/admin/indexer/reconnect` | POST | Force indexer reconnection |
| `/v1/admin/backfill` | POST | Backfill specific DIDs |
| `/v1/admin/backfill-from-firehose` | POST | Scan repos from ATProto relay |
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

### 6. Start the Indexer

```bash
curl -X POST https://your-worker.workers.dev/v1/admin/indexer/start \
  -H "X-Admin-Key: your-admin-key"
```

### 7. Backfill Historical Data

The Jetstream indexer only captures new records. To backfill existing mappings:

```bash
# Set environment variables
export BACKEND_URL=https://your-worker.workers.dev
export ADMIN_KEY=your-admin-key

# Option A: Scan from ATProto relay (comprehensive but slow)
pnpm backfill:relay -- --limit 100000

# Option B: Backfill specific DIDs from a file
pnpm backfill -- --from-file known-users.txt

# Option C: Single DID
pnpm backfill -- --did did:plc:xyz123
```

## Client Integration

The Electron app automatically uses the backend when `VITE_MAPPING_BACKEND_URL` is set:

```bash
# In .env.local
VITE_MAPPING_BACKEND_URL=https://your-worker.workers.dev
```

The client implements:
- **3-tier fallback**: Backend → Local cache → ATProto
- **Request deduplication** for concurrent lookups
- **Exponential backoff** on rate limits (429)
- **Circuit breaker** after repeated failures

## Rate Limiting

- **Limit**: 1000 requests/minute per IP
- **Headers**: `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`
- **Backoff**: Exponential on 429 responses

## Security

- **Public endpoints** are read-only or verify against ATProto
- **Admin endpoints** require `X-Admin-Key` header matching the configured secret
- **Register endpoint** only caches mappings that already exist on ATProto (prevents spoofing)

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
| `pnpm backfill` | Run backfill script |
| `pnpm backfill:relay` | Backfill from ATProto relay |
| `pnpm test` | Run tests |
| `pnpm typecheck` | Type check |
