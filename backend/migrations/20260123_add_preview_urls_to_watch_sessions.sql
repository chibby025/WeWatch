-- Add poster_url and preview_url columns to watch_sessions table
-- These store URLs for session preview images (poster frame and animated GIF)

ALTER TABLE watch_sessions 
ADD COLUMN IF NOT EXISTS poster_url TEXT,
ADD COLUMN IF NOT EXISTS preview_url TEXT;

-- Add index for faster lookups when fetching sessions with previews
CREATE INDEX IF NOT EXISTS idx_watch_sessions_preview_url ON watch_sessions(preview_url) WHERE preview_url IS NOT NULL;
