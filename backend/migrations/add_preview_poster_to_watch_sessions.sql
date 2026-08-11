-- Add preview_url / poster_url columns to watch_sessions for the lobby WatchOuts
-- feed session-preview pipeline (poster JPEG + short looping WebM/MP4 clip).
-- WatchSession is intentionally excluded from GORM AutoMigrate (see main.go comment
-- near the migration block) because GORM tries to convert session_id from
-- VARCHAR(36) to BIGINT when it sees foreign-key relationships. This table's schema
-- is managed via manual migrations like this one only.
--
-- Safe to run more than once (IF NOT EXISTS everywhere).

ALTER TABLE watch_sessions
  ADD COLUMN IF NOT EXISTS preview_url TEXT,
  ADD COLUMN IF NOT EXISTS poster_url  TEXT;
