-- Create token_transactions table for all token-related transactions
CREATE TABLE IF NOT EXISTS token_transactions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    transaction_type VARCHAR(50) NOT NULL CHECK (transaction_type IN ('purchase', 'ticket', 'donation', 'refund', 'payout', 'gift_sent', 'gift_received')),
    amount INT NOT NULL,
    usd_value DECIMAL(10,2),
    payment_method VARCHAR(50),
    payment_id VARCHAR(255),
    session_id BIGINT REFERENCES watch_sessions(id) ON DELETE SET NULL,
    ticket_id BIGINT,
    donation_id BIGINT,
    status VARCHAR(50) NOT NULL DEFAULT 'completed' CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
    metadata JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_token_transactions_user_id ON token_transactions(user_id);
CREATE INDEX idx_token_transactions_type ON token_transactions(transaction_type);
CREATE INDEX idx_token_transactions_session_id ON token_transactions(session_id);
CREATE INDEX idx_token_transactions_created_at ON token_transactions(created_at DESC);
CREATE INDEX idx_token_transactions_status ON token_transactions(status);
CREATE INDEX idx_token_transactions_user_created ON token_transactions(user_id, created_at DESC);
