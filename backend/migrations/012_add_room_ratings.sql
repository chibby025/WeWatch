-- ✅ Add room rating columns for competitive quality system
-- Rooms compete for high ratings based on all sessions hosted in that room
-- Rating updates are atomic using cumulative sum approach

-- Add rating columns to rooms table
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS average_rating DECIMAL(3,2) DEFAULT 0.00;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS total_ratings INTEGER DEFAULT 0;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS cumulative_rating_sum INTEGER DEFAULT 0;

-- Add index for sorting rooms by rating (for discovery/ranking)
CREATE INDEX IF NOT EXISTS idx_rooms_rating ON rooms(average_rating DESC);

-- Add room_id to session_ratings table (link rating to room, not just session)
ALTER TABLE session_ratings ADD COLUMN IF NOT EXISTS room_id INTEGER REFERENCES rooms(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_session_ratings_room ON session_ratings(room_id);

-- Update existing session_ratings to populate room_id from watch_sessions
UPDATE session_ratings sr
SET room_id = ws.room_id
FROM watch_sessions ws
WHERE sr.session_id = ws.session_id
AND sr.room_id IS NULL;

-- Backfill existing room ratings from historical session ratings
UPDATE rooms r
SET 
    cumulative_rating_sum = COALESCE((
        SELECT SUM(sr.rating)
        FROM session_ratings sr
        WHERE sr.room_id = r.id
    ), 0),
    total_ratings = COALESCE((
        SELECT COUNT(*)
        FROM session_ratings sr
        WHERE sr.room_id = r.id
    ), 0),
    average_rating = CASE 
        WHEN COALESCE((SELECT COUNT(*) FROM session_ratings sr WHERE sr.room_id = r.id), 0) > 0
        THEN COALESCE((SELECT SUM(sr.rating) FROM session_ratings sr WHERE sr.room_id = r.id), 0)::DECIMAL / 
             COALESCE((SELECT COUNT(*) FROM session_ratings sr WHERE sr.room_id = r.id), 1)::DECIMAL
        ELSE 0.00
    END;

-- Create view for top rated rooms (useful for discovery page)
CREATE OR REPLACE VIEW top_rated_rooms AS
SELECT 
    r.id,
    r.name,
    r.description,
    r.host_id,
    r.average_rating,
    r.total_ratings,
    r.image_url,
    u.username as host_username,
    COUNT(DISTINCT ws.session_id) as total_sessions_hosted
FROM rooms r
LEFT JOIN users u ON r.host_id = u.id
LEFT JOIN watch_sessions ws ON r.id = ws.room_id
WHERE r.deleted_at IS NULL
  AND r.total_ratings >= 5  -- Minimum 5 ratings to appear in top rated
GROUP BY r.id, r.name, r.description, r.host_id, r.average_rating, r.total_ratings, r.image_url, u.username
ORDER BY r.average_rating DESC, r.total_ratings DESC
LIMIT 50;

-- Comments
COMMENT ON COLUMN rooms.average_rating IS 'Current average rating (0.00 to 5.00) from all session ratings';
COMMENT ON COLUMN rooms.total_ratings IS 'Total number of ratings received from all sessions';
COMMENT ON COLUMN rooms.cumulative_rating_sum IS 'Sum of all rating values (for atomic average calculation)';
