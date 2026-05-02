-- Migration: Add current_bible_verse column to watch_sessions table
-- Purpose: Store current Bible verse for church mode (for late joiners)
-- Date: 2026-04-30

ALTER TABLE watch_sessions
ADD COLUMN IF NOT EXISTS current_bible_verse TEXT;

-- Add comment for documentation
COMMENT ON COLUMN watch_sessions.current_bible_verse IS 'JSON string of current Bible verse for church mode (reference, text, textStyle)';
