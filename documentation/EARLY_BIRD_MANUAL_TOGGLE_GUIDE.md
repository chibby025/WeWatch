# Early Bird Manual Toggle - Frontend Guide

## Overview

In addition to automatic early bird deactivation (1 hour before event), hosts can now **manually toggle** early bird pricing on/off at any time.

## New API Endpoint

```
PATCH /api/scheduled-events/:id/early-bird
```

**Request:**
```json
{
  "early_bird_active": false  // or true to re-activate
}
```

**Response:**
```json
{
  "message": "Early bird pricing deactivated successfully",
  "event": { /* updated event object */ },
  "early_bird_active": false,
  "status": "Early bird pricing ended - regular pricing now in effect"
}
```

## Frontend Implementation

### 1. Add API Function

**File:** `frontend/src/services/api.js`

```javascript
// Toggle early bird pricing for a scheduled event
export const toggleEarlyBird = async (eventId, isActive) => {
  try {
    const response = await apiClient.patch(
      `/api/scheduled-events/${eventId}/early-bird`,
      { early_bird_active: isActive }
    );
    return response.data;
  } catch (error) {
    throw error;
  }
};
```

---

### 2. Add Toggle Button to Event Card

**File:** `frontend/src/components/Sidebar.jsx`

Add a toggle switch for hosts to control early bird pricing:

```jsx
import { toggleEarlyBird } from '../services/api';

const EventCard = ({ 
  event, 
  isHost, 
  onEdit, 
  onDelete, 
  onJoin, 
  onAddToCalendar,
  onRefresh  // NEW: callback to refresh events list
}) => {
  const [isToggling, setIsToggling] = useState(false);
  const now = new Date();
  const eventTime = new Date(event.start_time);
  const earlyBirdEndTime = new Date(eventTime.getTime() - 60 * 60 * 1000);
  const isEarlyBirdActive = event.early_bird_enabled && event.early_bird_active;
  const canToggleEarlyBird = event.early_bird_enabled && now < earlyBirdEndTime;

  const handleToggleEarlyBird = async () => {
    if (!window.confirm(
      isEarlyBirdActive 
        ? 'End early bird pricing now? Regular pricing will apply to new purchases.'
        : 'Re-activate early bird pricing? Discounted tickets will be available again.'
    )) return;

    setIsToggling(true);
    try {
      await toggleEarlyBird(event.ID, !isEarlyBirdActive);
      toast.success(
        isEarlyBirdActive 
          ? '✅ Early bird pricing ended' 
          : '✅ Early bird pricing re-activated'
      );
      if (onRefresh) onRefresh(); // Refresh the events list
    } catch (err) {
      console.error('Failed to toggle early bird:', err);
      const errorMsg = err.response?.data?.error || 'Failed to update early bird pricing';
      toast.error(errorMsg);
    } finally {
      setIsToggling(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-4 mb-3">
      {/* ... existing event card content ... */}

      {/* HOST CONTROLS - Early Bird Toggle */}
      {isHost && event.early_bird_enabled && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-700">Early Bird Control</p>
              <p className="text-xs text-gray-500">
                {canToggleEarlyBird 
                  ? 'Manually toggle early bird pricing'
                  : 'Auto-deactivation window reached (< 1hr to event)'}
              </p>
            </div>
            
            {canToggleEarlyBird && (
              <button
                onClick={handleToggleEarlyBird}
                disabled={isToggling}
                className={`px-4 py-2 rounded-lg font-medium transition-all ${
                  isEarlyBirdActive
                    ? 'bg-red-100 text-red-700 hover:bg-red-200'
                    : 'bg-green-100 text-green-700 hover:bg-green-200'
                } ${isToggling ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {isToggling ? (
                  <span className="flex items-center">
                    <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Processing...
                  </span>
                ) : isEarlyBirdActive ? (
                  '🛑 End Early Bird'
                ) : (
                  '✅ Activate Early Bird'
                )}
              </button>
            )}
          </div>

          {/* Status Indicator */}
          <div className={`mt-2 px-3 py-2 rounded text-sm ${
            isEarlyBirdActive
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-gray-50 text-gray-800 border border-gray-200'
          }`}>
            {isEarlyBirdActive ? (
              <span className="flex items-center">
                <span className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse" />
                Early bird is ACTIVE - discounted tickets available
              </span>
            ) : (
              <span className="flex items-center">
                <span className="w-2 h-2 bg-gray-400 rounded-full mr-2" />
                Early bird INACTIVE - regular pricing in effect
              </span>
            )}
          </div>
        </div>
      )}

      {/* ... rest of event card ... */}
    </div>
  );
};
```

---

### 3. Handle WebSocket Message

**File:** `frontend/src/components/RoomPageNew.jsx`

Add handler for the new `early_bird_toggled` WebSocket message:

```jsx
const handleWebSocketMessage = (message) => {
  if (!message || !message.type) return;

  switch (message.type) {
    // ... existing cases ...

    case 'early_bird_ended':
      // Automatic deactivation by scheduler
      toast(`⏰ Early bird pricing ended for "${message.event_title}"`, {
        icon: '🎟️',
        duration: 5000,
        style: {
          background: '#FEF3C7',
          color: '#92400E',
          border: '2px solid #F59E0B',
        },
      });
      setScheduledEventsKey(prev => prev + 1);
      fetchScheduledEvents();
      break;

    // NEW: Handle manual toggle
    case 'early_bird_toggled':
      const action = message.early_bird_active ? 'activated' : 'ended';
      const icon = message.early_bird_active ? '✅' : '🛑';
      const bgColor = message.early_bird_active ? '#D1FAE5' : '#FEE2E2';
      const textColor = message.early_bird_active ? '#065F46' : '#991B1B';
      const borderColor = message.early_bird_active ? '#10B981' : '#EF4444';
      
      toast(`${icon} Early bird ${action} for "${message.event_title}"`, {
        duration: 5000,
        style: {
          background: bgColor,
          color: textColor,
          border: `2px solid ${borderColor}`,
        },
      });
      
      // Show price info
      if (message.early_bird_active) {
        setTimeout(() => {
          toast(`💰 Discounted price: ${message.early_bird_price_tokens} tokens`, {
            icon: '🎟️',
            duration: 4000,
          });
        }, 1000);
      } else {
        setTimeout(() => {
          toast(`Regular price now: ${message.regular_price_tokens} tokens`, {
            duration: 4000,
          });
        }, 1000);
      }
      
      // Refresh scheduled events
      setScheduledEventsKey(prev => prev + 1);
      fetchScheduledEvents();
      break;

    // ... other cases ...
  }
};
```

---

### 4. Update Event Card Parent Component

**File:** `frontend/src/components/Sidebar.jsx` (Parent component rendering EventCard)

Pass the refresh callback:

```jsx
const Sidebar = ({
  scheduledEvents,
  // ... other props
}) => {
  const [refreshKey, setRefreshKey] = useState(0);

  const handleRefreshEvents = () => {
    setRefreshKey(prev => prev + 1);
    // Trigger parent refresh if needed
    if (onRefresh) onRefresh();
  };

  return (
    <>
      {/* ... sidebar content ... */}
      
      {eventsToShow.map(event => (
        <EventCard
          key={event.ID}
          event={event}
          isHost={isHost}
          onEdit={handleEditEvent}
          onDelete={handleDeleteEvent}
          onJoin={handleJoinOnSchedule}
          onAddToCalendar={handleAddToCalendar}
          onRefresh={handleRefreshEvents}  // NEW: pass refresh callback
        />
      ))}
    </>
  );
};
```

---

## UI/UX Behavior

### Early Bird Active State
```
┌─────────────────────────────────────────────────┐
│  🎟️ Friday Movie Night                          │
│  📅 Dec 13, 8:00 PM                             │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │ 🎟️ EARLY BIRD ACTIVE                     │  │
│  │ Ends 7:00 PM                              │  │
│  │                                           │  │
│  │ Early Bird: $3.50    Regular: $5.00      │  │
│  │ 35 tokens            50 tokens           │  │
│  │                                           │  │
│  │ 💰 Save 15 tokens!                        │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │ Early Bird Control                        │  │
│  │ Manually toggle early bird pricing        │  │
│  │                                           │  │
│  │  ⚫ Early bird is ACTIVE      [🛑 End]   │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
│  [🎟️ Get Early Bird Ticket]  [✏️] [🗑️]        │
└─────────────────────────────────────────────────┘
```

### Early Bird Inactive State
```
┌─────────────────────────────────────────────────┐
│  🎟️ Friday Movie Night                          │
│  📅 Dec 13, 8:00 PM                             │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │ ⏰ Early bird ended                       │  │
│  │                                           │  │
│  │ $5.00 (50 tokens)                        │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
│  ┌──────────────────────────────────────────┐  │
│  │ Early Bird Control                        │  │
│  │ Manually toggle early bird pricing        │  │
│  │                                           │  │
│  │  ⚪ Early bird INACTIVE   [✅ Activate]   │  │
│  └──────────────────────────────────────────┘  │
│                                                 │
│  [Buy Ticket]  [✏️] [🗑️]                        │
└─────────────────────────────────────────────────┘
```

### Within 1 Hour of Event (Toggle Disabled)
```
┌─────────────────────────────────────────────────┐
│  Early Bird Control                             │
│  Auto-deactivation window reached (< 1hr)       │
│                                                 │
│  ⚪ Early bird INACTIVE   [Disabled]            │
│                                                 │
│  ⚠️ Cannot toggle within 1 hour of event start  │
└─────────────────────────────────────────────────┘
```

---

## Validation & Error Handling

### Client-Side Validation

```jsx
const handleToggleEarlyBird = async () => {
  // Check if within 1 hour of event
  const oneHourBeforeEvent = new Date(event.start_time).getTime() - 60 * 60 * 1000;
  if (Date.now() >= oneHourBeforeEvent && !isEarlyBirdActive) {
    toast.error('Cannot re-activate early bird within 1 hour of event start');
    return;
  }

  // Check if event has already started
  if (Date.now() >= new Date(event.start_time).getTime()) {
    toast.error('Cannot modify early bird for events that have already started');
    return;
  }

  // Proceed with toggle...
};
```

### Server-Side Error Messages

The backend returns specific error messages:

```javascript
// Error: Early bird not enabled
{
  "error": "Early bird pricing is not enabled for this event",
  "message": "You can only toggle early bird status for events that have early bird pricing configured"
}

// Error: Event already started
{
  "error": "Cannot activate early bird for past events",
  "message": "The event has already started"
}

// Error: Within 1 hour
{
  "error": "Cannot activate early bird within 1 hour of event start",
  "message": "Early bird pricing automatically ends 1 hour before the event",
  "early_bird_end_time": "2025-12-13T19:00:00Z"
}
```

Handle these in the catch block:

```jsx
catch (err) {
  const errorData = err.response?.data;
  if (errorData?.message) {
    toast.error(errorData.message);
  } else {
    toast.error('Failed to toggle early bird pricing');
  }
}
```

---

## Use Cases

### 1. Host Wants to End Early Bird Early
**Scenario:** Host set 30% early bird discount but sold 50 tickets already. Wants to end early bird 2 hours before the auto-deactivation.

**Flow:**
1. Host opens scheduled events sidebar
2. Sees "Early bird is ACTIVE" with green indicator
3. Clicks "🛑 End Early Bird" button
4. Confirms dialog: "End early bird pricing now?"
5. Backend deactivates early bird
6. WebSocket notification sent to all room members
7. UI updates to show regular price
8. Toast: "✅ Early bird pricing ended"

### 2. Host Accidentally Ended Too Early
**Scenario:** Host clicked end button by mistake. Event is still 3 hours away.

**Flow:**
1. Host sees "Early bird INACTIVE" with gray indicator
2. Clicks "✅ Activate Early Bird" button
3. Confirms dialog: "Re-activate early bird pricing?"
4. Backend re-activates early bird
5. WebSocket notification sent
6. UI updates to show early bird price again
7. Toast: "✅ Early bird pricing re-activated"

### 3. Cannot Re-activate (Too Close to Event)
**Scenario:** Host ended early bird 2 hours early, now wants to re-activate but only 45 minutes remain.

**Flow:**
1. Host sees "✅ Activate Early Bird" button but it's disabled
2. Tooltip shows: "Cannot toggle within 1 hour of event start"
3. Status shows: "Auto-deactivation window reached"
4. Host cannot re-activate (validation prevents)

---

## Testing Checklist

- [ ] Toggle early bird off when active
- [ ] Toggle early bird on when inactive (>1hr before event)
- [ ] Verify toggle button disabled when <1hr to event
- [ ] Verify only host sees toggle controls
- [ ] Verify non-host users don't see toggle button
- [ ] Verify WebSocket notification received by all users
- [ ] Verify UI updates immediately after toggle
- [ ] Verify event card shows correct pricing after toggle
- [ ] Test confirmation dialog appears before toggle
- [ ] Test error handling when toggle fails
- [ ] Test loading state during toggle request
- [ ] Verify automatic scheduler still works alongside manual toggle
- [ ] Test re-activation blocked after event started
- [ ] Test re-activation blocked within 1 hour window

---

## Backend Logs

When toggle happens, you'll see:

**Deactivation:**
```
⏹️ [ToggleEarlyBird] Early bird MANUALLY DEACTIVATED for event 123: 'Friday Movie Night'
   Host 456 ended early bird pricing early
   Regular price now in effect: 50 tokens ($5.00 USD)
```

**Re-activation:**
```
✅ [ToggleEarlyBird] Early bird RE-ACTIVATED for event 123: 'Friday Movie Night'
   Host 456 manually enabled early bird pricing
   Early bird price: 35 tokens ($3.50 USD)
```

---

## Summary

**Two ways to control early bird:**
1. ✅ **Automatic** - Scheduler ends it 1 hour before event (always happens)
2. ✅ **Manual** - Host can toggle it on/off anytime (new feature)

**Key Rules:**
- Host can end early bird anytime
- Host can re-activate only if >1 hour before event
- Automatic deactivation happens regardless of manual state
- All changes broadcast via WebSocket
- Full validation on both frontend and backend

This gives hosts maximum flexibility while maintaining automatic safety controls! 🎉
