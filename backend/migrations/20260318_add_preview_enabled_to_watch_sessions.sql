-- Migration: Add preview_enabled field to watch_sessions table for content moderation
-- Date: March 18, 2026
-- Description: Allows hosts to toggle preview thumbnail generation on/off for content moderation purposes

-- Add preview_enabled column (defaults to TRUE for existing sessions)
ALTER TABLE watch_sessions 
ADD COLUMN IF NOT EXISTS preview_enabled BOOLEAN DEFAULT TRUE;

-- Add comment for documentation
COMMENT ON COLUMN watch_sessions.preview_enabled IS 'If false, no preview thumbnails generated for lobby. Used for content moderation.';
