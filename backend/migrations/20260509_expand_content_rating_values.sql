-- Migration: Expand content_rating column to support Educational and Religious values
-- Date: 2026-05-09
-- Description: Increases varchar size from 10 to 20 to accommodate longer rating names

-- Alter watch_sessions table to support Educational and Religious content ratings
ALTER TABLE watch_sessions 
ALTER COLUMN content_rating TYPE VARCHAR(20);

-- Update comment for clarity
COMMENT ON COLUMN watch_sessions.content_rating IS 'Content rating for age-based filtering: G, PG, Educational, Religious, 13+, 16+, 18+, Mature';
