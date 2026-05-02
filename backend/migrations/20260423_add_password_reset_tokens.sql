-- Migration: Add password reset tokens table
-- Date: April 23, 2026
-- Purpose: Enable forgot password functionality with secure token-based reset

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_password_reset_token ON password_reset_tokens(token);
CREATE INDEX idx_password_reset_expiry ON password_reset_tokens(expires_at);
CREATE INDEX idx_password_reset_user_id ON password_reset_tokens(user_id);

-- Add comment for documentation
COMMENT ON TABLE password_reset_tokens IS 'Stores temporary tokens for password reset requests (15-minute expiry)';
COMMENT ON COLUMN password_reset_tokens.token IS 'UUID token sent in reset email';
COMMENT ON COLUMN password_reset_tokens.used IS 'Prevents token reuse after successful reset';
COMMENT ON COLUMN password_reset_tokens.expires_at IS 'Token expires 15 minutes after creation';
