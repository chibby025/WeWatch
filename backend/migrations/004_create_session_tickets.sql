CREATE TABLE IF NOT EXISTS session_tickets (
    id BIGSERIAL PRIMARY KEY,
    session_id BIGINT NOT NULL REFERENCES watch_sessions(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    host_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ticket_price_tokens INT NOT NULL CHECK (ticket_price_tokens > 0),
    ticket_price_currency VARCHAR(10),
    ticket_price_amount DECIMAL(10,2),
    payment_method VARCHAR(50) NOT NULL CHECK (payment_method IN ('tokens', 'paystack', 'stripe')),
    payment_id VARCHAR(255),
    is_gift BOOLEAN DEFAULT FALSE,
    gifted_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    is_refunded BOOLEAN DEFAULT FALSE,
    refund_reason TEXT,
    refunded_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(session_id, user_id)
);

CREATE INDEX idx_session_tickets_session_id ON session_tickets(session_id);
CREATE INDEX idx_session_tickets_user_id ON session_tickets(user_id);
CREATE INDEX idx_session_tickets_host_id ON session_tickets(host_id);
CREATE INDEX idx_session_tickets_payment_method ON session_tickets(payment_method);
CREATE INDEX idx_session_tickets_is_gift ON session_tickets(is_gift) WHERE is_gift = TRUE;
CREATE INDEX idx_session_tickets_is_refunded ON session_tickets(is_refunded) WHERE is_refunded = TRUE;
CREATE INDEX idx_session_tickets_host_created ON session_tickets(host_id, created_at DESC);
