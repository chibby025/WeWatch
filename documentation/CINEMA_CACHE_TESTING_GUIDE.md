# Cinema Cache Testing Guide

## 🎯 Purpose
Test the localStorage caching optimization to verify the "finding seat" spinner time has been reduced by 20-40%.

## 📋 Prerequisites
- Frontend build completed: `npm run build`
- Backend running with WebSocket support
- Browser with DevTools (Chrome/Firefox recommended)
- Clear localStorage before starting tests

## 🧪 Test Scenarios

### Test 1: First Load (Cache Miss)
**Goal**: Establish baseline performance without cache

**Steps:**
1. Open DevTools → Console
2. Clear localStorage:
   ```javascript
   localStorage.clear();
   ```
3. Navigate to login page
4. Login with test credentials
5. Join a 3D Cinema room
6. **Measure**: Time from entering cinema to seat assignment

**Expected Console Output:**
```
🔍 [Seat Request] Conditions: isConnected=true, sendMessage=true...
⏱️ Seat request sent at: [timestamp]
🎯 [SEAT ASSIGNED] [username] → Seat A1_3
💾 [Cache] User data cached on login
💾 [Cache] Saved seat assignment to localStorage
```

**Expected Time**: 520ms - 1200ms

**Record Results:**
- Time to seat assignment: ______ ms
- Cache hit for user: ❌ No
- Cache hit for seats: ❌ No

---

### Test 2: Page Refresh (Cache Hit)
**Goal**: Verify cache reduces load time

**Steps:**
1. Stay logged in
2. Navigate away from cinema (to lobby)
3. Open DevTools → Console
4. Navigate back to the same 3D Cinema room
5. **Measure**: Time from entering cinema to seat assignment

**Expected Console Output:**
```
⚡ [Cache] Using cached user: john_doe
⚡ [Cache] Loaded 150 cinema seats from cache
🔍 [Seat Request] Conditions: isConnected=true, sendMessage=true...
🎯 [SEAT ASSIGNED] [username] → Seat B2_5
💾 [Cache] Saved seat assignment
```

**Expected Time**: 420ms - 700ms (100-500ms faster)

**Record Results:**
- Time to seat assignment: ______ ms
- Cache hit for user: ✅ Yes
- Cache hit for seats: ✅ Yes
- **Performance gain**: ______ ms (% improvement: ____%)

---

### Test 3: Hard Refresh (Cache Persists)
**Goal**: Verify cache survives page reload

**Steps:**
1. Stay in cinema
2. Press `Ctrl+Shift+R` (hard refresh)
3. Watch console for cache logs
4. **Measure**: Time to seat assignment

**Expected Console Output:**
```
⚡ [Cache] Using cached user: john_doe
⚡ [Cache] Loaded 150 cinema seats from cache
```

**Expected Result**: Cache still works, performance similar to Test 2

**Record Results:**
- Cache hit for user: ✅ Yes / ❌ No
- Cache hit for seats: ✅ Yes / ❌ No

---

### Test 4: Cache Expiry (1 Hour)
**Goal**: Verify user cache expires after TTL

**Steps:**
1. Method A (Fast): Manually expire cache
   ```javascript
   // In DevTools console
   let cache = JSON.parse(localStorage.getItem('wewatch_user_cache'));
   cache.cached_at = Date.now() - (61 * 60 * 1000); // 61 minutes ago
   localStorage.setItem('wewatch_user_cache', JSON.stringify(cache));
   ```
2. Refresh page
3. Watch console for fresh API fetch

**Expected Console Output:**
```
🔍 [Cache] User cache expired (age: 3661 seconds)
🔄 Fetching fresh user data...
💾 [Cache] User data cached
```

**Expected Result**: Fresh API call made, new data cached

**Record Results:**
- Cache expired correctly: ✅ Yes / ❌ No
- Fresh data fetched: ✅ Yes / ❌ No

---

### Test 5: Logout Cache Clearing
**Goal**: Verify cache cleared on logout

**Steps:**
1. Stay logged in
2. Open DevTools → Console
3. Check cache exists:
   ```javascript
   console.log('User cache:', localStorage.getItem('wewatch_user_cache'));
   console.log('Seats cache:', localStorage.getItem('wewatch_cinema_seats'));
   ```
4. Click logout button
5. Check cache again:
   ```javascript
   console.log('User cache:', localStorage.getItem('wewatch_user_cache'));
   console.log('Seats cache:', localStorage.getItem('wewatch_cinema_seats'));
   ```

**Expected Console Output:**
```
🚪 [Logout] Clearing auth data and cache...
✅ [Logout] Cinema cache cleared
```

**Expected Result**: Both outputs should be `null` after logout

**Record Results:**
- Cache cleared on logout: ✅ Yes / ❌ No
- Login page loaded: ✅ Yes / ❌ No

---

### Test 6: Multiple Users (No Cache Collision)
**Goal**: Verify cache doesn't leak between users

**Steps:**
1. Login as User A
2. Join cinema (cache populated)
3. Logout (cache cleared)
4. Login as User B
5. Check console for User A's data

**Expected Console Output:**
```
⚡ [Cache] Using cached user: userB
```

**Expected Result**: User B's data loaded, NOT User A's

**Record Results:**
- Correct user cached: ✅ Yes / ❌ No
- No data leakage: ✅ Yes / ❌ No

---

### Test 7: Corrupted Cache (Error Handling)
**Goal**: Verify app doesn't crash with bad cache data

**Steps:**
1. Login and populate cache
2. Corrupt cache manually:
   ```javascript
   localStorage.setItem('wewatch_user_cache', '{invalid json');
   ```
3. Refresh page
4. Watch for errors

**Expected Console Output:**
```
⚠️ [Cache] Failed to parse user cache: [error]
🔄 Fetching fresh user data...
```

**Expected Result**: App continues working, fetches fresh data

**Record Results:**
- App crashed: ✅ Yes / ❌ No (should be No)
- Fallback to API: ✅ Yes / ❌ No (should be Yes)

---

### Test 8: Seat Assignment Still Dynamic
**Goal**: Verify backend still controls seat assignment

**Steps:**
1. Login and join cinema (seat assigned)
2. Note assigned seat (e.g., A1_5)
3. Refresh page
4. Check if same seat assigned

**Expected Result**: Backend assigns a NEW seat (not from cache)

**Expected Console Output:**
```
💾 [Cache] Saved seat assignment: B2_3  (different from before)
```

**Record Results:**
- Seat re-assigned by backend: ✅ Yes / ❌ No
- Cache not used for assignment: ✅ Yes / ❌ No

---

## 📊 Performance Comparison Table

| Test Scenario | Time (ms) | Cache Hit | Notes |
|---------------|-----------|-----------|-------|
| First Load (No Cache) | _____ | ❌ | Baseline |
| Refresh (Cache Hit) | _____ | ✅ | Expected faster |
| Hard Refresh | _____ | ✅ | Should persist |
| After 1 Hour | _____ | ❌ | Expired, refetch |
| After Logout/Login | _____ | ❌ | Cache cleared |

**Target Performance:**
- Cache miss: 520-1200ms
- Cache hit: 420-700ms
- **Improvement**: 100-500ms (20-40% faster)

---

## 🔍 Debugging Tools

### Check Cache State
```javascript
// In DevTools console
function checkCacheState() {
  const caches = [
    'wewatch_user_cache',
    'wewatch_cinema_seats',
    'wewatch_lecture_hall_seats'
  ];
  
  caches.forEach(key => {
    const data = localStorage.getItem(key);
    if (data) {
      try {
        const parsed = JSON.parse(data);
        const age = Math.floor((Date.now() - parsed.cached_at) / 1000);
        console.log(`${key}: ${age}s old, ${(JSON.stringify(data).length / 1024).toFixed(2)} KB`);
      } catch (e) {
        console.error(`${key}: CORRUPTED`);
      }
    } else {
      console.log(`${key}: NOT FOUND`);
    }
  });
}

checkCacheState();
```

### Monitor Cache Size
```javascript
// Calculate total localStorage size
let totalSize = 0;
for (let key in localStorage) {
  if (localStorage.hasOwnProperty(key)) {
    totalSize += localStorage[key].length + key.length;
  }
}
console.log(`Total localStorage: ${(totalSize / 1024).toFixed(2)} KB`);
```

### Performance Timing
```javascript
// Measure time to seat assignment
const startTime = performance.now();
// ... wait for seat_assigned message ...
const endTime = performance.now();
console.log(`⏱️ Time to seat: ${Math.round(endTime - startTime)}ms`);
```

---

## ✅ Success Criteria

**Pass Conditions:**
- [x] Cache hit reduces spinner time by 100-500ms (20-40%)
- [x] User cache loads instantly on refresh
- [x] Seat layout loads from cache without regeneration
- [x] Cache clears on logout (no data leakage)
- [x] Cache expires after TTL (1 hour for user, 24 hours for seats)
- [x] Backend still controls seat assignment (cache not used)
- [x] App works without cache (graceful degradation)
- [x] No crashes with corrupted cache

**Fail Conditions:**
- ❌ Performance not improved or worse
- ❌ Cache leaks between users
- ❌ App crashes with corrupted cache
- ❌ Seat assignment uses cached data (wrong seat)
- ❌ Cache not cleared on logout

---

## 🐛 Troubleshooting

### Cache Not Loading
**Symptoms**: Console shows no cache logs, performance not improved

**Checks:**
1. Verify localStorage enabled: `typeof localStorage !== 'undefined'`
2. Check cache exists: `localStorage.getItem('wewatch_user_cache')`
3. Verify import: Check cinemaCache.js imported correctly
4. Console errors: Check for JS errors blocking execution

### Cache Not Clearing
**Symptoms**: Old user data appears after logout

**Checks:**
1. Verify clearAllCaches() called in handleLogout
2. Check console for logout logs: `✅ [Logout] Cinema cache cleared`
3. Manually clear: `localStorage.clear()` then retry
4. Check browser privacy settings (may block localStorage)

### Performance Not Improved
**Symptoms**: Cache loads but time still slow

**Checks:**
1. Verify WebSocket connection time (not cached)
2. Check network tab for API calls still happening
3. Verify seat request conditions logged correctly
4. Test on different network (slow network may hide cache benefit)

### Corrupted Cache Crashes
**Symptoms**: App won't load, console shows parse errors

**Fix:**
```javascript
// In DevTools console
localStorage.removeItem('wewatch_user_cache');
localStorage.removeItem('wewatch_cinema_seats');
location.reload();
```

---

## 📝 Test Results Template

**Date**: ___________  
**Tester**: ___________  
**Browser**: ___________  
**Environment**: Dev / Staging / Production

### Performance Results
| Metric | Value |
|--------|-------|
| Baseline (no cache) | _____ ms |
| With cache | _____ ms |
| Improvement | _____ ms (_____ %) |

### Test Results
- [ ] Test 1: First Load (Cache Miss) - PASS / FAIL
- [ ] Test 2: Page Refresh (Cache Hit) - PASS / FAIL
- [ ] Test 3: Hard Refresh - PASS / FAIL
- [ ] Test 4: Cache Expiry - PASS / FAIL
- [ ] Test 5: Logout Cache Clearing - PASS / FAIL
- [ ] Test 6: Multiple Users - PASS / FAIL
- [ ] Test 7: Corrupted Cache - PASS / FAIL
- [ ] Test 8: Seat Assignment Dynamic - PASS / FAIL

### Notes
_Any issues, bugs, or observations:_

---

**Created**: 2025-01-16  
**Last Updated**: 2025-01-16  
**Status**: Ready for Testing
