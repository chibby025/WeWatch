-- WeWatch Dummy Ad Campaigns for Testing
-- Run this to create realistic test ads
-- Updated with working image URLs (Unsplash)
-- To delete later: DELETE FROM ad_campaigns WHERE id >= 1000;

-- First, delete existing test ads if they exist
DELETE FROM ad_campaigns WHERE id >= 1000;

-- 1. Banner Ad - Gaming Headset
INSERT INTO ad_campaigns (
  id, advertiser_id, campaign_name, budget, spent_amount, status,
  start_date, end_date, target_age_min, target_age_max, target_content_rating,
  ad_type, media_url, thumbnail_url, click_url, ad_duration,
  impressions, clicks, ctr, cpm,
  created_at, updated_at
) VALUES (
  1000,
  1, -- Replace with your test user ID
  'Premium Gaming Headset Sale - TechGear Pro',
  500.00,
  0.00,
  'active',
  NOW(),
  NOW() + INTERVAL '30 days',
  16,
  35,
  '13+',
  'banner',
  'https://images.unsplash.com/photo-1599669454699-248893623440?w=728&h=90&fit=crop',
  'https://images.unsplash.com/photo-1599669454699-248893623440?w=300&h=250&fit=crop',
  'https://example.com/gaming-headsets',
  0,
  0,
  0,
  0.00,
  3.50,
  NOW(),
  NOW()
);

-- 2. Video Pre-Roll - Energy Drink
INSERT INTO ad_campaigns (
  id, advertiser_id, campaign_name, budget, spent_amount, status,
  start_date, end_date, target_age_min, target_age_max, target_content_rating,
  ad_type, media_url, thumbnail_url, click_url, ad_duration,
  impressions, clicks, ctr, cpm,
  created_at, updated_at
) VALUES (
  1001,
  1,
  'New Thunder Energy Drink Launch',
  1000.00,
  0.00,
  'active',
  NOW(),
  NOW() + INTERVAL '30 days',
  18,
  45,
  '16+',
  'video_preroll',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
  'https://via.placeholder.com/640x360.png/ff6b6b/ffffff?text=Thunder+Energy',
  'https://example.com/thunder-energy',
  15,
  0,
  0,
  0.00,
  7.50,
  NOW(),
  NOW()
);

-- 3. Banner Ad - Streaming Service
INSERT INTO ad_campaigns (
  id, advertiser_id, campaign_name, budget, spent_amount, status,
  start_date, end_date, target_age_min, target_age_max, target_content_rating,
  ad_type, media_url, thumbnail_url, click_url, ad_duration,
  impressions, clicks, ctr, cpm,
  created_at, updated_at
) VALUES (
  1002,
  1,
  'Watch 1000+ Movies - StreamMax Free Trial',
  750.00,
  0.00,
  'active',
  NOW(),
  NOW() + INTERVAL '60 days',
  13,
  99,
  'G',
  'banner',
  'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=728&h=90&fit=crop',
  'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=300&h=250&fit=crop',
  'https://example.com/streammax-trial',
  0,
  0,
  0,
  0.00,
  2.75,
  NOW(),
  NOW()
);

-- 4. Sponsored Room Ad - Concert Live Stream
INSERT INTO ad_campaigns (
  id, advertiser_id, campaign_name, budget, spent_amount, status,
  start_date, end_date, target_age_min, target_age_max, target_content_rating,
  ad_type, media_url, thumbnail_url, click_url, ad_duration,
  impressions, clicks, ctr, cpm,
  created_at, updated_at
) VALUES (
  1003,
  1,
  'Exclusive Concert - LiveNation Saturday Night',
  2000.00,
  0.00,
  'active',
  NOW(),
  NOW() + INTERVAL '7 days',
  16,
  50,
  '13+',
  'sponsored_room',
  'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=1920&h=1080&fit=crop',
  'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=640&h=360&fit=crop',
  'https://example.com/live-concert',
  0,
  0,
  0,
  0.00,
  15.00,
  NOW(),
  NOW()
);

-- 5. Banner Ad - Mobile Game
INSERT INTO ad_campaigns (
  id, advertiser_id, campaign_name, budget, spent_amount, status,
  start_date, end_date, target_age_min, target_age_max, target_content_rating,
  ad_type, media_url, thumbnail_url, click_url, ad_duration,
  impressions, clicks, ctr, cpm,
  created_at, updated_at
) VALUES (
  1004,
  1,
  'New RPG Launch - Download Now - Epic Games',
  1500.00,
  0.00,
  'active',
  NOW(),
  NOW() + INTERVAL '45 days',
  13,
  25,
  'PG',
  'banner',
  'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=728&h=90&fit=crop',
  'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=300&h=250&fit=crop',
  'https://example.com/epic-rpg',
  0,
  0,
  0,
  0.00,
  4.25,
  NOW(),
  NOW()
);

-- 6. Video Ad - Tech Product
INSERT INTO ad_campaigns (
  id, advertiser_id, campaign_name, budget, spent_amount, status,
  start_date, end_date, target_age_min, target_age_max, target_content_rating,
  ad_type, media_url, thumbnail_url, click_url, ad_duration,
  impressions, clicks, ctr, cpm,
  created_at, updated_at
) VALUES (
  1005,
  1,
  'Revolutionary Smart Watch - NextGen Tech',
  3000.00,
  0.00,
  'active',
  NOW(),
  NOW() + INTERVAL '90 days',
  18,
  55,
  '13+',
  'video_preroll',
  'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
  'https://via.placeholder.com/640x360.png/1abc9c/ffffff?text=NextGen+Watch',
  'https://example.com/nextgen-watch',
  10,
  0,
  0,
  0.00,
  9.00,
  NOW(),
  NOW()
);

-- Verification Query
SELECT 
  id,
  campaign_name,
  ad_type,
  status,
  cpm,
  budget,
  impressions,
  clicks
FROM ad_campaigns 
WHERE id >= 1000
ORDER BY id;
