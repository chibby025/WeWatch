CREATE TABLE IF NOT EXISTS instant_watch_earnings (
    id BIGSERIAL PRIMARY KEY,
    session_id BIGINT NOT NULL REFERENCES watch_sessions(id) ON DELETE CASCADE,
    host_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    room_id BIGINT,
    token_earnings INT NOT NULL DEFAULT 0,
    gateway_earnings_usd DECIMAL(10,2) NOT NULL DEFAULT 0,
    gateway_earnings_ngn DECIMAL(10,2) NOT NULL DEFAULT 0,
    gateway_earnings_ghs DECIMAL(10,2) NOT NULL DEFAULT 0,
    gateway_earnings_kes DECIMAL(10,2) NOT NULL DEFAULT 0,
    total_tickets_sold INT NOT NULL DEFAULT 0,
    total_donations INT NOT NULL DEFAULT 0,
    total_attendees INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_instant_watch_earnings_session_id ON instant_watch_earnings(session_id);
CREATE INDEX idx_instant_watch_earnings_host_id ON instant_watch_earnings(host_id);
CREATE INDEX idx_instant_watch_earnings_created_at ON instant_watch_earnings(created_at DESC);
CREATE INDEX idx_instant_watch_earnings_host_created ON instant_watch_earnings(host_id, created_at DESC);
