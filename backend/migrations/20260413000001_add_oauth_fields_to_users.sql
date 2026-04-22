-- Migration: Add OAuth authentication fields to users table
-- Date: 2026-04-13
-- Purpose: Support Google OAuth login and other OAuth providers

-- Add OAuth tracking columns
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS oauth_provider VARCHAR(20),
ADD COLUMN IF NOT EXISTS oauth_provider_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false;

-- Remove NOT NULL constraint from password_hash (OAuth users don't have passwords)
ALTER TABLE users 
ALTER COLUMN password_hash DROP NOT NULL;

-- Create index for OAuth provider lookups
CREATE INDEX IF NOT EXISTS idx_users_oauth_provider_id ON users(oauth_provider, oauth_provider_id) 
WHERE oauth_provider IS NOT NULL AND oauth_provider_id IS NOT NULL;

-- Create index for email verification status
CREATE INDEX IF NOT EXISTS idx_users_email_verified ON users(email_verified) 
WHERE email_verified = true;

-- Set existing users as email verified (they registered with email)
UPDATE users 
SET email_verified = true 
WHERE email_verified = false 
AND password_hash IS NOT NULL 
AND password_hash != '';

-- Add comment for documentation
COMMENT ON COLUMN users.oauth_provider IS 'OAuth provider name (google, facebook, apple, etc.)';
COMMENT ON COLUMN users.oauth_provider_id IS 'Unique user ID from OAuth provider (prevents duplicate accounts)';
COMMENT ON COLUMN users.email_verified IS 'Whether email has been verified (OAuth users auto-verified)';
