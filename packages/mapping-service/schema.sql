-- Identity↔InboxId mappings table
-- Stores verified cryptographic bindings between identity IDs and XMTP inbox IDs

CREATE TABLE IF NOT EXISTS mappings (
  identity_id TEXT PRIMARY KEY,        -- Identity ID (DID, npub, hex pubkey, etc.)
  inbox_id TEXT NOT NULL UNIQUE,       -- XMTP inbox ID (hex string)
  signature TEXT NOT NULL,             -- Base64-encoded verification signature
  created_at INTEGER NOT NULL          -- Unix timestamp when first created
);

-- Index for reverse lookup (inbox_id → identity)
CREATE INDEX IF NOT EXISTS idx_inbox_id ON mappings(inbox_id);

-- Index for admin stats query (ORDER BY created_at ASC)
CREATE INDEX IF NOT EXISTS idx_created_at ON mappings(created_at ASC);
