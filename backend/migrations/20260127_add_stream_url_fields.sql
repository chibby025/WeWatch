-- Migration: Add stream URL fields to temporary_media_items
-- Date: 2026-01-27

-- Add stream URL fields to temporary_media_items table
ALTER TABLE temporary_media_items ADD COLUMN IF NOT EXISTS is_stream BOOLEAN DEFAULT FALSE;
ALTER TABLE temporary_media_items ADD COLUMN IF NOT EXISTS original_stream_url TEXT;

-- Add index for quick lookup of stream vs uploaded media
CREATE INDEX IF NOT EXISTS idx_temp_media_items_is_stream ON temporary_media_items(is_stream);
