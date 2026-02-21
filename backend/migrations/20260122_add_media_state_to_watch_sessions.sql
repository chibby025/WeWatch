-- Add media state fields to watch_sessions for lecture hall preview generation
-- Migration: 20260122_add_media_state_to_watch_sessions

ALTER TABLE watch_sessions
ADD COLUMN current_media_url TEXT,
ADD COLUMN current_media_type VARCHAR(20),
ADD COLUMN is_screen_sharing_active BOOLEAN DEFAULT FALSE,
ADD COLUMN sharing_source VARCHAR(20);

-- Add comments for clarity
COMMENT ON COLUMN watch_sessions.current_media_url IS 'file_url of currently playing media (for uploaded videos)';
COMMENT ON COLUMN watch_sessions.current_media_type IS 'Type of media: upload, liveshare, watchfrom';
COMMENT ON COLUMN watch_sessions.is_screen_sharing_active IS 'True when LiveShare or WatchFrom is active';
COMMENT ON COLUMN watch_sessions.sharing_source IS 'Source of screen share: liveshare or watchfrom';
