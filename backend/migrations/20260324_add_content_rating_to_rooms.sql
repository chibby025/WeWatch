-- Add content_rating column to rooms table for age-based content moderation
-- Valid values: 'G', 'PG', '13+', '16+', '18+', 'Mature'
-- Default: 'G' (General Audiences - safe for all ages)

ALTER TABLE rooms ADD COLUMN content_rating VARCHAR(10) DEFAULT 'G' NOT NULL;

-- Add check constraint to ensure only valid ratings
ALTER TABLE rooms ADD CONSTRAINT rooms_content_rating_check 
    CHECK (content_rating IN ('G', 'PG', '13+', '16+', '18+', 'Mature'));

-- Add index for filtering rooms by content rating in lobby
CREATE INDEX idx_rooms_content_rating ON rooms(content_rating);
