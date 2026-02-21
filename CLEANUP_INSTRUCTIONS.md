# Orphaned Media Cleanup Instructions

## 🧹 One-Time Cleanup of Old Temporary Media

### What This Does
Deletes all temporary media files and database records from **ended watch sessions**. This ensures:
- ✅ Free disk space
- ✅ Clean database
- ✅ No copyright violations
- ✅ Efficient resource usage

### Before Running
1. **Backup your database** (recommended)
   ```bash
   pg_dump -U postgres wewatch_db > backup_$(date +%Y%m%d).sql
   ```

2. **Stop the backend server** (optional but recommended)
   ```bash
   # Press Ctrl+C in the terminal running the server
   ```

### How to Run

#### Option 1: Direct Execution (Recommended)
```bash
cd backend
go run cmd/cleanup_orphaned_media.go
```

#### Option 2: Build and Run
```bash
cd backend
go build -o cleanup_orphaned_media cmd/cleanup_orphaned_media.go
./cleanup_orphaned_media
```

### Environment Variables
The script will use your `DATABASE_URL` environment variable. If not set, it defaults to:
```
host=localhost user=postgres password=your_password dbname=wewatch_db port=5432 sslmode=disable
```

**Set your database connection:**
```bash
export DATABASE_URL="host=localhost user=postgres password=your_actual_password dbname=wewatch_db port=5432 sslmode=disable"
```

### What Happens

1. **Connects to database**
2. **Finds orphaned media** (media from ended sessions)
3. **Shows preview** of items to be deleted (first 10)
4. **Asks for confirmation** (type `YES` to proceed)
5. **Deletes files** from disk
6. **Deletes thumbnails**
7. **Deletes database records**
8. **Shows summary** of cleanup results

### Example Output
```
🧹 ===== ORPHANED MEDIA CLEANUP SCRIPT =====
⚠️  This will DELETE all temporary media from ENDED watch sessions
✅ Connected to database
🔍 Found 15 orphaned media items from ended sessions

📋 Preview of items to be deleted:
   1. movie_night.mp4 (Session: abc-123, Size: 15728640 bytes)
   2. tutorial.mkv (Session: def-456, Size: 25165824 bytes)
   ... and 13 more items

⚠️  Proceed with deletion? Type 'YES' to confirm: YES

🗑️  Starting cleanup...
🗑️  [1/15] Processing: movie_night.mp4
   ✅ Deleted file: /uploads/temp/movie_night.mp4
   ✅ Deleted thumbnail: /uploads/temp/movie_night.mp4.jpg
   ✅ Deleted DB record (ID: 123)
...

============================================================
📊 CLEANUP SUMMARY
============================================================
✅ Successfully deleted: 15 items
💾 Disk space freed: 125.50 MB
⚠️  File deletion errors: 0
⚠️  DB deletion errors: 0
============================================================
✨ Cleanup completed successfully! System is now clean.
```

### After Cleanup

1. **Start backend server**
   ```bash
   cd backend
   go run main.go
   ```

2. **Verify fix is working**
   - Create new watch session
   - Upload media
   - End session
   - Start new session
   - Confirm old media doesn't appear

### What Changed in Code

**Fixed:** `GetTemporaryMediaItemsForRoomHandler` now:
- ✅ Checks for active session first
- ✅ Only returns media for active session
- ✅ Returns empty array if no active session
- ✅ Prevents old media from appearing

**Result:** Future sessions will never see orphaned media, even if cleanup fails during session end.

### Troubleshooting

**"No active session for room X"**
- This is normal if room has no active watch session
- Start a new session to upload media

**"File already deleted"**
- Database record exists but file is gone
- Script will clean up the database record anyway

**Permission errors**
- Ensure you have write access to the uploads directory
- Run with appropriate permissions

### Safety Features

- ✅ Shows preview before deletion
- ✅ Requires explicit "YES" confirmation
- ✅ Logs every operation
- ✅ Counts successes and errors
- ✅ Only targets ended sessions (safe)
- ✅ Doesn't touch active session media

---

**Note:** This is a one-time cleanup. The code fix ensures this won't happen again.
