#!/usr/bin/env npx tsx
/**
 * Backfill script for populating the mapping cache.
 *
 * This script registers known DIDs with the mapping service backend,
 * which fetches and caches their org.xmtp.inbox records from ATProto.
 *
 * Usage:
 *   # Backfill specific DIDs from a file (one DID per line)
 *   npx tsx scripts/backfill.ts --from-file known-users.txt
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

const BATCH_SIZE = 50
const DELAY_BETWEEN_BATCHES_MS = 1000

interface BackfillStats {
  scanned: number
  indexed: number
  notFound: number
  failed: number
  startTime: number
}

async function registerMapping(did: string): Promise<'indexed' | 'not_found' | 'failed'> {
  try {
    const response = await fetch(`${BACKEND_URL}/v1/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Key': ADMIN_KEY
      },
      body: JSON.stringify({ did })
    })

    if (response.ok) return 'indexed'
    if (response.status === 404) return 'not_found'
    return 'failed'
  } catch {
    return 'failed'
  }
}

async function processDid(did: string, stats: BackfillStats): Promise<void> {
  stats.scanned++

  const result = await registerMapping(did)

  switch (result) {
    case 'indexed':
      stats.indexed++
      console.log(`✓ ${did}`)
      break
    case 'not_found':
      stats.notFound++
      console.log(`- ${did} (no org.xmtp.inbox record)`)
      break
    case 'failed':
      stats.failed++
      console.log(`✗ ${did} (registration failed)`)
      break
  }
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
    indexed: 0,
    notFound: 0,
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
    indexed: 0,
    notFound: 0,
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
    `\n[Progress] Scanned: ${stats.scanned} | Indexed: ${stats.indexed} | ` +
      `Not found: ${stats.notFound} | Failed: ${stats.failed} | ` +
      `Rate: ${rate.toFixed(1)}/s\n`
  )
}

function printFinalStats(stats: BackfillStats): void {
  const elapsed = (Date.now() - stats.startTime) / 1000

  console.log('\n' + '='.repeat(50))
  console.log('BACKFILL COMPLETE')
  console.log('='.repeat(50))
  console.log(`Scanned:   ${stats.scanned}`)
  console.log(`Indexed:   ${stats.indexed}`)
  console.log(`Not found: ${stats.notFound}`)
  console.log(`Failed:    ${stats.failed}`)
  console.log(`Duration:  ${elapsed.toFixed(1)}s`)
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
  npx tsx scripts/backfill.ts --from-file <path>
  npx tsx scripts/backfill.ts --did <did>

Options:
  --from-file     Read DIDs from file (one per line)
  --did           Backfill a single DID

Environment:
  BACKEND_URL     Mapping service URL (default: http://localhost:8787)
  ADMIN_KEY       Admin API key
`)
    process.exit(0)
  }

  if (args.includes('--from-file')) {
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
    console.error('Error: Must specify --from-file or --did')
    console.error('Run with --help for usage')
    process.exit(1)
  }
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
