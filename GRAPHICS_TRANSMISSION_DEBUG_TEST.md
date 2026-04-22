# Graphics Transmission Debug Test - April 18, 2026

## 🎯 Goal
Test if graphics (banner, ticker, lower third) are transmitted and rendered on member devices when viewing a LiveShare broadcast.

---

## 🔧 Setup

**Accounts Needed:**
- Host account (starts LiveShare)
- Member account (views LiveShare)

**Browser Setup:**
1. Open 2 browser windows side-by-side
2. Window 1 (LEFT): Host browser
3. Window 2 (RIGHT): Member browser

**Open Developer Console:**
- Press F12 on both browsers
- Switch to "Console" tab
- Clear console logs (click trash icon)

---

## 📝 Test Procedure

### Step 1: Login & Create Session

**Host Browser (LEFT):**
1. Login with host account
2. Navigate to dashboard
3. Click "Create Session" → Select "VideoWatch"
4. Set session name: "Graphics Test"
5. Set rating: G (General Audiences)
6. Click "Create Session"
7. Click "Join Now"
8. Wait for VideoWatch page to load
9. **Copy the room URL** (e.g., `http://localhost:5173/room/123`)

**Member Browser (RIGHT):**
1. Login with member account
2. Paste the room URL in address bar
3. Click "Join Now"
4. Wait for VideoWatch page to load

**Expected Console Logs (BOTH browsers):**
```
🔍 [GRAPHICS INIT] Checking renderer initialization: {
  liveShareMode: null,
  isHost: true/false,
  sessionStatus: {...},
  hasCanvas: true,
  hasRenderer: false,
  userRole: 'HOST' or 'MEMBER'
}
⚠️ [GRAPHICS INIT] Blocked: liveShareMode is null/undefined
```

---

### Step 2: Start LiveShare (Host Only)

**Host Browser (LEFT):**
1. Click "LiveShare" button in left sidebar
2. Click "News" mode (red card with 📰 icon)
3. LiveShare wizard opens
4. Click "Share Screen" button
5. Select window/screen to share
6. Click "Share"
7. Screen share starts

**Expected Console Logs - HOST:**
```
🎨 [VideoWatch] Initializing GraphicsRenderer for mode: news
🎨 [VideoWatch] GraphicsRenderer initialized and rendering
```

**Expected Console Logs - MEMBER:**
```
📊 [SESSION STATUS] Update received: {
  sessionStatus: {...},
  hasLiveShareActive: true/false,  ← CHECK THIS VALUE
  liveShareActiveValue: true/false,
  ...
}
```

**❓ Question 1: Does member see `liveShareActiveValue: true`?**
- [ ] YES - Backend sends LiveShare state ✅
- [ ] NO - Backend does NOT send LiveShare state ❌

---

### Step 3: Add Banner (Host Only)

**Host Browser (LEFT):**
1. In LiveShare sidebar, find "Banner" section
2. Type: "BREAKING NEWS"
3. Click "Show Banner" toggle (should turn ON)

**Expected Console Logs - HOST:**
```
📨 [GRAPHICS UPDATE] WebSocket message received
User Role: HOST
Graphic Details: {
  type: 'banner',
  active: true,
  content: { text: 'BREAKING NEWS' }
}
Renderer State: {
  hasRenderer: true,
  rendererInitialized: 'YES ✅'
}
✅ [BANNER] Showing banner: { text: 'BREAKING NEWS' }
```

**Expected Console Logs - MEMBER:**
```
═══════════════════════════════════════════════════════
📨 [GRAPHICS UPDATE] WebSocket message received
User Role: MEMBER
User: <member_username> (ID: <id>)
───────────────────────────────────────────────────────
Graphic Details: {
  type: 'banner',
  active: true,
  content: { text: 'BREAKING NEWS' }
}
───────────────────────────────────────────────────────
Renderer State: {
  hasRenderer: false,  ← EXPECTED FALSE (the bug)
  hasCanvas: true,
  liveShareMode: null,
  rendererInitialized: 'NO ❌'
}
═══════════════════════════════════════════════════════
✅ [BANNER] Showing banner: { text: 'BREAKING NEWS' }
```

**Visual Check:**
- [ ] HOST: Banner appears at top of screen? (YES/NO)
- [ ] MEMBER: Banner appears at top of screen? (YES/NO)

**Note:** Banner uses DOM rendering, so it SHOULD work on both. But let's verify.

---

### Step 4: Add Ticker (Host Only)

**Host Browser (LEFT):**
1. In LiveShare sidebar, find "Ticker" section
2. Type headline 1: "Markets crash 500 points"
3. Click "Add" button
4. Type headline 2: "President announces new policy"
5. Click "Add" button
6. Click "Show Ticker" toggle (should turn ON)

**Expected Console Logs - HOST:**
```
📨 [GRAPHICS UPDATE] WebSocket message received
User Role: HOST
Graphic Details: {
  type: 'ticker',
  active: true,
  content: {
    items: ['Markets crash 500 points', 'President announces new policy']
  }
}
Renderer State: {
  hasRenderer: true,
  rendererInitialized: 'YES ✅'
}
➕ [CANVAS] Adding layer: ticker
✅ [CANVAS] Layer added successfully
   Total layers: 1
```

**Expected Console Logs - MEMBER:**
```
═══════════════════════════════════════════════════════
📨 [GRAPHICS UPDATE] WebSocket message received
User Role: MEMBER
───────────────────────────────────────────────────────
Graphic Details: {
  type: 'ticker',
  active: true,
  content: { items: [...] }
}
───────────────────────────────────────────────────────
Renderer State: {
  hasRenderer: false,  ← THE BUG
  hasCanvas: true,
  liveShareMode: null,
  rendererInitialized: 'NO ❌'
}
═══════════════════════════════════════════════════════
❌ [GRAPHICS UPDATE] CRITICAL ERROR: Cannot render graphics
   → Reason: graphicsRendererRef.current is null
   → User Role: MEMBER
   → liveShareMode: null/undefined
   → THIS IS THE BUG WE NEED TO FIX!
```

**Visual Check:**
- [ ] HOST: Scrolling ticker at bottom of screen? (YES/NO)
- [ ] MEMBER: Scrolling ticker at bottom of screen? (YES/NO)

**Expected Result:** Ticker SHOULD NOT appear on member (this is the bug).

---

### Step 5: Add Lower Third (Host Only)

**Host Browser (LEFT):**
1. In LiveShare sidebar, find "Lower Third" section
2. Type name: "John Doe"
3. Type title: "News Anchor"
4. Click "Show Lower Third" toggle (should turn ON)

**Expected Console Logs - HOST:**
```
📨 [GRAPHICS UPDATE] WebSocket message received
Graphic Details: {
  type: 'lower_third',
  active: true,
  content: { name: 'John Doe', title: 'News Anchor' }
}
➕ [CANVAS] Adding layer: lower_third
✅ [CANVAS] Layer added successfully
   Total layers: 2
```

**Expected Console Logs - MEMBER:**
```
📨 [GRAPHICS UPDATE] WebSocket message received
User Role: MEMBER
Graphic Details: {
  type: 'lower_third',
  active: true,
  content: { name: 'John Doe', title: 'News Anchor' }
}
Renderer State: {
  hasRenderer: false,
  rendererInitialized: 'NO ❌'
}
❌ [GRAPHICS UPDATE] CRITICAL ERROR: Cannot render graphics
```

**Visual Check:**
- [ ] HOST: Lower third at bottom-left of screen? (YES/NO)
- [ ] MEMBER: Lower third at bottom-left of screen? (YES/NO)

**Expected Result:** Lower third SHOULD NOT appear on member (this is the bug).

---

## 📊 Results Summary

**Fill this out after testing:**

### Console Log Analysis

**Question 1:** Does `sessionStatus` include `liveShareActive` field?
- [ ] YES - Value: _______________
- [ ] NO - Field not present

**Question 2:** Does MEMBER receive `liveshare_graphics_update` messages?
- [ ] YES - All 3 messages received (banner, ticker, lower_third)
- [ ] NO - Messages not arriving
- [ ] PARTIAL - Some messages received: _______________

**Question 3:** Does MEMBER have canvas element in DOM?
- [ ] YES - `hasCanvas: true` in logs
- [ ] NO - `hasCanvas: false` in logs

**Question 4:** Does MEMBER have GraphicsRenderer initialized?
- [ ] YES - `hasRenderer: true` (surprising!)
- [ ] NO - `hasRenderer: false` (expected - this is the bug)

### Visual Analysis

| Graphic Type | HOST Visible? | MEMBER Visible? | Notes |
|--------------|---------------|-----------------|-------|
| Banner (DOM) | YES / NO      | YES / NO        |       |
| Ticker (Canvas) | YES / NO   | YES / NO        |       |
| Lower Third (Canvas) | YES / NO | YES / NO     |       |

### Expected Behavior

**Banner:** ✅ Should work on both (DOM rendering, not dependent on GraphicsRenderer)

**Ticker:** ❌ Should NOT work on member (requires GraphicsRenderer which is not initialized)

**Lower Third:** ❌ Should NOT work on member (requires GraphicsRenderer which is not initialized)

---

## 🔍 Diagnosis

Based on the test results, we'll determine:

**If `sessionStatus.liveShareActive` exists:**
→ Solution: Change renderer init condition to check this field

**If `sessionStatus.liveShareActive` does NOT exist:**
→ Solution: Add backend support OR initialize renderer based on WebSocket messages

**If messages don't arrive at all:**
→ Problem: WebSocket broadcasting broken (unlikely, but need to check)

---

## 📋 Next Steps

After completing this test:
1. Copy all console logs from BOTH browsers
2. Paste logs into conversation
3. Answer all questions above
4. We'll implement the fix based on findings

---

## 🎬 Video Recording (Optional)

If you want to record the test:
1. Use OBS or screen recorder
2. Record both browser windows side-by-side
3. Show console logs during the test
4. This helps with bug reporting and documentation
