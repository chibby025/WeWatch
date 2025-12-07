-- Migration: Add watch_type and media_file_path to scheduled_events table
-- Date: 2025-12-03
-- Description: Make media_item_id nullable, add watch_type (required) and media_file_path (optional)

-- Step 1: Add new columns
ALTER TABLE scheduled_events 
ADD COLUMN watch_type VARCHAR(50),
ADD COLUMN media_file_path TEXT;

-- Step 2: Set default watch_type for existing records (assume 'video_watch' for legacy data)
UPDATE scheduled_events 
SET watch_type = 'video_watch' 
WHERE watch_type IS NULL;

-- Step 3: Make watch_type NOT NULL after setting defaults
ALTER TABLE scheduled_events 
ALTER COLUMN watch_type SET NOT NULL;

-- Step 4: Make media_item_id nullable (if not already)
ALTER TABLE scheduled_events 
ALTER COLUMN media_item_id DROP NOT NULL;

-- Step 5: Add index on watch_type for faster queries
CREATE INDEX idx_scheduled_events_watch_type ON scheduled_events(watch_type);

-- Rollback script (save separately if needed):
-- ALTER TABLE scheduled_events DROP COLUMN watch_type;
-- ALTER TABLE scheduled_events DROP COLUMN media_file_path;
-- ALTER TABLE scheduled_events ALTER COLUMN media_item_id SET NOT NULL;
-- DROP INDEX idx_scheduled_events_watch_type;
