-- Add is_active column to watch_sessions table
-- This provides an explicit flag to check if a session is active
-- alongside the EndedAt timestamp check

ALTER TABLE watch_sessions 
ADD COLUMN is_active BOOLEAN DEFAULT TRUE;

-- Set is_active to FALSE for all sessions that have ended
UPDATE watch_sessions 
SET is_active = FALSE 
WHERE ended_at IS NOT NULL;

-- Set is_active to TRUE for all sessions that are still active
UPDATE watch_sessions 
SET is_active = TRUE 
WHERE ended_at IS NULL;

-- Create index for faster lookups
CREATE INDEX idx_watch_sessions_is_active ON watch_sessions(is_active);
CREATE INDEX idx_watch_sessions_room_active ON watch_sessions(room_id, is_active);
