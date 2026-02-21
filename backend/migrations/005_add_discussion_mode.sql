-- Migration 005: Add discussion_mode column to watch_sessions table
-- Purpose: Store discussion mode state for lecture hall sessions
-- Created: 2024

-- Add discussion_mode column with default false
ALTER TABLE watch_sessions 
ADD COLUMN IF NOT EXISTS discussion_mode BOOLEAN DEFAULT FALSE;

-- Add index for faster queries if needed
CREATE INDEX IF NOT EXISTS idx_watch_sessions_discussion_mode 
ON watch_sessions(discussion_mode);

-- Add comment for documentation
COMMENT ON COLUMN watch_sessions.discussion_mode IS 'When true, all lecture hall participants can broadcast to everyone (overrides row-based audio)';
