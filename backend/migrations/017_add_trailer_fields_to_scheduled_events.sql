-- Migration: Add trailer fields to scheduled_events table
-- Date: 2026-02-13
-- Description: Add trailer support for scheduled events (auto-delete at start_time for legal protection)

-- Step 1: Add trailer columns
ALTER TABLE scheduled_events
ADD COLUMN trailer_url TEXT,
ADD COLUMN trailer_title VARCHAR(255),
ADD COLUMN trailer_duration INTEGER DEFAULT 0,
ADD COLUMN trailer_uploaded_at TIMESTAMP,
ADD COLUMN trailer_deleted_at TIMESTAMP;

-- Step 2: Add index for efficient trailer deletion queries
CREATE INDEX idx_scheduled_events_trailer_deleted ON scheduled_events(trailer_deleted_at);

-- Step 3: Add index for fetching active trailers (lobby "Watching Now" queries)
CREATE INDEX idx_scheduled_events_active_trailers ON scheduled_events(start_time) 
WHERE trailer_url != '' AND trailer_deleted_at IS NULL;

-- Step 4: Add comments for documentation
COMMENT ON COLUMN scheduled_events.trailer_url IS 'S3/local path to trailer video (max 60 seconds)';
COMMENT ON COLUMN scheduled_events.trailer_title IS 'Custom trailer title (defaults to event title if empty)';
COMMENT ON COLUMN scheduled_events.trailer_duration IS 'Trailer duration in seconds (max 60)';
COMMENT ON COLUMN scheduled_events.trailer_uploaded_at IS 'When trailer was uploaded';
COMMENT ON COLUMN scheduled_events.trailer_deleted_at IS 'Soft delete timestamp (auto-set when event starts)';

-- Rollback script (save separately if needed):
-- DROP INDEX idx_scheduled_events_active_trailers;
-- DROP INDEX idx_scheduled_events_trailer_deleted;
-- ALTER TABLE scheduled_events DROP COLUMN trailer_url;
-- ALTER TABLE scheduled_events DROP COLUMN trailer_title;
-- ALTER TABLE scheduled_events DROP COLUMN trailer_duration;
-- ALTER TABLE scheduled_events DROP COLUMN trailer_uploaded_at;
-- ALTER TABLE scheduled_events DROP COLUMN trailer_deleted_at;
