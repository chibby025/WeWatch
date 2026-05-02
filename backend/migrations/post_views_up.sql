-- Create post_views table
CREATE TABLE IF NOT EXISTS post_views (
    id BIGSERIAL PRIMARY KEY,
    post_id BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    ip_address VARCHAR(45),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    
    CONSTRAINT fk_post_views_post FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    CONSTRAINT fk_post_views_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_post_views_post_id ON post_views(post_id);
CREATE INDEX IF NOT EXISTS idx_post_views_user_id ON post_views(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_post_views_created_at ON post_views(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_views_ip_address ON post_views(ip_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_post_views_dedup ON post_views(post_id, user_id, created_at DESC) WHERE user_id IS NOT NULL;
