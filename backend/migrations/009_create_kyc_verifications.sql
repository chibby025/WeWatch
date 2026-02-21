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
