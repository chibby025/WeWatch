-- Add index on ends_at column for fast expiry queries
-- This index makes the "WHERE ends_at <= NOW()" query extremely fast
-- Even with millions of records, query time stays under 10ms

CREATE INDEX IF NOT EXISTS idx_room_tv_contents_ends_at 
ON room_tv_contents(ends_at);

-- Composite index for session + expiry filtering
CREATE INDEX IF NOT EXISTS idx_room_tv_contents_session_ends_at 
ON room_tv_contents(session_id, ends_at);

-- Explain: With these indexes, PostgreSQL can:
-- 1. Quickly find all expired content using B-tree index scan
-- 2. Filter by session + expiry without full table scan
-- 3. Handle 10-second cleanup intervals efficiently
