-- Migration: Create LiveShare Graphics Tables
-- Created: 2026-03-19
-- Description: Adds support for LiveShare Studio graphics overlays and media queue

-- LiveShare Graphics Table
-- Stores active graphics overlays (lower thirds, logo bugs, tickers, banners)
CREATE TABLE IF NOT EXISTS liveshare_graphics (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES watch_sessions(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK (type IN ('lower_third', 'logo_bug', 'ticker', 'banner')),
    content JSONB NOT NULL DEFAULT '{}'::jsonb,
    position VARCHAR(50),
    active BOOLEAN DEFAULT false,
    z_index INTEGER DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_liveshare_graphics_session ON liveshare_graphics(session_id);
CREATE INDEX IF NOT EXISTS idx_liveshare_graphics_active ON liveshare_graphics(session_id, active);

-- LiveShare Media Queue Table
-- Stores queued images/videos for display during broadcast
CREATE TABLE IF NOT EXISTS liveshare_media_queue (
    id SERIAL PRIMARY KEY,
    session_id INTEGER NOT NULL REFERENCES watch_sessions(id) ON DELETE CASCADE,
    media_type VARCHAR(20) NOT NULL CHECK (media_type IN ('image', 'video')),
    media_url TEXT NOT NULL,
    file_name VARCHAR(255),
    file_size INTEGER,
    position INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'queued' CHECK (status IN ('queued', 'playing', 'played')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    played_at TIMESTAMP WITH TIME ZONE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_liveshare_media_queue_session ON liveshare_media_queue(session_id);
CREATE INDEX IF NOT EXISTS idx_liveshare_media_queue_status ON liveshare_media_queue(session_id, status);
CREATE INDEX IF NOT EXISTS idx_liveshare_media_queue_position ON liveshare_media_queue(session_id, position);

-- Constraint: Max 5 items per session
CREATE OR REPLACE FUNCTION check_media_queue_limit()
RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT COUNT(*) FROM liveshare_media_queue WHERE session_id = NEW.session_id) >= 5 THEN
        RAISE EXCEPTION 'Maximum 5 media items allowed per session';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_media_queue_limit
BEFORE INSERT ON liveshare_media_queue
FOR EACH ROW
EXECUTE FUNCTION check_media_queue_limit();

-- Update timestamp trigger for liveshare_graphics
CREATE OR REPLACE FUNCTION update_liveshare_graphics_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_liveshare_graphics_updated_at
BEFORE UPDATE ON liveshare_graphics
FOR EACH ROW
EXECUTE FUNCTION update_liveshare_graphics_timestamp();

-- Comments for documentation
COMMENT ON TABLE liveshare_graphics IS 'Stores graphics overlays for LiveShare Studio broadcasts';
COMMENT ON TABLE liveshare_media_queue IS 'Stores queued media (images/videos) for LiveShare broadcasts';
COMMENT ON COLUMN liveshare_graphics.content IS 'JSON containing graphic configuration (name, title, imageUrl, style, etc)';
COMMENT ON COLUMN liveshare_graphics.type IS 'Type of graphic: lower_third, logo_bug, ticker, or banner';
COMMENT ON COLUMN liveshare_media_queue.position IS 'Queue position (0-based), determines display order';
