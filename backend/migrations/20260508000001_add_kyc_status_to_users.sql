-- Add KYC status fields to users table for quick withdrawal checks
-- Migration: 20260508000001_add_kyc_status_to_users

-- Add KYC status columns to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS kyc_status VARCHAR(20) DEFAULT 'none',
ADD COLUMN IF NOT EXISTS kyc_verified_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS kyc_expires_at TIMESTAMP WITH TIME ZONE;

-- Create index for fast KYC status lookups
CREATE INDEX IF NOT EXISTS idx_users_kyc_status ON users(kyc_status);
CREATE INDEX IF NOT EXISTS idx_users_kyc_expires_at ON users(kyc_expires_at);

-- Update existing users with approved KYC to have the new status fields
UPDATE users u
SET 
    kyc_status = 'approved',
    kyc_verified_at = k.verified_at,
    kyc_expires_at = k.expires_at
FROM kyc_verifications k
WHERE u.id = k.user_id 
AND k.status = 'approved';

-- Update users with pending KYC
UPDATE users u
SET kyc_status = 'pending'
FROM kyc_verifications k
WHERE u.id = k.user_id 
AND k.status = 'pending'
AND u.kyc_status = 'none';

-- Update users with rejected KYC
UPDATE users u
SET kyc_status = 'rejected'
FROM kyc_verifications k
WHERE u.id = k.user_id 
AND k.status = 'rejected'
AND u.kyc_status = 'none';

-- Comment on new columns
COMMENT ON COLUMN users.kyc_status IS 'KYC verification status: none, pending, approved, rejected, expired';
COMMENT ON COLUMN users.kyc_verified_at IS 'When KYC was approved (null if not approved)';
COMMENT ON COLUMN users.kyc_expires_at IS 'When KYC expires (2 years from approval)';
