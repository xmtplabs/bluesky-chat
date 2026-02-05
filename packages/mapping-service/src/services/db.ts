import type { D1Database } from '@cloudflare/workers-types'
import type { Mapping, MappingRow } from '../types'

function rowToMapping(row: MappingRow): Mapping {
  return {
    did: row.did,
    inboxId: row.inbox_id,
    signature: row.signature,
    handle: row.handle,
    createdAt: row.created_at,
    verifiedAt: row.verified_at
  }
}

export async function getMappingByDid(db: D1Database, did: string): Promise<Mapping | null> {
  const row = await db
    .prepare('SELECT * FROM mappings WHERE did = ?')
    .bind(did)
    .first<MappingRow>()

  return row ? rowToMapping(row) : null
}

export async function getMappingByInboxId(db: D1Database, inboxId: string): Promise<Mapping | null> {
  const row = await db
    .prepare('SELECT * FROM mappings WHERE inbox_id = ?')
    .bind(inboxId)
    .first<MappingRow>()

  return row ? rowToMapping(row) : null
}

export async function getMappingsByDids(db: D1Database, dids: string[]): Promise<Mapping[]> {
  if (dids.length === 0) return []

  const placeholders = dids.map(() => '?').join(', ')
  const result = await db
    .prepare(`SELECT * FROM mappings WHERE did IN (${placeholders})`)
    .bind(...dids)
    .all<MappingRow>()

  return (result.results ?? []).map(rowToMapping)
}

export async function getMappingsByInboxIds(db: D1Database, inboxIds: string[]): Promise<Mapping[]> {
  if (inboxIds.length === 0) return []

  const placeholders = inboxIds.map(() => '?').join(', ')
  const result = await db
    .prepare(`SELECT * FROM mappings WHERE inbox_id IN (${placeholders})`)
    .bind(...inboxIds)
    .all<MappingRow>()

  return (result.results ?? []).map(rowToMapping)
}

/**
 * Upsert a mapping.
 *
 * This is a cache - ATProto/Jetstream is the source of truth.
 * If an inbox_id moves from one DID to another, we delete the old mapping
 * and insert the new one.
 */
export async function upsertMapping(
  db: D1Database,
  mapping: Omit<Mapping, 'createdAt'> & { createdAt?: number }
): Promise<void> {
  const now = Date.now()
  const createdAt = mapping.createdAt ?? now

  // If this inbox_id was previously claimed by a different DID, remove it
  // (This handles legitimate reassignment - ATProto is the authority)
  const existingByInbox = await getMappingByInboxId(db, mapping.inboxId)
  if (existingByInbox && existingByInbox.did !== mapping.did) {
    await deleteMapping(db, existingByInbox.did)
  }

  await db
    .prepare(
      `INSERT INTO mappings (did, inbox_id, signature, handle, created_at, verified_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (did) DO UPDATE SET
         inbox_id = excluded.inbox_id,
         signature = excluded.signature,
         handle = excluded.handle,
         verified_at = excluded.verified_at`
    )
    .bind(
      mapping.did,
      mapping.inboxId,
      mapping.signature,
      mapping.handle ?? null,
      createdAt,
      mapping.verifiedAt
    )
    .run()
}

/**
 * Update just the handle for a mapping.
 * Used for async handle resolution.
 */
export async function updateHandle(
  db: D1Database,
  did: string,
  handle: string | null
): Promise<void> {
  await db
    .prepare('UPDATE mappings SET handle = ? WHERE did = ?')
    .bind(handle, did)
    .run()
}

export async function deleteMapping(db: D1Database, did: string): Promise<void> {
  await db.prepare('DELETE FROM mappings WHERE did = ?').bind(did).run()
}

export async function getTotalMappings(db: D1Database): Promise<number> {
  const result = await db
    .prepare('SELECT COUNT(*) as count FROM mappings')
    .first<{ count: number }>()

  return result?.count ?? 0
}
