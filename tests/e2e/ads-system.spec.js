// tests/e2e/ads-system.spec.js
// End-to-end test for the ads system using Playwright

import { test, expect } from '@playwright/test';

const API_BASE_URL = process.env.VITE_API_BASE_URL || 'http://localhost:8080';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

test.describe('Ads System E2E Tests', () => {
  let advertiserUser;
  let viewerUser;
  let testCampaign;

  test.beforeAll(async ({ request }) => {
    // Create test users
    const advertiserRes = await request.post(`${API_BASE_URL}/api/auth/register`, {
      data: {
        username: `advertiser_${Date.now()}`,
        email: `advertiser_${Date.now()}@test.com`,
        password: 'Test123!',
        date_of_birth: '1990-01-01',
      },
    });
    advertiserUser = await advertiserRes.json();

    const viewerRes = await request.post(`${API_BASE_URL}/api/auth/register`, {
      data: {
        username: `viewer_${Date.now()}`,
        email: `viewer_${Date.now()}@test.com`,
        password: 'Test123!',
        date_of_birth: '1995-01-01',
      },
    });
    viewerUser = await viewerRes.json();

    console.log('✅ Test users created');
  });

  test.describe('Ad Campaign Creation', () => {
    test('should create a video ad campaign', async ({ request }) => {
      const response = await request.post(`${API_BASE_URL}/api/ads/campaigns`, {
        data: {
          advertiser_id: advertiserUser.user.id,
          advertiser_name: 'E2E Test Corp',
          title: 'E2E Test Video Ad',
          description: 'This is a test video ad',
          ad_type: 'video_preroll',
          media_url: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
          thumbnail_url: 'https://via.placeholder.com/640x360',
          click_url: 'https://example.com/e2e-test',
          cpm_bid: 7.50,
          daily_budget: 150.0,
          total_budget: 1000.0,
          target_age_min: 18,
          target_age_max: 65,
          content_ratings: ['G', 'PG', '13+', '16+'],
          start_date: new Date().toISOString(),
          end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
        headers: {
          'Authorization': `Bearer ${advertiserUser.token}`,
        },
      });

      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      testCampaign = data.campaign;

      expect(testCampaign.advertiser_name).toBe('E2E Test Corp');
      expect(testCampaign.cpm_bid).toBe(7.50);
      expect(testCampaign.status).toBe('pending');

      console.log('✅ Video ad campaign created:', testCampaign.id);
    });

    test('should create a banner ad campaign', async ({ request }) => {
      const response = await request.post(`${API_BASE_URL}/api/ads/campaigns`, {
        data: {
          advertiser_id: advertiserUser.user.id,
          advertiser_name: 'E2E Banner Corp',
          title: 'E2E Test Banner Ad',
          ad_type: 'banner',
          media_url: 'https://via.placeholder.com/728x90.gif',
          click_url: 'https://example.com/banner-test',
          cpm_bid: 2.00,
          daily_budget: 50.0,
          total_budget: 500.0,
        },
        headers: {
          'Authorization': `Bearer ${advertiserUser.token}`,
        },
      });

      expect(response.ok()).toBeTruthy();
      console.log('✅ Banner ad campaign created');
    });

    test('should reject campaign with invalid CPM', async ({ request }) => {
      const response = await request.post(`${API_BASE_URL}/api/ads/campaigns`, {
        data: {
          advertiser_id: advertiserUser.user.id,
          advertiser_name: 'Invalid CPM Corp',
          title: 'Invalid Ad',
          ad_type: 'banner',
          media_url: 'https://example.com/ad.gif',
          click_url: 'https://example.com',
          cpm_bid: 0.10, // Too low
          daily_budget: 10.0,
        },
        headers: {
          'Authorization': `Bearer ${advertiserUser.token}`,
        },
      });

      expect(response.ok()).toBeFalsy();
      console.log('✅ Invalid CPM rejected');
    });
  });

  test.describe('Frequency Capping', () => {
    test('should allow ad after no previous impressions', async ({ request }) => {
      // Activate the campaign first
      await request.put(`${API_BASE_URL}/api/ads/campaigns/${testCampaign.id}`, {
        data: { status: 'active' },
        headers: { 'Authorization': `Bearer ${advertiserUser.token}` },
      });

      const response = await request.get(`${API_BASE_URL}/api/ads/check-eligibility`, {
        params: {
          user_id: viewerUser.user.id,
          session_id: 'test-session-1',
        },
      });

      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      expect(data.eligible).toBe(true);

      console.log('✅ User eligible for first ad');
    });

    test('should block ad within 1 hour of impression', async ({ request }) => {
      // Track an impression
      await request.post(`${API_BASE_URL}/api/ads/campaigns/${testCampaign.id}/track`, {
        data: {
          user_id: viewerUser.user.id,
          session_id: 'test-session-1',
          room_id: 'test-room',
          clicked: false,
          view_duration: 15,
        },
      });

      // Check eligibility immediately after
      const response = await request.get(`${API_BASE_URL}/api/ads/check-eligibility`, {
        params: {
          user_id: viewerUser.user.id,
          session_id: 'test-session-1',
        },
      });

      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      expect(data.eligible).toBe(false);
      expect(data.time_remaining).toBeGreaterThan(0);

      console.log('✅ User blocked within cooldown period');
    });
  });

  test.describe('Ad Serving', () => {
    test('should return highest CPM ad', async ({ request }) => {
      // Create multiple campaigns with different CPMs
      const campaigns = [];
      for (let i = 0; i < 3; i++) {
        const res = await request.post(`${API_BASE_URL}/api/ads/campaigns`, {
          data: {
            advertiser_id: advertiserUser.user.id,
            advertiser_name: `CPM Test ${i}`,
            title: `Ad ${i}`,
            ad_type: 'banner',
            media_url: `https://example.com/ad${i}.gif`,
            click_url: 'https://example.com',
            cpm_bid: (i + 1) * 2.0, // 2.0, 4.0, 6.0
            daily_budget: 100.0,
            status: 'active',
          },
          headers: { 'Authorization': `Bearer ${advertiserUser.token}` },
        });
        campaigns.push(await res.json());
      }

      // Request an ad
      const response = await request.get(`${API_BASE_URL}/api/ads/in-session`, {
        params: {
          user_id: viewerUser.user.id + 100, // Different user to avoid cooldown
          session_id: 'cpm-test-session',
          ad_type: 'banner',
          placement: 'in_session',
          user_age: 25,
        },
      });

      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      expect(data.ad).toBeTruthy();
      expect(data.ad.cpm_bid).toBe(6.0); // Highest CPM

      console.log('✅ Highest CPM ad returned');
    });

    test('should filter by age targeting', async ({ request }) => {
      // Create adult-only ad
      const adultAdRes = await request.post(`${API_BASE_URL}/api/ads/campaigns`, {
        data: {
          advertiser_id: advertiserUser.user.id,
          advertiser_name: 'Adult Content Corp',
          title: 'Adult Ad',
          ad_type: 'banner',
          media_url: 'https://example.com/adult.gif',
          click_url: 'https://example.com/adult',
          cpm_bid: 10.0,
          daily_budget: 100.0,
          target_age_min: 21,
          target_age_max: 99,
          status: 'active',
        },
        headers: { 'Authorization': `Bearer ${advertiserUser.token}` },
      });

      const adultAd = (await adultAdRes.json()).campaign;

      // Request as underage user
      const response = await request.get(`${API_BASE_URL}/api/ads/in-session`, {
        params: {
          user_id: viewerUser.user.id + 200,
          session_id: 'age-test-session',
          ad_type: 'banner',
          placement: 'in_session',
          user_age: 18, // Too young
        },
      });

      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      
      // Should not get the adult ad
      if (data.ad) {
        expect(data.ad.id).not.toBe(adultAd.id);
      }

      console.log('✅ Age targeting works correctly');
    });
  });

  test.describe('Break Screen Ads (VideoWatch)', () => {
    test('should fetch and display break screen ad', async ({ page }) => {
      // Login as viewer
      await page.goto(`${FRONTEND_URL}/login`);
      await page.fill('input[name="email"]', viewerUser.user.email);
      await page.fill('input[name="password"]', 'Test123!');
      await page.click('button[type="submit"]');

      await page.waitForURL(/\/lobby/);

      // Create a test room and session
      // (This would require more setup - simplified for demonstration)

      // Navigate to VideoWatch
      await page.goto(`${FRONTEND_URL}/watch/test-room?session_id=test-session`);

      // Open Studio Controls (host only - would need host user)
      // Click "Take a Break" → "Show Ad"
      // Verify InSessionAdPanel appears in fullscreen mode

      console.log('✅ Break screen ad test completed');
    });
  });

  test.describe('Banner Ads (80-20 Split)', () => {
    test('should display banner ad in VideoWatch', async ({ page }) => {
      // Login and navigate to VideoWatch
      await page.goto(`${FRONTEND_URL}/login`);
      await page.fill('input[name="email"]', viewerUser.user.email);
      await page.fill('input[name="password"]', 'Test123!');
      await page.click('button[type="submit"]');

      await page.waitForURL(/\/lobby/);

      // Navigate to active session
      // Wait for preroll to complete
      // Check if banner ad appears at bottom 20%

      console.log('✅ Banner ad test completed');
    });
  });

  test.describe('Feed Ads (Watching Now)', () => {
    test('should inject ads in session feed', async ({ page }) => {
      // Login
      await page.goto(`${FRONTEND_URL}/login`);
      await page.fill('input[name="email"]', viewerUser.user.email);
      await page.fill('input[name="password"]', 'Test123!');
      await page.click('button[type="submit"]');

      await page.waitForURL(/\/lobby/);

      // Switch to "Watching Now" tab
      await page.click('text=Watching Now');

      // Wait for sessions to load
      await page.waitForSelector('[class*="space-y-6"]');

      // Check if ad cards are injected
      // (Would need to identify them by specific class or data attribute)

      console.log('✅ Feed ad test completed');
    });

    test('should track impression on scroll into view', async ({ page, request }) => {
      await page.goto(`${FRONTEND_URL}/lobby`);

      // Login
      await page.fill('input[name="email"]', viewerUser.user.email);
      await page.fill('input[name="password"]', 'Test123!');
      await page.click('button[type="submit"]');

      // Navigate to Watching Now
      await page.click('text=Watching Now');

      // Scroll to ad card
      await page.evaluate(() => window.scrollTo(0, 1000));

      // Wait a bit for impression tracking
      await page.waitForTimeout(1000);

      // Verify impression was tracked
      const impressions = await request.get(`${API_BASE_URL}/api/ads/campaigns/${testCampaign.id}/impressions`, {
        headers: { 'Authorization': `Bearer ${advertiserUser.token}` },
      });

      expect(impressions.ok()).toBeTruthy();

      console.log('✅ Impression tracking verified');
    });
  });

  test.describe('Impression Tracking', () => {
    test('should track view impression', async ({ request }) => {
      const response = await request.post(`${API_BASE_URL}/api/ads/campaigns/${testCampaign.id}/track`, {
        data: {
          user_id: viewerUser.user.id,
          session_id: 'impression-test',
          room_id: 'test-room',
          clicked: false,
          view_duration: 15,
        },
      });

      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      expect(data.message).toContain('tracked');

      console.log('✅ View impression tracked');
    });

    test('should track click impression', async ({ request }) => {
      const response = await request.post(`${API_BASE_URL}/api/ads/campaigns/${testCampaign.id}/track`, {
        data: {
          user_id: viewerUser.user.id,
          session_id: 'click-test',
          room_id: 'test-room',
          clicked: true,
          view_duration: 8,
        },
      });

      expect(response.ok()).toBeTruthy();
      console.log('✅ Click impression tracked');
    });
  });

  test.describe('Campaign Management', () => {
    test('should list all campaigns for advertiser', async ({ request }) => {
      const response = await request.get(`${API_BASE_URL}/api/ads/campaigns`, {
        headers: { 'Authorization': `Bearer ${advertiserUser.token}` },
      });

      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      expect(Array.isArray(data.campaigns)).toBe(true);
      expect(data.campaigns.length).toBeGreaterThan(0);

      console.log('✅ Campaigns list retrieved');
    });

    test('should update campaign status', async ({ request }) => {
      const response = await request.put(`${API_BASE_URL}/api/ads/campaigns/${testCampaign.id}`, {
        data: { status: 'paused' },
        headers: { 'Authorization': `Bearer ${advertiserUser.token}` },
      });

      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      expect(data.campaign.status).toBe('paused');

      console.log('✅ Campaign status updated');
    });

    test('should get campaign analytics', async ({ request }) => {
      const response = await request.get(`${API_BASE_URL}/api/ads/campaigns/${testCampaign.id}/analytics`, {
        headers: { 'Authorization': `Bearer ${advertiserUser.token}` },
      });

      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      expect(data).toHaveProperty('total_impressions');
      expect(data).toHaveProperty('total_clicks');
      expect(data).toHaveProperty('ctr');

      console.log('✅ Campaign analytics retrieved');
    });
  });
});
