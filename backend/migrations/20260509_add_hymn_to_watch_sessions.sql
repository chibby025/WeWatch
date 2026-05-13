-- Migration: Add current_hymn columns to watch_sessions table
-- This allows hymns to persist for church mode late joiners

-- Add columns for current hymn state
ALTER TABLE watch_sessions
ADD COLUMN IF NOT EXISTS current_hymn TEXT,
ADD COLUMN IF NOT EXISTS current_hymn_verse INTEGER DEFAULT 1;

-- Add comments
COMMENT ON COLUMN watch_sessions.current_hymn IS 'JSON string of current hymn for church mode (title, verses, textStyle, author)';
COMMENT ON COLUMN watch_sessions.current_hymn_verse IS 'Current verse number being displayed (1-based index)';
