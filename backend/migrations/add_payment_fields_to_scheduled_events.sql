-- Migration: Add payment/ticketing fields to scheduled_events table
-- Date: 2025-12-10
-- Description: Add is_paid, ticket_price_tokens, ticket_price_currency, and ticket_price_amount fields

-- Step 1: Add new columns
ALTER TABLE scheduled_events 
ADD COLUMN is_paid BOOLEAN DEFAULT false,
ADD COLUMN ticket_price_tokens INTEGER DEFAULT 0,
ADD COLUMN ticket_price_currency VARCHAR(10),
ADD COLUMN ticket_price_amount DECIMAL(10,2) DEFAULT 0;

-- Step 2: Add index on is_paid for faster queries
CREATE INDEX idx_scheduled_events_is_paid ON scheduled_events(is_paid);

-- Rollback script (save separately if needed):
-- ALTER TABLE scheduled_events DROP COLUMN is_paid;
-- ALTER TABLE scheduled_events DROP COLUMN ticket_price_tokens;
-- ALTER TABLE scheduled_events DROP COLUMN ticket_price_currency;
-- ALTER TABLE scheduled_events DROP COLUMN ticket_price_amount;
-- DROP INDEX idx_scheduled_events_is_paid;
