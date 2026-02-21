# WeWatch Token Pricing System

## Overview
WeWatch uses a token-based system for payments within the platform.

## Token Economics

### Pricing
- **₦165 = 1 Token** (Nigerian Naira)
- Tokens are the universal currency for all platform transactions

### Storage Format
- **Tokens are stored as integers representing cents**
- 1 token = 100 units in database
- Example: User buys ₦200 worth of tokens:
  - Calculation: 200 / 165 = 1.2121 tokens
  - Stored as: 121 (represents 1.21 tokens)
  - Display: 1.21 tokens (divide by 100)

### Why This Format?
- Avoids floating-point precision issues
- Ensures accurate calculations for financial transactions
- Standard practice in financial systems (like storing cents instead of dollars)

## Payment Split

### Revenue Distribution
All payments (token purchases, ticket sales, donations) are split:
- **15%** → Platform Revenue Account
- **85%** → Host Reserve Account

### Token Purchase Flow
```
Customer pays ₦200
    ↓
Gateway Earnings Record Created:
- gross_amount: 200.00
- platform_commission: 30.00 (15%)
- net_amount: 170.00 (85%)
    ↓
User receives 121 tokens (1.21 tokens)
```

### Gateway Earnings Table
Token purchases create entries in `gateway_earnings`:
- `session_ticket_id` = NULL (identifies token purchases)
- `donation_id` = NULL (identifies token purchases)
- `host_id` = 1 (system user for token purchases)
- `gross_amount` = total payment
- `platform_commission` = 15% platform fee
- `net_amount` = 85% reserve amount

## Token Transactions

### Transaction Flow
1. User initiates payment via Paystack/Stripe
2. Payment success webhook triggers
3. `TokenTransaction` record created with status "completed"
4. `GatewayEarning` record created for revenue tracking
5. `UserWallet` updated with new token balance

### Token Transaction Fields
- `amount`: Token balance in cents (121 = 1.21 tokens)
- `usd_value`: Equivalent USD value
- `payment_method`: "paystack" or "stripe"
- `payment_id`: Gateway payment reference
- `status`: "completed", "pending", "failed"

## Implementation Notes

### Backend
- Store tokens as integers (multiply by 100)
- Calculate: `tokensInCents = (amount * 100) / 165`
- Track revenue in `gateway_earnings` table

### Frontend
- Display tokens by dividing by 100
- Example: `balance / 100` shows "1.21 tokens"
- Format with 2 decimal places

### Database Queries
Token purchases are identified in analytics by:
```sql
SELECT * FROM gateway_earnings 
WHERE session_ticket_id IS NULL 
  AND donation_id IS NULL
```

## Revenue Calculations

### Admin Dashboard
Total revenue includes:
1. Session ticket sales (from `session_tickets`)
2. Token purchases (from `gateway_earnings` where session_ticket_id IS NULL)
3. Donations (separate tracking)

Platform revenue (15%) calculated from:
1. Ticket sales: `ticket_price_amount * 0.15`
2. Token purchases: `platform_commission` from gateway_earnings

## Future: Paystack Subaccounts

### Option 1: Subaccounts (Recommended for Live)
Create two Paystack subaccounts:
1. Revenue Account (receives 15% automatically)
2. Reserve Account (receives 85% automatically)

Configure at payment time:
```json
{
  "amount": 20000,
  "subaccount": "ACCT_reserve_id",
  "bearer": "account"
}
```

### Option 2: Manual Transfers (Current MVP)
- All payments go to one account
- Track splits in database via `gateway_earnings`
- Transfer 85% to Reserve account periodically

## Testing

### Token Purchase Test
```bash
# User pays ₦200
# Expected:
# - User receives 121 tokens (1.21 tokens displayed)
# - gateway_earnings: gross_amount=200, platform_commission=30, net_amount=170
# - Admin dashboard shows ₦200 in total revenue, ₦30 in platform revenue
```

### Verification Queries
```sql
-- Check user's token balance
SELECT token_balance FROM user_wallets WHERE user_id = ?;
-- Result: 121 (display as 1.21 tokens)

-- Check gateway earnings
SELECT gross_amount, platform_commission, net_amount 
FROM gateway_earnings 
WHERE session_ticket_id IS NULL AND donation_id IS NULL;

-- Check admin revenue
SELECT 
  SUM(gross_amount) as total_revenue,
  SUM(platform_commission) as platform_revenue
FROM gateway_earnings;
```

## Migration Path

### From Old System (if needed)
If old records stored tokens differently:
1. Multiply existing balances by 100
2. Update all queries to divide by 100 for display
3. Test thoroughly before deployment

### Current State (December 2025)
- ✅ Token storage: Cents format (multiply by 100)
- ✅ Revenue tracking: Gateway earnings
- ✅ Admin dashboard: Includes token purchases
- ⏳ Payment split: Database tracking (manual transfer needed)
- 🔜 Paystack subaccounts: Future implementation
