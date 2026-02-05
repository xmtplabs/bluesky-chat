-- DID↔InboxId mappings table
-- Stores verified cryptographic bindings between Bluesky DIDs and XMTP inbox IDs

CREATE TABLE IF NOT EXISTS mappings (
  did TEXT PRIMARY KEY,           -- Bluesky DID (e.g., did:plc:abc123)
  inbox_id TEXT NOT NULL UNIQUE,  -- XMTP inbox ID (hex string)
  signature TEXT NOT NULL,        -- Base64-encoded verification signature
  created_at INTEGER NOT NULL     -- Unix timestamp when first created
);

-- Index for reverse lookup (inbox_id → DID)
CREATE INDEX IF NOT EXISTS idx_inbox_id ON mappings(inbox_id);

-- Index for admin stats query (ORDER BY created_at ASC)
CREATE INDEX IF NOT EXISTS idx_created_at ON mappings(created_at ASC);
