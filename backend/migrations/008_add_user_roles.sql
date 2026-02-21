-- Migration: Add role field to users table
-- Created: 2025-01-17

-- Add role column with default value
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user';

-- Create index for role queries
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Upgrade user ID 7 (chibi) to super_admin
UPDATE users 
SET role = 'super_admin' 
WHERE id = 7;

-- Log the changes
DO $$
DECLARE
    user_count INT;
    admin_count INT;
    super_admin_count INT;
BEGIN
    SELECT COUNT(*) INTO user_count FROM users WHERE role = 'user';
    SELECT COUNT(*) INTO admin_count FROM users WHERE role = 'admin';
    SELECT COUNT(*) INTO super_admin_count FROM users WHERE role = 'super_admin';
    
    RAISE NOTICE '✅ Migration complete!';
    RAISE NOTICE '   Users: %', user_count;
    RAISE NOTICE '   Admins: %', admin_count;
    RAISE NOTICE '   Super Admins: %', super_admin_count;
END $$;
