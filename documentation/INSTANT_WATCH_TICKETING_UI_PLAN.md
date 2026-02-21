# Instant Watch Ticketing UI/UX Implementation Plan

## Overview
Implement a refined ticketing configuration flow for instant watch sessions with improved UI/UX based on user specifications.

---

## 🎨 Refined UI/UX Design

### Flow Architecture
```
WatchTypeModal (Select Video/3D Cinema)
    ↓
PricingModal (Select Free/Paid)
    ↓
SetTicketPriceModal (If Paid selected) 
    ↓
Create Watch Session + Navigate
```

---

## 📋 Component Specifications

### 1. **PricingModal** (New Component)
**Purpose**: Let host choose between Free or Paid session after selecting watch type

**Visual Design**:
- Title: "Price"
- Two large card options side-by-side:
  
  **Free Card**:
  - Icon: `freeIcon.svg` from `/public/icons/`
  - Title: "Free"
  - Description: "Free to join"
  - Color scheme: Green gradient (suggest: `from-green-500 to-emerald-600`)
  
  **Paid Card**:
  - Icon: `coinIcon.svg` from `/public/icons/`
  - Title: "Paid"
  - Description: "Members pay you to join watch session"
  - Color scheme: Gold/Yellow gradient (suggest: `from-yellow-500 to-amber-600`)

**Behavior**:
- Clicking "Free" → Immediately creates session with `ticketing_enabled: false`
- Clicking "Paid" → Opens `SetTicketPriceModal`

---

### 2. **SetTicketPriceModal** (New Component)
**Purpose**: Configure ticket pricing when host selects "Paid"

**Visual Design - Ticket Paper Style**:

```
┌─────────────────────────────────────────────────┐
│  [CLOSE X]                                      │
│                                                 │
│  ┌──────────────┐  ┌─────────────────────────┐ │
│  │              │  │  SET TICKET PRICE       │ │
│  │  [TICKET.SVG]│  │                         │ │
│  │   (Left      │  │  Fiat Currency:         │ │
│  │    Side)     │  │  ┌─────────────────┐    │ │
│  │              │  │  │ USD  [Dropdown] │    │ │
│  │              │  │  └─────────────────┘    │ │
│  │              │  │                         │ │
│  │              │  │  Price Amount:          │ │
│  │              │  │  ┌─────────────────┐    │ │
│  │              │  │  │  $0.00         │    │ │
│  │              │  │  └─────────────────┘    │ │
│  │              │  │                         │ │
│  │              │  │  ≈ 50 tokens           │ │
│  │              │  │  (Auto-calculated)      │ │
│  │              │  │                         │ │
│  │              │  │  ┌─────────────────┐    │ │
│  │              │  │  │☐ Early Bird Promo│   │ │
│  │              │  │  └─────────────────┘    │ │
│  └──────────────┘  └─────────────────────────┘ │
│                                                 │
│         [Cancel]  [Create Session →]            │
└─────────────────────────────────────────────────┘
```

**Layout Details**:
- Split layout: 40% left (ticket image), 60% right (form)
- Left side: Large `ticket.svg` icon with subtle background
- Right side styled like a ticket with:
  - Decorative border (dashed or perforated edge effect)
  - Input fields styled to look like printed ticket details
  - Typography: Monospace font for amounts

**Form Fields**:

1. **Currency Selector** (Dropdown)
   - Options: USD, NGN, EUR, GBP (based on backend support)
   - Default: USD
   - Style: Looks like a ticket stamp/box

2. **Price Amount** (Input)
   - Type: Number
   - Placeholder: "0.00"
   - Validation: Min $0.10 (1 token equivalent)
   - Currency symbol prefix ($ ₦ € £) based on selection
   - Style: Large, bold font like ticket price printing

3. **Token Equivalent Display** (Calculated, Read-only)
   - Formula: `tokens = fiatAmount / 0.10` (1 token = $0.10 USD)
   - Convert to tokens using exchange rates
   - Example: "$5.00 USD ≈ 50 tokens"
   - Style: Smaller text, secondary color
   - Real-time update as user types amount

4. **Early Bird Promo Toggle** (Checkbox/Toggle)
   - Label: "Enable Early Bird Promo"
   - When enabled → Shows additional fields:
     - Early Bird Discount % (e.g., 20% off)
     - Early Bird Price (auto-calculated)
     - Early Bird End Time (datetime picker)
   - Default: Unchecked
   - Style: Toggle switch with ticket-themed styling

**Actions**:
- **Cancel**: Close modal, return to PricingModal
- **Create Session**: Validate and create session with ticketing config

---

## 🔧 Implementation Details

### State Management (RoomPageNew.jsx)

**New State Variables**:
```javascript
// Ticketing flow state
const [showWatchTypeModal, setShowWatchTypeModal] = useState(false);
const [showPricingModal, setShowPricingModal] = useState(false);
const [showSetTicketPriceModal, setShowSetTicketPriceModal] = useState(false);
const [selectedWatchType, setSelectedWatchType] = useState(null);

// Ticketing configuration
const [ticketingConfig, setTicketingConfig] = useState({
  ticketing_enabled: false,
  ticket_price_tokens: 0,
  ticket_price_currency: '',
  ticket_price_amount: 0,
  early_bird_enabled: false,
  early_bird_price_tokens: 0,
  early_bird_end_time: null
});
```

**Flow Handlers**:
```javascript
// Step 1: Watch Type Selection
const handleWatchTypeSelected = (watchType) => {
  setSelectedWatchType(watchType);
  setShowWatchTypeModal(false);
  setShowPricingModal(true); // Open pricing modal
};

// Step 2: Pricing Selection
const handlePricingSelected = (pricingType) => {
  if (pricingType === 'free') {
    // Create free session immediately
    createWatchSession({
      watch_type: selectedWatchType,
      ticketing_enabled: false
    });
  } else if (pricingType === 'paid') {
    // Open ticket price modal
    setShowPricingModal(false);
    setShowSetTicketPriceModal(true);
  }
};

// Step 3: Ticket Price Configuration
const handleTicketPriceSet = (config) => {
  setTicketingConfig(config);
  setShowSetTicketPriceModal(false);
  
  // Create paid session with ticketing config
  createWatchSession({
    watch_type: selectedWatchType,
    ticketing_enabled: true,
    ...config
  });
};

// Unified session creation
const createWatchSession = async (sessionData) => {
  try {
    const response = await apiClient.post(`/rooms/${roomId}/sessions`, sessionData);
    const session = response.data;
    
    // Navigate to watch page
    navigate(`/watch/${session.id}`);
  } catch (error) {
    console.error('Failed to create session:', error);
    toast.error('Failed to start watch session');
  }
};
```

---

### Backend Updates Required

**File**: `backend/internal/handlers/room_handlers.go`

**Update CreateWatchSession Input Struct**:
```go
type CreateWatchSessionInput struct {
    WatchType string `json:"watch_type" binding:"required"`
    
    // Ticketing fields
    TicketingEnabled      bool    `json:"ticketing_enabled"`
    TicketPriceTokens     int     `json:"ticket_price_tokens"`
    TicketPriceCurrency   string  `json:"ticket_price_currency"`
    TicketPriceAmount     float64 `json:"ticket_price_amount"`
    
    // Early bird fields
    EarlyBirdEnabled      bool      `json:"early_bird_enabled"`
    EarlyBirdPriceTokens  int       `json:"early_bird_price_tokens"`
    EarlyBirdEndTime      time.Time `json:"early_bird_end_time"`
}
```

**Validation Logic**:
```go
// Validate ticketing configuration
if input.TicketingEnabled {
    // Must have either token price or fiat price
    if input.TicketPriceTokens == 0 && input.TicketPriceAmount == 0 {
        c.JSON(http.StatusBadRequest, gin.H{
            "error": "Ticket price (tokens or fiat) required for paid sessions",
        })
        return
    }
    
    // If fiat amount set, currency is required
    if input.TicketPriceAmount > 0 && input.TicketPriceCurrency == "" {
        c.JSON(http.StatusBadRequest, gin.H{
            "error": "Currency required when setting fiat ticket price",
        })
        return
    }
    
    // Validate currency
    if input.TicketPriceCurrency != "" {
        validCurrencies := []string{"USD", "NGN", "EUR", "GBP"}
        isValid := false
        for _, curr := range validCurrencies {
            if input.TicketPriceCurrency == curr {
                isValid = true
                break
            }
        }
        if !isValid {
            c.JSON(http.StatusBadRequest, gin.H{
                "error": "Invalid currency. Supported: USD, NGN, EUR, GBP",
            })
            return
        }
    }
    
    // Validate early bird
    if input.EarlyBirdEnabled {
        if input.EarlyBirdPriceTokens == 0 {
            c.JSON(http.StatusBadRequest, gin.H{
                "error": "Early bird price required when early bird is enabled",
            })
            return
        }
        
        if input.EarlyBirdPriceTokens >= input.TicketPriceTokens {
            c.JSON(http.StatusBadRequest, gin.H{
                "error": "Early bird price must be less than regular price",
            })
            return
        }
        
        if input.EarlyBirdEndTime.Before(time.Now()) {
            c.JSON(http.StatusBadRequest, gin.H{
                "error": "Early bird end time must be in the future",
            })
            return
        }
    }
}
```

**Session Creation Update**:
```go
session := models.WatchSession{
    SessionID:             sessionID,
    RoomID:                room.ID,
    HostID:                user.ID,
    WatchType:             input.WatchType,
    Status:                "active",
    StartedAt:             time.Now(),
    
    // Ticketing fields
    TicketingEnabled:      input.TicketingEnabled,
    TicketPriceTokens:     input.TicketPriceTokens,
    TicketPriceCurrency:   input.TicketPriceCurrency,
    TicketPriceAmount:     input.TicketPriceAmount,
    
    // Early bird fields
    EarlyBirdEnabled:      input.EarlyBirdEnabled,
    EarlyBirdPriceTokens:  input.EarlyBirdPriceTokens,
    EarlyBirdEndTime:      input.EarlyBirdEndTime,
}
```

---

### Token Conversion Logic (Frontend)

**Create Utility Function**: `frontend/src/utils/tokenConverter.js`

```javascript
/**
 * Token Conversion Utility
 * Base rate: 1 token = $0.10 USD
 */

const BASE_TOKEN_RATE_USD = 0.10; // $0.10 per token

/**
 * Convert fiat amount to tokens
 * @param {number} fiatAmount - Amount in fiat currency
 * @param {string} currency - Currency code (USD, NGN, EUR, GBP)
 * @param {object} exchangeRates - Exchange rates object (optional, for non-USD)
 * @returns {number} Equivalent tokens
 */
export const convertFiatToTokens = (fiatAmount, currency = 'USD', exchangeRates = {}) => {
  // Convert to USD first if not USD
  let usdAmount = fiatAmount;
  
  if (currency !== 'USD' && exchangeRates[currency]) {
    usdAmount = fiatAmount / exchangeRates[currency];
  }
  
  // Convert USD to tokens (1 token = $0.10)
  const tokens = Math.round(usdAmount / BASE_TOKEN_RATE_USD);
  return tokens;
};

/**
 * Convert tokens to fiat amount
 * @param {number} tokens - Number of tokens
 * @param {string} currency - Target currency code
 * @param {object} exchangeRates - Exchange rates object
 * @returns {number} Equivalent fiat amount
 */
export const convertTokensToFiat = (tokens, currency = 'USD', exchangeRates = {}) => {
  // Convert tokens to USD
  const usdAmount = tokens * BASE_TOKEN_RATE_USD;
  
  // Convert to target currency
  if (currency === 'USD') {
    return usdAmount;
  }
  
  if (exchangeRates[currency]) {
    return usdAmount * exchangeRates[currency];
  }
  
  return usdAmount; // Fallback to USD
};

/**
 * Format token amount with label
 * @param {number} tokens - Number of tokens
 * @returns {string} Formatted string
 */
export const formatTokens = (tokens) => {
  return `${parseInt(tokens).toLocaleString()} tokens`;
};
```

**Exchange Rates** (can be fetched from backend or hardcoded):
```javascript
const EXCHANGE_RATES = {
  USD: 1.00,
  NGN: 1600.00,  // Example: ₦1600 = $1
  EUR: 0.92,     // Example: €0.92 = $1
  GBP: 0.79      // Example: £0.79 = $1
};
```

---

## 📁 File Structure

### New Files to Create:

1. **`frontend/src/components/PricingModal.jsx`**
   - Free vs Paid selection modal
   - Uses freeIcon.svg and coinIcon.svg

2. **`frontend/src/components/SetTicketPriceModal.jsx`**
   - Ticket price configuration modal
   - Uses ticket.svg
   - Ticket paper-themed design

3. **`frontend/src/utils/tokenConverter.js`**
   - Token/fiat conversion utilities
   - Exchange rate handling

### Files to Modify:

1. **`frontend/src/components/RoomPageNew.jsx`**
   - Add new state for ticketing flow
   - Update handlers for multi-step flow
   - Import new modals

2. **`backend/internal/handlers/room_handlers.go`**
   - Expand CreateWatchSession input struct
   - Add ticketing validation
   - Update session creation logic

---

## 🎯 Component Props Specification

### PricingModal Props:
```javascript
{
  isOpen: boolean,
  onClose: () => void,
  onSelectPricing: (pricingType: 'free' | 'paid') => void,
  watchType: 'video' | '3d_cinema'
}
```

### SetTicketPriceModal Props:
```javascript
{
  isOpen: boolean,
  onClose: () => void,
  onSetPrice: (config) => void,
  watchType: 'video' | '3d_cinema'
}

// config object structure:
{
  ticketing_enabled: true,
  ticket_price_tokens: number,
  ticket_price_currency: string,
  ticket_price_amount: number,
  early_bird_enabled: boolean,
  early_bird_price_tokens: number,
  early_bird_end_time: Date | null
}
```

---

## ✅ Validation Rules

### Frontend Validation:

1. **Price Amount**:
   - Min: $0.10 (1 token equivalent)
   - Max: $1000 (10,000 tokens)
   - Must be positive number
   - 2 decimal places for fiat

2. **Currency**:
   - Must be one of: USD, NGN, EUR, GBP
   - Required when price amount > 0

3. **Early Bird**:
   - Early bird price < Regular price
   - Early bird end time in future
   - Minimum discount: 5%

4. **Token Calculation**:
   - Always rounded to nearest whole number
   - Display real-time as user types

### Backend Validation:

1. **Ticketing Enabled**:
   - Must have either `ticket_price_tokens` OR `ticket_price_amount`
   - Currency required if using fiat pricing

2. **Early Bird**:
   - Only allowed if ticketing enabled
   - Early bird price must be < regular price
   - End time must be > current time

---

## 🎨 Styling Guidelines

### PricingModal Styling:
```css
/* Free Card */
.free-card {
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
  hover: scale(1.05);
  transition: all 0.3s ease;
}

/* Paid Card */
.paid-card {
  background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
  hover: scale(1.05);
  transition: all 0.3s ease;
}
```

### SetTicketPriceModal Styling:
```css
/* Ticket Paper Theme */
.ticket-container {
  background: linear-gradient(to right, #fefce8, #ffffff);
  border: 2px dashed #d97706;
  border-radius: 16px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);
}

.ticket-left {
  background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%);
  border-right: 2px dashed #d97706;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ticket-right {
  padding: 2rem;
  font-family: 'Courier New', monospace; /* Ticket-like font */
}

.price-input {
  font-size: 2rem;
  font-weight: bold;
  color: #1f2937;
  border: 2px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px;
  font-family: 'Courier New', monospace;
}

.token-equivalent {
  color: #6b7280;
  font-size: 1.125rem;
  font-weight: 500;
  margin-top: 8px;
}
```

---

## 📊 User Flow Example

### Scenario: Host creates paid 3D Cinema session

1. **Step 1**: Host clicks "Start Instant Watch"
   - WatchTypeModal opens

2. **Step 2**: Host selects "3D Cinema"
   - WatchTypeModal closes
   - PricingModal opens with title "Price"

3. **Step 3**: Host sees two options:
   - Free (green, freeIcon.svg) - "Free to join"
   - Paid (gold, coinIcon.svg) - "Members pay you to join watch session"

4. **Step 4**: Host clicks "Paid"
   - PricingModal closes
   - SetTicketPriceModal opens

5. **Step 5**: Host sees ticket-themed modal:
   - Left: Large ticket.svg image
   - Right: Form styled like ticket paper
   - Selects "USD" currency
   - Enters "$5.00"
   - Sees "≈ 50 tokens" auto-calculate
   - Toggles "Early Bird Promo"
   - Sets 20% discount (40 tokens)
   - Sets early bird end time (2 hours from now)

6. **Step 6**: Host clicks "Create Session"
   - Backend creates session with:
     ```json
     {
       "watch_type": "3d_cinema",
       "ticketing_enabled": true,
       "ticket_price_tokens": 50,
       "ticket_price_currency": "USD",
       "ticket_price_amount": 5.00,
       "early_bird_enabled": true,
       "early_bird_price_tokens": 40,
       "early_bird_end_time": "2024-12-10T16:00:00Z"
     }
     ```
   - Frontend navigates to `/watch/{session_id}`

---

## ❓ Updated Assumptions

### Confirmed Assumptions:
1. ✅ Icons exist: `ticket.svg`, `freeIcon.svg`, `coinIcon.svg` in `/public/icons/`
2. ✅ Token rate: 1 token = $0.10 USD (from backend currency_service.go)
3. ✅ Backend supports: USD, NGN, EUR, GBP currencies
4. ✅ WatchSession model has all ticketing fields defined
5. ✅ Two-step modal flow: Pricing selection → Price configuration (if paid)
6. ✅ Ticket paper aesthetic for SetTicketPriceModal
7. ✅ Real-time token conversion display as user types

### New Design Decisions:
1. ✅ PricingModal replaces direct ticketing config in WatchTypeModal
2. ✅ Free sessions skip price configuration (instant creation)
3. ✅ Paid sessions require price configuration before creation
4. ✅ Ticket image on left (40%), form on right (60%)
5. ✅ Monospace/ticket-themed typography for price inputs
6. ✅ Token equivalent shown prominently below fiat input

---

## ✅ Design Decisions (Confirmed)

### 1. **Currency Auto-Detection** ✅
**Decision**: Detect from browser locale/region
**Implementation**:
```javascript
const detectUserCurrency = () => {
  const locale = navigator.language; // e.g., "en-NG"
  const region = locale.split('-')[1]; // "NG"
  
  const currencyMap = {
    'NG': 'NGN',
    'GH': 'GHS',
    'KE': 'KES',
    'ZA': 'ZAR',
    'US': 'USD',
    'GB': 'GBP',
    'EU': 'EUR'
  };
  
  return currencyMap[region] || 'USD'; // Default to USD
};
```

---

### 2. **Early Bird UI Expansion** ✅
**Decision**: Expand inline below the toggle with smooth animation

**Early Bird Fields**:
- Early bird discount percentage (slider or input?)
- Auto-calculate early bird price based on percentage
- End time picker (datetime-local input)

**Visual Example**:
```
☑ Enable Early Bird Promo

  Discount: [20%] ────────────────
            10%              50%
  
  Early Bird Price: $4.00 (40 tokens)
  Regular Price:    $5.00 (50 tokens)
  
  Early Bird Ends: [Date/Time Picker]
```

---

### 3. **Price Input Validation** ✅
**Decision**: Hybrid approach (basic checks real-time, full validation on submit)

**Real-time checks**:
- Min value warning ($0.10)
- Max value warning ($1000)
- Invalid characters blocked

**Submit validation**:
- Currency required
- Early bird logic validation
- Final price confirmation

---

### 4. **Cancel Behavior** ✅
**Decision**: Return to PricingModal (gives flexibility to choose Free instead)

---

### 5. **Token Display Format** ✅
**Decision**: `≈ 50 tokens` (with approximation symbol - clear and professional)

---

### 6. **Ticket Image Size** ✅
**Decision**: Full-height, edge-to-edge fill (maximum visual impact)

---

### 7. **Pricing Method** ✅
**Decision**: Host sets fiat price only, tokens auto-calculated

**Rationale**: 
- ✅ Simpler UX - no confusion about dual pricing
- ✅ Consistent pricing - token calculation is automatic and accurate
- ✅ Backend stores both values for flexibility
- ✅ Display shows both for transparency
- ✅ Avoids currency conversion issues (see MULTI_CURRENCY_PAYMENT_ANALYSIS.md)

---

### 8. **Error Handling** ✅
**Decision**: Error banner at top of modal with retry button

---

### 9. **Loading States** ✅
**Decision**: Disable "Create Session" button + spinner (simple and clear)

---

### 10. **Confirmation Step** ✅
**Decision**: No confirmation modal - create immediately on "Create Session" (reduce friction, settings visible before submit)

---

## 🚀 Implementation Order

### Phase 1: Core Components (Priority)
1. Create `PricingModal.jsx` - Free/Paid selection
2. Create `SetTicketPriceModal.jsx` - Basic price input (no early bird yet)
3. Create `tokenConverter.js` - Conversion utilities
4. Update `RoomPageNew.jsx` - Integrate new flow

### Phase 2: Backend Integration
5. Update `room_handlers.go` - Accept ticketing params
6. Add validation logic
7. Test session creation with various configs

### Phase 3: Enhanced Features
8. Add early bird functionality to `SetTicketPriceModal`
9. Implement exchange rates (API or static)
10. Add real-time validation and error handling

### Phase 4: Polish
11. Refine ticket paper styling
12. Add animations and transitions
13. Accessibility improvements (ARIA labels, keyboard nav)
14. Mobile responsive adjustments

---

## 🧪 Testing Checklist

### Frontend Tests:
- [ ] PricingModal opens after watch type selection
- [ ] Free option creates session immediately
- [ ] Paid option opens SetTicketPriceModal
- [ ] Token conversion updates in real-time
- [ ] Currency dropdown works correctly
- [ ] Early bird toggle shows/hides fields
- [ ] Cancel returns to PricingModal
- [ ] Validation errors display correctly

### Backend Tests:
- [ ] Free sessions created with ticketing_enabled=false
- [ ] Paid sessions require price configuration
- [ ] Validation rejects invalid currencies
- [ ] Validation rejects negative prices
- [ ] Early bird validation works (price < regular, time > now)
- [ ] Session created with correct ticketing fields

### Integration Tests:
- [ ] End-to-end flow: WatchType → Pricing → Price → Session → Navigate
- [ ] Error handling: Network failures, validation errors
- [ ] Edge cases: $0.00 price, very large prices, invalid dates

---

## 📱 Responsive Design Notes

### Mobile Considerations:
- **PricingModal**: Stack cards vertically on mobile
- **SetTicketPriceModal**: 
  - Stack ticket image above form (not side-by-side)
  - Smaller ticket image on mobile
  - Full-width form inputs

### Breakpoints:
```css
/* Desktop: Side-by-side layout */
@media (min-width: 768px) {
  .ticket-layout {
    display: flex;
    flex-direction: row;
  }
}

/* Mobile: Stacked layout */
@media (max-width: 767px) {
  .ticket-layout {
    display: flex;
    flex-direction: column;
  }
  
  .ticket-left {
    height: 150px; /* Fixed height for image */
    border-right: none;
    border-bottom: 2px dashed #d97706;
  }
}
```

---

## 🎨 Icon Usage Reference

### Available Icons:
- **ticket.svg** - Main ticket icon for SetTicketPriceModal left side
- **freeIcon.svg** - Free pricing option card
- **coinIcon.svg** - Paid pricing option card

### Icon Integration:
```javascript
// In PricingModal
<img src="/icons/freeIcon.svg" alt="Free" className="w-16 h-16" />
<img src="/icons/coinIcon.svg" alt="Paid" className="w-16 h-16" />

// In SetTicketPriceModal
<img src="/icons/ticket.svg" alt="Ticket" className="w-full h-auto" />
```

---

## 🔄 State Flow Diagram

```
┌─────────────────┐
│ RoomPageNew     │
│ (Parent)        │
└────────┬────────┘
         │
         ├─> [User clicks "Start Instant Watch"]
         │
┌────────▼────────┐
│ WatchTypeModal  │
│ - Video         │
│ - 3D Cinema     │
└────────┬────────┘
         │
         ├─> handleWatchTypeSelected(watchType)
         │   setSelectedWatchType(watchType)
         │   setShowPricingModal(true)
         │
┌────────▼────────┐
│ PricingModal    │
│ - Free          │◄───┐ (Cancel from SetTicketPriceModal)
│ - Paid          │    │
└────────┬────────┘    │
         │             │
         ├─> Free: createWatchSession({ticketing_enabled: false})
         │    → Navigate to /watch/:id
         │
         ├─> Paid: setShowSetTicketPriceModal(true)
         │
┌────────▼────────────┐
│SetTicketPriceModal  │
│ - Currency          │
│ - Amount            │
│ - Tokens (calc)     │
│ - Early Bird        │
└────────┬────────────┘
         │
         ├─> Cancel: return to PricingModal ────┘
         │
         ├─> Create: handleTicketPriceSet(config)
         │   createWatchSession({
         │     ticketing_enabled: true,
         │     ...config
         │   })
         │   → Navigate to /watch/:id
         │
         ▼
    [Watch Page]
```

---

## 📝 Next Steps

1. **Review this plan** - Confirm design decisions and answer questions
2. **Create PricingModal** - Start with basic Free/Paid selection
3. **Create SetTicketPriceModal** - Implement ticket paper UI
4. **Integrate with RoomPageNew** - Update flow handlers
5. **Update backend** - Expand CreateWatchSession endpoint
6. **Test end-to-end** - Verify complete flow works

---

## 🎯 Success Criteria

### User Experience:
- ✅ Intuitive two-step flow (Pricing → Price)
- ✅ Visual clarity (ticket paper design)
- ✅ Real-time feedback (token conversion)
- ✅ Error prevention (validation)
- ✅ Flexibility (can go back to choose Free)

### Technical:
- ✅ Clean component separation
- ✅ Proper state management
- ✅ Backend validation
- ✅ Error handling
- ✅ Responsive design

### Business:
- ✅ Hosts can monetize sessions
- ✅ Clear pricing transparency
- ✅ Early bird incentives supported
- ✅ Multi-currency support

