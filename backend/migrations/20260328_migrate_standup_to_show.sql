-- Migration: Convert deprecated 'standup' mode to 'show' mode
-- Date: 2026-03-28
-- Purpose: Stand-up mode functionality is now covered by Show mode

-- Update all existing sessions using 'standup' mode to use 'show' mode instead
UPDATE watch_sessions
SET liveshare_mode = 'show'
WHERE liveshare_mode = 'standup';

-- Update any liveshare_participants records that reference standup mode
-- (if mode is stored in participants table as well)
UPDATE liveshare_participants
SET role = 'host'
WHERE role = 'standup';

-- Update comment on watch_sessions.liveshare_mode column to reflect current modes
COMMENT ON COLUMN watch_sessions.liveshare_mode IS 'Mode: regular, podcast, interview, news, show (standup deprecated → show)';

-- Log the migration
DO $$
DECLARE
    affected_count INT;
BEGIN
    SELECT COUNT(*) INTO affected_count
    FROM watch_sessions
    WHERE liveshare_mode = 'show'
    AND updated_at > NOW() - INTERVAL '1 minute';
    
    RAISE NOTICE 'Migration complete: % sessions migrated from standup to show mode', affected_count;
END $$;
