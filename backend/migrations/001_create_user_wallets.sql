-- Create user_wallets table for token balance tracking
CREATE TABLE IF NOT EXISTS user_wallets (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_balance INT NOT NULL DEFAULT 0 CHECK (token_balance >= 0),
    lifetime_earned INT NOT NULL DEFAULT 0,
    lifetime_spent INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Create index for faster lookups
CREATE INDEX idx_user_wallets_user_id ON user_wallets(user_id);

-- Auto-create wallet for existing users
INSERT INTO user_wallets (user_id, token_balance, lifetime_earned, lifetime_spent, created_at, updated_at)
SELECT id, 0, 0, 0, NOW(), NOW()
FROM users
WHERE id NOT IN (SELECT user_id FROM user_wallets);

-- Trigger to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_wallet_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_wallet_updated_at
BEFORE UPDATE ON user_wallets
FOR EACH ROW
EXECUTE FUNCTION update_user_wallet_timestamp();
