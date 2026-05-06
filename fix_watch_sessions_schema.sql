-- Fix watch_sessions table schema - add missing columns
-- Run this on Railway PostgreSQL to fix the 500 error

\c railway;

-- Add preview_enabled column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'watch_sessions' AND column_name = 'preview_enabled'
    ) THEN
        ALTER TABLE watch_sessions ADD COLUMN preview_enabled BOOLEAN DEFAULT TRUE;
        RAISE NOTICE 'Added preview_enabled column';
    ELSE
        RAISE NOTICE 'preview_enabled column already exists';
    END IF;
END $$;

-- Add podcast_logo_url column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'watch_sessions' AND column_name = 'podcast_logo_url'
    ) THEN
        ALTER TABLE watch_sessions ADD COLUMN podcast_logo_url TEXT;
        RAISE NOTICE 'Added podcast_logo_url column';
    ELSE
        RAISE NOTICE 'podcast_logo_url column already exists';
    END IF;
END $$;

-- Verify the columns were added
SELECT 
    column_name, 
    data_type, 
    column_default,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'watch_sessions' 
  AND column_name IN ('preview_enabled', 'podcast_logo_url')
ORDER BY column_name;
