CREATE TABLE IF NOT EXISTS refund_requests (
    id BIGSERIAL PRIMARY KEY,
    ticket_id BIGINT NOT NULL REFERENCES session_tickets(id) ON DELETE CASCADE,
    session_id BIGINT NOT NULL REFERENCES watch_sessions(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    host_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount_tokens INT NOT NULL CHECK (amount_tokens > 0),
    amount_currency DECIMAL(10,2),
    currency VARCHAR(10),
    reason TEXT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
    denial_reason TEXT,
    reviewed_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refund_requests_ticket_id ON refund_requests(ticket_id);
CREATE INDEX idx_refund_requests_session_id ON refund_requests(session_id);
CREATE INDEX idx_refund_requests_user_id ON refund_requests(user_id);
CREATE INDEX idx_refund_requests_host_id ON refund_requests(host_id);
CREATE INDEX idx_refund_requests_status ON refund_requests(status);
CREATE INDEX idx_refund_requests_created_at ON refund_requests(created_at DESC);
CREATE INDEX idx_refund_requests_host_status ON refund_requests(host_id, status) WHERE status = 'pending';

CREATE OR REPLACE FUNCTION update_refund_request_timestamp()
RETURNS TRIGGER AS \$\$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
\$\$ LANGUAGE plpgsql;

CREATE TRIGGER refund_request_updated_at
BEFORE UPDATE ON refund_requests
FOR EACH ROW
EXECUTE FUNCTION update_refund_request_timestamp();
