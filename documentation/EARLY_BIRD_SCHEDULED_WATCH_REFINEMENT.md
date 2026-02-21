# Early Bird Pricing for Scheduled Watches - Refined Implementation

## Overview
Refined implementation of early bird pricing that **automatically ends 1 hour before scheduled watch time**.

## Key Design Decision

### Original Problem
- Early bird end time wasn't stored in database
- No automatic deactivation mechanism
- Would require manual management

### Refined Solution
✅ **Use scheduled watch time as the anchor**
- When host schedules a paid watch with early bird enabled
- Early bird pricing is active **from creation until 1 hour before scheduled start time**
- System automatically deactivates early bird at the right moment
- Calendar shows early bird end time clearly

## Architecture

### Database Schema Updates

#### Migration: `016_add_early_bird_to_scheduled_events.sql`
```sql
-- Add early bird fields to scheduled_events table
ALTER TABLE scheduled_events
ADD COLUMN early_bird_enabled BOOLEAN DEFAULT false,
ADD COLUMN early_bird_price_tokens INTEGER DEFAULT 0,
ADD COLUMN early_bird_price_amount DECIMAL(10,2) DEFAULT 0,
ADD COLUMN early_bird_active BOOLEAN DEFAULT true;

-- Add index for scheduled job queries
CREATE INDEX idx_scheduled_events_early_bird_active 
ON scheduled_events(early_bird_enabled, early_bird_active, start_time);
```

#### Updated Model: `scheduled_event.go`
```go
type ScheduledEvent struct {
	gorm.Model
	RoomID          uint       `gorm:"not null;index" json:"room_id"`
	MediaItemID     *uint      `gorm:"index" json:"media_item_id"`
	WatchType       string     `gorm:"type:varchar(50);not null" json:"watch_type"`
	MediaFilePath   string     `gorm:"type:text" json:"media_file_path"`
	StartTime       time.Time  `gorm:"not null;index" json:"start_time"`
	Title           string     `gorm:"type:varchar(255)" json:"title"`
	Description     string     `gorm:"type:text" json:"description"`
	HostUserID      uint       `gorm:"not null" json:"host_user_id"`
	
	// Payment/Ticketing fields
	IsPaid                bool    `gorm:"default:false" json:"is_paid"`
	TicketPriceTokens     int     `gorm:"default:0" json:"ticket_price_tokens"`
	TicketPriceCurrency   string  `gorm:"type:varchar(10)" json:"ticket_price_currency"`
	TicketPriceAmount     float64 `gorm:"type:decimal(10,2);default:0" json:"ticket_price_amount"`
	
	// Early Bird fields (NEW)
	EarlyBirdEnabled      bool    `gorm:"default:false" json:"early_bird_enabled"`
	EarlyBirdPriceTokens  int     `gorm:"default:0" json:"early_bird_price_tokens"`
	EarlyBirdPriceAmount  float64 `gorm:"type:decimal(10,2);default:0" json:"early_bird_price_amount"`
	EarlyBirdActive       bool    `gorm:"default:true" json:"early_bird_active"`
}
```

### Backend Handler Updates

#### `scheduled_events.go` - Create Handler
```go
type CreateScheduledEventInput struct {
	WatchType       string  `json:"watch_type" binding:"required"`
	MediaFilePath   string  `json:"media_file_path"`
	StartTime       string  `json:"start_time" binding:"required"`
	Title           string  `json:"title" binding:"required"`
	Description     string  `json:"description"`
	
	// Ticketing fields
	IsPaid                bool    `json:"is_paid"`
	TicketPriceTokens     int     `json:"ticket_price_tokens"`
	TicketPriceCurrency   string  `json:"ticket_price_currency"`
	TicketPriceAmount     float64 `json:"ticket_price_amount"`
	
	// Early Bird fields (NEW)
	EarlyBirdEnabled      bool    `json:"early_bird_enabled"`
	EarlyBirdPriceTokens  int     `json:"early_bird_price_tokens"`
	EarlyBirdPriceAmount  float64 `json:"early_bird_price_amount"`
}

func CreateScheduledEventHandler(c *gin.Context) {
	// ... existing code ...
	
	// Validation for early bird
	if input.EarlyBirdEnabled {
		if !input.IsPaid {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Early bird pricing requires paid event"})
			return
		}
		if input.EarlyBirdPriceTokens <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Early bird price must be greater than 0"})
			return
		}
		if input.EarlyBirdPriceTokens >= input.TicketPriceTokens {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Early bird price must be less than regular price"})
			return
		}
	}
	
	// Create event
	event := models.ScheduledEvent{
		RoomID:       uint(roomID),
		WatchType:    input.WatchType,
		StartTime:    startTime,
		Title:        input.Title,
		Description:  input.Description,
		HostUserID:   userID,
		IsPaid:       input.IsPaid,
		TicketPriceTokens:    input.TicketPriceTokens,
		TicketPriceCurrency:  input.TicketPriceCurrency,
		TicketPriceAmount:    input.TicketPriceAmount,
		EarlyBirdEnabled:     input.EarlyBirdEnabled,
		EarlyBirdPriceTokens: input.EarlyBirdPriceTokens,
		EarlyBirdPriceAmount: input.EarlyBirdPriceAmount,
		EarlyBirdActive:      input.EarlyBirdEnabled, // Active by default
	}
	
	// Save to database
	if err := DB.Create(&event).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create event"})
		return
	}
	
	// Log early bird info
	if event.EarlyBirdEnabled {
		earlyBirdEndTime := event.StartTime.Add(-1 * time.Hour)
		log.Printf("✅ Early bird pricing enabled for event %d", event.ID)
		log.Printf("   Regular Price: %d tokens ($%.2f %s)", 
			event.TicketPriceTokens, event.TicketPriceAmount, event.TicketPriceCurrency)
		log.Printf("   Early Bird Price: %d tokens ($%.2f %s)", 
			event.EarlyBirdPriceTokens, event.EarlyBirdPriceAmount, event.TicketPriceCurrency)
		log.Printf("   Early bird ends: %s (1 hour before event)", earlyBirdEndTime.Format(time.RFC3339))
	}
	
	c.JSON(http.StatusCreated, gin.H{
		"message": "Scheduled event created successfully",
		"event":   event,
	})
}
```

### Scheduled Job: Auto-Deactivate Early Bird

#### New File: `backend/internal/utils/early_bird_scheduler.go`
```go
package utils

import (
	"log"
	"time"
	"gorm.io/gorm"
	"wewatch/internal/models"
)

// StartEarlyBirdScheduler starts a background job that deactivates early bird pricing
// 1 hour before scheduled events start
func StartEarlyBirdScheduler(db *gorm.DB) {
	log.Println("🕐 Starting Early Bird Scheduler...")
	
	ticker := time.NewTicker(1 * time.Minute) // Check every minute
	go func() {
		for range ticker.C {
			deactivateExpiredEarlyBird(db)
		}
	}()
}

func deactivateExpiredEarlyBird(db *gorm.DB) {
	now := time.Now()
	oneHourFromNow := now.Add(1 * time.Hour)
	
	// Find events where:
	// 1. Early bird is enabled
	// 2. Early bird is still active
	// 3. Start time is within the next hour (meaning early bird should end now)
	var events []models.ScheduledEvent
	err := db.Where("early_bird_enabled = ? AND early_bird_active = ? AND start_time <= ? AND start_time > ?",
		true, true, oneHourFromNow, now).Find(&events).Error
	
	if err != nil {
		log.Printf("❌ Error querying early bird events: %v", err)
		return
	}
	
	if len(events) == 0 {
		return // No events to process
	}
	
	log.Printf("🎟️ Processing %d events with expiring early bird pricing", len(events))
	
	for _, event := range events {
		// Deactivate early bird
		if err := db.Model(&event).Update("early_bird_active", false).Error; err != nil {
			log.Printf("❌ Failed to deactivate early bird for event %d: %v", event.ID, err)
			continue
		}
		
		log.Printf("✅ Early bird deactivated for event %d: '%s'", event.ID, event.Title)
		log.Printf("   Event starts at: %s", event.StartTime.Format(time.RFC3339))
		log.Printf("   Price reverted to regular: %d tokens", event.TicketPriceTokens)
		
		// TODO: Send WebSocket notification to room
		// hub.BroadcastToRoom(event.RoomID, OutgoingMessage{
		//     Data: json.Marshal(map[string]interface{}{
		//         "type": "early_bird_ended",
		//         "event_id": event.ID,
		//         "event_title": event.Title,
		//     }),
		// })
	}
}
```

#### Update `main.go` to start scheduler
```go
func main() {
	// ... existing database connection ...
	
	// Start early bird scheduler
	utils.StartEarlyBirdScheduler(handlers.DB)
	
	// ... rest of initialization ...
}
```

## Frontend Updates

### 1. Schedule Event Modal - Add Early Bird Option

#### `ScheduleEventModal.jsx`
```jsx
const ScheduleEventModal = ({ isOpen, onClose, onCreate, eventToEdit }) => {
  const [isPaid, setIsPaid] = useState(false);
  const [currency, setCurrency] = useState('USD');
  const [priceAmount, setPriceAmount] = useState('');
  const [priceTokens, setPriceTokens] = useState(0);
  
  // Early bird state
  const [earlyBirdEnabled, setEarlyBirdEnabled] = useState(false);
  const [earlyBirdAmount, setEarlyBirdAmount] = useState('');
  const [earlyBirdTokens, setEarlyBirdTokens] = useState(0);
  const [earlyBirdDiscount, setEarlyBirdDiscount] = useState(20); // Default 20% off
  
  // Calculate early bird end time (1 hour before event)
  const earlyBirdEndTime = startTime 
    ? new Date(new Date(startTime).getTime() - 60 * 60 * 1000)
    : null;
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const eventData = {
      watch_type: watchType,
      start_time: new Date(startTime).toISOString(),
      title,
      description,
      is_paid: isPaid,
      ticket_price_tokens: priceTokens,
      ticket_price_currency: currency,
      ticket_price_amount: parseFloat(priceAmount),
      early_bird_enabled: earlyBirdEnabled,
      early_bird_price_tokens: earlyBirdTokens,
      early_bird_price_amount: parseFloat(earlyBirdAmount),
    };
    
    await onCreate(eventData);
  };
  
  return (
    <div className="modal">
      {/* ... existing fields ... */}
      
      {/* Paid/Free Toggle */}
      <div className="mb-4">
        <label className="flex items-center space-x-2">
          <input
            type="checkbox"
            checked={isPaid}
            onChange={(e) => setIsPaid(e.target.checked)}
          />
          <span>This is a paid event</span>
        </label>
      </div>
      
      {/* Pricing Section */}
      {isPaid && (
        <>
          <div className="mb-4">
            <label className="block mb-2">Currency</label>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="USD">USD ($)</option>
              <option value="NGN">NGN (₦)</option>
              <option value="GHS">GHS (₵)</option>
              <option value="KES">KES (KSh)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
            </select>
          </div>
          
          <div className="mb-4">
            <label className="block mb-2">Regular Ticket Price</label>
            <input
              type="number"
              value={priceAmount}
              onChange={(e) => {
                setPriceAmount(e.target.value);
                const tokens = convertFiatToTokens(parseFloat(e.target.value), currency);
                setPriceTokens(tokens);
              }}
              placeholder="0.00"
            />
            <p className="text-sm text-gray-500 mt-1">= {priceTokens} tokens</p>
          </div>
          
          {/* Early Bird Toggle */}
          <div className="mb-4">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={earlyBirdEnabled}
                onChange={(e) => setEarlyBirdEnabled(e.target.checked)}
              />
              <span>Enable Early Bird Pricing</span>
            </label>
          </div>
          
          {/* Early Bird Details */}
          {earlyBirdEnabled && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
              <h4 className="font-semibold mb-2">🎟️ Early Bird Promotion</h4>
              
              <div className="mb-3">
                <label className="block mb-2">Discount Percentage</label>
                <input
                  type="range"
                  min="5"
                  max="50"
                  step="5"
                  value={earlyBirdDiscount}
                  onChange={(e) => {
                    const discount = parseInt(e.target.value);
                    setEarlyBirdDiscount(discount);
                    const discountedAmount = priceAmount * (1 - discount / 100);
                    setEarlyBirdAmount(discountedAmount.toFixed(2));
                    setEarlyBirdTokens(convertFiatToTokens(discountedAmount, currency));
                  }}
                  className="w-full"
                />
                <p className="text-sm text-center mt-1">{earlyBirdDiscount}% OFF</p>
              </div>
              
              <div className="bg-white rounded p-3 mb-3">
                <p className="text-sm mb-1">Early Bird Price:</p>
                <p className="text-2xl font-bold text-green-600">
                  {getCurrencySymbol(currency)}{earlyBirdAmount}
                </p>
                <p className="text-sm text-gray-500">{earlyBirdTokens} tokens</p>
              </div>
              
              {earlyBirdEndTime && (
                <div className="text-sm text-gray-600">
                  <p>⏰ Early bird ends: <strong>{earlyBirdEndTime.toLocaleString()}</strong></p>
                  <p className="text-xs mt-1">(1 hour before event starts)</p>
                </div>
              )}
            </div>
          )}
        </>
      )}
      
      {/* ... rest of form ... */}
    </div>
  );
};
```

### 2. Scheduled Events Display - Show Early Bird Info

#### `Sidebar.jsx` - Enhanced Event Card
```jsx
const EventCard = ({ event, isHost, onEdit, onDelete, onJoin, onAddToCalendar }) => {
  const now = new Date();
  const eventTime = new Date(event.start_time);
  const earlyBirdEndTime = new Date(eventTime.getTime() - 60 * 60 * 1000);
  const isEarlyBirdActive = event.early_bird_enabled && event.early_bird_active;
  
  return (
    <div className="bg-white rounded-lg shadow-md p-4 mb-3">
      <h3 className="font-semibold text-lg mb-2">{event.title}</h3>
      
      {/* Event Time */}
      <div className="flex items-center text-sm text-gray-600 mb-2">
        <CalendarIcon className="w-4 h-4 mr-1" />
        <span>{eventTime.toLocaleString()}</span>
      </div>
      
      {/* Pricing Info */}
      {event.is_paid && (
        <div className="border-t border-gray-200 pt-2 mt-2">
          {isEarlyBirdActive ? (
            <div className="bg-yellow-50 border border-yellow-300 rounded p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-yellow-800 uppercase">
                  🎟️ Early Bird Active
                </span>
                <span className="text-xs text-yellow-700">
                  Ends {earlyBirdEndTime.toLocaleTimeString()}
                </span>
              </div>
              
              <div className="flex items-baseline space-x-2">
                <span className="text-2xl font-bold text-green-600">
                  {getCurrencySymbol(event.ticket_price_currency)}
                  {event.early_bird_price_amount}
                </span>
                <span className="text-sm line-through text-gray-500">
                  {getCurrencySymbol(event.ticket_price_currency)}
                  {event.ticket_price_amount}
                </span>
              </div>
              
              <p className="text-xs text-gray-600 mt-1">
                {event.early_bird_price_tokens} tokens (save {event.ticket_price_tokens - event.early_bird_price_tokens} tokens!)
              </p>
            </div>
          ) : event.early_bird_enabled && !event.early_bird_active ? (
            <div className="bg-gray-50 rounded p-3">
              <div className="text-xs text-gray-500 mb-1">
                ⏰ Early bird ended
              </div>
              <div className="flex items-baseline space-x-2">
                <span className="text-xl font-bold">
                  {getCurrencySymbol(event.ticket_price_currency)}
                  {event.ticket_price_amount}
                </span>
              </div>
              <p className="text-xs text-gray-600 mt-1">
                {event.ticket_price_tokens} tokens
              </p>
            </div>
          ) : (
            <div className="flex items-baseline space-x-2">
              <span className="text-xl font-bold">
                {getCurrencySymbol(event.ticket_price_currency)}
                {event.ticket_price_amount}
              </span>
              <span className="text-sm text-gray-500">
                ({event.ticket_price_tokens} tokens)
              </span>
            </div>
          )}
        </div>
      )}
      
      {/* Action Buttons */}
      <div className="mt-3 flex space-x-2">
        <button onClick={() => onJoin(event.ID)} className="flex-1 bg-blue-500 text-white px-3 py-2 rounded">
          {isEarlyBirdActive ? '🎟️ Get Early Bird Ticket' : 'Buy Ticket'}
        </button>
        {isHost && (
          <>
            <button onClick={() => onEdit(event.ID)}>
              <PencilIcon className="w-5 h-5" />
            </button>
            <button onClick={() => onDelete(event.ID)}>
              <TrashIcon className="w-5 h-5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
};
```

### 3. WebSocket Notification for Early Bird Ending

#### Backend: Send notification when early bird expires
```go
func deactivateExpiredEarlyBird(db *gorm.DB) {
	// ... existing code ...
	
	for _, event := range events {
		// Deactivate early bird
		if err := db.Model(&event).Update("early_bird_active", false).Error; err != nil {
			log.Printf("❌ Failed to deactivate early bird for event %d: %v", event.ID, err)
			continue
		}
		
		log.Printf("✅ Early bird deactivated for event %d: '%s'", event.ID, event.Title)
		
		// Broadcast to room
		broadcastData := map[string]interface{}{
			"type": "early_bird_ended",
			"event_id": event.ID,
			"event_title": event.Title,
			"regular_price_tokens": event.TicketPriceTokens,
			"regular_price_amount": event.TicketPriceAmount,
			"currency": event.TicketPriceCurrency,
		}
		jsonData, _ := json.Marshal(broadcastData)
		hub.BroadcastToRoom(event.RoomID, OutgoingMessage{
			Data:     jsonData,
			IsBinary: false,
		}, nil)
	}
}
```

#### Frontend: Handle WebSocket message
```jsx
const handleWebSocketMessage = (message) => {
  switch (message.type) {
    case 'early_bird_ended':
      toast(`⏰ Early bird pricing ended for "${message.event_title}"`, {
        icon: '🎟️',
        duration: 5000,
      });
      // Refresh scheduled events to update UI
      setScheduledEventsKey(prev => prev + 1);
      break;
    // ... other cases ...
  }
};
```

## User Flow Example

### Host Scheduling Paid Event with Early Bird

1. **Host clicks "Schedule Event"**
2. **Fills out form:**
   - Event: "Friday Movie Night"
   - Watch Type: 3D Cinema
   - Scheduled Time: Dec 13, 2025 at 8:00 PM
   - Checks "This is a paid event"
   - Sets price: $5.00 USD (50 tokens)
   - Checks "Enable Early Bird Pricing"
   - Sets discount: 30% OFF
   - Early bird price auto-calculates: $3.50 USD (35 tokens)

3. **System shows:**
   - "Early bird ends: Dec 13, 2025 at 7:00 PM (1 hour before event)"

4. **Event created and displayed in calendar with:**
   ```
   🎟️ EARLY BIRD ACTIVE
   $3.50 USD (35 tokens) - Save 15 tokens!
   Regular price: $5.00 (50 tokens)
   Early bird ends: 7:00 PM
   Event starts: 8:00 PM
   ```

### Automatic Early Bird Deactivation

**At 7:00 PM (1 hour before event):**
1. Scheduler detects early bird should end
2. Updates `early_bird_active = false` in database
3. Sends WebSocket notification to all room members
4. UI updates automatically to show regular price
5. Toast notification: "⏰ Early bird pricing ended for 'Friday Movie Night'"

### User Purchasing Ticket

**Before 7:00 PM (Early Bird Active):**
- User sees: "$3.50 USD (35 tokens) 🎟️ EARLY BIRD"
- Clicks "Get Early Bird Ticket"
- Pays 35 tokens
- Saved 15 tokens!

**After 7:00 PM (Early Bird Ended):**
- User sees: "$5.00 USD (50 tokens)"
- Clicks "Buy Ticket"
- Pays full 50 tokens

## Benefits of This Approach

✅ **Automatic Management**
- No manual intervention needed
- Early bird ends precisely 1 hour before event

✅ **Clear Communication**
- Users see exactly when early bird ends
- Calendar displays early bird countdown
- WebSocket notifications keep everyone informed

✅ **Scalable**
- Scheduler handles unlimited events
- Efficient database queries with indexes

✅ **Host Control**
- Host sets discount percentage (5-50%)
- Can enable/disable per event
- Can edit before early bird expires

✅ **User Incentive**
- Clear savings displayed (e.g., "Save 15 tokens!")
- Creates urgency to buy early
- Better event attendance

## Implementation Order

1. ✅ Create migration `016_add_early_bird_to_scheduled_events.sql`
2. ✅ Update `scheduled_event.go` model
3. ✅ Create `early_bird_scheduler.go` utility
4. ✅ Update `scheduled_events.go` handler with validation
5. ✅ Update `main.go` to start scheduler
6. ✅ Update `ScheduleEventModal.jsx` with early bird UI
7. ✅ Update `Sidebar.jsx` event cards with pricing display
8. ✅ Add WebSocket message handling for `early_bird_ended`
9. ✅ Test end-to-end flow

## Testing Checklist

- [ ] Create paid scheduled event with early bird
- [ ] Verify early bird end time shows "1 hour before event"
- [ ] Wait for scheduler to deactivate (or manually set event time close)
- [ ] Verify `early_bird_active` becomes false
- [ ] Verify WebSocket notification sent
- [ ] Verify UI updates to show regular price
- [ ] Verify user can purchase at early bird price (when active)
- [ ] Verify user pays regular price (after early bird expires)
- [ ] Edit event and change early bird discount
- [ ] Delete event with early bird enabled

## Migration Path from Current Implementation

Since we already added early bird to watch_sessions (instant watch), we now add it to scheduled_events:

- **Instant Watch Sessions**: Early bird managed manually via `EarlyBirdActive` toggle
- **Scheduled Watch Events**: Early bird managed automatically based on `start_time - 1 hour`

Both use the same pricing UI components and token conversion logic.
