-- backend/migrations/20260424000001_create_admin_audit_logs.sql
-- Admin Audit Log table for tracking all administrative actions

-- +migrate Up
CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id BIGSERIAL PRIMARY KEY,
    admin_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action VARCHAR(100) NOT NULL,
    target_type VARCHAR(50),
    target_id BIGINT,
    details TEXT,
    ip_address VARCHAR(45),
    user_agent TEXT,
    success BOOLEAN DEFAULT true,
    error_msg TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes for efficient querying
    CONSTRAINT fk_admin_audit_logs_admin FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_admin_audit_logs_admin_id ON admin_audit_logs(admin_id);
CREATE INDEX idx_admin_audit_logs_action ON admin_audit_logs(action);
CREATE INDEX idx_admin_audit_logs_target ON admin_audit_logs(target_type, target_id);
CREATE INDEX idx_admin_audit_logs_created_at ON admin_audit_logs(created_at DESC);

COMMENT ON TABLE admin_audit_logs IS 'Audit trail of all administrative actions for security and compliance';
COMMENT ON COLUMN admin_audit_logs.action IS 'Action performed: approve_kyc, reject_payout, ban_user, etc.';
COMMENT ON COLUMN admin_audit_logs.target_type IS 'Entity type affected: user, kyc, payout, session, etc.';
COMMENT ON COLUMN admin_audit_logs.target_id IS 'ID of the affected entity';
COMMENT ON COLUMN admin_audit_logs.details IS 'JSON or text description of the action details';

-- +migrate Down
DROP TABLE IF EXISTS admin_audit_logs CASCADE;
