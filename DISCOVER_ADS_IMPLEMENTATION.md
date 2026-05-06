# WeWatch Ads System - Discover Tab Integration

## Changes Implemented (May 4, 2026)

### Backend Changes

**1. Ad Settings Model** (`ad_settings.go`)
- Added `AdSettingDiscoverAds` constant for granular control

**2. Ad Settings Handler** (`ad_settings_handlers.go`)
- Added `discover_ads` to GET response (defaults to `true`)
- Updated validation to accept `discover_ads` in PUT requests

### Frontend Changes

**1. AdsManagementModal** (`AdsManagementModal.jsx`)
- Added `discover_ads` toggle in Master Switch tab
- Description: "Show sponsored posts in Discover subtab of Watching Now (every 6th post)"
- Added to status summary display

**2. Toggle Behavior**
- Disabled when global ads are off
- Independent control from other ad types
- Shows as "🔍 Discover Ads" with appropriate icon

### Dummy Ads Created

Successfully created 6 test campaigns in database (IDs 1000-1005):

1. **Banner Ad** - Gaming Headset (CPM $3.50)
2. **Video Pre-Roll** - Energy Drink (CPM $7.50, 15s)
3. **Banner Ad** - Streaming Service (CPM $2.75)
4. **Sponsored Room** - Concert Event (CPM $15.00)
5. **Banner Ad** - Mobile Game (CPM $4.25)
6. **Video Ad** - Smart Watch (CPM $9.00, 10s)

**To delete test ads later:**
```sql
DELETE FROM ad_campaigns WHERE id >= 1000;
```

### Next Steps

1. **Test the toggles** - Open Ads Management modal and verify all 5 toggles work:
   - Global Master Switch
   - Feed Ads
   - Session Ads
   - RoomTV Ads
   - **Discover Ads** (NEW)

2. **View test ads** - Check Active Campaigns tab to see the 6 dummy ads

3. **Implement Discover Feed Integration** - Add logic to DiscoverFeed.jsx:
   ```jsx
   // Fetch ad settings
   const adSettings = await fetchAdSettings();
   
   // If discover_ads enabled, inject ads every 6 posts
   if (adSettings.discover_ads && adSettings.global_enabled) {
     // Inject sponsored post cards
   }
   ```

4. **Create SponsoredPostCard component** - Styled like regular posts with:
   - "Sponsored" badge
   - Click tracking
   - Impression tracking on scroll into view

### Testing Checklist

- [ ] Backend returns `discover_ads` in `/api/ads/settings`
- [ ] Frontend displays Discover Ads toggle
- [ ] Toggle can be enabled/disabled independently
- [ ] Toggle grayed out when global ads disabled
- [ ] Status summary shows correct state
- [ ] 6 dummy ads appear in Active Campaigns tab
- [ ] Can delete dummy ads with SQL command

## Current Ad System Architecture

**Master Controls (5 toggles):**
1. 🌐 **Global Enabled** - Master kill switch
2. 📰 **Feed Ads** - User timelines/feeds
3. 🎬 **Session Ads** - Video pre-roll/mid-roll
4. 📺 **RoomTV Ads** - Room banners (1hr frequency cap)
5. 🔍 **Discover Ads** - Discover subtab posts (NEW)

**Ad Types:**
- Banner (sidebar, inline)
- Video Pre-Roll (5-15s, skippable after 5s)
- Sponsored Room (featured placement)
- Sponsored Post (native feed ads - TO BE IMPLEMENTED)

**Features:**
- CPM-based bidding
- Age targeting (min/max)
- Content rating filters
- Budget management (auto-pause when exceeded)
- Impression & click tracking
- 1-hour frequency capping
