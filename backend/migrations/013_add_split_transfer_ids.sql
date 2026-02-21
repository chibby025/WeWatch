-- Add transfer tracking for split payments (85/15 revenue model)
-- This allows us to audit every payment split between reserve and revenue accounts

ALTER TABLE token_transactions 
ADD COLUMN revenue_transfer_id VARCHAR(255),
ADD COLUMN reserve_transfer_id VARCHAR(255);

-- Add indexes for quick lookup
CREATE INDEX idx_token_transactions_revenue_transfer ON token_transactions(revenue_transfer_id);
CREATE INDEX idx_token_transactions_reserve_transfer ON token_transactions(reserve_transfer_id);

-- Comments for clarity
COMMENT ON COLUMN token_transactions.revenue_transfer_id IS 'Stripe/Paystack transfer ID for 15% platform revenue';
COMMENT ON COLUMN token_transactions.reserve_transfer_id IS 'Stripe/Paystack transfer ID for 85% host reserve';
