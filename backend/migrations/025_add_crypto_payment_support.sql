-- Migration: Add crypto payment support
-- Date: 2026-03-21
-- Description: Track cryptocurrency payments (USDC, USDT) for token purchases

-- Add crypto tracking columns to token_transactions
ALTER TABLE token_transactions
ADD COLUMN payment_provider VARCHAR(50),     -- 'stripe', 'paystack', 'coinbase_commerce'
ADD COLUMN crypto_currency VARCHAR(10),      -- 'USDT', 'USDC', 'ETH', NULL for fiat
ADD COLUMN crypto_amount DECIMAL(18,8),      -- Amount in crypto (e.g., 10.50000000 USDC)
ADD COLUMN crypto_network VARCHAR(50),       -- 'ethereum', 'polygon', 'base', NULL for fiat
ADD COLUMN blockchain_tx_hash VARCHAR(100),  -- Blockchain transaction hash for verification
ADD COLUMN coinbase_charge_id VARCHAR(100);  -- Coinbase Commerce charge ID

-- Add crypto tracking to session_tickets
ALTER TABLE session_tickets
ADD COLUMN payment_provider VARCHAR(50),
ADD COLUMN crypto_currency VARCHAR(10),
ADD COLUMN crypto_amount DECIMAL(18,8),
ADD COLUMN crypto_network VARCHAR(50),
ADD COLUMN blockchain_tx_hash VARCHAR(100),
ADD COLUMN coinbase_charge_id VARCHAR(100);

-- Add crypto tracking to donations (if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'donations') THEN
        ALTER TABLE donations
        ADD COLUMN IF NOT EXISTS payment_provider VARCHAR(50),
        ADD COLUMN IF NOT EXISTS crypto_currency VARCHAR(10),
        ADD COLUMN IF NOT EXISTS crypto_amount DECIMAL(18,8),
        ADD COLUMN IF NOT EXISTS crypto_network VARCHAR(50),
        ADD COLUMN IF NOT EXISTS blockchain_tx_hash VARCHAR(100),
        ADD COLUMN IF NOT EXISTS coinbase_charge_id VARCHAR(100);
    END IF;
END $$;

-- Create index for faster crypto transaction lookups
CREATE INDEX IF NOT EXISTS idx_token_transactions_crypto ON token_transactions(crypto_currency, blockchain_tx_hash);
CREATE INDEX IF NOT EXISTS idx_token_transactions_coinbase ON token_transactions(coinbase_charge_id);
CREATE INDEX IF NOT EXISTS idx_session_tickets_crypto ON session_tickets(crypto_currency, blockchain_tx_hash);

-- Add comment for documentation
COMMENT ON COLUMN token_transactions.payment_provider IS 'Payment gateway used: stripe, paystack, or coinbase_commerce';
COMMENT ON COLUMN token_transactions.crypto_currency IS 'Cryptocurrency used for payment (USDT, USDC, ETH) or NULL for fiat';
COMMENT ON COLUMN token_transactions.crypto_amount IS 'Amount paid in cryptocurrency (up to 8 decimal places for precision)';
COMMENT ON COLUMN token_transactions.crypto_network IS 'Blockchain network: ethereum, polygon, base, etc.';
COMMENT ON COLUMN token_transactions.blockchain_tx_hash IS 'Transaction hash on blockchain for verification';

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Crypto payment support added successfully!';
    RAISE NOTICE '📊 New columns added to: token_transactions, session_tickets, donations';
    RAISE NOTICE '🔍 Indexes created for crypto transaction lookups';
END $$;
