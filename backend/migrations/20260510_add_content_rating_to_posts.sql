-- Migration: Add content_rating to posts table for age-appropriate content filtering
-- Date: May 10, 2026
-- Run with: psql -h localhost -p 5432 -U postgres -d wewatch_db -f migrations/20260510_add_content_rating_to_posts.sql

ALTER TABLE posts 
ADD COLUMN IF NOT EXISTS content_rating VARCHAR(20) DEFAULT 'G' NOT NULL 
CHECK (content_rating IN ('G', 'PG', 'Educational', 'Religious', '13+', '16+', '18+', 'Mature'));

COMMENT ON COLUMN posts.content_rating IS 'Content rating for age-appropriate filtering: G (all ages), PG (parental guidance), Educational (learning content), Religious (faith-based), 13+, 16+, 18+, Mature (explicit)';

-- Update existing posts to have G rating (safest default)
UPDATE posts SET content_rating = 'G' WHERE content_rating IS NULL OR content_rating = '';
