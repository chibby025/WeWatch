-- Create posts table
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
    
    CONSTRAINT fk_posts_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT fk_posts_room FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL,
    CONSTRAINT check_price_when_paid CHECK (
        (is_paid = false) OR (is_paid = true AND price IS NOT NULL AND price > 0)
    )
);

CREATE INDEX IF NOT EXISTS idx_posts_user_id ON posts(user_id);
CREATE INDEX IF NOT EXISTS idx_posts_room_id ON posts(room_id) WHERE room_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_is_public ON posts(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_posts_media_type ON posts(media_type);
CREATE INDEX IF NOT EXISTS idx_posts_post_type ON posts(post_type);
CREATE INDEX IF NOT EXISTS idx_posts_deleted_at ON posts(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_posts_discover_feed ON posts(is_public, created_at DESC) WHERE deleted_at IS NULL;
