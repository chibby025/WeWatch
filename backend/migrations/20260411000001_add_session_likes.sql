-- Migration: Add session likes table and engagement metrics
-- Date: 2026-04-11
-- Purpose: Enable session liking functionality for lobby preview cards

-- Create session_likes table
CREATE TABLE IF NOT EXISTS session_likes (
    id BIGSERIAL PRIMARY KEY,
    session_id VARCHAR(36) NOT NULL,
    user_id BIGINT NOT NULL,
    liked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    
    -- Composite index for fast lookup and prevent duplicates
    CONSTRAINT idx_session_likes_session_user UNIQUE(session_id, user_id),
    
    -- Foreign keys
    CONSTRAINT fk_session_likes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_session_likes_session_id ON session_likes(session_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_session_likes_user_id ON session_likes(user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_session_likes_liked_at ON session_likes(liked_at DESC) WHERE deleted_at IS NULL;

-- Note: likes_count column already exists in watch_sessions table (added in migration 008)
-- Verify it exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'watch_sessions' 
        AND column_name = 'likes_count'
    ) THEN
        ALTER TABLE watch_sessions ADD COLUMN likes_count INTEGER DEFAULT 0 NOT NULL;
    END IF;
END $$;

-- Create index on likes_count for sorting in lobby
CREATE INDEX IF NOT EXISTS idx_watch_sessions_likes_count ON watch_sessions(likes_count DESC) WHERE is_active = true AND deleted_at IS NULL;

-- Add comment for documentation
COMMENT ON TABLE session_likes IS 'Tracks user likes on watch sessions for engagement metrics and social proof in lobby';
COMMENT ON COLUMN session_likes.session_id IS 'UUID of the watch session being liked';
COMMENT ON COLUMN session_likes.user_id IS 'ID of user who liked the session';
COMMENT ON COLUMN session_likes.liked_at IS 'Timestamp when the like was created';
