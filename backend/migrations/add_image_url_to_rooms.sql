-- Add image_url column to rooms table for room profile pictures
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS image_url TEXT;

-- Add index for faster image URL lookups
CREATE INDEX IF NOT EXISTS idx_rooms_image_url ON rooms(image_url) WHERE image_url IS NOT NULL;
