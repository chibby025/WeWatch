-- Migration: Add deleted_at column to quizzes table for soft deletes
-- Date: 2025-12-30
-- Description: Add deleted_at column to support GORM soft delete functionality

-- Add deleted_at column to quizzes table
ALTER TABLE quizzes 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL;

-- Create index on deleted_at for better query performance
CREATE INDEX IF NOT EXISTS idx_quizzes_deleted_at ON quizzes(deleted_at);

-- Comment for documentation
COMMENT ON COLUMN quizzes.deleted_at IS 'Timestamp for soft delete (GORM DeletedAt field)';
