-- backend/migrations/013_create_post_views_table.sql
-- Post views table for analytics and rate limiting

-- +migrate Up
CREATE TABLE IF NOT EXISTS post_views (
    id BIGSERIAL PRIMARY KEY,
    post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    -- Constraints
    CONSTRAINT fk_post_views_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    CONSTRAINT fk_post_views_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Indexes for efficient querying and analytics
CREATE INDEX idx_post_views_post_id ON post_views(post_id);
CREATE INDEX idx_post_views_user_id ON post_views(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_post_views_created_at ON post_views(created_at DESC);
CREATE INDEX idx_post_views_ip_address ON post_views(ip_address, created_at DESC);

-- Composite index for deduplication (one view per user per post per day)
CREATE INDEX idx_post_views_dedup ON post_views(post_id, user_id, created_at DESC) WHERE user_id IS NOT NULL;

COMMENT ON TABLE post_views IS 'Post view tracking for analytics and engagement metrics';
COMMENT ON COLUMN post_views.user_id IS 'NULL for anonymous/guest views';
COMMENT ON COLUMN post_views.ip_address IS 'For rate limiting and fraud detection';

-- +migrate Down
DROP TABLE IF EXISTS post_views CASCADE;
