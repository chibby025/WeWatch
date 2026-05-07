-- Add full_name field to KYC verifications for identity matching
-- Migration: 20260508000002_add_full_name_to_kyc

-- Add full_name column (user's legal name from ID document)
ALTER TABLE kyc_verifications 
ADD COLUMN IF NOT EXISTS full_name VARCHAR(255) NOT NULL DEFAULT 'Unknown';

-- Remove default after adding (for future inserts to require it)
ALTER TABLE kyc_verifications 
ALTER COLUMN full_name DROP DEFAULT;

-- Comment on new column
COMMENT ON COLUMN kyc_verifications.full_name IS 'User''s legal full name (must match ID document)';
