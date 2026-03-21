-- Migration: Add unique constraint to liveshare_participants table
-- Date: 2026-03-07
-- Description: Adds unique constraint on (session_id, user_id) to support ON CONFLICT clause

-- Add unique constraint to prevent duplicate participant entries per session
ALTER TABLE liveshare_participants 
ADD CONSTRAINT liveshare_participants_session_user_unique 
UNIQUE (session_id, user_id);

-- Add comment for documentation
COMMENT ON CONSTRAINT liveshare_participants_session_user_unique ON liveshare_participants 
IS 'Ensures each user can only have one entry per session (supports ON CONFLICT upsert)';
