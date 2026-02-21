-- Add session_title column to watch_sessions table
-- This allows hosts to set custom titles for their watch sessions
-- Auto-populated from media titles in upload tab, manually editable in liveshare/watchfrom tabs

ALTER TABLE watch_sessions 
ADD COLUMN session_title VARCHAR(500);

COMMENT ON COLUMN watch_sessions.session_title IS 'Display title for the watch session, shown in lobby watching tab';
