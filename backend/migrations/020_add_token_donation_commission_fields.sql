-- Add token donation commission tracking to platform accounting
-- Migration: 020_add_token_donation_commission_fields.sql
-- Created: 2024-12-20
-- Purpose: Track 5% commissions from wallet-to-wallet token gifts separately from 15% purchase commissions

ALTER TABLE platform_accounting
ADD COLUMN IF NOT EXISTS token_donation_commission DECIMAL(15,2) NOT NULL DEFAULT 0
CHECK (token_donation_commission >= 0);

ALTER TABLE platform_accounting
ADD COLUMN IF NOT EXISTS lifetime_token_donation_commission DECIMAL(15,2) NOT NULL DEFAULT 0
CHECK (lifetime_token_donation_commission >= 0);

COMMENT ON COLUMN platform_accounting.token_donation_commission IS 'Current balance of 5% commissions from wallet-to-wallet token gifts (available to transfer to revenue)';
COMMENT ON COLUMN platform_accounting.lifetime_token_donation_commission IS 'Historical total of all gift commissions earned';

-- Create index for reporting queries
CREATE INDEX IF NOT EXISTS idx_platform_accounting_token_commission 
ON platform_accounting(token_donation_commission);
