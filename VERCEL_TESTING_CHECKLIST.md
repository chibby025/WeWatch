# 🧪 Vercel Production Testing Checklist
**Before PWA: Comprehensive Testing & Bug Fixing**

**Date Started:** December 2024  
**Vercel URL:** https://letswatchout.vercel.app  
**Backend API:** https://letswatchout-production.up.railway.app  
**Database:** Railway PostgreSQL  

---

## ✅ COMPLETED: Routing Fix (Dec 2024)

### What Was Fixed:
- ✅ Watch session creation (preview_enabled, podcast_logo_url, content_rating, liveshare_mode + 5 live_share_* columns)
- ✅ Dynamic API routing implemented across **17 files**
- ✅ WithdrawalPage: 4 axios calls → apiClient
- ✅ AdsManagementModal: 6 fetch calls → API_BASE_URL
- ✅ AdCampaignCreator: 2 fetch calls → API_BASE_URL
- ✅ RoomGroupEditModal: 1 fetch call → API_BASE_URL
- ✅ AdInquiryForm: 1 fetch call → API_BASE_URL
- ✅ AdBanner: 2 tracking calls → API_BASE_URL
- ✅ AdVideoPreroll: 1 tracking call → API_BASE_URL
- ✅ LiveShareManager: 2 podcast logo uploads → API_BASE_URL
- ✅ LeftSidebar: 1 media fetch → API_BASE_URL

### Routing Pattern:
```javascript
// ✅ CORRECT (works on localhost + Vercel)
import { apiClient, API_BASE_URL } from '../services/api';

// For apiClient usage (automatic URL handling)
const response = await apiClient.get('/api/wallets/me');

// For raw fetch() (manual URL prepending)
const response = await fetch(`${API_BASE_URL}/api/ads/active`);
```

---

## 🎯 Phase 1: Core Functionality Testing

### Authentication & User Management
- [ ] **Register new account**
  - Test: Create account with username, email, password
  - Verify: Account created, JWT token received
  - Check: User redirected to home/dashboard

- [ ] **Login existing account**
  - Test: Login with correct credentials
  - Verify: JWT token stored, user session active
  - Check: Home page displays user info

- [ ] **Logout**
  - Test: Click logout button
  - Verify: Token cleared, redirected to login
  - Check: Protected routes inaccessible

- [ ] **Password reset flow**
  - Test: Request password reset via email
  - Verify: Email received with reset link
  - Check: Reset link works, new password accepted

- [ ] **Google OAuth login**
  - Test: Click "Login with Google"
  - Verify: Google auth popup works
  - Check: Account created/logged in successfully

### Room Browsing & Navigation
- [ ] **Home page loads**
  - Test: Visit https://letswatchout.vercel.app
  - Verify: Room groups display (Classic Cinema, Sports Bar, etc.)
  - Check: Room images load from BunnyCDN

- [ ] **Room groups display correctly**
  - Test: Scroll through all room groups
  - Verify: Images, titles, descriptions show properly
  - Check: No broken image links

- [ ] **Room page loads (RoomPageNew)**
  - Test: Click a room (e.g., Classic Cinema)
  - Verify: Room details, join button, members visible
  - Check: No console errors

- [ ] **Room search/filter**
  - Test: Search for specific room
  - Verify: Filtered results accurate
  - Check: Performance smooth with many rooms

---

## 🎬 Phase 2: Watch Session Testing

### Session Creation
- [ ] **Create regular watch session**
  - Test: Click "Create Session" in Classic Cinema room
  - Verify: Session created (status 200, session_id returned)
  - Check: Session appears in room
  - **NOTE:** Database columns added (preview_enabled, podcast_logo_url, content_rating, liveshare_mode, etc.)

- [ ] **Create 3D cinema session**
  - Test: Create session in 3D Cinema room
  - Verify: 3D theater loads with Three.js
  - Check: Avatars render, seats clickable

- [ ] **Create lecture hall session**
  - Test: Create session in Lecture Hall room
  - Verify: Lecture hall layout loads
  - Check: Host podium, student seats visible

- [ ] **Create LiveShare session**
  - Test: Enable LiveShare mode during session creation
  - Verify: LiveShare controls appear
  - Check: Screen sharing options available

- [ ] **Create ticketed session**
  - Test: Set ticket price during creation
  - Verify: Ticket system active
  - Check: Non-ticket holders blocked from joining

### Session Joining
- [ ] **Join as guest (no account)**
  - Test: Click join session while logged out
  - Verify: Guest name prompt appears
  - Check: Guest can view but has limited actions

- [ ] **Join as logged-in user**
  - Test: Join session with account
  - Verify: Full features available (chat, reactions, etc.)
  - Check: User appears in participants list

- [ ] **Join ticketed session**
  - Test: Attempt to join ticketed session
  - Verify: Payment prompt appears
  - Check: Payment successful → access granted

### Media Playback
- [ ] **Upload video to session**
  - Test: Upload video file (<500MB for chunk upload test)
  - Verify: Parallel chunk upload works (3-5 chunks)
  - Check: Progress bar accurate, upload completes

- [ ] **Play video in session**
  - Test: Click play on uploaded video
  - Verify: Video streams for all participants
  - Check: Sync works (all users see same timestamp)

- [ ] **Pause/resume video**
  - Test: Host pauses video
  - Verify: All participants see pause
  - Check: Resume syncs correctly

- [ ] **Seek video timeline**
  - Test: Host drags video timeline
  - Verify: All participants jump to new timestamp
  - Check: Smooth seeking, no buffering issues

- [ ] **Queue management**
  - Test: Add multiple videos to queue
  - Verify: Queue displays correctly
  - Check: Auto-play next video works

### LiveKit Integration (Real-Time Features)
- [ ] **Screen sharing (host)**
  - Test: Host clicks "Share Screen"
  - Verify: LiveKit screen track published
  - Check: All participants see screen

- [ ] **Camera sharing (LiveShare mode)**
  - Test: Enable camera in LiveShare
  - Verify: Camera feed appears in layout
  - Check: Quality good, no lag

- [ ] **Audio chat**
  - Test: Enable microphone
  - Verify: Audio transmitted via LiveKit
  - Check: Low latency (<200ms), clear audio

- [ ] **Text chat**
  - Test: Send messages in session chat
  - Verify: Messages appear for all users
  - Check: Timestamps correct, no duplicates

---

## 💰 Phase 3: Payment System Testing

### Wallet & Balance
- [ ] **Wallet page loads**
  - Test: Visit /wallet
  - Verify: Balance displays (tokens + gateway earnings)
  - Check: Transaction history visible

- [ ] **Token purchase (Paystack - NGN)**
  - Test: Buy 500 tokens for ₦5,000
  - Verify: Redirected to Paystack checkout
  - Check: Payment successful → tokens credited

- [ ] **Token purchase (Stripe - USD)**
  - Test: Buy 1,000 tokens for $40
  - Verify: Redirected to Stripe checkout
  - Check: Payment successful → tokens credited

- [ ] **Transaction history**
  - Test: View transaction history
  - Verify: All purchases, donations, payouts listed
  - Check: Filtering works (by type, date)

### Donations
- [ ] **Send donation to host**
  - Test: During session, donate 100 tokens
  - Verify: Tokens deducted from sender, added to host
  - Check: Donation message appears in chat

- [ ] **Donation leaderboard**
  - Test: View top donors in session
  - Verify: Leaderboard accurate
  - Check: Real-time updates

### Tickets
- [ ] **Purchase session ticket**
  - Test: Buy ticket for ticketed session (e.g., 50 tokens)
  - Verify: Tokens deducted, ticket granted
  - Check: Access to session unlocked

- [ ] **Gift ticket**
  - Test: Purchase ticket as gift for another user
  - Verify: Recipient gets ticket notification
  - Check: Recipient can join session

- [ ] **Refund ticket (within 24h)**
  - Test: Request refund within 24 hours
  - Verify: Refund processed, tokens returned
  - Check: Ticket revoked

### Withdrawals (Gateway Earnings)
- [ ] **Bank account management**
  - Test: Add Paystack bank account
  - Verify: Account verification works
  - Check: Primary account marked

- [ ] **Request payout**
  - Test: Request ₦10,000 payout
  - Verify: Request submitted (status: pending)
  - Check: Balance deducted from available earnings

- [ ] **Auto-approved payout**
  - Test: Request payout within daily limit
  - Verify: Status changes to "processing" automatically
  - Check: Funds sent to bank account

### KYC Verification
- [ ] **Submit KYC documents**
  - Test: Upload ID (NIN, BVN, passport)
  - Verify: Documents uploaded to backend
  - Check: Status changes to "pending"

- [ ] **KYC approval (admin)**
  - Test: Admin approves KYC
  - Verify: User status changes to "verified"
  - Check: Higher withdrawal limits unlocked

---

## 🎨 Phase 4: 3D Cinema & Advanced Features

### 3D Cinema Scene
- [ ] **3D theater loads**
  - Test: Join 3D cinema session
  - Verify: Three.js scene renders
  - Check: Smooth 60fps, no stuttering

- [ ] **Avatar customization**
  - Test: Change avatar appearance
  - Verify: Avatar updates in real-time
  - Check: Other users see changes

- [ ] **Seat selection**
  - Test: Click different seat
  - Verify: Avatar moves to new seat
  - Check: Seat marked as occupied for others

- [ ] **Camera controls**
  - Test: Pan, zoom, rotate camera
  - Verify: Controls smooth, responsive
  - Check: Camera position persists

### Lecture Hall
- [ ] **Lecture hall layout**
  - Test: Join lecture hall session
  - Verify: Tiered seating visible
  - Check: Host podium at front

- [ ] **Presentation mode**
  - Test: Host shares presentation
  - Verify: Slides appear on screen
  - Check: All students see same slide

- [ ] **Raise hand feature**
  - Test: Student raises hand
  - Verify: Host sees notification
  - Check: Queue system works

### LiveShare Features
- [ ] **Lower third overlay**
  - Test: Add lower third graphic
  - Verify: Text/logo appears on stream
  - Check: Position adjustable

- [ ] **Ticker/scrolling text**
  - Test: Enable news ticker
  - Verify: Text scrolls smoothly
  - Check: Speed adjustable

- [ ] **Logo bug (watermark)**
  - Test: Add logo to corner
  - Verify: Logo visible, not intrusive
  - Check: Position customizable

- [ ] **Break screen**
  - Test: Switch to break screen
  - Verify: "Be Right Back" appears
  - Check: Music/media plays

- [ ] **Podcast mode**
  - Test: Enable podcast layout
  - Verify: Audio waveform visible
  - Check: Logo displays

---

## 📢 Phase 5: Ads System Testing

### Ad Display
- [ ] **Banner ads in feed**
  - Test: Scroll through discovery feed
  - Verify: Banner ads appear between posts
  - Check: Click URL works, tracking fires

- [ ] **Video preroll ads**
  - Test: Start playing video
  - Verify: Preroll ad plays first (5s)
  - Check: Skip button appears after 5s

- [ ] **RoomTV ads**
  - Test: View RoomTV screen
  - Verify: Ad rotation works
  - Check: Ad changes every 10s

- [ ] **Discover page ads**
  - Test: Browse discover page
  - Verify: Featured ads displayed
  - Check: Targeting works (age, content rating)

### Ad Management (Admin)
- [ ] **Ad settings toggle**
  - Test: Disable global ads
  - Verify: All ads stop serving
  - Check: Revenue impact warning shown

- [ ] **Ad inquiry submission**
  - Test: Submit advertiser inquiry
  - Verify: Form submitted, saved to database
  - Check: Admin receives notification

- [ ] **Ad campaign creation**
  - Test: Create new ad campaign
  - Verify: Media uploaded, campaign saved
  - Check: Status set to "pending_review"

- [ ] **Campaign approval**
  - Test: Admin approves campaign
  - Verify: Status changes to "active"
  - Check: Ad starts serving immediately

- [ ] **Campaign analytics**
  - Test: View campaign stats
  - Verify: Impressions, clicks tracked
  - Check: CTR calculated correctly

---

## 🔒 Phase 6: Security Testing

### Input Validation
- [ ] **SQL injection attempts**
  - Test: Enter `' OR 1=1--` in forms
  - Verify: Input sanitized, no DB errors
  - Check: GORM parameterized queries work

- [ ] **XSS attempts**
  - Test: Enter `<script>alert('xss')</script>` in chat
  - Verify: Script escaped, not executed
  - Check: React auto-escaping works

- [ ] **File upload security**
  - Test: Upload .exe, .sh, malicious files
  - Verify: File type validation rejects
  - Check: Only video/image allowed

### Authentication Security
- [ ] **JWT expiration**
  - Test: Wait for token to expire (30 days)
  - Verify: Session ends, user logged out
  - Check: Refresh token flow works

- [ ] **Password strength**
  - Test: Try weak passwords (e.g., "123")
  - Verify: Validation rejects weak passwords
  - Check: Min 8 chars, bcrypt hashing

- [ ] **Rate limiting**
  - Test: Make 100 requests in 1 second
  - Verify: Rate limiter blocks after threshold
  - Check: 429 status returned

### Authorization
- [ ] **Admin-only endpoints**
  - Test: Non-admin tries to access admin API
  - Verify: 403 Forbidden returned
  - Check: Middleware blocks properly

- [ ] **Session host permissions**
  - Test: Non-host tries to end session
  - Verify: Permission denied
  - Check: Only host can control session

---

## ⚡ Phase 7: Performance Testing

### Load Time
- [ ] **Initial page load (First Contentful Paint)**
  - Test: Clear cache, load home page
  - Verify: FCP < 1.5s
  - Check: Lighthouse score > 90

- [ ] **Room page load**
  - Test: Load room with 50+ sessions
  - Verify: Load time < 2s
  - Check: Images lazy-loaded

- [ ] **3D cinema load**
  - Test: Load 3D scene with 100 seats
  - Verify: Scene ready < 3s
  - Check: Assets cached

### Video Streaming
- [ ] **Video buffering**
  - Test: Play 1080p video
  - Verify: No buffering after initial load
  - Check: Adaptive bitrate works

- [ ] **Concurrent viewers**
  - Test: 50+ users watch same video
  - Verify: No lag, sync maintained
  - Check: LiveKit handles load

### API Response Time
- [ ] **Wallet API (<100ms)**
  - Test: Call /api/wallets/me
  - Verify: Response < 100ms
  - Check: PostgreSQL query optimized

- [ ] **Session list API (<200ms)**
  - Test: Call /api/rooms/{id}/sessions
  - Verify: Response < 200ms
  - Check: Pagination works

### Database Performance
- [ ] **Query optimization**
  - Test: Check slow query log
  - Verify: No queries > 500ms
  - Check: Indexes on foreign keys

- [ ] **Connection pooling**
  - Test: Monitor connection count
  - Verify: Max 50 connections
  - Check: GORM pool works

---

## 🐛 Phase 8: Bug Fixing (Ongoing)

### Known Issues to Test
- [ ] **Guest permission flow**
  - Issue: Guests could do actions they shouldn't
  - Test: Verify guests can only view, not upload/admin
  - Check: Permission middleware correct

- [ ] **Wallet sync issues**
  - Issue: Balance not updating after donation
  - Test: Verify balance updates immediately
  - Check: Transaction logged correctly

- [ ] **3D avatar positioning**
  - Issue: Avatars overlapping on same seat
  - Test: Verify seat occupancy check works
  - Check: Avatar collision detection

- [ ] **LiveShare layout bugs**
  - Issue: Layouts not switching properly
  - Test: Verify layout changes apply immediately
  - Check: WebSocket messages sent

### Error Handling
- [ ] **Network errors**
  - Test: Disconnect internet mid-upload
  - Verify: Error message shown, retry works
  - Check: Graceful degradation

- [ ] **Backend downtime**
  - Test: Stop Railway backend
  - Verify: Frontend shows "Server unavailable"
  - Check: Retry logic works

- [ ] **Database errors**
  - Test: Simulate DB connection failure
  - Verify: 500 error returned, logged
  - Check: Circuit breaker pattern

---

## 🧪 Phase 9: Multi-User Session Testing

### Collaborative Features
- [ ] **10+ users in session**
  - Test: 10 users join same session
  - Verify: Chat works, no lag
  - Check: Video sync maintained

- [ ] **50+ users in session**
  - Test: 50 users join
  - Verify: LiveKit scales properly
  - Check: Performance still good

- [ ] **Screen sharing with viewers**
  - Test: Host shares, 20 viewers watch
  - Verify: All see screen clearly
  - Check: Bitrate adapts

### Stress Testing
- [ ] **Rapid chat messages**
  - Test: 5 users send 100 messages in 10s
  - Verify: All messages delivered
  - Check: No rate limiting issues

- [ ] **Simultaneous uploads**
  - Test: 3 users upload videos at once
  - Verify: All uploads complete
  - Check: Bandwidth not saturated

---

## 📱 Phase 10: Responsive Design Testing

### Mobile Devices
- [ ] **iPhone (Safari)**
  - Test: All features on iPhone 12/13/14
  - Verify: Touch controls work
  - Check: Layout responsive

- [ ] **Android (Chrome)**
  - Test: All features on Samsung/Pixel
  - Verify: Touch controls work
  - Check: Layout responsive

### Tablet
- [ ] **iPad**
  - Test: All features on iPad
  - Verify: Landscape/portrait work
  - Check: Layout optimized

### Desktop Browsers
- [ ] **Chrome**
- [ ] **Firefox**
- [ ] **Safari (Mac)**
- [ ] **Edge**

---

## 🚀 NEXT STEPS: PWA Implementation

**Once ALL above tests pass:**

1. **Install PWA Plugin**
   ```bash
   npm install vite-plugin-pwa -D
   ```

2. **Configure PWA**
   ```javascript
   // vite.config.js
   import { VitePWA } from 'vite-plugin-pwa'
   
   export default {
     plugins: [
       VitePWA({
         registerType: 'autoUpdate',
         manifest: {
           name: 'LetsWatchOut',
           short_name: 'LWO',
           description: 'Watch parties, 3D cinema, lecture halls',
           theme_color: '#1f2937',
           icons: [/* ... */]
         }
       })
     ]
   }
   ```

3. **Test PWA**
   - [ ] Install on mobile home screen
   - [ ] Offline mode works (service worker)
   - [ ] Push notifications (if implemented)

4. **Capacitor Setup (Android/iOS)**
   ```bash
   npm install @capacitor/core @capacitor/cli
   npx cap init
   npx cap add android
   npx cap add ios
   ```

5. **Build Native Apps**
   ```bash
   npm run build
   npx cap sync
   npx cap open android  # Opens Android Studio
   npx cap open ios      # Opens Xcode
   ```

---

## 📊 Testing Progress Tracker

**Estimated Time:**
- Phase 1: 2 hours
- Phase 2: 3 hours
- Phase 3: 2 hours
- Phase 4: 2 hours
- Phase 5: 1 hour
- Phase 6: 2 hours
- Phase 7: 2 hours
- Phase 8: Ongoing (1-2 days)
- Phase 9: 2 hours
- Phase 10: 2 hours
**Total: ~2-3 days intensive testing**

**Bugs Found:** (Track as you go)
- [ ] Bug 1: _____
- [ ] Bug 2: _____
- [ ] Bug 3: _____

**Critical Issues (Block PWA):**
- [ ] Issue 1: _____
- [ ] Issue 2: _____

---

## ✅ Sign-Off Criteria

**Before moving to PWA, ALL must be ✅:**
- [ ] Zero critical bugs
- [ ] All payment flows work (Paystack + Stripe)
- [ ] Multi-user sessions stable (50+ users)
- [ ] Performance targets met (Lighthouse > 90)
- [ ] Security tests passed
- [ ] Mobile responsive on iOS + Android
- [ ] Investor demo ready (smooth, impressive)

---

**Good luck! 🚀 You got this!**
