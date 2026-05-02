# 🧪 WeWatch Ads Platform - Testing Guide

This guide provides step-by-step instructions for testing all ad platform features.

---

## 🏗️ Setup

### 1. Backend Status
```bash
# Check backend is running
curl http://localhost:8080/api/health

# Expected response:
# {"database":"connected","message":"WeWatch Backend is running!","status":"ok"}
```

### 2. Database Verification
```bash
# Connect to database
sudo -u postgres psql wewatch_db

# Check tables exist
\dt ad_*

# Expected output:
# ad_campaigns
# ad_impressions
# ad_inquiries
# ad_payments

# Exit
\q
```

### 3. Frontend Status
```bash
# Navigate to frontend
cd frontend

# Start dev server (if not running)
npm run dev

# Expected: Running on http://localhost:5173
```

---

## 📋 Test Plan

### Test Suite 1: Ad Inquiry System (Phase 1)

#### Test 1.1: Submit Ad Inquiry (Public User)
**Steps**:
1. Open browser to `http://localhost:5173`
2. Navigate to Ad Inquiry Form (or create test route)
3. Fill out form:
   - Company Name: "Test Company Inc"
   - Contact Name: "John Doe"
   - Email: "john@testcompany.com"
   - Phone: "+1234567890"
   - Budget: "1k_5k"
   - Campaign Goals: "Brand awareness and user acquisition"
   - Target Audience: "18-34 year olds interested in movies"
   - Message: "We want to reach 50K impressions"
4. Click "Submit Inquiry"

**Expected**:
- ✅ Success toast: "Inquiry submitted successfully"
- ✅ Form resets
- ✅ Backend logs show POST /api/ads/inquiries

**Verify in Database**:
```sql
SELECT id, company_name, email, status, created_at 
FROM ad_inquiries 
ORDER BY created_at DESC 
LIMIT 1;
```

---

#### Test 1.2: View Inquiries (Super Admin)
**Steps**:
1. Login as super admin user
2. Click hamburger menu (left sidebar)
3. Click "Ads Management" (should see "ADS" badge)
4. Modal opens to "Ad Inquiries" tab
5. See inquiry from Test 1.1 with "Pending" badge

**Expected**:
- ✅ Inquiry card displays with all details
- ✅ Status shows "Pending" (yellow badge)
- ✅ Action buttons visible: Approve, Reject, Mark Contacted, Send Email

---

#### Test 1.3: Approve Inquiry
**Steps**:
1. From AdsManagementModal → Inquiries tab
2. Find inquiry from Test 1.1
3. Click "✓ Approve" button
4. Confirm action

**Expected**:
- ✅ Success toast: "Inquiry approved"
- ✅ Status badge changes to "Approved" (green)
- ✅ Admin notes added with timestamp

**Verify in Database**:
```sql
SELECT id, status, admin_notes, reviewed_by 
FROM ad_inquiries 
WHERE company_name = 'Test Company Inc';
```

---

#### Test 1.4: Send Email to Advertiser
**Steps**:
1. From inquiry card, click "📨 Send Email"
2. System opens mailto link

**Expected**:
- ✅ Email client opens
- ✅ To: john@testcompany.com
- ✅ Subject: "WeWatch Advertising Inquiry - Test Company Inc"

---

### Test Suite 2: Self-Service Campaign Creation (Phase 2)

#### Test 2.1: Create Banner Campaign
**Steps**:
1. Login as regular user (not super admin)
2. Navigate to Campaign Creator
3. **Step 1: Basic Info**
   - Campaign Name: "Summer Sale 2026"
   - Ad Type: "banner"
   - Start Date: Today
   - End Date: 30 days from now
   - Click "Next"
4. **Step 2: Creative Upload**
   - Upload test image (1080x1440, under 5MB)
   - Preview appears
   - Click URL: "https://example.com/sale"
   - Click "Next"
5. **Step 3: Targeting**
   - Age Min: 18
   - Age Max: 45
   - Content Rating: "general"
   - Click "Next"
6. **Step 4: Budget & Review**
   - Budget: $100
   - See estimated: 50,000 impressions
   - Review all details
   - Click "Create Campaign"

**Expected**:
- ✅ Success toast: "Campaign created and submitted for review"
- ✅ File uploads successfully
- ✅ Campaign saved with status "pending_review"
- ✅ User redirected or modal closes

**Verify in Database**:
```sql
SELECT id, campaign_name, ad_type, budget, status, media_url 
FROM ad_campaigns 
WHERE campaign_name = 'Summer Sale 2026';
```

---

#### Test 2.2: File Upload Validation
**Test Invalid File Type**:
- Try uploading .txt or .exe file
- **Expected**: ❌ Error: "Invalid file type"

**Test Oversized File**:
- Try uploading 10MB image
- **Expected**: ❌ Error: "File too large (max 5MB for images)"

**Test Valid Files**:
- Upload .jpg: ✅ Success
- Upload .png: ✅ Success
- Upload .gif: ✅ Success
- Upload .mp4 (video): ✅ Success
- Upload .webm (video): ✅ Success

---

#### Test 2.3: Create Video Pre-roll Campaign
**Steps**:
1. Start new campaign
2. **Step 1**: Ad Type = "video_preroll"
3. **Step 2**: Upload test video (MP4, 30 seconds, under 50MB)
4. Complete targeting and budget ($150)
5. Submit

**Expected**:
- ✅ Video preview plays in Step 2
- ✅ Campaign created with ad_type = "video_preroll"
- ✅ Status = "pending_review"

---

#### Test 2.4: View User's Campaigns
**Steps**:
1. As the user who created campaigns, navigate to "My Campaigns"
2. See list of campaigns

**Expected**:
- ✅ "Summer Sale 2026" appears with "Pending Review" badge
- ✅ "Video Campaign" appears with details
- ✅ Can click to view analytics (once approved)

**API Test**:
```bash
# Get auth token from localStorage
TOKEN="your_jwt_token"

curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/ads/campaigns
```

---

#### Test 2.5: Approve Campaign (Super Admin)
**Steps**:
1. Login as super admin
2. Open Ads Management → "Active Campaigns" tab
3. See "Summer Sale 2026" with "Pending Review" badge
4. Click "✓ Approve"

**Expected**:
- ✅ Success toast: "Campaign active"
- ✅ Status badge changes to "Active" (green)
- ✅ Ad is now eligible for display

**Verify**:
```bash
curl "http://localhost:8080/api/ads/active?ad_type=banner&user_age=25"
# Should now return the campaign
```

---

### Test Suite 3: Ad Display & Tracking

#### Test 3.1: Banner Ad in Discover Feed
**Steps**:
1. Login as regular user (age 18-45)
2. Navigate to "Watching" → "Discover" tab
3. Scroll through posts

**Expected**:
- ✅ Every 6th post, see ad banner
- ✅ Banner shows campaign image
- ✅ "Sponsored" label appears
- ✅ Hover shows campaign name overlay

**Verify Impression Tracked**:
```sql
SELECT COUNT(*) FROM ad_impressions 
WHERE campaign_id = (SELECT id FROM ad_campaigns WHERE campaign_name = 'Summer Sale 2026')
AND impression_type = 'view';
```

---

#### Test 3.2: Banner Ad Click Tracking
**Steps**:
1. From Discover feed with ad visible
2. Click on banner ad
3. New tab opens to click URL

**Expected**:
- ✅ New tab opens to https://example.com/sale
- ✅ Click is tracked in database

**Verify Click Tracked**:
```sql
SELECT COUNT(*) FROM ad_impressions 
WHERE campaign_id = (SELECT id FROM ad_campaigns WHERE campaign_name = 'Summer Sale 2026')
AND impression_type = 'click';
```

**Check Campaign Metrics Updated**:
```sql
SELECT campaign_name, impressions_count, clicks_count,
       CASE WHEN impressions_count > 0 
            THEN ROUND((clicks_count::numeric / impressions_count) * 100, 2)
            ELSE 0 END as ctr
FROM ad_campaigns 
WHERE campaign_name = 'Summer Sale 2026';
```

---

#### Test 3.3: Video Pre-roll Ad Display
**Steps**:
1. Create and approve a video pre-roll campaign
2. Login as regular user
3. Join any watch session or create instant watch
4. Page loads → Video pre-roll starts immediately

**Expected**:
- ✅ Ad video plays full-screen
- ✅ "AD" badge in top-left corner
- ✅ Countdown: "Skip in 5s..." → "Skip in 4s..." etc.
- ✅ After 5 seconds, "Skip Ad" button appears
- ✅ Click "Skip Ad" → Ad closes, main content starts

**Verify View Duration Tracked**:
```sql
SELECT view_duration FROM ad_impressions 
WHERE campaign_id = (SELECT id FROM ad_campaigns WHERE ad_type = 'video_preroll')
ORDER BY created_at DESC LIMIT 1;
```

---

#### Test 3.4: Video Ad Click
**Steps**:
1. During video pre-roll playback
2. Click anywhere on video (click-to-visit overlay)
3. New tab opens

**Expected**:
- ✅ New tab opens to campaign click URL
- ✅ Click tracked
- ✅ Ad continues playing (doesn't close)
- ✅ User can still skip after 5 seconds

---

#### Test 3.5: Age-Based Targeting
**Setup**: Create 2 campaigns:
- Campaign A: Age 18-25
- Campaign B: Age 30-50

**Test**:
1. Login as 22-year-old user → Should see Campaign A
2. Login as 35-year-old user → Should see Campaign B
3. Login as 15-year-old user → Should see no ads (under 18)

**Verify**:
```bash
# Test age filtering
curl "http://localhost:8080/api/ads/active?ad_type=banner&user_age=22"
# Should return Campaign A only

curl "http://localhost:8080/api/ads/active?ad_type=banner&user_age=35"
# Should return Campaign B only
```

---

### Test Suite 4: Campaign Management

#### Test 4.1: Pause Active Campaign
**Steps**:
1. As super admin, open Ads Management → Active Campaigns
2. Find active campaign
3. Click "⏸ Pause"

**Expected**:
- ✅ Success toast: "Campaign paused"
- ✅ Status badge changes to "Paused" (gray)
- ✅ Ad no longer appears in Discover feed

**Verify**:
```bash
curl "http://localhost:8080/api/ads/active?ad_type=banner&user_age=25"
# Should NOT return paused campaign
```

---

#### Test 4.2: Resume Paused Campaign
**Steps**:
1. From paused campaign card, click "▶ Resume"

**Expected**:
- ✅ Success toast: "Campaign active"
- ✅ Status = "active"
- ✅ Ad resumes showing in feed

---

#### Test 4.3: Reject Pending Campaign
**Steps**:
1. Create new campaign, leave as "pending_review"
2. As super admin, click "✗ Reject"

**Expected**:
- ✅ Success toast: "Campaign rejected"
- ✅ Status = "rejected"
- ✅ User sees rejection in their campaigns list

---

#### Test 4.4: Budget Auto-Pause
**Setup**: Create campaign with $50 budget (25,000 impressions)

**Test**:
1. Simulate 25,000+ impressions via API or multiple page views
2. Check campaign status

**Expected**:
- ✅ Campaign auto-pauses when spent_amount >= budget
- ✅ Status changes to "completed"

**Simulate Impressions** (Super Admin Only):
```bash
# Track 1000 impressions
for i in {1..1000}; do
  curl -X POST http://localhost:8080/api/ads/campaigns/1/track \
    -H "Content-Type: application/json" \
    -d '{"impression_type":"view","view_duration":0}'
done

# Check if completed
curl "http://localhost:8080/api/admin/ad-campaigns?status=completed"
```

---

### Test Suite 5: Analytics Verification

#### Test 5.1: Campaign Metrics in Admin Panel
**Steps**:
1. As super admin, open Active Campaigns tab
2. View campaign card

**Expected**:
- ✅ Impressions count displayed
- ✅ Clicks count displayed
- ✅ CTR calculated: (clicks / impressions) × 100
- ✅ Spent amount: (impressions / 1000) × CPM
- ✅ CPM value shown ($2.00 default)

---

#### Test 5.2: Impression Tracking Accuracy
**Steps**:
1. Open Discover feed
2. Scroll to see 3 different ad placements
3. Check database

**Expected**:
```sql
SELECT campaign_id, COUNT(*) as impressions
FROM ad_impressions
WHERE impression_type = 'view'
GROUP BY campaign_id;
-- Should show 3 impressions for the active campaign
```

---

#### Test 5.3: Click-Through Rate (CTR)
**Setup**: Campaign with 100 impressions, 5 clicks

**Verify**:
```sql
SELECT 
  campaign_name,
  impressions_count,
  clicks_count,
  ROUND((clicks_count::numeric / impressions_count * 100), 2) as ctr_percentage
FROM ad_campaigns
WHERE campaign_name = 'Summer Sale 2026';

-- Expected: CTR = 5.00%
```

---

### Test Suite 6: Edge Cases & Error Handling

#### Test 6.1: Campaign with Missing Fields
**Steps**:
1. Try creating campaign without campaign name
2. Try without budget
3. Try with budget < $50

**Expected**:
- ❌ Validation errors appear
- ❌ Cannot proceed to next step
- ❌ Error messages clear and helpful

---

#### Test 6.2: Upload Without Authentication
**Steps**:
```bash
curl -X POST http://localhost:8080/api/ads/upload/ad-media \
  -F "file=@test_image.jpg"
```

**Expected**:
- ❌ Status: 401 Unauthorized
- ❌ Error: "Authorization required"

---

#### Test 6.3: Non-Super Admin Tries Admin Endpoints
**Steps**:
```bash
# Login as regular user, get token
TOKEN="regular_user_jwt"

curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:8080/api/admin/ad-campaigns
```

**Expected**:
- ❌ Status: 403 Forbidden
- ❌ Error: "Super admin access required"

---

#### Test 6.4: Ad Display with No Active Campaigns
**Steps**:
1. Pause all campaigns
2. Visit Discover feed

**Expected**:
- ✅ No ads shown (graceful handling)
- ✅ No errors in console
- ✅ Posts display normally without ad slots

---

#### Test 6.5: Multiple Ads Rotation
**Setup**: Create 3 active banner campaigns

**Test**:
1. Refresh Discover feed multiple times
2. Check which ad appears

**Expected**:
- ✅ Random ad selected each time (RANDOM() in SQL)
- ✅ All 3 campaigns get impressions over time
- ✅ Fair distribution

---

## 📊 Performance Testing

### Load Test: 1000 Concurrent Users
```bash
# Install k6 (load testing tool)
brew install k6  # macOS
# or
sudo apt install k6  # Linux

# Create test script
cat > ad_load_test.js << 'EOF'
import http from 'k6/http';

export let options = {
  vus: 1000,
  duration: '30s',
};

export default function () {
  http.get('http://localhost:8080/api/ads/active?ad_type=banner&user_age=25');
}
EOF

# Run test
k6 run ad_load_test.js
```

**Expected**:
- ✅ Response time < 200ms
- ✅ 0 errors
- ✅ Database handles concurrent queries

---

## ✅ Final Verification Checklist

### Backend
- [ ] All 11 ad routes respond correctly
- [ ] Database tables have correct indexes
- [ ] File uploads save to ./uploads/ads/
- [ ] Admin audit logs created for actions

### Frontend
- [ ] AdInquiryForm submits successfully
- [ ] AdsManagementModal loads both tabs
- [ ] AdCampaignCreator completes 4 steps
- [ ] AdBanner displays in Discover feed
- [ ] AdVideoPreroll plays before video content

### Functionality
- [ ] Inquiries can be approved/rejected
- [ ] Campaigns require approval before going live
- [ ] Age targeting filters ads correctly
- [ ] Impressions and clicks tracked accurately
- [ ] Budget auto-pauses campaigns
- [ ] Analytics calculate CTR correctly

### Security
- [ ] Public routes accessible without auth
- [ ] Protected routes require JWT token
- [ ] Admin routes require super admin role
- [ ] File uploads validate type and size
- [ ] SQL injection protection (parameterized queries)

---

## 🐛 Common Issues & Solutions

### Issue 1: "Failed to fetch ads"
**Solution**: Check backend is running and CORS enabled

### Issue 2: File upload fails
**Solution**: Ensure ./uploads/ads/ directory exists and has write permissions
```bash
mkdir -p backend/uploads/ads
chmod 755 backend/uploads/ads
```

### Issue 3: Ads not appearing
**Solution**:
- Verify campaign status is "active"
- Check age targeting matches user
- Ensure budget not exceeded

### Issue 4: Analytics not updating
**Solution**: Check ad_impressions table for entries
```sql
SELECT * FROM ad_impressions ORDER BY created_at DESC LIMIT 10;
```

---

## 📝 Test Report Template

```markdown
# Ad Platform Test Report

**Date**: YYYY-MM-DD  
**Tester**: Your Name  
**Environment**: Development/Staging/Production

## Summary
- Total Tests: X
- Passed: Y
- Failed: Z
- Pass Rate: Y/X %

## Test Results

| Test ID | Test Case | Status | Notes |
|---------|-----------|--------|-------|
| 1.1 | Submit Ad Inquiry | ✅ Pass | - |
| 1.2 | View Inquiries | ✅ Pass | - |
| ... | ... | ... | ... |

## Issues Found
1. [Issue description]
2. [Issue description]

## Recommendations
1. [Recommendation]
2. [Recommendation]
```

---

**Testing Complete!** 🎉 Your WeWatch Ads Platform is ready for production! 🚀
