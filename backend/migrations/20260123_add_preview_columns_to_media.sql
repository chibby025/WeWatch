-- Migration: Add preview columns for on-demand preview generation
-- Date: 2026-01-23

-- Add preview columns to media_items
ALTER TABLE media_items ADD COLUMN IF NOT EXISTS preview_url TEXT;
ALTER TABLE media_items ADD COLUMN IF NOT EXISTS preview_generated_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_media_items_preview_url ON media_items(preview_url);

-- Add preview columns to temporary_media_items
ALTER TABLE temporary_media_items ADD COLUMN IF NOT EXISTS preview_url TEXT;
ALTER TABLE temporary_media_items ADD COLUMN IF NOT EXISTS preview_generated_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_temp_media_items_preview_url ON temporary_media_items(preview_url);

-- Add media type tracking and current playback time to watch_sessions
ALTER TABLE watch_sessions ADD COLUMN IF NOT EXISTS current_media_type VARCHAR(20) DEFAULT 'none';
ALTER TABLE watch_sessions ADD COLUMN IF NOT EXISTS current_playback_time INTEGER DEFAULT 0;
ALTER TABLE watch_sessions ADD COLUMN IF NOT EXISTS current_media_id INTEGER DEFAULT 0;
ALTER TABLE watch_sessions ADD COLUMN IF NOT EXISTS current_media_path TEXT;

CREATE INDEX IF NOT EXISTS idx_watch_sessions_media_type ON watch_sessions(current_media_type);
