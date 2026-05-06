-- Migration: Add download tracking to posts
-- Created: 2026-05-03

-- Add download fields to posts table
ALTER TABLE posts ADD COLUMN IF NOT EXISTS allow_downloads BOOLEAN DEFAULT true NOT NULL;
ALTER TABLE posts ADD COLUMN IF NOT EXISTS downloads_count INTEGER DEFAULT 0 NOT NULL;

-- Drop table if exists to recreate with correct structure
DROP TABLE IF EXISTS post_downloads CASCADE;

-- Create post_downloads table for tracking individual downloads
CREATE TABLE post_downloads (
    id BIGSERIAL PRIMARY KEY,
    post_id BIGINT NOT NULL,
    user_id BIGINT,
    ip_address VARCHAR(45),
    user_agent TEXT,
    downloaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign keys
    CONSTRAINT post_downloads_post_id_fkey FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    CONSTRAINT post_downloads_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Create indexes for efficient queries
CREATE INDEX idx_post_downloads_post_id ON post_downloads(post_id);
CREATE INDEX idx_post_downloads_user_id ON post_downloads(user_id);
CREATE INDEX idx_post_downloads_downloaded_at ON post_downloads(downloaded_at);

-- Add comments
COMMENT ON TABLE post_downloads IS 'Tracks individual post download events for analytics';
COMMENT ON COLUMN posts.allow_downloads IS 'Whether creator allows downloads for this post';
COMMENT ON COLUMN posts.downloads_count IS 'Cached count of total downloads';
