# Frontend Implementation Guide - Early Bird for Scheduled Watches

## Quick Start

This guide shows **exactly** what to add to the frontend to support early bird pricing for scheduled events.

## Files to Modify

### 1. ScheduleEventModal.jsx - Add Early Bird Configuration

**Location:** `frontend/src/components/ScheduleEventModal.jsx`

**What to add:** Early bird toggle, discount slider, and price preview

```jsx
// ADD THESE IMPORTS
import { useState, useEffect } from 'react';
import { convertFiatToTokens, getCurrencySymbol } from '../utils/tokenConverter';

const ScheduleEventModal = ({ isOpen, onClose, onCreate, eventToEdit }) => {
  // ... existing state ...
  const [isPaid, setIsPaid] = useState(false);
  const [currency, setCurrency] = useState('USD');
  const [priceAmount, setPriceAmount] = useState('');
  const [priceTokens, setPriceTokens] = useState(0);
  
  // ADD EARLY BIRD STATE
  const [earlyBirdEnabled, setEarlyBirdEnabled] = useState(false);
  const [earlyBirdDiscount, setEarlyBirdDiscount] = useState(20); // Default 20% off
  const [earlyBirdAmount, setEarlyBirdAmount] = useState('');
  const [earlyBirdTokens, setEarlyBirdTokens] = useState(0);

  // CALCULATE EARLY BIRD END TIME (1 hour before event)
  const earlyBirdEndTime = startTime 
    ? new Date(new Date(startTime).getTime() - 60 * 60 * 1000)
    : null;

  // UPDATE handleSubmit TO INCLUDE EARLY BIRD
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
      
      // ADD EARLY BIRD FIELDS
      early_bird_enabled: earlyBirdEnabled,
      early_bird_price_tokens: earlyBirdTokens,
      early_bird_price_amount: parseFloat(earlyBirdAmount),
    };
    
    await onCreate(eventData);
  };

  // IN THE JSX, AFTER THE REGULAR PRICING SECTION:
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
          {/* Currency Selector */}
          <div className="mb-4">
            <label className="block mb-2 font-medium">Currency</label>
            <select 
              value={currency} 
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            >
              <option value="USD">USD ($)</option>
              <option value="NGN">NGN (₦)</option>
              <option value="GHS">GHS (₵)</option>
              <option value="KES">KES (KSh)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
            </select>
          </div>

          {/* Regular Price */}
          <div className="mb-4">
            <label className="block mb-2 font-medium">Regular Ticket Price</label>
            <input
              type="number"
              step="0.01"
              value={priceAmount}
              onChange={(e) => {
                const amount = e.target.value;
                setPriceAmount(amount);
                const tokens = convertFiatToTokens(parseFloat(amount) || 0, currency);
                setPriceTokens(tokens);
                
                // Auto-update early bird if enabled
                if (earlyBirdEnabled && amount) {
                  const discounted = parseFloat(amount) * (1 - earlyBirdDiscount / 100);
                  setEarlyBirdAmount(discounted.toFixed(2));
                  setEarlyBirdTokens(convertFiatToTokens(discounted, currency));
                }
              }}
              placeholder="0.00"
              className="w-full px-3 py-2 border rounded-lg"
            />
            <p className="text-sm text-gray-500 mt-1">= {priceTokens} tokens</p>
          </div>

          {/* ✨ EARLY BIRD SECTION - ADD THIS ✨ */}
          <div className="mb-4">
            <label className="flex items-center space-x-2 mb-3">
              <input
                type="checkbox"
                checked={earlyBirdEnabled}
                onChange={(e) => {
                  const enabled = e.target.checked;
                  setEarlyBirdEnabled(enabled);
                  if (enabled && priceAmount) {
                    // Calculate initial early bird price
                    const discounted = parseFloat(priceAmount) * (1 - earlyBirdDiscount / 100);
                    setEarlyBirdAmount(discounted.toFixed(2));
                    setEarlyBirdTokens(convertFiatToTokens(discounted, currency));
                  }
                }}
              />
              <span className="font-medium">Enable Early Bird Pricing 🎟️</span>
            </label>

            {/* Early Bird Configuration */}
            {earlyBirdEnabled && (
              <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border-2 border-yellow-300 rounded-lg p-4">
                <h4 className="font-semibold text-gray-800 mb-3 flex items-center">
                  <span className="text-2xl mr-2">🎟️</span>
                  Early Bird Promotion
                </h4>

                {/* Discount Slider */}
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-2">
                    Discount Percentage
                  </label>
                  <input
                    type="range"
                    min="5"
                    max="50"
                    step="5"
                    value={earlyBirdDiscount}
                    onChange={(e) => {
                      const discount = parseInt(e.target.value);
                      setEarlyBirdDiscount(discount);
                      if (priceAmount) {
                        const discounted = parseFloat(priceAmount) * (1 - discount / 100);
                        setEarlyBirdAmount(discounted.toFixed(2));
                        setEarlyBirdTokens(convertFiatToTokens(discounted, currency));
                      }
                    }}
                    className="w-full h-2 bg-yellow-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-gray-600 mt-1">
                    <span>5%</span>
                    <span className="font-bold text-lg text-orange-600">{earlyBirdDiscount}% OFF</span>
                    <span>50%</span>
                  </div>
                </div>

                {/* Price Comparison */}
                <div className="bg-white rounded-lg p-4 mb-3 shadow-sm">
                  <div className="flex items-baseline justify-between mb-2">
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Early Bird Price</p>
                      <p className="text-3xl font-bold text-green-600">
                        {getCurrencySymbol(currency)}{earlyBirdAmount}
                      </p>
                      <p className="text-sm text-gray-600">{earlyBirdTokens} tokens</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500 mb-1">Regular Price</p>
                      <p className="text-xl font-medium text-gray-400 line-through">
                        {getCurrencySymbol(currency)}{priceAmount}
                      </p>
                      <p className="text-sm text-gray-500">{priceTokens} tokens</p>
                    </div>
                  </div>
                  <div className="bg-green-100 text-green-800 text-sm font-medium px-3 py-2 rounded text-center">
                    💰 Save {priceTokens - earlyBirdTokens} tokens!
                  </div>
                </div>

                {/* Early Bird End Time Info */}
                {earlyBirdEndTime && (
                  <div className="bg-orange-100 border border-orange-300 rounded-lg p-3 text-sm">
                    <p className="font-medium text-orange-900 mb-1">
                      ⏰ Early bird pricing ends automatically:
                    </p>
                    <p className="text-orange-800 font-semibold">
                      {earlyBirdEndTime.toLocaleString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                    <p className="text-xs text-orange-700 mt-1">
                      (1 hour before event starts)
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
          {/* ✨ END EARLY BIRD SECTION ✨ */}
        </>
      )}
      
      {/* ... rest of form ... */}
    </div>
  );
};
```

---

### 2. Sidebar.jsx - Update Event Card Display

**Location:** `frontend/src/components/Sidebar.jsx`

**What to add:** Show early bird status and countdown

```jsx
const EventCard = ({ 
  event, 
  isHost, 
  onEdit, 
  onDelete, 
  onJoin, 
  onAddToCalendar 
}) => {
  const now = new Date();
  const eventTime = new Date(event.start_time);
  const earlyBirdEndTime = new Date(eventTime.getTime() - 60 * 60 * 1000);
  const isEarlyBirdActive = event.early_bird_enabled && event.early_bird_active;
  
  // Helper function for currency symbol
  const getCurrencySymbol = (currency) => {
    const symbols = { USD: '$', NGN: '₦', GHS: '₵', KES: 'KSh', EUR: '€', GBP: '£' };
    return symbols[currency] || currency;
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-4 mb-3 hover:shadow-lg transition-shadow">
      {/* Event Title */}
      <h3 className="font-semibold text-lg text-gray-800 mb-2">{event.title}</h3>
      
      {/* Event Time */}
      <div className="flex items-center text-sm text-gray-600 mb-3">
        <CalendarIcon className="w-4 h-4 mr-2" />
        <span>{eventTime.toLocaleString()}</span>
      </div>

      {/* Pricing Section */}
      {event.is_paid && (
        <div className="border-t border-gray-200 pt-3 mt-3">
          {/* EARLY BIRD ACTIVE */}
          {isEarlyBirdActive ? (
            <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border-2 border-yellow-400 rounded-lg p-4">
              {/* Badge */}
              <div className="flex items-center justify-between mb-3">
                <span className="bg-yellow-500 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide">
                  🎟️ Early Bird Active
                </span>
                <span className="text-xs text-orange-700 font-medium">
                  Ends {earlyBirdEndTime.toLocaleTimeString()}
                </span>
              </div>

              {/* Price Display */}
              <div className="flex items-baseline justify-between mb-2">
                <div>
                  <p className="text-xs text-gray-600 mb-1">Early Bird Price</p>
                  <p className="text-3xl font-bold text-green-600">
                    {getCurrencySymbol(event.ticket_price_currency)}
                    {event.early_bird_price_amount}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-500">Regular Price</p>
                  <p className="text-xl text-gray-400 line-through">
                    {getCurrencySymbol(event.ticket_price_currency)}
                    {event.ticket_price_amount}
                  </p>
                </div>
              </div>

              {/* Token Info */}
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-700">
                  {event.early_bird_price_tokens} tokens
                </span>
                <span className="bg-green-100 text-green-800 font-medium px-2 py-1 rounded">
                  💰 Save {event.ticket_price_tokens - event.early_bird_price_tokens} tokens!
                </span>
              </div>
            </div>
          ) 
          
          {/* EARLY BIRD ENDED (but was enabled) */}
          : event.early_bird_enabled && !event.early_bird_active ? (
            <div className="bg-gray-50 border border-gray-300 rounded-lg p-4">
              <div className="text-xs text-gray-500 mb-2 flex items-center">
                <span className="mr-1">⏰</span>
                Early bird pricing ended
              </div>
              <div className="flex items-baseline space-x-3">
                <span className="text-2xl font-bold text-gray-800">
                  {getCurrencySymbol(event.ticket_price_currency)}
                  {event.ticket_price_amount}
                </span>
                <span className="text-sm text-gray-600">
                  ({event.ticket_price_tokens} tokens)
                </span>
              </div>
            </div>
          ) 
          
          {/* REGULAR PRICING (no early bird) */}
          : (
            <div className="p-3">
              <div className="flex items-baseline space-x-3">
                <span className="text-2xl font-bold text-gray-800">
                  {getCurrencySymbol(event.ticket_price_currency)}
                  {event.ticket_price_amount}
                </span>
                <span className="text-sm text-gray-600">
                  ({event.ticket_price_tokens} tokens)
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="mt-4 flex space-x-2">
        <button 
          onClick={() => onJoin(event.ID)} 
          className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
            isEarlyBirdActive 
              ? 'bg-gradient-to-r from-yellow-500 to-orange-500 hover:from-yellow-600 hover:to-orange-600 text-white' 
              : 'bg-blue-500 hover:bg-blue-600 text-white'
          }`}
        >
          {isEarlyBirdActive ? '🎟️ Get Early Bird Ticket' : 'Buy Ticket'}
        </button>
        
        {isHost && (
          <>
            <button 
              onClick={() => onEdit(event.ID)}
              className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              <PencilIcon className="w-5 h-5" />
            </button>
            <button 
              onClick={() => onDelete(event.ID)}
              className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
            >
              <TrashIcon className="w-5 h-5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
};
```

---

### 3. RoomPageNew.jsx - Handle WebSocket Message

**Location:** `frontend/src/components/RoomPageNew.jsx`

**What to add:** Handler for `early_bird_ended` WebSocket message

```jsx
// In the WebSocket message handler function
const handleWebSocketMessage = (message) => {
  if (!message || !message.type) return;

  switch (message.type) {
    // ... existing cases ...
    
    case 'scheduled_event_created':
      toast.success(`📅 New event scheduled: ${message.event?.title}`);
      setScheduledEventsKey(prev => prev + 1);
      fetchScheduledEvents();
      break;

    // ADD THIS NEW CASE
    case 'early_bird_ended':
      toast(`⏰ Early bird pricing ended for "${message.event_title}"`, {
        icon: '🎟️',
        duration: 5000,
        style: {
          background: '#FEF3C7',
          color: '#92400E',
          border: '2px solid #F59E0B',
        },
      });
      // Refresh scheduled events to update UI
      setScheduledEventsKey(prev => prev + 1);
      fetchScheduledEvents();
      break;

    // ... other cases ...
  }
};
```

---

## Testing Guide

### 1. Test Early Bird Creation

1. Open room as host
2. Click "Schedule Event"
3. Fill in event details:
   - Title: "Test Early Bird Event"
   - Scheduled time: 2 hours from now
   - Check "This is a paid event"
   - Set price: $5.00 USD
   - Check "Enable Early Bird Pricing"
   - Slide discount to 30%
4. Verify you see:
   - Early Bird Price: $3.50 (35 tokens)
   - Regular Price: $5.00 (50 tokens) crossed out
   - "Save 15 tokens!" message
   - End time: 1 hour before scheduled time
5. Submit form
6. Check event card shows early bird badge and pricing

### 2. Test Early Bird Display

In the scheduled events sidebar:
- Event card should show "🎟️ EARLY BIRD ACTIVE" badge
- Green early bird price prominently displayed
- Regular price shown crossed out
- Savings highlighted: "💰 Save X tokens!"
- End time displayed: "Ends 7:00 PM"
- Button says "🎟️ Get Early Bird Ticket"

### 3. Test Auto-Deactivation

**Quick Test (for development):**
1. Create event scheduled for 1.5 hours from now
2. In database, manually update the event:
   ```sql
   UPDATE scheduled_events 
   SET start_time = NOW() + INTERVAL '30 minutes' 
   WHERE id = [event_id];
   ```
3. Wait 1-2 minutes
4. Watch for:
   - Backend logs: "✅ Early bird deactivated for event..."
   - Frontend toast: "⏰ Early bird pricing ended for..."
   - UI updates: Badge changes to "Early bird ended", shows regular price

**Real Test:**
1. Create event 2 hours in future with early bird
2. Wait until 1 hour before event
3. Scheduler should auto-deactivate early bird
4. UI should update automatically

### 4. Test Edge Cases

**Can't enable early bird for free event:**
1. Don't check "paid event"
2. Try to check "Enable Early Bird"
3. Should be disabled or show error

**Early bird ends before event:**
1. Schedule event for 30 minutes from now
2. Try to enable early bird
3. Should get error: "Event must be scheduled more than 1 hour in advance"

**Early bird must be cheaper:**
1. Set regular price: $5.00 (50 tokens)
2. Try to set early bird to $6.00 (60 tokens)
3. Slider should prevent this (or show validation error)

---

## Styling Tips

### Colors Used
- **Early Bird Active:** Yellow/Orange gradient (`from-yellow-50 to-orange-50`)
- **Early Bird Badge:** Yellow (`bg-yellow-500`)
- **Early Bird Price:** Green (`text-green-600`)
- **Savings Highlight:** Green background (`bg-green-100`)
- **End Time Alert:** Orange (`bg-orange-100`)
- **Early Bird Ended:** Gray (`bg-gray-50`)

### Icons
- 🎟️ - Early bird badge
- ⏰ - Time/countdown
- 💰 - Savings/discount
- 📅 - Scheduled event

### Responsive Breakpoints
All components use Tailwind's responsive classes:
- Mobile: Full width cards, stacked layout
- Tablet/Desktop: Side-by-side price comparison

---

## API Reference

### Create Event with Early Bird

```javascript
POST /api/rooms/:id/scheduled-events

Request Body:
{
  "watch_type": "3d_cinema",
  "start_time": "2025-12-13T20:00:00Z",  // Must be >1 hour in future
  "title": "Friday Movie Night",
  "description": "Join us!",
  "is_paid": true,
  "ticket_price_tokens": 50,
  "ticket_price_currency": "USD",
  "ticket_price_amount": 5.00,
  
  // Early bird fields
  "early_bird_enabled": true,
  "early_bird_price_tokens": 35,        // Must be < ticket_price_tokens
  "early_bird_price_amount": 3.50       // Must be < ticket_price_amount
}

Response:
{
  "message": "Scheduled event created successfully",
  "event": {
    "ID": 123,
    "early_bird_enabled": true,
    "early_bird_active": true,           // Will become false 1 hour before start_time
    "early_bird_price_tokens": 35,
    "early_bird_price_amount": 3.50,
    "ticket_price_tokens": 50,
    "ticket_price_amount": 5.00,
    // ... other fields
  }
}
```

### WebSocket Message Format

```javascript
{
  "type": "early_bird_ended",
  "event_id": 123,
  "event_title": "Friday Movie Night",
  "regular_price_tokens": 50,
  "regular_price_amount": 5.00,
  "currency": "USD"
}
```

---

## Common Issues

### Issue: Early bird checkbox disabled
**Solution:** Make sure `isPaid` is `true` first

### Issue: Can't save event with early bird
**Solution:** Check browser console for validation errors. Ensure:
- Early bird price < regular price
- Event scheduled >1 hour in future

### Issue: UI doesn't update when early bird ends
**Solution:** Verify WebSocket connection is active. Check:
- `ws://localhost:8080/ws` connection established
- Message handler includes `early_bird_ended` case
- `fetchScheduledEvents()` is called after receiving message

### Issue: Discount slider not working
**Solution:** Verify `convertFiatToTokens()` function is imported and working

---

## Need Help?

Check these files for reference:
- `frontend/src/utils/tokenConverter.js` - Currency conversion functions
- `frontend/src/components/SetTicketPriceModal.jsx` - Similar early bird UI for instant watch
- `documentation/EARLY_BIRD_IMPLEMENTATION_SUMMARY.md` - Complete backend implementation details

---

**Happy coding! 🎟️**
