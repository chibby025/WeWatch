-- Add content_rating column to watch_sessions table for age-based content moderation
-- This is especially important for instant watch sessions (temporary rooms)
-- Valid values: 'G', 'PG', '13+', '16+', '18+', 'Mature'
-- Default: 'G' (General Audiences - safe for all ages)

ALTER TABLE watch_sessions ADD COLUMN content_rating VARCHAR(10) DEFAULT 'G' NOT NULL;

-- Add check constraint to ensure only valid ratings
ALTER TABLE watch_sessions ADD CONSTRAINT watch_sessions_content_rating_check 
    CHECK (content_rating IN ('G', 'PG', '13+', '16+', '18+', 'Mature'));

-- Add index for filtering active sessions by content rating in lobby
CREATE INDEX idx_watch_sessions_content_rating ON watch_sessions(content_rating);
