-- Migration: Add LiveShare participants table and mode column to watch_sessions
-- Date: 2026-03-04
-- Description: Adds support for collaborative broadcasting modes (podcast, interview, etc.)

-- Add liveshare_mode column to watch_sessions table
ALTER TABLE watch_sessions ADD COLUMN IF NOT EXISTS liveshare_mode VARCHAR(50) DEFAULT 'regular';

-- Create liveshare_participants table
CREATE TABLE IF NOT EXISTS liveshare_participants (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL,
    user_id INT NOT NULL,
    role VARCHAR(20) CHECK (role IN ('host', 'guest')) NOT NULL,
    share_type VARCHAR(20) CHECK (share_type IN ('camera', 'screen', 'both')),
    status VARCHAR(20) CHECK (status IN ('granted', 'active', 'left', 'revoked')) NOT NULL,
    position INT CHECK (position IN (0, 1)) NOT NULL, -- 0=host, 1=guest
    granted_at TIMESTAMP DEFAULT NOW(),
    joined_at TIMESTAMP,
    left_at TIMESTAMP
);

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_liveshare_session_status 
    ON liveshare_participants(session_id, status);

CREATE INDEX IF NOT EXISTS idx_liveshare_user_id 
    ON liveshare_participants(user_id);

-- Add comments for documentation
COMMENT ON TABLE liveshare_participants IS 'Tracks participants in LiveShare collaborative broadcasting sessions';
COMMENT ON COLUMN liveshare_participants.role IS 'host or guest';
COMMENT ON COLUMN liveshare_participants.share_type IS 'camera, screen, or both';
COMMENT ON COLUMN liveshare_participants.status IS 'granted (invited), active (joined), left (disconnected), revoked (permission removed)';
COMMENT ON COLUMN liveshare_participants.position IS '0 for host, 1 for guest (used for split-screen layout)';
COMMENT ON COLUMN watch_sessions.liveshare_mode IS 'Mode: regular, podcast, interview, news, standup';
