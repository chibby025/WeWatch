-- Migration: Create ad_inquiries table
-- Created: 2026-04-29

CREATE TABLE IF NOT EXISTS ad_inquiries (
    id SERIAL PRIMARY KEY,
    company_name VARCHAR(255) NOT NULL,
    contact_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    budget VARCHAR(50) NOT NULL,
    campaign_goals TEXT NOT NULL,
    target_audience TEXT,
    message TEXT,
    status VARCHAR(50) DEFAULT 'pending',
    admin_notes TEXT,
    reviewed_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ad_inquiries_status ON ad_inquiries(status);
CREATE INDEX idx_ad_inquiries_created_at ON ad_inquiries(created_at DESC);
CREATE INDEX idx_ad_inquiries_email ON ad_inquiries(email);

COMMENT ON TABLE ad_inquiries IS 'Stores advertising inquiry submissions from potential advertisers';
COMMENT ON COLUMN ad_inquiries.budget IS 'Budget range: under_500, 500_1k, 1k_5k, 5k_10k, over_10k';
COMMENT ON COLUMN ad_inquiries.status IS 'Status: pending, approved, rejected, contacted';
