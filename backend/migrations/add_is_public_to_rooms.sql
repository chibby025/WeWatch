-- Add is_public column to rooms table
-- This allows rooms to be either public (visible to all) or private (visible only to members)

ALTER TABLE rooms ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT true;

-- Update existing rooms to be public by default
UPDATE rooms SET is_public = true WHERE is_public IS NULL;
