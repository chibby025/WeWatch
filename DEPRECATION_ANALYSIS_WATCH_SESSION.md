# Deprecation Analysis: `/watch-session` Endpoint

**Date:** January 2025  
**Status:** ✅ **SAFE TO DEPRECATE**  
**Investigation:** Instant Watch Session Creation

---

## Summary

The `/api/rooms/:id/watch-session` endpoint and its handler `CreateWatchSessionForRoomHandler` are **NOT used by instant watch** and are **safe to deprecate**. The old `RoomPage.jsx` component that uses this endpoint is **imported but never routed** in the application.

---

## Findings

### 1. Instant Watch Flow ✅

**Frontend:** [frontend/src/components/LobbyPage.jsx](frontend/src/components/LobbyPage.jsx#L297-L355)
```javascript
const createInstantWatchSession = async () => {
  // ...
  const response = await apiClient.post('/api/rooms/instant-watch', requestBody);
  // ...
};
```

**Backend:** [backend/internal/handlers/rooms.go](backend/internal/handlers/rooms.go#L1335-L1500)
- Handler: `CreateInstantWatchHandler`
- Endpoint: `POST /api/rooms/instant-watch`
- Creates room + session **atomically in a transaction**
- Does **NOT** use `CreateWatchSessionForRoomHandler`
- Does **NOT** call `/watch-session` endpoint

**Verdict:** ✅ Instant watch uses a **completely separate endpoint**

---

### 2. Current Persistent Rooms ✅

**Component:** [frontend/src/components/RoomPageNew.jsx](frontend/src/components/RoomPageNew.jsx#L1366)
```javascript
const response = await apiClient.post(`/api/rooms/${roomId}/sessions`, finalSessionData);
```

**Backend:** [backend/internal/handlers/room_handlers.go](backend/internal/handlers/room_handlers.go#L304)
- Handler: `CreateWatchSession`
- Endpoint: `POST /api/rooms/:id/sessions`
- **This is the handler that was FIXED** for content rating bug

**Routing:** [frontend/src/App.jsx](frontend/src/App.jsx#L164)
```jsx
<Route path="/rooms/:id" element={
  <ErrorBoundary>
    <ProtectedRoute><RoomPageNew /></ProtectedRoute>
  </ErrorBoundary>
} />
```

**Verdict:** ✅ Current rooms use `/sessions` endpoint (NOT `/watch-session`)

---

### 3. Legacy Persistent Rooms ⚠️

**Component:** [frontend/src/components/RoomPage.jsx](frontend/src/components/RoomPage.jsx#L533)
```javascript
const newSessionResponse = await createWatchSessionForRoom(roomId, watchType);
```

**API Helper:** [frontend/src/services/api.js](frontend/src/services/api.js#L735-L741)
```javascript
export const createWatchSessionForRoom = (roomId, watchTypeOrConfig = 'video') => {
  const requestBody = typeof watchTypeOrConfig === 'string'
    ? { watch_type: watchTypeOrConfig } 
    : watchTypeOrConfig;
  return apiClient.post(`/api/rooms/${roomId}/watch-session`, requestBody);
};
```

**Backend:** [backend/internal/handlers/rooms.go](backend/internal/handlers/rooms.go#L2327)
- Handler: `CreateWatchSessionForRoomHandler`
- Endpoint: `POST /api/rooms/:id/watch-session`

**Routing Status:** [frontend/src/App.jsx](frontend/src/App.jsx#L15)
```jsx
import RoomPage from './components/RoomPage'; // ⚠️ IMPORTED BUT NEVER USED IN ROUTES
```

**Verdict:** ⚠️ **Legacy component is imported but NOT in routing table**

---

## Deprecation Path

### Phase 1: Remove Unused Imports ✅ SAFE
```javascript
// frontend/src/App.jsx
// ❌ REMOVE THIS LINE (component not used)
import RoomPage from './components/RoomPage';
```

### Phase 2: Deprecate API Helper ✅ SAFE
```javascript
// frontend/src/services/api.js
// ⚠️ DEPRECATED: Use POST /api/rooms/:id/sessions instead
// This endpoint is not used by any active components
// Can be removed after confirming no external integrations
export const createWatchSessionForRoom = (roomId, watchTypeOrConfig = 'video') => {
  console.warn('[DEPRECATED] createWatchSessionForRoom is deprecated. Use POST /api/rooms/:id/sessions instead.');
  const requestBody = typeof watchTypeOrConfig === 'string'
    ? { watch_type: watchTypeOrConfig } 
    : watchTypeOrConfig;
  return apiClient.post(`/api/rooms/${roomId}/watch-session`, requestBody);
};
```

### Phase 3: Comment Out Backend Route ✅ SAFE
```go
// backend/cmd/server/main.go
// ⚠️ DEPRECATED: Legacy session creation endpoint
// Replaced by POST /api/rooms/:id/sessions (CreateWatchSession handler)
// roomGroup.POST("/:id/watch-session", handlers.CreateWatchSessionForRoomHandler)
```

### Phase 4: Mark Handler for Removal (After Testing)
```go
// backend/internal/handlers/rooms.go
// ⚠️ DEPRECATED: Legacy handler - DO NOT USE
// Use CreateWatchSession in room_handlers.go instead
// This handler can be removed after confirming no external API consumers
func CreateWatchSessionForRoomHandler(c *gin.Context) {
  c.JSON(http.StatusGone, gin.H{
    "error": "This endpoint is deprecated. Use POST /api/rooms/:id/sessions instead.",
  })
  return
  
  // ... original code commented out ...
}
```

---

## Session Creation Endpoints Summary

| Endpoint | Handler | Component | Status |
|----------|---------|-----------|--------|
| `POST /api/rooms/instant-watch` | `CreateInstantWatchHandler` | LobbyPage (instant watch) | ✅ **ACTIVE** |
| `POST /api/rooms/:id/sessions` | `CreateWatchSession` | RoomPageNew (persistent) | ✅ **ACTIVE** (Fixed) |
| `POST /api/rooms/:id/watch-session` | `CreateWatchSessionForRoomHandler` | RoomPage (legacy) | ⚠️ **DEPRECATED** |

---

## Verification Checklist

- [x] Instant watch uses separate `/instant-watch` endpoint
- [x] Current persistent rooms use `/sessions` endpoint
- [x] Legacy `RoomPage.jsx` is imported but not routed
- [x] No active route uses `<RoomPage />` component
- [x] `createWatchSessionForRoom()` API helper is unused
- [x] `/watch-session` endpoint has no active consumers

---

## Recommendation

✅ **SAFE TO PROCEED WITH DEPRECATION**

1. Remove `RoomPage.jsx` import from [App.jsx](frontend/src/App.jsx#L15)
2. Add deprecation warning to [createWatchSessionForRoom()](frontend/src/services/api.js#L735)
3. Comment out `/watch-session` route in [main.go](backend/cmd/server/main.go)
4. Test instant watch and persistent rooms to ensure no breakage
5. After 1-2 release cycles, remove deprecated code entirely

---

## Testing Plan

### Test 1: Instant Watch
1. Go to Lobby → "Create New"
2. Select "Instant Watch" → Choose content rating → Start
3. Verify session creates successfully
4. Confirm content rating displays correctly in lobby

### Test 2: Persistent Room Session
1. Go to existing persistent room
2. Click "Start Session" → Select content rating → Start
3. Verify session creates successfully
4. Confirm content rating displays correctly in lobby

### Test 3: Verify No 404s
1. Check browser console for failed API calls
2. Confirm no requests to `/watch-session` endpoint
3. Monitor backend logs for deprecation warnings

---

## Related Files

**Frontend:**
- [frontend/src/App.jsx](frontend/src/App.jsx) - Routing configuration
- [frontend/src/components/RoomPage.jsx](frontend/src/components/RoomPage.jsx) - Legacy component (unused)
- [frontend/src/components/RoomPageNew.jsx](frontend/src/components/RoomPageNew.jsx) - Current component
- [frontend/src/components/LobbyPage.jsx](frontend/src/components/LobbyPage.jsx) - Instant watch
- [frontend/src/services/api.js](frontend/src/services/api.js) - API helpers

**Backend:**
- [backend/cmd/server/main.go](backend/cmd/server/main.go) - Route definitions
- [backend/internal/handlers/rooms.go](backend/internal/handlers/rooms.go) - Legacy handler + instant watch
- [backend/internal/handlers/room_handlers.go](backend/internal/handlers/room_handlers.go) - Current handler (fixed)

---

## Bug Fix Summary (Completed)

**Issue:** Content rating defaulting to 'G' instead of selected rating (e.g., '18+')

**Root Cause:** [CreateWatchSession](backend/internal/handlers/room_handlers.go#L304) handler missing `ContentRating` field

**Fix Applied:**
- ✅ Added `ContentRating string` to input struct
- ✅ Added validation logic (defaults to 'G' if invalid)
- ✅ Updated `CreateWatchSessionWithTypeAndTicketing` signature
- ✅ Set `ContentRating` in session model before DB save
- ✅ Added comprehensive debug logging
- ✅ Included `content_rating` in JSON response
- ✅ **User verified: "ok it works now"**

---

**END OF ANALYSIS**
