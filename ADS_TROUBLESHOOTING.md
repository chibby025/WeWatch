# WeWatch Ads Troubleshooting Guide

## ✅ Fixes Applied

### 1. Reduced Verbose Logs
- ❌ Removed: `🎬 [PostViewModal] Not rendering` (was appearing 30+ times)
- ❌ Removed: `✅ [RoomPageNew] Successfully prevented zombie reconnection`

### 2. Fixed Ad Images
- **Problem:** `via.placeholder.com` was down/blocked (`ERR_CONNECTION_CLOSED`)
- **Solution:** Replaced with Unsplash images (free, reliable CDN)
- **Re-run SQL:** Test ads now use working image URLs

### 3. WebSocket Error Explained
```
❌ [LobbyPage WS] Connection error: error
❌ [LobbyPage WS] Disconnected (code: 1006)
```
**Meaning:** Code 1006 = Abnormal closure (connection lost without proper close handshake)
**Cause:** Backend restart, network hiccup, or tab switching
**Impact:** Low - WebSocket auto-reconnects ✅

---

## 🔍 Why Ads Aren't Visible

### Check These 3 Things:

**1. Are Ads Enabled?**
```
Open: LobbyLeftSidebar → "Ads Management" → Master Switch Tab
Toggle: 🌐 Global Ads Master Switch → ON (green)
```

**2. Are Test Ads Active?**
```sql
-- Run in database to verify
SELECT id, campaign_name, status, ad_type, cpm 
FROM ad_campaigns 
WHERE id >= 1000 AND status = 'active';

-- Should show 6 campaigns (IDs 1000-1005)
```

**3. Where Should Ads Appear?**
- **DiscoverFeed** - Every 6th post (if `feed_ads` enabled)
- **LobbyPage Sidebar** - Right panel (uses `<AdBanner />`)
- **Active Campaigns Tab** - In Ads Management modal

---

## 🧪 Quick Test Steps

### Step 1: Enable Ads
1. Open app → Click avatar (top-left) → "Ads Management"
2. Go to "Master Switch" tab
3. Toggle **Global Ads** to ON (green)
4. Toggle **Feed Ads** to ON
5. Close modal

### Step 2: Verify Test Ads Loaded
1. In Ads Management → "Active Campaigns" tab
2. Should see 6 campaigns:
   - Gaming Headset ($3.50 CPM)
   - Energy Drink ($7.50 CPM)
   - Streaming Service ($2.75 CPM)
   - Concert Event ($15.00 CPM)
   - Mobile Game ($4.25 CPM)
   - Smart Watch ($9.00 CPM)

### Step 3: View Ads in App
1. Go to **Watching Now** tab → **Discover** subtab
2. Scroll down - ads should appear every 6 posts
3. Look for "Sponsored" badge on ads

---

## 🐛 If Ads Still Don't Show

### Backend Check:
```bash
# Verify ads in database
psql -h localhost -p 5432 -U postgres -d wewatch_db \
  -c "SELECT count(*) FROM ad_campaigns WHERE status='active';"

# Should return: count = 6
```

### Frontend Check:
```javascript
// Open browser console, run:
fetch('/api/ads/settings', {
  headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
})
.then(r => r.json())
.then(d => console.log('Ad Settings:', d));

// Should show:
// { global_enabled: true, feed_ads: true, session_ads: true, ... }
```

### API Check:
```bash
# Test ad endpoint
curl http://localhost:8080/api/ads/active?ad_type=banner

# Should return campaigns array
```

---

## 📝 Next Steps

1. **Enable ads** via Ads Management modal
2. **Refresh page** to see ads in Discover feed
3. **Check Active Campaigns tab** to confirm 6 test ads loaded
4. **Test clicking ads** - should track impressions/clicks

**To delete test ads later:**
```sql
DELETE FROM ad_campaigns WHERE id >= 1000;
```
