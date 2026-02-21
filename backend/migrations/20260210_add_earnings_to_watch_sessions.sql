-- Add earnings tracking fields to watch_sessions table
-- These fields track ticket sales revenue during a session

ALTER TABLE watch_sessions
ADD COLUMN IF NOT EXISTS total_tickets_sold INT DEFAULT 0 NOT NULL,
ADD COLUMN IF NOT EXISTS total_ticket_revenue INT DEFAULT 0 NOT NULL; -- Revenue in CENTS (tokens × 100)

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_watch_sessions_total_tickets_sold ON watch_sessions(total_tickets_sold);
CREATE INDEX IF NOT EXISTS idx_watch_sessions_total_ticket_revenue ON watch_sessions(total_ticket_revenue);

COMMENT ON COLUMN watch_sessions.total_tickets_sold IS 'Number of tickets sold for this session';
COMMENT ON COLUMN watch_sessions.total_ticket_revenue IS 'Total ticket revenue in CENTS (1 token = 100 cents)';
