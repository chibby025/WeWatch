-- Migration: Add early bird pricing fields to scheduled_events table
-- Date: 2025-12-10
-- Description: Add early bird discount pricing that auto-deactivates 1 hour before event starts

-- Step 1: Add early bird columns
ALTER TABLE scheduled_events
ADD COLUMN early_bird_enabled BOOLEAN DEFAULT false,
ADD COLUMN early_bird_price_tokens INTEGER DEFAULT 0,
ADD COLUMN early_bird_price_amount DECIMAL(10,2) DEFAULT 0,
ADD COLUMN early_bird_active BOOLEAN DEFAULT true;

-- Step 2: Add index for scheduled job queries
-- This index helps the scheduler efficiently find events with active early bird pricing
CREATE INDEX idx_scheduled_events_early_bird_active 
ON scheduled_events(early_bird_enabled, early_bird_active, start_time);

-- Step 3: Add comment for documentation
COMMENT ON COLUMN scheduled_events.early_bird_enabled IS 'Whether early bird pricing is configured for this event';
COMMENT ON COLUMN scheduled_events.early_bird_price_tokens IS 'Discounted price in tokens (active until 1hr before event)';
COMMENT ON COLUMN scheduled_events.early_bird_price_amount IS 'Discounted price in fiat currency';
COMMENT ON COLUMN scheduled_events.early_bird_active IS 'Whether early bird is currently active (auto-deactivates 1hr before start_time)';

-- Rollback script (save separately if needed):
-- DROP INDEX IF EXISTS idx_scheduled_events_early_bird_active;
-- ALTER TABLE scheduled_events DROP COLUMN early_bird_enabled;
-- ALTER TABLE scheduled_events DROP COLUMN early_bird_price_tokens;
-- ALTER TABLE scheduled_events DROP COLUMN early_bird_price_amount;
-- ALTER TABLE scheduled_events DROP COLUMN early_bird_active;
