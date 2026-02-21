-- ✅ DAY 2-3: Content Declarations & Session Ratings
-- Tracks user-declared ownership of content for paid cinema/video sessions
-- Stores session ratings for creator reputation system

-- Content declarations for paid sessions (legal protection)
CREATE TABLE IF NOT EXISTS content_declarations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id VARCHAR(255) NOT NULL REFERENCES watch_sessions(session_id) ON DELETE CASCADE,
    watch_type VARCHAR(50) NOT NULL, -- 'video' or '3d_cinema'
    
    -- Legal certification
    is_original_content BOOLEAN DEFAULT true,
    has_license BOOLEAN DEFAULT false,
    declaration_text TEXT NOT NULL, -- Full text of what user agreed to
    
    -- Audit trail
    ip_address VARCHAR(45),
    user_agent TEXT,
    declared_at TIMESTAMP DEFAULT NOW(),
    
    -- Indexes for fast lookup
    UNIQUE(session_id) -- One declaration per session
);

CREATE INDEX idx_content_declarations_user ON content_declarations(user_id);
CREATE INDEX idx_content_declarations_session ON content_declarations(session_id);

-- 🌟 DAY 3: Session Ratings (Creator Reputation System)
CREATE TABLE IF NOT EXISTS session_ratings (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(255) NOT NULL REFERENCES watch_sessions(session_id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    host_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Rating data
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    review TEXT,
    
    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    
    -- Prevent duplicate ratings from same user
    UNIQUE(session_id, user_id)
);

CREATE INDEX idx_session_ratings_session ON session_ratings(session_id);
CREATE INDEX idx_session_ratings_host ON session_ratings(host_id);
CREATE INDEX idx_session_ratings_rating ON session_ratings(rating);

-- 📊 View: Host average ratings (for creator profiles)
CREATE OR REPLACE VIEW host_ratings AS
SELECT 
    host_id,
    COUNT(*) as total_ratings,
    AVG(rating) as average_rating,
    COUNT(CASE WHEN rating = 5 THEN 1 END) as five_star_count,
    COUNT(CASE WHEN rating >= 4 THEN 1 END) as four_star_plus_count
FROM session_ratings
GROUP BY host_id;

-- 📊 View: Session statistics (for discovery/ranking)
CREATE OR REPLACE VIEW session_stats AS
SELECT 
    ws.session_id,
    ws.host_id,
    ws.session_title,
    ws.watch_type,
    ws.ticketing_enabled,
    ws.ticket_price_tokens,
    COUNT(DISTINCT wsm.user_id) as total_attendees,
    COALESCE(AVG(sr.rating), 0) as average_rating,
    COUNT(sr.id) as rating_count,
    ws.created_at
FROM watch_sessions ws
LEFT JOIN watch_session_members wsm ON ws.id = wsm.watch_session_id
LEFT JOIN session_ratings sr ON ws.session_id = sr.session_id
GROUP BY ws.session_id, ws.host_id, ws.session_title, ws.watch_type, 
         ws.ticketing_enabled, ws.ticket_price_tokens, ws.created_at;

-- 🚀 FUTURE: AI Trailer Generation tracking (Day 4+)
-- Uncomment when implementing trailer generation feature
/*
CREATE TABLE IF NOT EXISTS session_trailers (
    id SERIAL PRIMARY KEY,
    session_id UUID NOT NULL REFERENCES watch_sessions(session_id) ON DELETE CASCADE,
    trailer_url TEXT NOT NULL,
    thumbnail_url TEXT,
    duration_seconds INTEGER DEFAULT 15,
    
    -- AI generation metadata
    ai_model VARCHAR(100), -- e.g., 'openai-vision-4'
    generation_cost_usd DECIMAL(10, 4), -- Track costs
    highlights_detected JSONB, -- AI-identified key moments
    
    -- Performance metrics
    views INTEGER DEFAULT 0,
    click_through_rate DECIMAL(5, 2), -- Percentage who bought tickets after watching
    
    created_at TIMESTAMP DEFAULT NOW(),
    
    UNIQUE(session_id) -- One trailer per session
);

CREATE INDEX idx_session_trailers_session ON session_trailers(session_id);
*/

COMMENT ON TABLE content_declarations IS 'Legal protection: Users declare ownership of content for paid sessions';
COMMENT ON TABLE session_ratings IS 'Creator reputation: User ratings of completed sessions';
COMMENT ON VIEW host_ratings IS 'Aggregated host ratings for creator profiles and discovery';
COMMENT ON VIEW session_stats IS 'Session performance metrics for ranking and discovery';
