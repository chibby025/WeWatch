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
