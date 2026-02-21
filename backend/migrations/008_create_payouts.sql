CREATE TABLE IF NOT EXISTS payouts (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    payout_type VARCHAR(50) NOT NULL CHECK (payout_type IN ('tokens', 'gateway_earnings')),
    amount_tokens INT,
    amount_currency DECIMAL(10,2),
    currency VARCHAR(10) CHECK (currency IN ('USD', 'NGN', 'GHS', 'KES')),
    payout_method VARCHAR(50) NOT NULL CHECK (payout_method IN ('bank_transfer', 'paypal', 'mobile_money')),
    payout_details JSONB NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled')),
    external_payout_id VARCHAR(255),
    failure_reason TEXT,
    processed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_payouts_user_id ON payouts(user_id);
CREATE INDEX idx_payouts_status ON payouts(status);
CREATE INDEX idx_payouts_payout_type ON payouts(payout_type);
CREATE INDEX idx_payouts_created_at ON payouts(created_at DESC);
CREATE INDEX idx_payouts_user_created ON payouts(user_id, created_at DESC);

CREATE OR REPLACE FUNCTION update_payout_timestamp()
RETURNS TRIGGER AS \$\$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
\$\$ LANGUAGE plpgsql;

CREATE TRIGGER payout_updated_at
BEFORE UPDATE ON payouts
FOR EACH ROW
EXECUTE FUNCTION update_payout_timestamp();
