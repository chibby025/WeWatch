-- WeWatch Content Declaration System
-- Migration: Add content declarations support for paid sessions

-- Content Declarations Table
CREATE TABLE IF NOT EXISTS content_declarations (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id INTEGER REFERENCES watch_sessions(id) ON DELETE CASCADE,
    
    -- Declaration Details
    content_type VARCHAR(50) NOT NULL CHECK (content_type IN ('original', 'licensed', 'educational', 'public_domain')),
    content_title VARCHAR(255) NOT NULL,
    content_description TEXT NOT NULL,
    production_year INTEGER CHECK (production_year >= 1900 AND production_year <= EXTRACT(YEAR FROM CURRENT_DATE)),
    rights_holder VARCHAR(255) NOT NULL,
    additional_info TEXT,
    
    -- Legal Record (CRITICAL for indemnity)
    agreed_to_terms BOOLEAN NOT NULL DEFAULT false,
    declaration_timestamp TIMESTAMP NOT NULL DEFAULT NOW(),
    ip_address INET NOT NULL,
    user_agent TEXT NOT NULL,
    
    -- Verification Status
    is_verified BOOLEAN DEFAULT false,
    verified_at TIMESTAMP,
    verified_by INTEGER REFERENCES users(id),
    verification_notes TEXT,
    
    -- Compliance Tracking
    dmca_complaints INTEGER DEFAULT 0,
    last_complaint_date TIMESTAMP,
    status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'disputed', 'removed', 'verified')),
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- DMCA Complaints Table
CREATE TABLE IF NOT EXISTS dmca_complaints (
    id SERIAL PRIMARY KEY,
    
    -- Complaint Details
    complainant_name VARCHAR(255) NOT NULL,
    complainant_email VARCHAR(255) NOT NULL,
    complainant_address TEXT,
    complainant_phone VARCHAR(50),
    
    -- Target Content
    session_id INTEGER REFERENCES watch_sessions(id) ON DELETE SET NULL,
    declaration_id INTEGER REFERENCES content_declarations(id) ON DELETE SET NULL,
    content_url TEXT NOT NULL,
    infringing_material_description TEXT NOT NULL,
    
    -- Copyright Claim
    copyrighted_work_description TEXT NOT NULL,
    copyright_registration_number VARCHAR(100),
    original_work_location TEXT,
    
    -- Legal Attestation (DMCA requirement)
    good_faith_belief TEXT NOT NULL,
    accurate_info_attestation BOOLEAN NOT NULL DEFAULT false,
    perjury_statement BOOLEAN NOT NULL DEFAULT false,
    electronic_signature VARCHAR(255) NOT NULL,
    signature_date DATE NOT NULL,
    
    -- Processing
    received_at TIMESTAMP DEFAULT NOW(),
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'removed', 'counter_notice', 'restored', 'invalid')),
    processed_at TIMESTAMP,
    processed_by INTEGER REFERENCES users(id),
    removal_reason TEXT,
    
    -- User Response
    counter_notice_received BOOLEAN DEFAULT false,
    counter_notice_text TEXT,
    counter_notice_date TIMESTAMP,
    counter_notice_contact TEXT,
    
    -- Resolution
    restored_at TIMESTAMP,
    restoration_reason TEXT,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- User Copyright Strikes Table
CREATE TABLE IF NOT EXISTS user_copyright_strikes (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    dmca_complaint_id INTEGER REFERENCES dmca_complaints(id) ON DELETE SET NULL,
    
    strike_number INTEGER NOT NULL CHECK (strike_number BETWEEN 1 AND 3),
    strike_reason TEXT NOT NULL,
    strike_date TIMESTAMP DEFAULT NOW(),
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    expires_at TIMESTAMP, -- Strikes can expire after 6-12 months of good behavior
    appealed BOOLEAN DEFAULT false,
    appeal_text TEXT,
    appeal_date TIMESTAMP,
    appeal_decision TEXT,
    
    -- Ban Tracking
    resulted_in_ban BOOLEAN DEFAULT false,
    ban_date TIMESTAMP,
    ban_duration_days INTEGER, -- Permanent ban = NULL
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- Add declaration_id to watch_sessions (optional link)
ALTER TABLE watch_sessions ADD COLUMN IF NOT EXISTS content_declaration_id INTEGER REFERENCES content_declarations(id) ON DELETE SET NULL;
ALTER TABLE watch_sessions ADD COLUMN IF NOT EXISTS requires_declaration BOOLEAN DEFAULT false;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_declarations_user ON content_declarations(user_id);
CREATE INDEX IF NOT EXISTS idx_declarations_session ON content_declarations(session_id);
CREATE INDEX IF NOT EXISTS idx_declarations_status ON content_declarations(status);
CREATE INDEX IF NOT EXISTS idx_declarations_verified ON content_declarations(is_verified);

CREATE INDEX IF NOT EXISTS idx_complaints_session ON dmca_complaints(session_id);
CREATE INDEX IF NOT EXISTS idx_complaints_declaration ON dmca_complaints(declaration_id);
CREATE INDEX IF NOT EXISTS idx_complaints_status ON dmca_complaints(status);
CREATE INDEX IF NOT EXISTS idx_complaints_email ON dmca_complaints(complainant_email);

CREATE INDEX IF NOT EXISTS idx_strikes_user ON user_copyright_strikes(user_id);
CREATE INDEX IF NOT EXISTS idx_strikes_active ON user_copyright_strikes(is_active);
CREATE INDEX IF NOT EXISTS idx_strikes_date ON user_copyright_strikes(strike_date);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_content_declarations_updated_at BEFORE UPDATE ON content_declarations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_dmca_complaints_updated_at BEFORE UPDATE ON dmca_complaints
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to check if user is banned (3 active strikes)
CREATE OR REPLACE FUNCTION is_user_copyright_banned(p_user_id INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
    active_strikes INTEGER;
BEGIN
    SELECT COUNT(*) INTO active_strikes
    FROM user_copyright_strikes
    WHERE user_id = p_user_id
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > NOW());
    
    RETURN active_strikes >= 3;
END;
$$ LANGUAGE plpgsql;

-- Function to add copyright strike
CREATE OR REPLACE FUNCTION add_copyright_strike(
    p_user_id INTEGER,
    p_complaint_id INTEGER,
    p_reason TEXT
) RETURNS VOID AS $$
DECLARE
    current_strikes INTEGER;
    new_strike_number INTEGER;
BEGIN
    -- Count active strikes
    SELECT COUNT(*) INTO current_strikes
    FROM user_copyright_strikes
    WHERE user_id = p_user_id
    AND is_active = true;
    
    new_strike_number := current_strikes + 1;
    
    -- Add new strike
    INSERT INTO user_copyright_strikes (
        user_id,
        dmca_complaint_id,
        strike_number,
        strike_reason,
        resulted_in_ban,
        ban_date
    ) VALUES (
        p_user_id,
        p_complaint_id,
        new_strike_number,
        p_reason,
        new_strike_number >= 3, -- Ban on 3rd strike
        CASE WHEN new_strike_number >= 3 THEN NOW() ELSE NULL END
    );
    
    -- If 3rd strike, ban user
    IF new_strike_number >= 3 THEN
        UPDATE users
        SET is_banned = true,
            ban_reason = 'Copyright infringement (3 strikes)',
            banned_at = NOW()
        WHERE id = p_user_id;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON TABLE content_declarations IS 'Legal declarations for paid content sessions. Creates indemnification record.';
COMMENT ON TABLE dmca_complaints IS 'DMCA takedown requests and processing records.';
COMMENT ON TABLE user_copyright_strikes IS 'Three-strike system for copyright violations. 3 strikes = permanent ban.';

COMMENT ON COLUMN content_declarations.ip_address IS 'IP address at time of declaration. Critical for legal traceability.';
COMMENT ON COLUMN content_declarations.user_agent IS 'Browser/device info. Part of legal record.';
COMMENT ON COLUMN content_declarations.agreed_to_terms IS 'Must be true. User certified under penalty of perjury.';

COMMENT ON FUNCTION is_user_copyright_banned IS 'Check if user has 3 active strikes and is banned from paid sessions.';
COMMENT ON FUNCTION add_copyright_strike IS 'Add copyright strike to user. Automatically bans on 3rd strike.';
