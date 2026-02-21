# Platform Owner & Host Payment Setup Guide

**Last Updated:** December 10, 2024  
**Purpose:** Clarify platform owner vs host payment accounts

---

## 🏦 Two Types of Payment Accounts

### 1. Platform Owner Account (YOU)
**Who:** The WeWatch platform owner  
**Purpose:** Receive ALL payments from users (token purchases, ticket sales)  
**Location:** Backend `.env` file  
**Money Flow:** Users → Platform Account → You manually pay hosts

### 2. Host Payment Accounts (HOSTS)
**Who:** Individual content creators/hosts  
**Purpose:** Receive their earnings (85% of ticket sales & donations)  
**Location:** Database (`payment_accounts` table)  
**Money Flow:** Users buy tokens → Host earns tokens → Host requests withdrawal → You pay them

---

## 💰 Platform Owner Setup (YOU)

### Step 1: Create Your Payment Gateway Accounts

#### Stripe Account (International Payments)
1. Go to https://dashboard.stripe.com/register
2. Create account
3. Get your API keys from https://dashboard.stripe.com/test/apikeys
4. Note down:
   - Publishable key: `pk_test_...`
   - Secret key: `sk_test_...`

#### Paystack Account (African Payments)
1. Go to https://dashboard.paystack.com/signup
2. Create account
3. Get your API keys from Settings → API Keys
4. Note down:
   - Public key: `pk_test_...`
   - Secret key: `sk_test_...`

### Step 2: Add Keys to Backend `.env`

Your `.env` file should have:

```bash
# Payment Gateways (YOUR Platform Accounts)
# These are YOUR accounts - all money comes HERE first

# Stripe (for international payments)
STRIPE_PUBLISHABLE_KEY=pk_test_YOUR_STRIPE_KEY_HERE
STRIPE_SECRET_KEY=sk_test_YOUR_STRIPE_SECRET_HERE
STRIPE_WEBHOOK_SECRET=whsec_YOUR_WEBHOOK_SECRET_HERE

# Paystack (for African payments)
PAYSTACK_PUBLIC_KEY=pk_test_YOUR_PAYSTACK_KEY_HERE
PAYSTACK_SECRET_KEY=sk_test_YOUR_PAYSTACK_SECRET_HERE
```

### Step 3: How You Receive Money

**When a user buys 100 tokens ($10 USD):**
```
User's Credit Card
    ↓
💳 Stripe/Paystack processes payment
    ↓
💰 Money goes to YOUR Stripe/Paystack account
    ↓
✅ User gets 100 tokens in WeWatch wallet
    ↓
💵 YOU now have $10 in your Stripe/Paystack account
```

**When a user buys a ticket (50 tokens from host "John"):**
```
User's WeWatch Wallet: 100 tokens → 50 tokens
    ↓
Host "John" earns: 42.5 tokens (85%)
Platform keeps: 7.5 tokens (15% commission)
    ↓
💰 You already have the $10 from token purchase
💰 You keep 15% automatically
```

### Step 4: How You Pay Hosts

**Current Implementation (Manual Payouts):**

1. Host requests withdrawal:
   - POST `/api/payments/payouts/request`
   - Converts tokens to cash (100 tokens = $10)
   - Status: `pending`

2. You review request in admin panel:
   - Check host has verified payment account
   - Check KYC is approved
   - Check withdrawal amount is valid

3. You manually transfer money:
   - Via bank transfer (Paystack → Nigerian banks)
   - Via Stripe Connect (international)
   - Via PayPal, Wise, etc.

4. Mark payout as completed:
   - PUT `/api/payments/payouts/:id/complete`
   - Tokens deducted from host's wallet
   - Payout record marked `completed`

**Future Implementation (Automated Payouts):**
- Stripe Connect for international hosts
- Paystack Transfer API for African hosts
- See `documentation/PHASE3_WEEK2_COMPLETE.md` for details

---

## 👤 Host Payment Setup (HOSTS)

### Validation: Cannot Create Paid Events Without Payment Account

**Backend validation exists!** See `scheduled_events.go` line 81-97:

```go
// When host tries to create a paid event (is_paid = true)
if input.IsPaid {
    // Check for verified payment account
    var paymentAccount models.PaymentAccount
    if err := DB.Where("user_id = ? AND is_verified = ?", hostID, true).
        First(&paymentAccount).Error; err != nil {
        
        // NO VERIFIED ACCOUNT FOUND
        return error: "Payment account required"
        message: "You must set up a verified payment account"
        redirect: "/wallet/accounts"
    }
}
```

### Host Setup Flow

**Step 1: Complete KYC (If Required)**
- Navigate to `/wallet/kyc`
- Upload ID document (passport, ID card, or license)
- Fill in personal information
- Submit for verification
- Wait 24-48 hours for admin approval

**Step 2: Add Payment Account**
- Navigate to `/wallet/accounts`
- Click "Add Account"

**Option A: Paystack (African hosts)**
- Select bank from dropdown (20+ Nigerian banks)
- Enter account number (10 digits)
- System auto-verifies with bank
- Account marked as `verified` immediately

**Option B: Stripe Connect (International hosts)**
- Select country (US, UK, CA, AU, EU)
- Click "Create Stripe Connect"
- Redirected to Stripe onboarding
- Complete Stripe's verification process
- Return to WeWatch
- Account marked as `verified` after 24-48 hours

**Step 3: Create Paid Event**
- Navigate to room
- Click "Schedule Event"
- Toggle "Paid Event" to ON
- Set ticket price (tokens or currency)
- System validates payment account exists
- ✅ Event created successfully

**Step 4: Earn from Events**
- Users buy tickets or send donations
- Host earns 85% (platform keeps 15%)
- Earnings tracked in wallet

**Step 5: Request Withdrawal**
- Navigate to `/wallet/withdraw`
- Select withdrawal source (token balance or gateway earnings)
- Enter amount (min $5 USD or ₦2,000 NGN)
- Select payment account
- Submit request
- Platform owner reviews and pays out

---

## 🔄 Complete Money Flow Example

### Scenario: Host "John" creates paid watch party

**1. John wants to create paid event:**
```
POST /api/rooms/123/scheduled-events
{
  "is_paid": true,
  "ticket_price_tokens": 50
}

Response:
{
  "error": "Payment account required",
  "redirect": "/wallet/accounts",
  "message": "You must set up a verified payment account..."
}
```

**2. John sets up payment account:**
```
# John goes to /wallet/kyc and uploads ID
POST /api/payments/kyc/submit
{ "full_name": "John Doe", "document_type": "passport", ... }

# Admin approves KYC
PUT /api/payments/kyc/approve/456
{ "status": "approved" }

# John adds Paystack account
POST /api/payments/accounts/paystack
{
  "bank_code": "058",  # GTBank
  "account_number": "0123456789"
}

Response:
{
  "account_id": 789,
  "is_verified": true,  # Instant verification!
  "display_name": "GTBank - 0123456789"
}
```

**3. John creates paid event (now succeeds):**
```
POST /api/rooms/123/scheduled-events
{
  "is_paid": true,
  "ticket_price_tokens": 50,
  "title": "Movie Night"
}

Response:
{
  "event_id": 999,
  "message": "Scheduled event created successfully"
}
```

**4. Users buy tickets:**
```
# User 1 buys ticket (has 100 tokens)
POST /api/payments/tickets/purchase
{
  "session_id": 999,
  "payment_method": "tokens"
}

Result:
- User 1: 100 tokens → 50 tokens
- John: 0 tokens → 42.5 tokens (85%)
- Platform: 7.5 tokens commission (15%)
```

**5. John requests withdrawal:**
```
POST /api/payments/payouts/request
{
  "amount": 42.5,
  "source": "token_balance",
  "payment_account_id": 789
}

Result:
- Payout request created (status: pending)
- John's tokens still in wallet (not deducted yet)
- Platform owner notified
```

**6. You (platform owner) pay John:**
```
# You manually transfer ₦4,250 to John's GTBank account
# (42.5 tokens = $4.25 USD = ₦4,250 at ~1,000/$1 rate)

# Then mark as completed
PUT /api/payments/payouts/888/complete

Result:
- 42.5 tokens deducted from John's wallet
- Payout status: completed
- John receives money in bank
```

---

## 🎯 Frontend Implementation Needed

### Current Status
✅ Backend validation exists (line 81-97 in `scheduled_events.go`)  
❌ Frontend doesn't yet check before showing "Create Paid Event" option

### What to Build

**1. Check Payment Account Status**

Before showing paid event option:

```javascript
// In CreateScheduledEventForm component
const [hasPaymentAccount, setHasPaymentAccount] = useState(false);
const [isCheckingAccount, setIsCheckingAccount] = useState(true);

useEffect(() => {
  checkPaymentAccount();
}, []);

const checkPaymentAccount = async () => {
  try {
    const accounts = await getPaymentAccounts();
    const verifiedAccount = accounts.find(acc => acc.is_verified);
    setHasPaymentAccount(!!verifiedAccount);
  } catch (error) {
    console.error('Failed to check payment account:', error);
  } finally {
    setIsCheckingAccount(false);
  }
};
```

**2. Show Setup Prompt**

```jsx
{isPaidEvent && !hasPaymentAccount && (
  <div className="bg-yellow-500/20 border border-yellow-500 rounded-lg p-4">
    <h3 className="font-bold text-yellow-400 mb-2">
      Payment Account Required
    </h3>
    <p className="text-yellow-300 text-sm mb-3">
      You must set up a verified payment account before creating paid events.
    </p>
    <div className="space-y-2 text-sm text-yellow-300 mb-4">
      <div>1. Complete KYC verification</div>
      <div>2. Add a payment account (Paystack or Stripe)</div>
      <div>3. Wait for verification</div>
      <div>4. Return to create your paid event</div>
    </div>
    <button
      onClick={() => navigate('/wallet/accounts')}
      className="px-4 py-2 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg"
    >
      Set Up Payment Account
    </button>
  </div>
)}
```

**3. Disable Paid Toggle Until Ready**

```jsx
<label className="flex items-center gap-2">
  <input
    type="checkbox"
    checked={isPaidEvent}
    onChange={(e) => {
      if (!hasPaymentAccount) {
        alert('Please set up a payment account first');
        return;
      }
      setIsPaidEvent(e.target.checked);
    }}
    disabled={!hasPaymentAccount}
  />
  <span>Paid Event</span>
  {!hasPaymentAccount && (
    <span className="text-xs text-yellow-400">(requires payment account)</span>
  )}
</label>
```

**4. Handle Backend Error Response**

```javascript
const createEvent = async () => {
  try {
    await createScheduledEvent(eventData);
  } catch (error) {
    if (error.response?.data?.action === 'setup_payment_account') {
      // Backend says no payment account
      setShowPaymentSetupModal(true);
    } else {
      setError(error.response?.data?.error);
    }
  }
};
```

---

## 📋 Summary

### Platform Owner (YOU)
✅ Add Stripe/Paystack keys to `.env` file  
✅ All money comes to YOUR accounts first  
✅ You keep 15% commission automatically  
✅ You manually pay out hosts (or automate later)

### Hosts
✅ Cannot create paid events without verified payment account  
✅ Backend validates this automatically  
✅ Must complete: KYC → Add Account → Wait for verification  
✅ Earn 85% of ticket sales & donations  
✅ Request withdrawals anytime  

### Frontend Todo
⚠️ Add payment account check in event creation form  
⚠️ Show setup prompt if no account  
⚠️ Disable paid event toggle until ready  
⚠️ Handle backend error gracefully

---

## 🚀 Next Steps

1. **Platform Owner:**
   - Get your Stripe API keys
   - Get your Paystack API keys
   - Add to backend `.env` file
   - Test token purchase flow

2. **Frontend Developer:**
   - Add payment account check to event creation
   - Show setup prompt for hosts without accounts
   - Test the full flow end-to-end

3. **Testing:**
   - Try creating paid event without payment account (should fail)
   - Set up payment account
   - Try creating paid event again (should succeed)
   - Test full flow: create event → user buys ticket → request payout

---

**All payment flows are ready! Just need to add your API keys to `.env`** 🚀
