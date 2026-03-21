# Media Cleanup Guide

## Overview

WeWatch has two types of media:

1. **Permanent Room Media** (`media_items` table)
   - Lives forever in the room
   - Uploaded via `/api/rooms/:id/upload?temporary=false`
   - Stored in `./uploads/` directory
   - ❌ **DEPRECATED**: No longer used, sessions use temporary media only

2. **Temporary Session Media** (`temporary_media_items` table)
   - Only exists for the duration of a watch session
   - Uploaded via `/api/rooms/:id/upload?temporary=true&session_id=xxx`
   - Stored in `./uploads/temp/` directory
   - ✅ **CURRENT**: Auto-deleted when session ends

## Cleanup Scripts

### 1. Delete All Room Media (One-Time Cleanup)

Removes ALL permanent media items from all rooms:

```bash
cd backend
go run cmd/delete_all_room_media.go
```

**What it does:**
- Finds all records in `media_items` table
- Deletes video files, posters, and preview GIFs
- Removes database records
- Shows disk space freed

**Safety:**
- Requires typing `DELETE ALL` to confirm
- Shows preview before deletion
- Logs all operations

### 2. Clean Orphaned Temporary Media

Removes temporary media from ended sessions:

```bash
cd backend
go run cmd/cleanup_orphaned_media.go
```

**What it does:**
- Finds temporary media where `watch_sessions.ended_at IS NOT NULL`
- Deletes files and database records
- Prevents disk space leaks

## Automatic Cleanup (Already Implemented)

### Session End Cleanup
When a host ends a session, the backend automatically:

1. Marks session as ended (`ended_at = NOW()`)
2. Deletes all temporary media for that session
3. Removes files from `./uploads/temp/`
4. Cleans up database records

**Location:** `backend/internal/handlers/rooms.go:EndWatchSessionHandler`

### Stale Session Cleanup
Every hour, the backend checks for:

- Sessions older than 24 hours
- Auto-ends them and deletes their media

**Location:** `backend/internal/handlers/websocket.go:CleanupStaleSessions`

## Frontend Behavior

### Cinema (3D Demo)
- ✅ **FIXED**: Now fetches session-specific media only
- Uses `getSessionTemporaryMedia(sessionId)` 
- No longer shows old uploads from previous sessions

**File:** `frontend/src/components/cinema/3d-cinema/CinemaScene3DDemo.jsx`

### Lecture Hall
- ✅ **Already correct**: Uses `getSessionTemporaryMedia(sessionId)`
- Only shows current session's uploads

**File:** `frontend/src/pages/PositionCalculatorPage.jsx`

## Database Tables

### media_items (Permanent - DEPRECATED)
```sql
SELECT COUNT(*), SUM(file_size) FROM media_items;
-- Shows count and total size of permanent media
```

### temporary_media_items (Session-Specific)
```sql
SELECT COUNT(*), SUM(file_size) FROM temporary_media_items;
-- Shows count and total size of temporary media

-- Check for orphaned media
SELECT COUNT(*) FROM temporary_media_items tmi
JOIN watch_sessions ws ON ws.session_id = tmi.session_id
WHERE ws.ended_at IS NOT NULL;
```

## Best Practices

### For Developers

1. **Always use temporary media for sessions:**
   ```javascript
   await uploadMediaToRoom(roomId, file, onProgress, true, sessionId);
   //                                              ↑ temporary  ↑ session
   ```

2. **Fetch session media, not room media:**
   ```javascript
   const media = await getSessionTemporaryMedia(sessionId); // ✅ Correct
   const media = await getTemporaryMediaItemsForRoom(roomId); // ❌ Wrong
   ```

3. **Let backend handle cleanup:**
   - Don't manually delete temporary media
   - Backend auto-deletes on session end

### For Production

1. **Monitor disk space:**
   ```bash
   du -sh backend/uploads/temp/
   ```

2. **Run cleanup monthly (safety net):**
   ```bash
   cd backend
   go run cmd/cleanup_orphaned_media.go
   ```

3. **Check for leaked files:**
   ```bash
   # Files on disk but not in database
   cd backend
   find ./uploads/temp -type f -mtime +7 # Files older than 7 days
   ```

## Troubleshooting

### Old videos showing in sessions
**Cause:** Frontend fetching room media instead of session media
**Fix:** Ensure using `getSessionTemporaryMedia(sessionId)`

### Disk space growing
**Cause:** Sessions not ending properly or cleanup not running
**Fix:** 
1. Check if `CleanupStaleSessions` is running (logs every hour)
2. Run `cleanup_orphaned_media.go` manually
3. Check for zombie sessions: `SELECT * FROM watch_sessions WHERE ended_at IS NULL AND created_at < NOW() - INTERVAL '24 hours'`

### Upload fails
**Cause:** Disk full or permissions
**Fix:**
1. Check disk space: `df -h`
2. Run cleanup scripts
3. Check upload directory permissions

## Migration Path

### Current State (Feb 2026)
- ✅ Temporary session media working
- ✅ Auto-cleanup on session end
- ✅ Frontend fixed to use session media
- ❌ Old permanent media still exists (bloat)

### Action Plan
1. Run `delete_all_room_media.go` to clear legacy media
2. Monitor temporary media cleanup
3. Consider removing permanent media upload feature entirely

## File Size Limits

- **Room media:** 500MB per file (deprecated)
- **Session media:** 500MB per file
- **Total disk:** Monitor and set alerts at 80% capacity

## API Endpoints

### Upload
- `POST /api/rooms/:id/upload?temporary=true&session_id=xxx` - Session media ✅
- `POST /api/rooms/:id/upload?temporary=false` - Room media ❌ (deprecated)

### Fetch
- `GET /api/sessions/:sessionId/temporary-media` - Session media ✅
- `GET /api/rooms/:id/temporary-media` - All room media ❌ (wrong)

### Delete
- Automatic on session end ✅
- `DELETE /api/rooms/:id/temporary-media` - Delete all (host only)
- `DELETE /api/rooms/:id/temporary-media/:itemId` - Delete one

## Monitoring Commands

```bash
# Check media counts
psql -d wewatch_db -c "SELECT COUNT(*) FROM media_items;"
psql -d wewatch_db -c "SELECT COUNT(*) FROM temporary_media_items;"

# Check disk usage
du -sh backend/uploads/
du -sh backend/uploads/temp/

# Check active sessions
psql -d wewatch_db -c "SELECT COUNT(*) FROM watch_sessions WHERE ended_at IS NULL;"

# Check orphaned media
psql -d wewatch_db -c "
  SELECT COUNT(*) FROM temporary_media_items tmi
  JOIN watch_sessions ws ON ws.session_id = tmi.session_id
  WHERE ws.ended_at IS NOT NULL;
"
```
