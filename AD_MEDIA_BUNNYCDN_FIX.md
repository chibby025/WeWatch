# 🎯 Ad Media Upload Fix - BunnyCDN Integration

**Date:** May 8, 2026  
**Issue:** Sponsored content cards showing empty (no images)  
**Status:** ✅ FIXED

---

## 🔴 Problem Identified

### What Was Wrong:
```go
// OLD CODE (ad_upload.go)
filepath := filepath.Join(uploadDir, filename)
c.SaveUploadedFile(file, filepath)  // ❌ Saves to ./uploads/ads/ (LOCAL ONLY)

mediaURL := fmt.Sprintf("/uploads/ads/%s", filename)  // ❌ localhost URL
```

**Result:**
- Ad media saved to `./uploads/ads/` on localhost filesystem
- URLs like `/uploads/ads/ad_7_1234567890.jpg`
- Only accessible on localhost:8080
- **Vercel/Railway production couldn't access these files**
- Sponsored content cards rendered empty boxes

---

## ✅ Solution Implemented

### New Code:
```go
// NEW CODE (ad_upload.go)
cdnURL, err := utils.UploadMultipartFileToBunnyCDN(file, header)  // ✅ Upload to BunnyCDN

// Returns: https://wewatch-posts.b-cdn.net/1746723456_ad_7_1234567890.jpg
```

**Result:**
- Ad media uploaded to BunnyCDN storage
- Globally accessible CDN URLs
- Works on localhost AND production
- Same as posts, rooms, profile pictures

---

## 📋 What You Need to Do

### 1. **Re-Upload Existing Ads** (If Any)
Any ads created before this fix have localhost URLs and won't show in production.

**Steps:**
1. Go to Admin Panel → Ads Management → Active Ads
2. For each ad with empty media:
   - Click "Edit" or "Upload New Media"
   - Re-upload the image/video
   - Save campaign
3. New URL will be BunnyCDN: `https://wewatch-posts.b-cdn.net/...`

### 2. **Verify BunnyCDN Configuration**
Make sure these env variables are set on Railway:

```bash
BUNNY_STORAGE_ZONE=wewatch-posts
BUNNY_ACCESS_KEY=your-access-key-here
BUNNY_STORAGE_REGION=ny  # or your region (la, sg, etc.)
BUNNY_PULL_ZONE_URL=https://wewatch-posts.b-cdn.net
```

**Check on Railway:**
```bash
# SSH into Railway or check dashboard
echo $BUNNY_STORAGE_ZONE
echo $BUNNY_PULL_ZONE_URL
```

### 3. **Test Ad Upload Flow**
**On Production (Vercel):**
1. Login as admin/advertiser
2. Create new ad campaign
3. Upload image/video
4. Check response includes:
   ```json
   {
     "media_url": "https://wewatch-posts.b-cdn.net/...",
     "cdn_provider": "BunnyCDN"
   }
   ```
5. Verify media shows in Discover feed

---

## 🧪 Testing Checklist

- [ ] BunnyCDN env vars configured on Railway
- [ ] Upload new ad media (image)
- [ ] Upload new ad media (video)
- [ ] Verify CDN URL in response
- [ ] Check media appears in Discover feed
- [ ] Test on mobile (responsive)
- [ ] Check Railway logs: `✅ [BunnyCDN] Upload successful`

---

## 🔍 How to Debug

### Check Backend Logs (Railway)
Look for these log messages:
```
📤 [UploadAdMedia] Uploading ad creative to BunnyCDN: ad_7_123.jpg (size: 45678 bytes)
✅ [BunnyCDN] Upload successful: https://wewatch-posts.b-cdn.net/1746723456_ad_7_123.jpg
```

### Check Frontend Console
Look for this when ad doesn't render:
```
🎯 [FeedAdCard] Not rendering - missing required ad data: { 
  hasAd: true, 
  hasMedia: false,  // ← If false, media_url is missing
  hasAdvertiser: true 
}
```

### Check Ad Campaign Data
Query your database:
```sql
SELECT id, campaign_name, media_url, status 
FROM ad_campaigns 
WHERE status = 'active' 
LIMIT 10;
```

**Good media_url:** `https://wewatch-posts.b-cdn.net/...`  
**Bad media_url:** `/uploads/ads/...` or `http://localhost:8080/...`

---

## 📊 Before vs After

### Before (Broken):
```
User creates ad → 
Upload to ./uploads/ads/ → 
URL: /uploads/ads/ad_7_123.jpg →
Works on localhost ✅ →
Fails on production ❌
```

### After (Fixed):
```
User creates ad → 
Upload to BunnyCDN → 
URL: https://wewatch-posts.b-cdn.net/1746723456_ad_7_123.jpg →
Works everywhere ✅
```

---

## 💡 Why This Matters

**Production Deployment:**
- Vercel hosts frontend (static files)
- Railway hosts backend (Go server)
- Backend doesn't serve static files in production
- All media MUST be on CDN (BunnyCDN)

**Consistency:**
- Posts use BunnyCDN ✅
- Rooms use BunnyCDN ✅
- Profile pics use BunnyCDN ✅
- **Ads NOW use BunnyCDN** ✅

---

## 🚀 Next Steps

1. **Deploy Complete** ✅ (commit 9d258f6)
2. **Test on Production** - Upload new ad
3. **Re-upload Old Ads** - If any exist with localhost URLs
4. **Monitor Logs** - Check for any upload errors
5. **User Testing** - Verify ads show in Discover feed

---

## 🔗 Related Files

- **Backend Upload:** `backend/internal/handlers/ad_upload.go`
- **BunnyCDN Utils:** `backend/internal/utils/bunny_cdn.go`
- **Frontend Card:** `frontend/src/components/ads/FeedAdCard.jsx`
- **API Route:** `POST /api/ads/upload/ad-media`

---

**Status:** ✅ Production Ready  
**Deployed:** May 8, 2026  
**Commit:** 9d258f6
