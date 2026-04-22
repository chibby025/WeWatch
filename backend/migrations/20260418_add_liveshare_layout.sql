-- Add liveshare_layout column to watch_sessions table
-- This stores the layout selection (solo-view, screen-share, split-view, panel-view)
-- for late joiner restoration

ALTER TABLE watch_sessions 
ADD COLUMN IF NOT EXISTS liveshare_layout TEXT DEFAULT '';

-- Index for faster queries (optional but recommended)
CREATE INDEX IF NOT EXISTS idx_watch_sessions_liveshare_layout 
ON watch_sessions(liveshare_layout) 
WHERE liveshare_layout != '';
