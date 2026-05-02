-- backend/migrations/012_create_post_comments_table.sql
-- Post comments table for threaded discussions on posts

-- +migrate Up
CREATE TABLE IF NOT EXISTS post_comments (
    id BIGSERIAL PRIMARY KEY,
    post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_comment_id BIGINT REFERENCES post_comments(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    likes_count INTEGER DEFAULT 0 NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    -- Constraints
    CONSTRAINT fk_post_comments_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    CONSTRAINT fk_post_comments_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_post_comments_parent FOREIGN KEY (parent_comment_id) REFERENCES post_comments(id) ON DELETE CASCADE,
    CONSTRAINT check_content_not_empty CHECK (LENGTH(TRIM(content)) > 0)
);

-- Indexes for efficient querying
CREATE INDEX idx_post_comments_post_id ON post_comments(post_id);
CREATE INDEX idx_post_comments_user_id ON post_comments(user_id);
CREATE INDEX idx_post_comments_parent_id ON post_comments(parent_comment_id) WHERE parent_comment_id IS NOT NULL;
CREATE INDEX idx_post_comments_created_at ON post_comments(created_at DESC);
CREATE INDEX idx_post_comments_deleted_at ON post_comments(deleted_at) WHERE deleted_at IS NULL;

-- Composite index for fetching post comments (top-level first)
CREATE INDEX idx_post_comments_post_toplevel ON post_comments(post_id, created_at DESC) WHERE parent_comment_id IS NULL AND deleted_at IS NULL;

COMMENT ON TABLE post_comments IS 'Comments on posts with support for threaded replies';
COMMENT ON COLUMN post_comments.parent_comment_id IS 'NULL for top-level comments, references parent for replies';
COMMENT ON COLUMN post_comments.likes_count IS 'Number of likes on this comment (future feature)';

-- +migrate Down
DROP TABLE IF EXISTS post_comments CASCADE;
