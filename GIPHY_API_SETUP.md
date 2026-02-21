# Giphy & Tenor API Setup Guide

This guide explains how to set up API keys for sticker functionality in WeWatch Lobby Chat.

## 📋 Overview

The lobby chat sticker feature supports two providers:
- **Giphy**: Popular GIF/sticker platform with extensive library
- **Tenor**: Google-owned GIF/sticker platform (alternative)

Both are **free** for development and low-volume production use.

## 🎯 Quick Start

### Option 1: Giphy (Recommended)

1. **Create Giphy Account**
   - Go to https://developers.giphy.com/
   - Click "Create an Account" (or login with existing account)
   - Verify your email address

2. **Create an App**
   - Go to https://developers.giphy.com/dashboard/
   - Click "Create an App"
   - Select "API" (not SDK)
   - Fill in:
     - **App Name**: "WeWatch" (or your app name)
     - **App Description**: "Watch party platform with lobby chat"
     - **Website**: Your domain (or localhost for development)
   - Accept the terms and click "Create App"

3. **Get Your API Key**
   - You'll see your API key immediately after creation
   - Copy the API key (format: `abc123def456ghi789...`)

4. **Add to Environment Variables**
   ```bash
   # In frontend/.env
   VITE_GIPHY_API_KEY=your_giphy_api_key_here
   ```

5. **Restart Frontend**
   ```bash
   cd frontend
   npm run dev
   ```

**Giphy Free Tier Limits:**
- ✅ 42 requests per hour (1,000 requests per day)
- ✅ No credit card required
- ✅ No attribution required in most cases
- ✅ Access to full sticker/GIF library

### Option 2: Tenor (Alternative)

1. **Create Google Cloud Project**
   - Go to https://console.cloud.google.com/
   - Create a new project or select existing
   - Enable billing (required but won't charge unless you exceed free tier)

2. **Enable Tenor API**
   - Go to https://console.cloud.google.com/apis/library
   - Search for "Tenor API"
   - Click "Enable"

3. **Create API Credentials**
   - Go to https://console.cloud.google.com/apis/credentials
   - Click "Create Credentials" → "API Key"
   - Copy your API key
   - (Optional) Restrict key to "Tenor API" for security

4. **Add to Environment Variables**
   ```bash
   # In frontend/.env
   VITE_TENOR_API_KEY=your_tenor_api_key_here
   ```

**Tenor Free Tier Limits:**
- ✅ 1,000,000 requests per month
- ✅ 100 requests per second
- ⚠️ Credit card required for Google Cloud
- ✅ Attribution required (auto-displayed in UI)

## 🔧 Configuration

### Frontend Environment Variables

Create or update `frontend/.env`:

```bash
# Giphy API (Primary - Recommended)
VITE_GIPHY_API_KEY=abc123def456ghi789

# Tenor API (Optional - Backup)
VITE_TENOR_API_KEY=xyz789uvw456rst123
```

### Component Usage

The `LobbyStickerPicker` component automatically uses these API keys:

```javascript
// In LobbyStickerPicker.jsx
const GIPHY_API_KEY = import.meta.env.VITE_GIPHY_API_KEY || 'YOUR_GIPHY_API_KEY';
const TENOR_API_KEY = import.meta.env.VITE_TENOR_API_KEY || 'YOUR_TENOR_API_KEY';
```

## 📊 API Rate Limits

### Giphy
- **Free Tier**: 42 requests/hour per API key
- **Strategy**: Cache trending stickers, implement search debouncing
- **Upgrade**: Contact Giphy for higher limits (paid plans available)

### Tenor
- **Free Tier**: 1M requests/month
- **Strategy**: No special handling needed for most apps
- **Upgrade**: Pay-as-you-go pricing on Google Cloud

## 🎨 Testing

1. **Test Sticker Picker**
   ```bash
   # Start frontend
   cd frontend
   npm run dev
   
   # Navigate to Lobby → Chats
   # Select a friend
   # Click sticker icon (smiley face)
   # Search for "happy" or "cats"
   ```

2. **Verify API Calls**
   - Open browser DevTools (F12)
   - Go to Network tab
   - Filter by "giphy.com" or "tenor.com"
   - Should see successful 200 responses

3. **Check Console for Errors**
   - Look for "Failed to fetch stickers"
   - Check API key is correctly set in .env
   - Verify .env file is in `frontend/` directory

## 🚨 Troubleshooting

### "Failed to fetch stickers" Error

**Possible Causes:**
1. API key not set in `.env`
2. API key invalid/expired
3. Rate limit exceeded
4. CORS issue (unlikely with Giphy/Tenor)

**Solutions:**
```bash
# 1. Check .env file exists and has correct key
cat frontend/.env | grep GIPHY

# 2. Restart frontend server after .env changes
# Press Ctrl+C in terminal, then:
npm run dev

# 3. Test API key directly in browser
# Open: https://api.giphy.com/v1/stickers/trending?api_key=YOUR_KEY&limit=5
# Should return JSON with sticker data
```

### Rate Limit Exceeded

**Symptoms:** Stickers stop loading after many searches

**Solutions:**
1. **Switch to Tenor** (higher limits)
2. **Implement caching**:
   ```javascript
   // Store trending stickers in localStorage
   const cachedStickers = localStorage.getItem('giphy_trending');
   if (cachedStickers && Date.now() - lastFetch < 3600000) {
     // Use cached data (1 hour)
   }
   ```
3. **Add search debouncing** (already implemented)

### Stickers Not Sending

**Check Backend Logs:**
```bash
cd backend
# Look for validation errors
grep "sticker" logs/app.log
```

**Verify Allowed Domains:**
In `backend/internal/handlers/lobby_chat_stickers.go`:
```go
allowedDomains := []string{
  "giphy.com",
  "media.giphy.com", 
  "tenor.com",
  "media.tenor.com",
}
```

## 🔒 Security Best Practices

### Do NOT:
- ❌ Commit `.env` files to Git
- ❌ Expose API keys in client-side code
- ❌ Share API keys publicly

### Do:
- ✅ Use environment variables
- ✅ Add `.env` to `.gitignore`
- ✅ Restrict API keys to specific domains (Giphy dashboard)
- ✅ Rotate keys if compromised

### Production Deployment

1. **Set environment variables on hosting platform**:
   ```bash
   # Vercel
   vercel env add VITE_GIPHY_API_KEY
   
   # Netlify
   netlify env:set VITE_GIPHY_API_KEY abc123...
   
   # Railway/Render
   # Add in dashboard Environment Variables section
   ```

2. **Monitor usage** in Giphy dashboard
3. **Set up alerts** for rate limit warnings

## 📈 Scaling

### For High Traffic (>1000 users)

**Option 1: Backend Proxy** (Recommended)
- Move API calls to backend
- Implement server-side caching
- Single API key shared across all users
- Better rate limit management

**Option 2: Multiple API Keys**
- Create multiple Giphy apps
- Rotate keys based on user groups
- More complex but no backend changes needed

**Option 3: Paid Tier**
- Giphy: Contact sales for enterprise pricing
- Tenor: Increase Google Cloud quotas

## 📚 Additional Resources

- **Giphy API Docs**: https://developers.giphy.com/docs/api/
- **Tenor API Docs**: https://developers.google.com/tenor
- **WeWatch Backend Validation**: `backend/internal/handlers/lobby_chat_stickers.go`
- **Frontend Component**: `frontend/src/components/lobby/LobbyStickerPicker.jsx`

## ✅ Success Checklist

- [ ] Giphy account created
- [ ] API key obtained
- [ ] `.env` file created in `frontend/` directory
- [ ] `VITE_GIPHY_API_KEY` variable set
- [ ] Frontend restarted after `.env` changes
- [ ] Sticker picker opens successfully
- [ ] Trending stickers load on open
- [ ] Search functionality works
- [ ] Stickers send and display in chat
- [ ] No console errors in browser DevTools

## 🎉 Done!

Once you see trending stickers in the picker, you're all set! Users can now send animated stickers in lobby chats.

**Next Steps:**
- Test poll creation
- Test voice notes
- Test file attachments
- Test message editing/deletion
