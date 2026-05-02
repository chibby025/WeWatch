-- backend/migrations/011_create_post_likes_table.sql
-- Post likes table for tracking user likes on posts

-- +migrate Up
CREATE TABLE IF NOT EXISTS post_likes (
    id BIGSERIAL PRIMARY KEY,
    post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    -- Constraints
    CONSTRAINT fk_post_likes_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    CONSTRAINT fk_post_likes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT uq_post_likes_post_user UNIQUE(post_id, user_id)
);

-- Indexes for efficient querying
CREATE INDEX idx_post_likes_post_id ON post_likes(post_id);
CREATE INDEX idx_post_likes_user_id ON post_likes(user_id);
CREATE INDEX idx_post_likes_created_at ON post_likes(created_at DESC);

COMMENT ON TABLE post_likes IS 'User likes on posts';
COMMENT ON CONSTRAINT uq_post_likes_post_user ON post_likes IS 'One like per user per post';

-- +migrate Down
DROP TABLE IF EXISTS post_likes CASCADE;
