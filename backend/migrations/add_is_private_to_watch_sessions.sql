-- Add is_private column to watch_sessions table for private instant watch sessions
-- Private sessions will be hidden from lobby "Watching Now" unless user is a member

ALTER TABLE watch_sessions 
ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT FALSE;

-- Add index for faster filtering in lobby queries
CREATE INDEX IF NOT EXISTS idx_watch_sessions_is_private 
ON watch_sessions(is_private);

-- Comment for documentation
COMMENT ON COLUMN watch_sessions.is_private IS 'When true, session is hidden from lobby unless user is a member. Used for private instant watch parties (e.g., couples, small groups).';
