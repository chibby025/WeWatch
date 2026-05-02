-- backend/migrations/010_create_posts_table.sql
-- Posts table for user-generated content (recordings and uploads)

-- +migrate Up
CREATE TABLE IF NOT EXISTS posts (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    room_id BIGINT REFERENCES rooms(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    video_url TEXT,
    thumbnail_url TEXT,
    media_type VARCHAR(20) NOT NULL CHECK (media_type IN ('video', 'image', 'gif')),
    post_type VARCHAR(20) NOT NULL CHECK (post_type IN ('recording', 'upload')),
    duration INTEGER,
    resolution VARCHAR(10),
    view_count INTEGER DEFAULT 0 NOT NULL,
    likes_count INTEGER DEFAULT 0 NOT NULL,
    comments_count INTEGER DEFAULT 0 NOT NULL,
    is_paid BOOLEAN DEFAULT false NOT NULL,
    price NUMERIC(10,2),
    is_public BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE,
    
    -- Constraints
    CONSTRAINT fk_posts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_posts_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL,
    CONSTRAINT check_price_when_paid CHECK (
        (is_paid = false) OR (is_paid = true AND price IS NOT NULL AND price > 0)
    )
);

-- Indexes for efficient querying
CREATE INDEX idx_posts_user_id ON posts(user_id);
CREATE INDEX idx_posts_room_id ON posts(room_id) WHERE room_id IS NOT NULL;
CREATE INDEX idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX idx_posts_is_public ON posts(is_public) WHERE is_public = true;
CREATE INDEX idx_posts_media_type ON posts(media_type);
CREATE INDEX idx_posts_post_type ON posts(post_type);
CREATE INDEX idx_posts_deleted_at ON posts(deleted_at) WHERE deleted_at IS NULL;

-- Composite index for discover feed (public posts ordered by date)
CREATE INDEX idx_posts_discover_feed ON posts(is_public, created_at DESC) WHERE deleted_at IS NULL;

COMMENT ON TABLE posts IS 'User-generated content: recordings from watch sessions or uploaded media';
COMMENT ON COLUMN posts.user_id IS 'Creator of the post';
COMMENT ON COLUMN posts.room_id IS 'Optional: room context where post was created';
COMMENT ON COLUMN posts.media_type IS 'Type of media: video, image, or gif';
COMMENT ON COLUMN posts.post_type IS 'How post was created: recording or upload';
COMMENT ON COLUMN posts.duration IS 'Duration in seconds (for videos)';
COMMENT ON COLUMN posts.resolution IS 'Video resolution: 720p, 1080p, etc.';
COMMENT ON COLUMN posts.is_paid IS 'Whether post requires payment to access';
COMMENT ON COLUMN posts.price IS 'Price in dollars (only if is_paid = true)';

-- +migrate Down
DROP TABLE IF EXISTS posts CASCADE;
