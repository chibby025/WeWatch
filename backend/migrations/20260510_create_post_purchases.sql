-- Migration: Create post_purchases table for paid post/recording purchases
-- Created: 2026-05-10
-- One purchase per (post, user). Purchase grants permanent download right
-- (see post_download_handler.go gating).

CREATE TABLE IF NOT EXISTS post_purchases (
    id BIGSERIAL PRIMARY KEY,
    post_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    amount_tokens INTEGER NOT NULL,                                  -- Token cents (100 cents = 1 token); matches admin analytics queries
    payment_method VARCHAR(20) DEFAULT 'tokens' NOT NULL,
    transaction_ref VARCHAR(100) UNIQUE,                             -- Idempotency key tying this row to its token_transactions
    status VARCHAR(20) DEFAULT 'completed' NOT NULL,
    purchased_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT post_purchases_post_id_fkey FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    CONSTRAINT post_purchases_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT post_purchases_unique_buyer UNIQUE (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_post_purchases_post_id ON post_purchases(post_id);
CREATE INDEX IF NOT EXISTS idx_post_purchases_user_id ON post_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_post_purchases_status ON post_purchases(status);
CREATE INDEX IF NOT EXISTS idx_post_purchases_purchased_at ON post_purchases(purchased_at);

COMMENT ON TABLE post_purchases IS 'Records token-based purchases of paid posts/recordings (75% creator / 25% platform split)';
COMMENT ON COLUMN post_purchases.amount_tokens IS 'Full purchase price in token cents (100 = 1 token); platform share is 25% of this, calculated implicitly';
