# Scheduled Events Cleanup Implementation

## Problem
Scheduled events were accumulating in the database indefinitely with no automatic cleanup:
- **Backend**: `GetScheduledEventsHandler` returned ALL events with no date filtering
- **Frontend**: Only filtered client-side to hide events older than 1 day
- **Result**: Database grew with old events indefinitely

## Solution Implemented

### 1. Backend Event Filtering (7-Day Window)
**File**: `backend/internal/handlers/scheduled_events.go`
- Modified `GetScheduledEventsHandler` to exclude events older than 7 days
- Backend now returns: `start_time >= (now - 7 days)`
- This provides a reasonable window to view recent past events

```go
// Before: Returned ALL events
DB.Where("room_id = ?", roomID).Find(&events)

// After: Returns events from last 7 days only
sevenDaysAgo := time.Now().Add(-7 * 24 * time.Hour)
DB.Where("room_id = ? AND start_time >= ?", roomID, sevenDaysAgo).Find(&events)
```

### 2. Automatic Cleanup Scheduler (30-Day Purge)
**File**: `backend/internal/utils/event_cleanup_scheduler.go` (NEW)

Created a background job that:
- Runs every 24 hours
- Permanently deletes events older than 30 days from database
- Executes on server startup + every 24 hours thereafter
- Logs cleanup activity for monitoring

```go
func StartEventCleanupScheduler(db *gorm.DB) {
    // Delete events older than 30 days
    thirtyDaysAgo := time.Now().Add(-30 * 24 * time.Hour)
    db.Where("start_time < ?", thirtyDaysAgo).Delete(&ScheduledEvent{})
}
```

### 3. Scheduler Initialization
**File**: `backend/cmd/server/main.go`
- Added cleanup scheduler initialization on server startup
- Positioned after early bird scheduler for consistency

```go
// Start the scheduler to auto-delete old scheduled events (older than 30 days)
utils.StartEventCleanupScheduler(DB)
log.Println("✅ Event cleanup scheduler initialized")
```

### 4. Frontend Simplification
**File**: `frontend/src/components/ScheduleEventModal.jsx`
- Removed client-side filtering (no longer needed)
- Now trusts backend to return only relevant events

```javascript
// Before: Client-side filtering
const upcomingEvents = events.filter(event => diffMins > -1440);

// After: Use all backend events
const upcomingEvents = events;
```

## Data Retention Policy

| Time Range | Behavior |
|------------|----------|
| **Future events** | Fully visible and editable |
| **0-7 days past** | Visible in UI (for recent history) |
| **7-30 days past** | Hidden from UI but kept in database |
| **30+ days past** | Permanently deleted by cleanup scheduler |

## Benefits

1. **Database Efficiency**: Automatic purging prevents unbounded growth
2. **Performance**: Queries are faster with fewer old records
3. **User Experience**: Recent past events still visible for reference
4. **Maintenance-Free**: Runs automatically without manual intervention
5. **Logging**: Cleanup activity is logged for monitoring

## Monitoring

Check server logs for cleanup activity:
```
🧹 [EventCleanup] Running cleanup job...
✅ [EventCleanup] Deleted 15 old event(s) (older than 30 days)
✨ [EventCleanup] No old events to delete - database is clean
```

## Technical Details

- **Scheduler Pattern**: Uses Go ticker for periodic execution
- **Database**: GORM soft-delete NOT used (hard delete for cleanup)
- **Timezone**: All times in UTC (consistent with event creation)
- **Error Handling**: Logs errors but doesn't crash server
- **Initial Run**: Executes immediately on startup before starting ticker

## Future Enhancements (Optional)

1. Add admin dashboard to view cleanup statistics
2. Make retention periods configurable via environment variables
3. Add metrics/analytics for cleaned events
4. Archive events to cold storage before deletion
5. Send weekly digest of upcoming events to room members
