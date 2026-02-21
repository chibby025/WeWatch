-- Migration: Add platform_accounting table for proper money tracking
-- This separates host reserves (85%) from platform revenue (15%)

CREATE TABLE IF NOT EXISTS platform_accounting (
    id SERIAL PRIMARY KEY,
    
    -- Money we owe to hosts (85% of all earnings)
    host_reserve_balance DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK (host_reserve_balance >= 0),
    
    -- Platform's actual revenue (15% commission)
    platform_revenue_balance DECIMAL(15,2) NOT NULL DEFAULT 0 CHECK (platform_revenue_balance >= 0),
    
    -- Total money in Stripe/Paystack accounts (should equal reserve + revenue)
    total_gateway_balance DECIMAL(15,2) NOT NULL DEFAULT 0,
    
    -- Lifetime metrics
    lifetime_host_earnings DECIMAL(15,2) NOT NULL DEFAULT 0,
    lifetime_platform_revenue DECIMAL(15,2) NOT NULL DEFAULT 0,
    lifetime_user_spend DECIMAL(15,2) NOT NULL DEFAULT 0,
    
    -- Pending amounts
    pending_payouts DECIMAL(15,2) NOT NULL DEFAULT 0,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert single record (singleton pattern)
INSERT INTO platform_accounting (id) VALUES (1) ON CONFLICT DO NOTHING;

-- Create index for faster lookups (though only 1 record)
CREATE INDEX IF NOT EXISTS idx_platform_accounting_id ON platform_accounting(id);

-- Add comment explaining the table
COMMENT ON TABLE platform_accounting IS 'Tracks platform revenue (15%) vs host reserves (85%) to prevent overspending';
COMMENT ON COLUMN platform_accounting.host_reserve_balance IS 'Money owed to hosts - cannot be spent by platform';
COMMENT ON COLUMN platform_accounting.platform_revenue_balance IS 'Platform profit - can be spent freely';
COMMENT ON COLUMN platform_accounting.total_gateway_balance IS 'Total in Stripe/Paystack - should equal reserve + revenue';
