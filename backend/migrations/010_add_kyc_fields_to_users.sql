ALTER TABLE users 
ADD COLUMN IF NOT EXISTS is_kyc_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS kyc_verified_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS preferred_currency VARCHAR(10),
ADD COLUMN IF NOT EXISTS detected_currency VARCHAR(10) DEFAULT 'USD';

CREATE INDEX IF NOT EXISTS idx_users_is_kyc_verified ON users(is_kyc_verified) WHERE is_kyc_verified = TRUE;
