# Gift & Donation System - Complete Guide

## Overview

WeWatch implements a comprehensive token-based gifting and donation system that allows users to support each other and hosts during watch sessions. The system operates on two models:

1. **Wallet-to-Wallet Gifts**: Direct token transfers between room members
2. **Session Donations**: Tips given to hosts during active watch sessions

---

## 🎁 Gift System (Wallet-to-Wallet)

### Purpose
Allow users to send tokens directly to other members they share rooms with. This fosters community engagement and provides a way to show appreciation outside of active sessions.

### Commission Structure
**5% Platform Fee** (95% to recipient)

- **Sender pays**: Full token amount
- **Recipient receives**: 95% of tokens sent
- **Platform keeps**: 5% as commission
- **Example**: Send 100 tokens → Recipient gets 95 tokens, Platform keeps 5 tokens

### API Endpoint
```
POST /api/donations/gift
Authorization: Required (Cookie-based JWT)

Request Body:
{
  "recipient_id": 123,      // User ID of recipient
  "amount_tokens": 100      // Amount in token cents (100 = 1 token)
}

Response (200 OK):
{
  "success": true,
  "message": "Gift sent successfully",
  "donor_balance": {
    "token_balance": 50000,
    "lifetime_earned": 100000,
    "lifetime_spent": 50000
  },
  "gift_details": {
    "amount_sent": 100,
    "amount_received": 95,
    "platform_fee": 5,
    "recipient_username": "JohnDoe"
  }
}
```

### Business Rules

1. **Room Membership Requirement**: Both sender and recipient must be members of at least one common room
2. **No Self-Gifting**: Users cannot send tokens to themselves
3. **Minimum Amount**: 1 token (1 cent) minimum per gift
4. **Balance Check**: Sender must have sufficient token balance
5. **Transaction Recording**: Both debit (sender) and credit (recipient) transactions are recorded

### Database Impact

**Token Transactions Created:**
```sql
-- Sender transaction (debit)
INSERT INTO token_transactions (
  user_id, transaction_type, amount, status
) VALUES (
  sender_id, 'gift_sent', -100, 'completed'
);

-- Recipient transaction (credit)
INSERT INTO token_transactions (
  user_id, transaction_type, amount, status
) VALUES (
  recipient_id, 'gift_received', 95, 'completed'
);
```

**Wallet Updates:**
```sql
-- Deduct from sender
UPDATE user_wallets 
SET token_balance = token_balance - 100,
    lifetime_spent = lifetime_spent + 100
WHERE user_id = sender_id;

-- Credit to recipient
UPDATE user_wallets 
SET token_balance = token_balance + 95,
    lifetime_earned = lifetime_earned + 95
WHERE user_id = recipient_id;
```

**Platform Accounting:**
```sql
-- Add 5% commission to platform profit
UPDATE platform_accounting 
SET platform_profit = platform_profit + (5 * 165 / 100),
    lifetime_platform_profit = lifetime_platform_profit + (5 * 165 / 100);
```

### Frontend Integration

#### Payment Page Modal
- **Component**: `DonateTokenToMember.jsx`
- **Location**: Payment Page → Token Balance card → "Donate Tokens" button
- **Features**:
  - Lists all room members (with avatars)
  - Preset amounts: 10, 25, 50, 100 tokens
  - Custom amount input
  - Confetti celebration animation on success
  - `gift.mp3` sound effect
  - Real-time balance updates

#### Floating Gift Icon (Session Pages)
- **Component**: `FloatingGiftIcon.jsx`
- **Location**: Left side of screen (CinemaScene3D, VideoWatch)
- **Behavior**:
  - Auto-sends 1 token per click directly to host
  - Coin counting animation on each gift
  - Visibility rules:
    - ✅ Shows on mouse/keyboard activity if user has tokens
    - ❌ Hides on: fullscreen mode, left sidebar open, no tokens, 3s inactivity
  - Sound: `gift.mp3` plays on each gift

---

## 💝 Donation System (Session-Based)

### Purpose
Allow viewers to tip hosts during active watch sessions. Donations are publicly visible and contribute to session leaderboards.

### Commission Structure
**15% Platform Fee** (85% to host)

- **Donor pays**: Full token/gateway amount
- **Host receives**: 85% of donation
- **Platform keeps**: 15% as commission
- **Example**: Donate 100 tokens → Host gets 85 tokens, Platform keeps 15 tokens

### API Endpoints

#### Send Donation
```
POST /api/sessions/:id/donate
Authorization: Required

Request Body:
{
  "amount_tokens": 500,           // Amount in token cents
  "payment_method": "tokens",     // "tokens" | "paystack" | "stripe"
  "payment_token": null,          // Required for gateway payments
  "message": "Great stream!",     // Optional message (max 500 chars)
  "is_anonymous": false           // Always false per spec
}
```

#### Get Session Donations
```
GET /api/sessions/:id/donations?limit=50&offset=0
Authorization: Required

Response:
{
  "donations": [...],
  "total_amount": 5000,
  "pagination": {
    "limit": 50,
    "offset": 0,
    "total": 123
  }
}
```

#### Get Top Donors (Per Session)
```
GET /api/sessions/:id/top-donors?limit=10
Authorization: Required

Response:
{
  "top_donors": [
    {
      "donor_id": 42,
      "username": "GenerosuUser",
      "avatar_url": "/avatars/user42.png",
      "total_donated": 10000,
      "donation_count": 25
    }
  ]
}
```

#### Get Global Top Donors
```
GET /api/donations/top-donors?limit=20
Authorization: Required

Response:
{
  "top_donors": [...],
  "statistics": {
    "total_donated_tokens": 500000,
    "total_donors": 342,
    "total_sessions": 1250
  }
}
```

### Business Rules

1. **Session Required**: Must be sent during an active watch session
2. **No Self-Donations**: Users cannot donate to their own sessions
3. **Minimum Amount**: 1 token minimum
4. **Payment Methods**: 
   - Tokens (from user wallet)
   - Paystack (direct gateway payment)
   - Stripe (direct gateway payment)
5. **Visibility**: All donations are visible to session participants (anonymous option available but not used)
6. **WebSocket Broadcast**: TODO - real-time notifications not yet implemented

---

## 📊 Admin Analytics

### Top Donors Leaderboard
Displays global donor statistics across all donations:

**Metrics Tracked:**
- Total tokens donated (all-time)
- Number of donations made
- Number of sessions participated in
- Revenue equivalent (tokens × ₦165)

**Display:**
- Top 20 donors by default
- Crown 👑 for #1, medals 🥈🥉 for #2-3
- Avatar, username, user ID
- Total donated, donation count, session count

**Refresh Rate**: Every 30 seconds (auto-refresh)

---

## 💰 Token Economy

### Token Value
- **1 Token = ₦165** (at ₦1650/$1 USD exchange rate)
- Tokens stored in database as **cents** (100 = 1 token)
- Display format: `(tokens / 100).toFixed(2)` tokens

### Commission Breakdown

| Transaction Type | Platform Fee | Host/Recipient Gets | Use Case |
|-----------------|--------------|---------------------|----------|
| Wallet-to-Wallet Gift | 5% | 95% | Community support, peer appreciation |
| Session Donation | 15% | 85% | Host tips during watch sessions |
| Token Purchase | 15% split at Paystack | 85% host reserve | Users buy tokens |
| Ticket Purchase | 15% commission | 85% to host reserve | Session ticket sales |

### Platform Accounting Updates

**Gift Transaction (5% commission):**
```go
commissionInNaira := float64(platformCommission) * 165.0 / 100.0
accounting.PlatformProfit += commissionInNaira
accounting.LifetimePlatformProfit += commissionInNaira
```

**Donation Transaction (15% commission):**
```go
amountInNaira := float64(req.AmountTokens) * 165.0 / 100.0
accounting.RecordTokenSpending(amountInNaira) // Moves 85% to host reserve
```

---

## 🎨 User Experience

### Celebration Animations

**DonateTokenToMember Modal:**
- Triggers on successful gift
- Uses `react-confetti` library
- 500 pieces, 5-second duration
- Gravity: 0.3, no recycle
- Full-screen coverage

**FloatingGiftIcon Animation:**
- Coin counting animation (10 coins fall from top)
- "+1 🪙" floating text effect
- Smooth fade-up animation
- Duration: 1 second per click

### Sound Effects

**gift.mp3:**
- Plays on successful gift/donation
- Volume: 30-50% (adjustable in components)
- Located in: `public/sounds/gift.mp3`
- Used by:
  - `DonateTokenToMember.jsx` (donation modal)
  - `FloatingGiftIcon.jsx` (quick gift button)

---

## 🔒 Security & Validation

### Backend Validations

1. **Authentication**: All endpoints require valid JWT cookie
2. **Balance Checks**: Prevents overspending
3. **Relationship Checks**: Validates room membership for gifts
4. **Session State**: Donations only during active sessions
5. **Self-Transaction Prevention**: Cannot gift/donate to self
6. **Minimum Amount**: 1 token floor
7. **Transaction Atomicity**: Uses GORM transactions with rollback on errors

### Frontend Validations

1. **Token Balance Display**: Real-time balance checks
2. **Form Validation**: Amount, recipient selection required
3. **Loading States**: Prevents double-submission
4. **Error Handling**: User-friendly error messages
5. **Success Feedback**: Visual + audio confirmation

---

## 📈 Future Enhancements (TODOs)

### Session Donations
- [ ] WebSocket broadcast for real-time donation notifications
- [ ] Floating notification when entering top 10 donors
- [ ] Leaderboard display in session UI
- [ ] Donation goal/progress bars for hosts
- [ ] Custom donation tiers with rewards

### Gift System
- [ ] Gift history page (sent/received)
- [ ] Bulk gifting (send to multiple users)
- [ ] Scheduled gifts (birthday, milestone)
- [ ] Gift messages/notes
- [ ] Undo gift (within 5 minutes)

### Analytics
- [ ] Per-room gift statistics
- [ ] Monthly donor rankings
- [ ] Gift/donation trends over time
- [ ] Host earnings breakdown by source
- [ ] Platform revenue dashboard improvements

---

## 🧪 Testing Checklist

### Backend Tests
- [ ] Gift with insufficient balance → 400 error
- [ ] Gift to non-room-member → 400 error
- [ ] Gift to self → 400 error
- [ ] Valid gift → 200, correct balances, transactions created
- [ ] Platform accounting updated correctly
- [ ] Concurrent gifts (race condition test)

### Frontend Tests
- [ ] Modal opens/closes correctly
- [ ] Room members load and display
- [ ] Preset amounts clickable and select
- [ ] Custom amount input validation
- [ ] Confetti triggers on success
- [ ] Sound plays on success
- [ ] Balance updates after gift
- [ ] Floating icon hides/shows on activity
- [ ] Floating icon click sends 1 token
- [ ] Error messages display properly

---

## 📝 Migration Notes

No database migrations required - uses existing tables:
- `token_transactions` (with `gift_sent`/`gift_received` types)
- `user_wallets`
- `platform_accounting`
- `donations` (for session-based donations)

Transaction types added to enum:
```go
TransactionTypeGiftSent     TransactionType = "gift_sent"
TransactionTypeGiftReceived TransactionType = "gift_received"
```

---

## 🎯 Key Takeaways

1. **Two Systems**: Gifts (5%) for peer support, Donations (15%) for host tips
2. **Commission-Free Option**: Consider removing gift commission for beta users
3. **Community Building**: Gifts foster engagement outside sessions
4. **Revenue Stream**: 5% gift + 15% donation fees contribute to platform sustainability
5. **User Experience**: Celebrations, sounds, and animations make gifting fun
6. **Scalability**: Transaction-based system scales with user growth
7. **Analytics**: Admin dashboard provides visibility into gift/donation patterns

---

**Last Updated**: December 18, 2025
**Version**: 1.0
**Author**: WeWatch Platform Team
