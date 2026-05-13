-- Migration: Fix content_rating constraint to allow Educational and Religious values
-- Date: 2026-05-09
-- Issue: Database check constraint blocking 'Educational' and 'Religious' values

-- Drop the constraint if it exists (ignore error if it doesn't)
ALTER TABLE watch_sessions DROP CONSTRAINT IF EXISTS watch_sessions_content_rating_check;

-- Recreate the constraint with all valid values including Educational and Religious
ALTER TABLE watch_sessions 
ADD CONSTRAINT watch_sessions_content_rating_check 
CHECK (content_rating IN ('G', 'PG', 'Educational', 'Religious', '13+', '16+', '18+', 'Mature'));

-- Update comment for documentation
COMMENT ON COLUMN watch_sessions.content_rating IS 'Content rating for age-based filtering: G, PG, Educational, Religious, 13+, 16+, 18+, Mature';
