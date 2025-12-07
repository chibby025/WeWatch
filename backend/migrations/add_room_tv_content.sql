-- Create room_tv_content table for host announcements, media, and (future) ads
CREATE TABLE IF NOT EXISTS room_tv_content (
    id SERIAL PRIMARY KEY,
    room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    content_type VARCHAR(50) NOT NULL, -- 'announcement', 'media', 'ad' (Phase 2)
    title VARCHAR(255) NOT NULL,
    description TEXT,
    content_url TEXT, -- URL to media or external content
    thumbnail_url TEXT, -- Thumbnail image for media
    starts_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ends_at TIMESTAMP NOT NULL, -- When to stop displaying
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_room_tv_content_room_id ON room_tv_content(room_id);
CREATE INDEX IF NOT EXISTS idx_room_tv_content_active ON room_tv_content(room_id, ends_at) WHERE ends_at > CURRENT_TIMESTAMP;
CREATE INDEX IF NOT EXISTS idx_room_tv_content_type ON room_tv_content(content_type);
