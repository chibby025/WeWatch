-- Migration: Add LiveShare Graphics State Columns
-- Date: April 18, 2026
-- Purpose: Persist canvas graphics state for late joiner restoration
-- Related to: LiveShare Mode enhancement (Podcast, News, Show modes)

-- Add columns to watch_sessions table for persisting graphics state
ALTER TABLE watch_sessions 
ADD COLUMN IF NOT EXISTS live_share_banner_text TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS live_share_ticker_items TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS live_share_lower_third TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS live_share_logo_bug TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS live_share_break_screen TEXT DEFAULT '';

-- Add comments to document column purpose
COMMENT ON COLUMN watch_sessions.live_share_banner_text IS 'JSON string containing current banner graphic data (text, colors, position)';
COMMENT ON COLUMN watch_sessions.live_share_ticker_items IS 'JSON array containing ticker headlines for news/breaking news displays';
COMMENT ON COLUMN watch_sessions.live_share_lower_third IS 'JSON string containing lower third graphic (name, title overlay)';
COMMENT ON COLUMN watch_sessions.live_share_logo_bug IS 'JSON string containing logo bug positioning and image URL';
COMMENT ON COLUMN watch_sessions.live_share_break_screen IS 'JSON string containing break screen state (duration, message, time remaining)';

-- These columns store JSON as TEXT rather than JSONB for simplicity
-- Empty string '' means no graphic is active
-- Non-empty string contains serialized JSON from GraphicsRenderer layers
-- This enables late joiners to restore exact graphics state when joining session
