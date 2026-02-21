-- Migration: Add unique constraint to prevent duplicate active session members
-- This ensures only ONE active member record can exist per (watch_session_id, user_id) combination
-- Prevents the bug where duplicate connections create multiple member records

-- ✅ Step 1: Clean up existing duplicates (keep the most recent join for each user/session)
WITH ranked_members AS (
    SELECT 
        id,
        watch_session_id,
        user_id,
        ROW_NUMBER() OVER (
            PARTITION BY watch_session_id, user_id 
            ORDER BY joined_at DESC, id DESC
        ) AS rn
    FROM watch_session_members
    WHERE is_active = true
)
UPDATE watch_session_members
SET is_active = false, left_at = NOW()
WHERE id IN (
    SELECT id FROM ranked_members WHERE rn > 1
);

-- ✅ Step 2: Add partial unique index (only applies when is_active = true)
-- PostgreSQL allows this - the constraint only enforces uniqueness for active members
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_session_member 
ON watch_session_members (watch_session_id, user_id) 
WHERE is_active = true;

-- ✅ Step 3: Add index on session_id + is_active for fast active member queries
CREATE INDEX IF NOT EXISTS idx_session_members_active 
ON watch_session_members (watch_session_id, is_active) 
WHERE is_active = true;

-- ✅ Step 4: Add index on user_id for fast user lookups
CREATE INDEX IF NOT EXISTS idx_session_members_user 
ON watch_session_members (user_id);
