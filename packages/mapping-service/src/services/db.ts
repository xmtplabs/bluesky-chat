import type { D1Database } from '@cloudflare/workers-types'
import type { Mapping, MappingRow } from '../types'

function rowToMapping(row: MappingRow): Mapping {
  return {
    identityId: row.identity_id,
    inboxId: row.inbox_id,
    signature: row.signature,
    createdAt: row.created_at
  }
}

export async function getMappingByIdentityId(db: D1Database, identityId: string): Promise<Mapping | null> {
  const row = await db
    .prepare('SELECT * FROM mappings WHERE identity_id = ?')
    .bind(identityId)
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

export async function getMappingsByIdentityIds(db: D1Database, identityIds: string[]): Promise<Mapping[]> {
  if (identityIds.length === 0) return []

  const placeholders = identityIds.map(() => '?').join(', ')
  const result = await db
    .prepare(`SELECT * FROM mappings WHERE identity_id IN (${placeholders})`)
    .bind(...identityIds)
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
 * This is a cache - the identity provider's source is the source of truth.
 * If an inbox_id moves from one identity to another, we delete the old mapping
 * and insert the new one.
 */
export async function upsertMapping(
  db: D1Database,
  mapping: Omit<Mapping, 'createdAt'> & { createdAt?: number }
): Promise<void> {
  const now = Date.now()
  const createdAt = mapping.createdAt ?? now

  // If this inbox_id was previously claimed by a different identity, remove it
  const existingByInbox = await getMappingByInboxId(db, mapping.inboxId)
  if (existingByInbox && existingByInbox.identityId !== mapping.identityId) {
    await deleteMapping(db, existingByInbox.identityId)
  }

  await db
    .prepare(
      `INSERT INTO mappings (identity_id, inbox_id, signature, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (identity_id) DO UPDATE SET
         inbox_id = excluded.inbox_id,
         signature = excluded.signature`
    )
    .bind(
      mapping.identityId,
      mapping.inboxId,
      mapping.signature,
      createdAt
    )
    .run()
}

export async function deleteMapping(db: D1Database, identityId: string): Promise<void> {
  await db.prepare('DELETE FROM mappings WHERE identity_id = ?').bind(identityId).run()
}

export async function getTotalMappings(db: D1Database): Promise<number> {
  const result = await db
    .prepare('SELECT COUNT(*) as count FROM mappings')
    .first<{ count: number }>()

  return result?.count ?? 0
}
