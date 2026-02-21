-- Migration: Add payment_accounts table for multiple bank accounts
-- Date: 2024-12-10
-- Purpose: Store host bank accounts for Paystack/Stripe payouts

-- Create payment_accounts table
CREATE TABLE IF NOT EXISTS payment_accounts (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Gateway type
    gateway VARCHAR(20) NOT NULL CHECK (gateway IN ('paystack', 'stripe')),
    
    -- Paystack fields (for African bank accounts)
    bank_code VARCHAR(10),              -- Bank code (e.g., '058' for GTBank)
    bank_name VARCHAR(100),             -- Bank name (e.g., 'GTBank')
    account_number VARCHAR(20),         -- Account number
    account_name VARCHAR(255),          -- Account holder name (verified from bank)
    paystack_recipient_code VARCHAR(100) UNIQUE, -- Paystack recipient code (e.g., 'RCP_abc123')
    
    -- Stripe fields (for international accounts)
    stripe_account_id VARCHAR(100) UNIQUE, -- Stripe Connect account ID
    stripe_country VARCHAR(2),          -- ISO country code for Stripe account
    
    -- Account status
    is_primary BOOLEAN DEFAULT false,   -- Is this the primary withdrawal account?
    is_verified BOOLEAN DEFAULT false,  -- Has account been verified?
    verification_method VARCHAR(50),    -- 'paystack_api', 'stripe_connect', 'manual'
    
    -- Currency preference
    currency VARCHAR(3) NOT NULL,       -- USD, NGN, GHS, KES, EUR, GBP
    
    -- Metadata
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP,
    
    -- Constraints
    CONSTRAINT unique_user_account UNIQUE(user_id, gateway, account_number),
    CONSTRAINT valid_paystack_account CHECK (
        (gateway = 'paystack' AND bank_code IS NOT NULL AND account_number IS NOT NULL) OR
        gateway != 'paystack'
    ),
    CONSTRAINT valid_stripe_account CHECK (
        (gateway = 'stripe' AND stripe_account_id IS NOT NULL) OR
        gateway != 'stripe'
    )
);

-- Add indexes for fast lookups
CREATE INDEX idx_payment_accounts_user_id ON payment_accounts(user_id);
CREATE INDEX idx_payment_accounts_gateway ON payment_accounts(gateway);
CREATE INDEX idx_payment_accounts_is_primary ON payment_accounts(user_id, is_primary) WHERE is_primary = true;
CREATE INDEX idx_payment_accounts_paystack_recipient ON payment_accounts(paystack_recipient_code) WHERE paystack_recipient_code IS NOT NULL;
CREATE INDEX idx_payment_accounts_stripe_account ON payment_accounts(stripe_account_id) WHERE stripe_account_id IS NOT NULL;

-- Add country and preferred_gateway to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS country VARCHAR(2); -- ISO country code (NG, US, GB, etc.)
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_gateway VARCHAR(20); -- 'paystack' or 'stripe'

-- Add gateway_transfer_id to payouts table (for tracking transfers)
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS gateway_transfer_id VARCHAR(100);
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS payment_account_id INTEGER REFERENCES payment_accounts(id) ON DELETE SET NULL;

-- Create index for transfer tracking
CREATE INDEX IF NOT EXISTS idx_payouts_gateway_transfer_id ON payouts(gateway_transfer_id) WHERE gateway_transfer_id IS NOT NULL;

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_payment_accounts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_payment_accounts_updated_at
    BEFORE UPDATE ON payment_accounts
    FOR EACH ROW
    EXECUTE FUNCTION update_payment_accounts_updated_at();

-- Comments for documentation
COMMENT ON TABLE payment_accounts IS 'Stores host bank accounts for Paystack and Stripe payouts';
COMMENT ON COLUMN payment_accounts.gateway IS 'Payment gateway: paystack (Africa) or stripe (International)';
COMMENT ON COLUMN payment_accounts.paystack_recipient_code IS 'Paystack recipient code from Transfer Recipients API';
COMMENT ON COLUMN payment_accounts.stripe_account_id IS 'Stripe Connect account ID for international payouts';
COMMENT ON COLUMN payment_accounts.is_primary IS 'Primary account used for withdrawals by default';
COMMENT ON COLUMN payment_accounts.is_verified IS 'Account verified via bank API (name matching)';
COMMENT ON COLUMN users.country IS 'ISO 3166-1 alpha-2 country code (auto-detected from IP or user-selected)';
COMMENT ON COLUMN users.preferred_gateway IS 'User preferred payment gateway (paystack or stripe)';
COMMENT ON COLUMN payouts.gateway_transfer_id IS 'Transfer ID from Paystack/Stripe for tracking status';
COMMENT ON COLUMN payouts.payment_account_id IS 'Payment account used for this payout';
