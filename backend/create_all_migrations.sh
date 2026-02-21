#!/bin/bash
cd migrations

# 003 - Add ticketing to watch_sessions
cat > 003_add_ticketing_to_watch_sessions.sql << 'EOF'
ALTER TABLE watch_sessions 
ADD COLUMN IF NOT EXISTS ticketing_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS ticket_price_tokens INT,
ADD COLUMN IF NOT EXISTS ticket_price_currency VARCHAR(10),
ADD COLUMN IF NOT EXISTS ticket_price_amount DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS early_bird_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS early_bird_price_tokens INT,
ADD COLUMN IF NOT EXISTS early_bird_price_amount DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS early_bird_active BOOLEAN DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_watch_sessions_ticketing ON watch_sessions(ticketing_enabled) WHERE ticketing_enabled = TRUE;

ALTER TABLE watch_sessions 
ADD CONSTRAINT IF NOT EXISTS check_ticket_price_tokens CHECK (ticket_price_tokens IS NULL OR ticket_price_tokens > 0),
ADD CONSTRAINT IF NOT EXISTS check_ticket_price_amount CHECK (ticket_price_amount IS NULL OR ticket_price_amount > 0),
ADD CONSTRAINT IF NOT EXISTS check_early_bird_price_tokens CHECK (early_bird_price_tokens IS NULL OR early_bird_price_tokens > 0),
ADD CONSTRAINT IF NOT EXISTS check_early_bird_price_amount CHECK (early_bird_price_amount IS NULL OR early_bird_price_amount > 0);
EOF

# 004 - Session tickets
cat > 004_create_session_tickets.sql << 'EOF'
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
EOF

# 005 - Gateway earnings
cat > 005_create_gateway_earnings.sql << 'EOF'
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
EOF

# 006 - Donations
cat > 006_create_donations.sql << 'EOF'
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
EOF

# 007 - Instant watch earnings
cat > 007_create_instant_watch_earnings.sql << 'EOF'
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
EOF

# 008 - Payouts
cat > 008_create_payouts.sql << 'EOF'
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
EOF

# 009 - KYC verifications
cat > 009_create_kyc_verifications.sql << 'EOF'
CREATE TABLE IF NOT EXISTS kyc_verifications (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id_type VARCHAR(50) NOT NULL CHECK (id_type IN ('national_id', 'passport', 'drivers_license', 'voters_card')),
    id_number VARCHAR(100) NOT NULL,
    id_document_url TEXT,
    selfie_url TEXT,
    bank_details JSONB,
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'expired')),
    rejection_reason TEXT,
    verified_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    verified_at TIMESTAMP,
    expires_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(user_id)
);

CREATE INDEX idx_kyc_verifications_user_id ON kyc_verifications(user_id);
CREATE INDEX idx_kyc_verifications_status ON kyc_verifications(status);
CREATE INDEX idx_kyc_verifications_created_at ON kyc_verifications(created_at DESC);

CREATE OR REPLACE FUNCTION update_kyc_timestamp()
RETURNS TRIGGER AS \$\$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
\$\$ LANGUAGE plpgsql;

CREATE TRIGGER kyc_updated_at
BEFORE UPDATE ON kyc_verifications
FOR EACH ROW
EXECUTE FUNCTION update_kyc_timestamp();
EOF

# 010 - Add KYC fields to users
cat > 010_add_kyc_fields_to_users.sql << 'EOF'
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS is_kyc_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS kyc_verified_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS preferred_currency VARCHAR(10),
ADD COLUMN IF NOT EXISTS detected_currency VARCHAR(10) DEFAULT 'USD';

CREATE INDEX IF NOT EXISTS idx_users_is_kyc_verified ON users(is_kyc_verified) WHERE is_kyc_verified = TRUE;
EOF

# 011 - Refund requests
cat > 011_create_refund_requests.sql << 'EOF'
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
EOF

echo "✅ All migration files created!"
ls -la *.sql | tail -11
