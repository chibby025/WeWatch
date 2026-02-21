-- Migration: Rename accounting columns for clarity and add new profit tracking
-- This aligns the schema with the actual money flow: split payments at purchase time

-- Step 1: Rename existing columns for clarity
ALTER TABLE platform_accounting 
RENAME COLUMN platform_revenue_balance TO total_platform_revenue;

ALTER TABLE platform_accounting 
RENAME COLUMN lifetime_platform_revenue TO lifetime_total_revenue;

-- Step 2: Add new columns for profit tracking
ALTER TABLE platform_accounting 
ADD COLUMN IF NOT EXISTS platform_profit DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK (platform_profit >= 0);

ALTER TABLE platform_accounting 
ADD COLUMN IF NOT EXISTS lifetime_platform_profit DECIMAL(15,2) NOT NULL DEFAULT 0;

ALTER TABLE platform_accounting 
ADD COLUMN IF NOT EXISTS lifetime_payouts DECIMAL(15,2) NOT NULL DEFAULT 0;

-- Step 3: Add gateway fees tracking column (if not exists)
ALTER TABLE platform_accounting 
ADD COLUMN IF NOT EXISTS lifetime_gateway_fees DECIMAL(15,2) NOT NULL DEFAULT 0;

-- Step 4: Migrate existing data
-- Set platform_profit = total_platform_revenue - host_reserve_balance
-- This assumes current balance already reflects the split
UPDATE platform_accounting 
SET platform_profit = GREATEST(total_platform_revenue - host_reserve_balance, 0)
WHERE platform_profit = 0;

-- Step 5: Add helpful comments
COMMENT ON COLUMN platform_accounting.total_platform_revenue 
IS 'Total NET money that entered platform from all sources (never decreases - historical)';

COMMENT ON COLUMN platform_accounting.platform_profit 
IS 'Platform 15% commission earned - can withdraw safely (increases at purchase via split payment)';

COMMENT ON COLUMN platform_accounting.host_reserve_balance 
IS 'Money owed to hosts (85% share) - DO NOT TOUCH (decreases with payouts)';

COMMENT ON COLUMN platform_accounting.total_gateway_balance 
IS 'Actual money in Paystack/Stripe accounts right now (decreases with payouts)';

COMMENT ON COLUMN platform_accounting.lifetime_total_revenue 
IS 'All NET money that ever entered the platform (historical metric)';

COMMENT ON COLUMN platform_accounting.lifetime_platform_profit 
IS 'All platform 15% commission ever earned (historical metric)';

COMMENT ON COLUMN platform_accounting.lifetime_host_earnings 
IS 'All host earnings ever attributed (historical metric)';

COMMENT ON COLUMN platform_accounting.lifetime_payouts 
IS 'Total amount paid out to hosts (historical metric)';

-- Step 6: Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_platform_accounting_balances 
ON platform_accounting(total_platform_revenue, platform_profit, host_reserve_balance);

-- Validation: Ensure accounting balance is correct
-- total_gateway_balance should equal platform_profit + host_reserve_balance
DO $$
DECLARE
    v_total_gateway DECIMAL(15,2);
    v_platform_profit DECIMAL(15,2);
    v_host_reserve DECIMAL(15,2);
    v_expected DECIMAL(15,2);
BEGIN
    SELECT total_gateway_balance, platform_profit, host_reserve_balance
    INTO v_total_gateway, v_platform_profit, v_host_reserve
    FROM platform_accounting
    WHERE id = 1;
    
    v_expected := v_platform_profit + v_host_reserve;
    
    IF ABS(v_total_gateway - v_expected) > 0.01 THEN
        RAISE WARNING 'Accounting imbalance detected: Gateway=%, Expected=% (Profit=% + Reserve=%)', 
            v_total_gateway, v_expected, v_platform_profit, v_host_reserve;
    ELSE
        RAISE NOTICE 'Accounting balanced: Gateway=%, Profit=%, Reserve=%', 
            v_total_gateway, v_platform_profit, v_host_reserve;
    END IF;
END $$;
