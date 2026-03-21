-- Create event_tickets table for tracking RSVPs and ticket purchases
CREATE TABLE IF NOT EXISTS event_tickets (
    id SERIAL PRIMARY KEY,
    scheduled_event_id INTEGER NOT NULL REFERENCES scheduled_events(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    host_id INTEGER NOT NULL REFERENCES users(id),
    
    -- Payment details
    payment_method VARCHAR(20) NOT NULL, -- 'tokens', 'free_rsvp', 'paystack', 'stripe'
    ticket_price_tokens INTEGER DEFAULT 0,
    ticket_price_currency VARCHAR(10),
    ticket_price_amount DECIMAL(10,2) DEFAULT 0,
    is_early_bird BOOLEAN DEFAULT false,
    
    -- Transaction tracking
    transaction_id INTEGER REFERENCES token_transactions(id),
    gateway_earning_id INTEGER,
    
    -- Gifting support
    is_gift BOOLEAN DEFAULT false,
    gifted_by_user_id INTEGER REFERENCES users(id),
    
    -- Status
    is_refunded BOOLEAN DEFAULT false,
    refunded_at TIMESTAMP,
    is_cancelled BOOLEAN DEFAULT false,
    cancelled_at TIMESTAMP,
    
    -- Attendance tracking
    did_attend BOOLEAN,
    attended_at TIMESTAMP,
    
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes
    CONSTRAINT event_tickets_scheduled_event_id_idx UNIQUE (scheduled_event_id, user_id)
);

-- Create indexes
CREATE INDEX idx_event_tickets_scheduled_event_id ON event_tickets(scheduled_event_id);
CREATE INDEX idx_event_tickets_user_id ON event_tickets(user_id);
CREATE INDEX idx_event_tickets_host_id ON event_tickets(host_id);
CREATE INDEX idx_event_tickets_transaction_id ON event_tickets(transaction_id);
CREATE INDEX idx_event_tickets_is_refunded ON event_tickets(is_refunded);
CREATE INDEX idx_event_tickets_created_at ON event_tickets(created_at);

-- Add RSVP and ticket counters to scheduled_events if not exists
ALTER TABLE scheduled_events ADD COLUMN IF NOT EXISTS rsvp_count INTEGER DEFAULT 0;
ALTER TABLE scheduled_events ADD COLUMN IF NOT EXISTS tickets_sold INTEGER DEFAULT 0;
ALTER TABLE scheduled_events ADD COLUMN IF NOT EXISTS session_created BOOLEAN DEFAULT false;
ALTER TABLE scheduled_events ADD COLUMN IF NOT EXISTS watch_session_id INTEGER REFERENCES watch_sessions(session_id);
ALTER TABLE scheduled_events ADD COLUMN IF NOT EXISTS host_joined_session BOOLEAN DEFAULT false;

-- Add scheduled event fields to watch_sessions if not exists
ALTER TABLE watch_sessions ADD COLUMN IF NOT EXISTS scheduled_event_id INTEGER REFERENCES scheduled_events(id);
ALTER TABLE watch_sessions ADD COLUMN IF NOT EXISTS host_required BOOLEAN DEFAULT true;

-- Add transfer fee revenue to platform_accounting if not exists
ALTER TABLE platform_accounting ADD COLUMN IF NOT EXISTS transfer_fee_revenue DECIMAL(15,2) DEFAULT 0;
ALTER TABLE platform_accounting ADD COLUMN IF NOT EXISTS lifetime_transfer_fee_revenue DECIMAL(15,2) DEFAULT 0;
ALTER TABLE platform_accounting ADD COLUMN IF NOT EXISTS total_early_bird_savings DECIMAL(15,2) DEFAULT 0;
