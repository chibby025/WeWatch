-- Migration: Add class_type column to watch_sessions table
-- This supports lecture hall vs regular classroom distinction

ALTER TABLE watch_sessions 
ADD COLUMN IF NOT EXISTS class_type VARCHAR(50);

COMMENT ON COLUMN watch_sessions.class_type IS 'Type of classroom: "classroom" or "lecture_hall" (only for watch_type="classroom")';
