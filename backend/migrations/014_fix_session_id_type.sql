-- Migration 014: Fix session_id column type in watch_sessions table
-- The session_id should be VARCHAR(36) to store UUIDs, not BIGINT

-- First, drop foreign key constraints that reference watch_sessions.id
-- (These reference the auto-increment ID, not session_id, so they're fine)
-- But we need to temporarily allow NULL in session_id to do the conversion

-- Step 1: Drop the unique index on session_id temporarily
DROP INDEX IF EXISTS idx_watch_sessions_session_id;

-- Step 2: Change session_id from BIGINT to VARCHAR(36)
ALTER TABLE watch_sessions 
ALTER COLUMN session_id TYPE VARCHAR(36);

-- Step 3: Recreate the unique index
CREATE UNIQUE INDEX idx_watch_sessions_session_id ON watch_sessions(session_id);

-- Note: This migration is safe because:
-- 1. The session_id column should always contain UUID strings (not integers)
-- 2. Foreign keys in other tables reference watch_sessions.id (auto-increment), not session_id
-- 3. This fixes the type mismatch between code (VARCHAR) and database (BIGINT)
