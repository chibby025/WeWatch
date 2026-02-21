CREATE TABLE IF NOT EXISTS gateway_earnings (
    id BIGSERIAL PRIMARY KEY,
    host_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id BIGINT NOT NULL REFERENCES watch_sessions(id) ON DELETE CASCADE,
    ticket_id BIGINT REFERENCES session_tickets(id) ON DELETE SET NULL,
    donation_id BIGINT,
    currency VARCHAR(10) NOT NULL CHECK (currency IN ('USD', 'NGN', 'GHS', 'KES')),
    gross_amount DECIMAL(10,2) NOT NULL CHECK (gross_amount > 0),
    platform_commission DECIMAL(10,2) NOT NULL CHECK (platform_commission >= 0),
    net_amount DECIMAL(10,2) NOT NULL CHECK (net_amount >= 0),
    payment_gateway VARCHAR(50) NOT NULL CHECK (payment_gateway IN ('paystack', 'stripe')),
    payment_id VARCHAR(255) NOT NULL,
    is_withdrawn BOOLEAN DEFAULT FALSE,
    withdrawn_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_gateway_earnings_host_id ON gateway_earnings(host_id);
CREATE INDEX idx_gateway_earnings_session_id ON gateway_earnings(session_id);
CREATE INDEX idx_gateway_earnings_payment_gateway ON gateway_earnings(payment_gateway);
CREATE INDEX idx_gateway_earnings_is_withdrawn ON gateway_earnings(is_withdrawn) WHERE is_withdrawn = FALSE;
CREATE INDEX idx_gateway_earnings_host_created ON gateway_earnings(host_id, created_at DESC);
