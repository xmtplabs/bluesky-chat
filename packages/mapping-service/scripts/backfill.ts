#!/usr/bin/env npx tsx
/**
 * Backfill script for initial deployment.
 *
 * This script scans ATProto repos for org.xmtp.inbox records and
 * registers them with the mapping service backend.
 *
 * Usage:
 *   # Backfill from relay (scans all repos)
 *   npx tsx scripts/backfill.ts --from-relay --limit 10000
 *
 *   # Backfill specific DIDs from a file
 *   npx tsx scripts/backfill.ts --from-file dids.txt
 *
 *   # Backfill a single DID
 *   npx tsx scripts/backfill.ts --did did:plc:xyz123
 *
 * Environment:
 *   BACKEND_URL - URL of the mapping service (default: http://localhost:8787)
 *   ADMIN_KEY - Admin API key for authentication
 */

const BACKEND_URL = process.env.BACKEND_URL ?? 'http://localhost:8787'
const ADMIN_KEY = process.env.ADMIN_KEY

if (!ADMIN_KEY) {
  console.error('Error: ADMIN_KEY environment variable is required')
  console.error('Set the same key you configured with: wrangler secret put ADMIN_KEY')
  process.exit(1)
}
const COLLECTION = 'org.xmtp.inbox'
const BATCH_SIZE = 50
const DELAY_BETWEEN_BATCHES_MS = 1000

interface BackfillStats {
  scanned: number
  found: number
  indexed: number
  failed: number
  startTime: number
}

async function fetchATProtoRecord(
  did: string
): Promise<{ inboxId: string; signature: string } | null> {
  try {
    const response = await fetch(
      `https://bsky.social/xrpc/com.atproto.repo.getRecord?repo=${encodeURIComponent(did)}&collection=${COLLECTION}&rkey=self`
    )

    if (!response.ok) return null

    const data = (await response.json()) as {
      value?: { id?: string; verificationSignature?: string }
    }

    if (!data.value?.id || !data.value?.verificationSignature) return null

    return {
      inboxId: data.value.id,
      signature: data.value.verificationSignature
    }
  } catch {
    return null
  }
}

async function fetchHandle(did: string): Promise<string | null> {
  try {
    const response = await fetch(
      `https://bsky.social/xrpc/com.atproto.repo.describeRepo?repo=${encodeURIComponent(did)}`
    )

    if (!response.ok) return null

    const data = (await response.json()) as { handle?: string }
    return data.handle ?? null
  } catch {
    return null
  }
}

async function registerMapping(
  did: string,
  inboxId: string,
  signature: string,
  handle: string | null
): Promise<boolean> {
  try {
    const response = await fetch(`${BACKEND_URL}/v1/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Key': ADMIN_KEY
      },
      body: JSON.stringify({ did, inboxId, signature, handle })
    })

    return response.ok
  } catch {
    return false
  }
}

async function processDid(did: string, stats: BackfillStats): Promise<void> {
  stats.scanned++

  const record = await fetchATProtoRecord(did)
  if (!record) return

  stats.found++

  const handle = await fetchHandle(did)
  const success = await registerMapping(did, record.inboxId, record.signature, handle)

  if (success) {
    stats.indexed++
    console.log(`✓ ${did} -> ${record.inboxId.slice(0, 16)}... (${handle ?? 'no handle'})`)
  } else {
    stats.failed++
    console.log(`✗ ${did} - registration failed`)
  }
}

async function backfillFromRelay(limit: number): Promise<void> {
  console.log(`\nBackfilling from ATProto relay (limit: ${limit})...\n`)

  const stats: BackfillStats = {
    scanned: 0,
    found: 0,
    indexed: 0,
    failed: 0,
    startTime: Date.now()
  }

  let cursor: string | undefined
  let totalScanned = 0

  while (totalScanned < limit) {
    const batchLimit = Math.min(1000, limit - totalScanned)
    const params = new URLSearchParams({ limit: String(batchLimit) })
    if (cursor) params.set('cursor', cursor)

    console.log(`Fetching repos batch (cursor: ${cursor ?? 'start'})...`)

    const response = await fetch(
      `https://bsky.network/xrpc/com.atproto.sync.listRepos?${params}`
    )

    if (!response.ok) {
      console.error(`Relay error: ${response.status}`)
      break
    }

    const data = (await response.json()) as {
      repos: Array<{ did: string }>
      cursor?: string
    }

    if (data.repos.length === 0) break

    // Process in batches to avoid overwhelming the backend
    for (let i = 0; i < data.repos.length; i += BATCH_SIZE) {
      const batch = data.repos.slice(i, i + BATCH_SIZE)
      await Promise.all(batch.map((repo) => processDid(repo.did, stats)))

      if (i + BATCH_SIZE < data.repos.length) {
        await sleep(DELAY_BETWEEN_BATCHES_MS)
      }
    }

    totalScanned += data.repos.length
    cursor = data.cursor

    if (!cursor) break

    printProgress(stats)
    await sleep(DELAY_BETWEEN_BATCHES_MS)
  }

  printFinalStats(stats)
}

async function backfillFromFile(filePath: string): Promise<void> {
  const fs = await import('fs')
  const content = fs.readFileSync(filePath, 'utf-8')
  const dids = content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('did:'))

  console.log(`\nBackfilling ${dids.length} DIDs from file...\n`)

  const stats: BackfillStats = {
    scanned: 0,
    found: 0,
    indexed: 0,
    failed: 0,
    startTime: Date.now()
  }

  for (let i = 0; i < dids.length; i += BATCH_SIZE) {
    const batch = dids.slice(i, i + BATCH_SIZE)
    await Promise.all(batch.map((did) => processDid(did, stats)))

    if (i + BATCH_SIZE < dids.length) {
      printProgress(stats)
      await sleep(DELAY_BETWEEN_BATCHES_MS)
    }
  }

  printFinalStats(stats)
}

async function backfillSingleDid(did: string): Promise<void> {
  console.log(`\nBackfilling single DID: ${did}\n`)

  const stats: BackfillStats = {
    scanned: 0,
    found: 0,
    indexed: 0,
    failed: 0,
    startTime: Date.now()
  }

  await processDid(did, stats)
  printFinalStats(stats)
}

function printProgress(stats: BackfillStats): void {
  const elapsed = (Date.now() - stats.startTime) / 1000
  const rate = stats.scanned / elapsed

  console.log(
    `\n[Progress] Scanned: ${stats.scanned} | Found: ${stats.found} | ` +
      `Indexed: ${stats.indexed} | Failed: ${stats.failed} | ` +
      `Rate: ${rate.toFixed(1)}/s\n`
  )
}

function printFinalStats(stats: BackfillStats): void {
  const elapsed = (Date.now() - stats.startTime) / 1000

  console.log('\n' + '='.repeat(50))
  console.log('BACKFILL COMPLETE')
  console.log('='.repeat(50))
  console.log(`Scanned:  ${stats.scanned}`)
  console.log(`Found:    ${stats.found} (${((stats.found / stats.scanned) * 100).toFixed(1)}%)`)
  console.log(`Indexed:  ${stats.indexed}`)
  console.log(`Failed:   ${stats.failed}`)
  console.log(`Duration: ${elapsed.toFixed(1)}s`)
  console.log(`Rate:     ${(stats.scanned / elapsed).toFixed(1)} repos/s`)
  console.log('='.repeat(50))
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Parse arguments and run
async function main(): Promise<void> {
  const args = process.argv.slice(2)

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Usage:
  npx tsx scripts/backfill.ts --from-relay [--limit N]
  npx tsx scripts/backfill.ts --from-file <path>
  npx tsx scripts/backfill.ts --did <did>

Options:
  --from-relay    Scan repos from ATProto relay
  --limit N       Max repos to scan (default: 10000)
  --from-file     Read DIDs from file (one per line)
  --did           Backfill a single DID

Environment:
  BACKEND_URL     Mapping service URL (default: http://localhost:8787)
  ADMIN_KEY       Admin API key
`)
    process.exit(0)
  }

  if (args.includes('--from-relay')) {
    const limitIndex = args.indexOf('--limit')
    const limit = limitIndex >= 0 ? parseInt(args[limitIndex + 1], 10) : 10000
    await backfillFromRelay(limit)
  } else if (args.includes('--from-file')) {
    const fileIndex = args.indexOf('--from-file')
    const filePath = args[fileIndex + 1]
    if (!filePath) {
      console.error('Error: --from-file requires a file path')
      process.exit(1)
    }
    await backfillFromFile(filePath)
  } else if (args.includes('--did')) {
    const didIndex = args.indexOf('--did')
    const did = args[didIndex + 1]
    if (!did) {
      console.error('Error: --did requires a DID')
      process.exit(1)
    }
    await backfillSingleDid(did)
  } else {
    console.error('Error: Must specify --from-relay, --from-file, or --did')
    console.error('Run with --help for usage')
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
