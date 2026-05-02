-- Migration: Create ad campaigns tables
-- Created: 2026-04-29

-- Ad Campaigns Table
CREATE TABLE IF NOT EXISTS ad_campaigns (
    id SERIAL PRIMARY KEY,
    inquiry_id INTEGER REFERENCES ad_inquiries(id) ON DELETE SET NULL,
    advertiser_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    campaign_name VARCHAR(255) NOT NULL,
    budget DECIMAL(10,2) NOT NULL,
    spent_amount DECIMAL(10,2) DEFAULT 0,
    status VARCHAR(50) DEFAULT 'draft',
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP NOT NULL,
    target_age_min INTEGER DEFAULT 13,
    target_age_max INTEGER DEFAULT 99,
    target_content_rating VARCHAR(50),
    ad_type VARCHAR(50) NOT NULL,
    media_url VARCHAR(500),
    thumbnail_url VARCHAR(500),
    click_url VARCHAR(500),
    ad_duration INTEGER DEFAULT 0,
    impressions BIGINT DEFAULT 0,
    clicks BIGINT DEFAULT 0,
    ctr DECIMAL(5,2) DEFAULT 0,
    cpm DECIMAL(10,2) DEFAULT 0,
    approved_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    approved_at TIMESTAMP,
    rejection_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ad_campaigns_status ON ad_campaigns(status);
CREATE INDEX idx_ad_campaigns_advertiser ON ad_campaigns(advertiser_id);
CREATE INDEX idx_ad_campaigns_dates ON ad_campaigns(start_date, end_date);
CREATE INDEX idx_ad_campaigns_active ON ad_campaigns(status, start_date, end_date) WHERE status = 'active';

-- Ad Impressions Table
CREATE TABLE IF NOT EXISTS ad_impressions (
    id BIGSERIAL PRIMARY KEY,
    campaign_id INTEGER NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    room_id INTEGER REFERENCES rooms(id) ON DELETE SET NULL,
    session_id VARCHAR(255),
    ip_address VARCHAR(50) NOT NULL,
    user_agent VARCHAR(500),
    clicked BOOLEAN DEFAULT FALSE,
    view_duration INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ad_impressions_campaign ON ad_impressions(campaign_id);
CREATE INDEX idx_ad_impressions_user ON ad_impressions(user_id);
CREATE INDEX idx_ad_impressions_created ON ad_impressions(created_at DESC);
CREATE INDEX idx_ad_impressions_clicked ON ad_impressions(clicked) WHERE clicked = TRUE;

-- Ad Payments Table
CREATE TABLE IF NOT EXISTS ad_payments (
    id SERIAL PRIMARY KEY,
    campaign_id INTEGER NOT NULL REFERENCES ad_campaigns(id) ON DELETE CASCADE,
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'USD',
    payment_method VARCHAR(50) NOT NULL,
    payment_status VARCHAR(50) DEFAULT 'pending',
    stripe_payment_intent_id VARCHAR(255),
    transaction_id VARCHAR(255),
    paid_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_ad_payments_campaign ON ad_payments(campaign_id);
CREATE INDEX idx_ad_payments_status ON ad_payments(payment_status);

COMMENT ON TABLE ad_campaigns IS 'Stores advertising campaigns with targeting and budget info';
COMMENT ON TABLE ad_impressions IS 'Tracks ad views and clicks for analytics';
COMMENT ON TABLE ad_payments IS 'Stores payment transactions for ad campaigns';
COMMENT ON COLUMN ad_campaigns.status IS 'Status: draft, pending_review, active, paused, completed, rejected';
COMMENT ON COLUMN ad_campaigns.ad_type IS 'Ad type: banner, video_preroll, sponsored_room';
