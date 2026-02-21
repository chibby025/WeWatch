CREATE TABLE IF NOT EXISTS donations (
    id BIGSERIAL PRIMARY KEY,
    session_id BIGINT NOT NULL REFERENCES watch_sessions(id) ON DELETE CASCADE,
    donor_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    host_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount_tokens INT NOT NULL CHECK (amount_tokens > 0),
    payment_method VARCHAR(50) NOT NULL CHECK (payment_method IN ('tokens', 'paystack', 'stripe')),
    payment_id VARCHAR(255),
    message TEXT,
    is_anonymous BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_donations_session_id ON donations(session_id);
CREATE INDEX idx_donations_donor_id ON donations(donor_id);
CREATE INDEX idx_donations_host_id ON donations(host_id);
CREATE INDEX idx_donations_created_at ON donations(created_at DESC);
CREATE INDEX idx_donations_session_donor ON donations(session_id, donor_id);
CREATE INDEX idx_donations_host_created ON donations(host_id, created_at DESC);
