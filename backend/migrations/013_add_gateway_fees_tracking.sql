-- Add gateway fees tracking to platform accounting
-- Migration: 013_add_gateway_fees_tracking.sql
-- Created: 2024-12-16

ALTER TABLE platform_accounting
ADD COLUMN IF NOT EXISTS lifetime_gateway_fees DECIMAL(15,2) NOT NULL DEFAULT 0
CHECK (lifetime_gateway_fees >= 0);

COMMENT ON COLUMN platform_accounting.lifetime_gateway_fees IS 'Total fees paid to payment gateways (Paystack/Stripe)';

-- Update existing record to include the ₦3 fee from the ₦200 purchase
UPDATE platform_accounting
SET lifetime_gateway_fees = 3.00
WHERE id = 1;
