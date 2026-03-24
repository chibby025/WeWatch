-- Add date_of_birth column to users table for age verification and content moderation
-- Date of birth is optional at registration but required to access the platform
-- This field is private and should never be exposed in public API responses

ALTER TABLE users ADD COLUMN date_of_birth DATE;

-- Add index for age-based queries (optional, for performance)
CREATE INDEX idx_users_date_of_birth ON users(date_of_birth);
