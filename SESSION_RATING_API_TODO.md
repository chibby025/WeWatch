# Session Rating API - Implementation TODO

## ✅ COMPLETED
- Frontend: SessionRatingModal component created
- Frontend: RoomPageNew shows rating modal on `session_ended` for paid sessions
- Backend: `session_ended` WebSocket message includes rating modal data:
  - `was_paid_session`: boolean
  - `session_title`: string
  - `host_id`: uint
  - `host_name`: string
  - `watch_type`: string

## 🔨 PENDING: Backend API Endpoint

### POST `/api/sessions/:id/ratings`

**Location**: `backend/internal/handlers/sessions.go` (or create new `ratings.go`)

**Request Body**:
```json
{
  "rating": 5,           // 1-5 stars (required)
  "review": "Amazing!",  // Optional text review (max 500 chars)
  "host_id": 123         // Host user ID (for foreign key)
}
```

**Implementation Steps**:

1. **Extract authenticated user ID** from JWT token
2. **Validate inputs**:
   - Rating must be 1-5
   - Review must be ≤500 characters
   - Session must exist
   - User must have been a member of this session (check `watch_session_members`)
   - User can only rate once per session (UNIQUE constraint will enforce this)

3. **Insert rating into database**:
```go
rating := models.SessionRating{
    SessionID: sessionID,
    UserID:    authenticatedUserID,
    HostID:    req.HostID,
    Rating:    req.Rating,
    Review:    req.Review, // Optional
}
if err := DB.Create(&rating).Error; err != nil {
    // Handle duplicate rating error (UNIQUE constraint violation)
    if strings.Contains(err.Error(), "duplicate") {
        c.JSON(http.StatusConflict, gin.H{"error": "You have already rated this session"})
        return
    }
    c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save rating"})
    return
}
```

4. **Calculate updated average rating**:
```go
var avgRating float64
DB.Model(&models.SessionRating{}).
    Where("host_id = ?", req.HostID).
    Select("AVG(rating)").
    Scan(&avgRating)
```

5. **Return success response**:
```json
{
  "message": "Rating submitted successfully",
  "average_rating": 4.8,
  "total_ratings": 42
}
```

**Error Responses**:
- `400 Bad Request`: Invalid rating value or review too long
- `401 Unauthorized`: User not authenticated
- `403 Forbidden`: User was not a member of this session
- `404 Not Found`: Session doesn't exist
- `409 Conflict`: User already rated this session
- `500 Internal Server Error`: Database error

## 🔨 PENDING: Display Ratings API

### GET `/api/users/:id/ratings` (Creator Profile)

**Response**:
```json
{
  "user_id": 123,
  "username": "comedy_creator",
  "total_ratings": 42,
  "average_rating": 4.8,
  "five_star_count": 30,
  "four_star_count": 10,
  "three_star_count": 2,
  "recent_reviews": [
    {
      "rating": 5,
      "review": "Hilarious show!",
      "session_title": "Stand-Up Comedy Night",
      "created_at": "2026-02-10T20:00:00Z"
    }
  ]
}
```

**Implementation**: Query `host_ratings` view created in migration

## 📊 Database Schema (Already Created)

Tables already exist from migration `add_content_declarations_ratings.sql`:

- ✅ `content_declarations` - Legal audit trail
- ✅ `session_ratings` - User ratings with UNIQUE constraint
- ✅ `host_ratings` VIEW - Aggregated creator ratings
- ✅ `session_stats` VIEW - Session performance metrics

## 🧪 Testing Flow

1. **Start a paid 3D cinema session** (ticketing_enabled = true)
2. **Host ends session** → Backend sends `session_ended` with rating data
3. **Frontend shows SessionRatingModal** in RoomPageNew
4. **User submits rating** → Frontend calls `POST /api/sessions/:id/ratings`
5. **Backend saves rating** to database
6. **Creator profile** shows updated average rating

## 🎯 Next Steps

1. Implement `POST /api/sessions/:id/ratings` endpoint
2. Test rating submission flow end-to-end
3. Add GET endpoint for displaying ratings on creator profiles
4. Add "Top Rated Creators" section to discovery page
5. Consider adding rating badges ("⭐ 4.8+ Host")

## 💡 Future Enhancements

- **Report Review**: Allow flagging inappropriate reviews
- **Host Reply**: Let hosts respond to reviews
- **Helpful Votes**: Users can mark reviews as helpful
- **Verified Attendance**: Badge for users who actually attended
- **Rating Breakdown**: Show distribution (30% 5-star, 20% 4-star, etc.)
