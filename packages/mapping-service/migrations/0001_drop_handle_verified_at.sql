-- Migration: Drop handle and verified_at columns
-- These fields were removed as they don't serve the core DID↔InboxId mapping purpose:
-- - handle: Bluesky handles change over time and are better looked up directly from Bluesky
-- - verified_at: Was just a timestamp, not actual cryptographic verification

-- Drop the indexes first
DROP INDEX IF EXISTS idx_handle;
DROP INDEX IF EXISTS idx_verified_at;

-- Drop the columns (SQLite 3.35+)
ALTER TABLE mappings DROP COLUMN handle;
ALTER TABLE mappings DROP COLUMN verified_at;
