-- Migration: Create split_profit_transfers table for super-admin sweeps
-- Created: 2026-05-10
-- Each row records a sweep of accumulated 25% platform profit from post sales
-- into the super admin's wallet. Used by TransferSplitProfit
-- (admin_analytics_handlers.go) to compute already-transferred amount and
-- avoid double-spending the same profit.

CREATE TABLE IF NOT EXISTS split_profit_transfers (
    id BIGSERIAL PRIMARY KEY,
    admin_id BIGINT NOT NULL,
    amount_tokens BIGINT NOT NULL,                                   -- Token cents transferred (BIGINT because TransferSplitProfit accumulates int64)
    status VARCHAR(20) DEFAULT 'completed' NOT NULL,
    transferred_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT split_profit_transfers_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_split_profit_transfers_admin_id ON split_profit_transfers(admin_id);
CREATE INDEX IF NOT EXISTS idx_split_profit_transfers_status ON split_profit_transfers(status);
CREATE INDEX IF NOT EXISTS idx_split_profit_transfers_transferred_at ON split_profit_transfers(transferred_at);

COMMENT ON TABLE split_profit_transfers IS 'Audit trail of super-admin sweeps of accumulated platform 25% profit from post sales';
COMMENT ON COLUMN split_profit_transfers.amount_tokens IS 'Amount swept in token cents (100 cents = 1 token)';
