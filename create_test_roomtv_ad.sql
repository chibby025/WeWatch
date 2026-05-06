-- Create test RoomTV text ad for jumbotron testing
-- Run with: psql -h localhost -p 5432 -U postgres -d wewatch_db -f create_test_roomtv_ad.sql

-- Clean up existing test RoomTV ad
DELETE FROM ad_campaigns WHERE id = 2000;

-- Insert test text ad for RoomTV
INSERT INTO ad_campaigns (
    id,
    advertiser_id,
    campaign_name,
    budget,
    spent_amount,
    status,
    start_date,
    end_date,
    target_age_min,
    target_age_max,
    target_content_rating,
    ad_type,
    media_url,
    thumbnail_url,
    click_url,
    ad_duration,
    impressions,
    clicks,
    ctr,
    cpm,
    created_at,
    updated_at
) VALUES (
    2000,
    1, -- advertiser_id (must exist in users table)
    '🎉 WeWatch Premium - Unlock 4K Streaming & Ad-Free Experience!',
    5000.00,
    0.00,
    'active',
    NOW() - INTERVAL '1 day',
    NOW() + INTERVAL '30 days',
    13,
    99,
    '', -- All content ratings
    'text', -- Text-based ad for RoomTV
    NULL, -- No image for text ads
    NULL, -- No thumbnail
    'https://letswatchout.com/premium',
    15, -- Display for 15 seconds
    0,
    0,
    0.00,
    8.50, -- High CPM for priority display
    NOW(),
    NOW()
);

-- Verify insertion
SELECT id, campaign_name, ad_type, status, cpm, start_date, end_date 
FROM ad_campaigns 
WHERE id = 2000;
