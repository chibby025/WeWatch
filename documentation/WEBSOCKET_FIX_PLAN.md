# WebSocket Seat Assignment Fix Plan

## Problem Analysis

When user logs in or refreshes:
1. Backend assigns seat to camera position ✅
2. Backend creates watch_session_member record ❌ (appears not registered)
3. Frontend spinner clears after 5s timeout ❌ (band-aid, not fix)

## Root Causes

### Issue 1: Member Registration Not Persisting
- `JoinWatchSession` creates member record BUT doesn't persist seat_id
- Seat is only stored in-memory (hub.seatingAssignments)
- On refresh, member exists but seat_id is NULL in database

### Issue 2: Incomplete Session State Broadcast
- `session_status` message doesn't include seat for newly joined user
- Frontend receives member list but no seat assignment
- User appears as "member" but not "seated"

### Issue 3: Race Condition on Reconnect
- User has existing seat in memory (hub.seatingAssignments)
- But database watch_session_members.seat_id is NULL
- Backend sends seat_assigned but member list doesn't match

## The Proper Fix

### Backend Changes (websocket.go)

#### 1. Fix JoinWatchSession - Restore Seat on Reconnect
```go
// In JoinWatchSession, after reactivating member:
if result.RowsAffected > 0 {
    log.Printf("✅ REACTIVATED existing member record for user %d (session: %s)", client.userID, sessionID)
    
    // 🔄 RESTORE SEAT: Check if user had a seat before disconnect
    var reactivatedMember models.WatchSessionMember
    if err := DB.Where("watch_session_id = ? AND user_id = ? AND is_active = true", 
        session.ID, client.userID).First(&reactivatedMember).Error; err == nil {
        
        if reactivatedMember.SeatID != nil && *reactivatedMember.SeatID > 0 {
            // User had a seat - restore it to memory and broadcast
            seatIDInt := *reactivatedMember.SeatID
            
            // For cinema: seat_id is stored as cinema seat key in DB
            // For lecture hall: seat_id is the numeric seat number
            
            if watchSession.WatchType == "3d_cinema" {
                // Restore cinema seat from database
                var assignment models.UserTheaterAssignment
                if err := DB.Where("user_id = ? AND watch_session_id = ?",
                    client.userID, session.ID).
                    Preload("Theater").First(&assignment).Error; err == nil {
                    
                    // Convert seat row/col back to seat key
                    row := int(assignment.SeatRow[0] - 'A')
                    col := assignment.SeatCol - 1
                    seatKey := fmt.Sprintf("%d-%d", row, col)
                    
                    // Restore to memory
                    h.seatingMutex.Lock()
                    if _, exists := h.seatingAssignments[client.roomID]; !exists {
                        h.seatingAssignments[client.roomID] = make(map[int]map[string]uint)
                    }
                    if _, exists := h.seatingAssignments[client.roomID][assignment.Theater.TheaterNumber]; !exists {
                        h.seatingAssignments[client.roomID][assignment.Theater.TheaterNumber] = make(map[string]uint)
                    }
                    h.seatingAssignments[client.roomID][assignment.Theater.TheaterNumber][seatKey] = client.userID
                    h.seatingMutex.Unlock()
                    
                    log.Printf("🔄 [RESTORE] User %d seat %s restored to memory (Theater %d)", 
                        client.userID, seatKey, assignment.Theater.TheaterNumber)
                    
                    // Broadcast seat_assigned immediately
                    seatMsg := WebSocketMessage{
                        Type: "seat_assigned",
                        Data: map[string]interface{}{
                            "user_id":        client.userID,
                            "seat_id":        seatKey,
                            "row":            row,
                            "col":            col,
                            "theater_number": assignment.Theater.TheaterNumber,
                        },
                    }
                    if msgBytes, err := json.Marshal(seatMsg); err == nil {
                        h.BroadcastToRoom(client.roomID, OutgoingMessage{Data: msgBytes, IsBinary: false}, nil)
                        log.Printf("📢 [RESTORE] Broadcasted seat_assigned for reconnected user %d", client.userID)
                    }
                }
            } else if watchSession.WatchType == "classroom" {
                // Restore lecture hall seat
                hallNum := 1
                if reactivatedMember.LectureHallNumber != nil {
                    hallNum = *reactivatedMember.LectureHallNumber
                }
                
                seatKey := fmt.Sprintf("%d", seatIDInt)
                
                h.seatingMutex.Lock()
                if _, exists := h.seatingAssignments[client.roomID]; !exists {
                    h.seatingAssignments[client.roomID] = make(map[int]map[string]uint)
                }
                if _, exists := h.seatingAssignments[client.roomID][hallNum]; !exists {
                    h.seatingAssignments[client.roomID][hallNum] = make(map[string]uint)
                }
                h.seatingAssignments[client.roomID][hallNum][seatKey] = client.userID
                h.seatingMutex.Unlock()
                
                log.Printf("🔄 [RESTORE] User %d seat %d restored to memory (Hall %d)", 
                    client.userID, seatIDInt, hallNum)
            }
        }
    }
}
```

#### 2. Fix request_seat - Always Persist to Database
```go
// After assigning seat in cinema mode:
// Persist to database
if err := AssignUserToTheater(client.userID, activeSession.ID, theater.ID, rowLetter, col+1); err != nil {
    log.Printf("❌ [request_seat] Failed to assign user to theater: %v", err)
} else {
    log.Printf("💾 [DB] User %d assigned to Theater %d, Seat %s-%d", 
        client.userID, theater.TheaterNumber, rowLetter, col+1)
    
    // ✅ ALSO UPDATE watch_session_members.seat_id for quick lookup
    seatIDInt := row*5 + col // Convert to unique int for cinema
    DB.Model(&models.WatchSessionMember{}).
        Where("watch_session_id = ? AND user_id = ? AND is_active = ?", 
            activeSession.ID, client.userID, true).
        Update("seat_id", seatIDInt)
}
```

### Frontend Changes (CinemaScene3DDemo.jsx)

#### 1. Remove 5-Second Timeout
```javascript
// ❌ DELETE THIS:
setTimeout(() => {
  if (!hasSeatAssigned) {
    console.warn('⏱️ [SEAT REQUEST] Timeout - forcing loading overlay off');
    setLoadingStatus(null);
    setHasSeatAssigned(true);
  }
}, 5000);
```

#### 2. Clear Loading Only When BOTH Conditions Met
```javascript
useEffect(() => {
  // Clear loading only when user is both a member AND has a seat
  if (loadingStatus === 'finding_seat' && 
      currentUser?.id && 
      members.some(m => m.user_id === currentUser.id) && // ✅ Is member
      userSeats[currentUser.id]) {                       // ✅ Has seat
    console.log('✅ [Loading] User is member with seat - clearing overlay');
    setLoadingStatus(null);
    setHasSeatAssigned(true);
  }
}, [loadingStatus, currentUser?.id, members, userSeats]);
```

#### 3. Add Debug Logging
```javascript
useEffect(() => {
  console.log('🔍 [STATE CHECK]', {
    loadingStatus,
    currentUserId: currentUser?.id,
    isMember: members.some(m => m.user_id === currentUser?.id),
    hasSeat: !!userSeats[currentUser?.id],
    memberCount: members.length,
    seatCount: Object.keys(userSeats).length
  });
}, [loadingStatus, currentUser, members, userSeats]);
```

## Testing Checklist

- [ ] Fresh login: User sees member list + gets seat
- [ ] Page refresh during session: Seat restored, still in member list
- [ ] Multiple refreshes: Consistent state
- [ ] Other users see new member + seat immediately
- [ ] No 5s delay on loading spinner
- [ ] Backend logs show seat restoration

## Migration Steps

1. Apply backend changes to `JoinWatchSession`
2. Apply backend changes to `request_seat` handler
3. Test backend seat restoration (check logs)
4. Remove frontend timeout code
5. Add frontend dual-condition check
6. Test full flow: login → refresh → check members

