-- Migration: Add podcast configuration fields to watch_sessions
-- Date: 2026-03-07
-- Description: Adds podcast_title, podcast_logo_url, and podcast_guest_user_id for podcast mode

-- Add podcast configuration columns
ALTER TABLE watch_sessions ADD COLUMN IF NOT EXISTS podcast_title VARCHAR(500);
ALTER TABLE watch_sessions ADD COLUMN IF NOT EXISTS podcast_logo_url TEXT;
ALTER TABLE watch_sessions ADD COLUMN IF NOT EXISTS podcast_guest_user_id INT;

-- Add foreign key constraint for podcast_guest_user_id
ALTER TABLE watch_sessions ADD CONSTRAINT fk_podcast_guest_user 
    FOREIGN KEY (podcast_guest_user_id) REFERENCES users(id) ON DELETE SET NULL;

-- Create index for guest lookups
CREATE INDEX IF NOT EXISTS idx_watch_sessions_podcast_guest 
    ON watch_sessions(podcast_guest_user_id);

-- Add comments for documentation
COMMENT ON COLUMN watch_sessions.podcast_title IS 'Title/name of the podcast episode (only for liveshare_mode=podcast)';
COMMENT ON COLUMN watch_sessions.podcast_logo_url IS 'URL to podcast logo/artwork (optional, max 2MB)';
COMMENT ON COLUMN watch_sessions.podcast_guest_user_id IS 'User ID of the podcast guest (1 guest limit for MVP)';
