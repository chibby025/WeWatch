# WeWatch Automated Host Payouts - Implementation Guide

**Last Updated**: December 9, 2024  
**Model**: Self-Service Host Withdrawals (No Manual Intervention)  

---

## 🎯 Your Payout Model

### Key Requirement:
> "Hosts withdraw from their Payment page on LobbyLeftSidebar. The platform cut goes to my account automatically. I don't manually process payouts."

**This means: FULLY AUTOMATED PAYOUTS** ✅

---

## 💰 Money Flow (Automated Model)

```
User Buys Ticket: $10 USD
    ↓
💳 Stripe/Paystack Payment
    ↓
✅ Money → YOUR Platform Account
    ↓
🤖 AUTOMATIC TRACKING:
    ├── Host Wallet: +85 tokens ($8.50)
    ├── Gateway Earning (Platform): +$1.50 (15%)
    └── Database updated automatically
    ↓
Host Goes to Payment Page (/payment)
    ↓
Host Clicks "Withdraw" Button
    ├── Selects amount (minimum 50 tokens = $5)
    ├── Enters bank details OR connects payment account
    └── Submits withdrawal request
    ↓
🤖 AUTOMATIC PROCESSING:
    ├── Backend validates request (balance, KYC, etc.)
    ├── Calls Stripe Transfer API OR Paystack Transfer API
    └── Money sent from YOUR account → Host's bank
    ↓
✅ Host Receives Money (2-5 business days)
    ↓
❌ ZERO manual work from you!
```

---

## 🏗️ 3 Implementation Options

### **Option A: Platform-Managed (RECOMMENDED FOR MVP)** ⭐

**How it works:**
1. All payments come to YOUR Stripe/Paystack account
2. Database tracks host earnings (tokens + gateway earnings)
3. Host clicks "Withdraw" → Backend API processes automatically
4. Backend calls Stripe Transfer or Paystack Transfer API
5. Money sent from YOUR account to host's bank

**Implementation:**
```javascript
// Frontend: Payment page withdraw button
const handleWithdraw = async (amount) => {
    const response = await fetch('/api/payouts/request', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            payout_type: 'tokens',
            amount: amount,
            payout_method: 'bank_transfer',
            bank_details: {
                bank_name: 'First Bank',
                account_number: '1234567890',
                account_name: 'John Doe'
            }
        })
    });
    
    // Payout status: pending → processing → completed
};
```

```go
// Backend: Auto-process payouts (cron job or webhook)
// Run every hour to process pending payouts

func AutoProcessPayoutsJob(db *gorm.DB) {
    var pendingPayouts []models.Payout
    db.Where("status = ?", "pending").Find(&pendingPayouts)
    
    for _, payout := range pendingPayouts {
        // Get user details
        var user models.User
        db.First(&user, payout.UserID)
        
        // Verify KYC if >$100
        if payout.AmountUSD > 100 {
            var kyc models.KYCVerification
            db.Where("user_id = ? AND status = ?", user.ID, "approved").First(&kyc)
            if kyc.ID == 0 {
                continue // Skip if no KYC
            }
        }
        
        // Update status to processing
        payout.Status = "processing"
        db.Save(&payout)
        
        // Call Transfer API
        if payout.PayoutMethod == "bank_transfer" {
            err := processTransfer(payout, user)
            if err != nil {
                payout.Status = "failed"
                payout.FailureReason = err.Error()
            } else {
                payout.Status = "completed"
                payout.ProcessedAt = time.Now()
            }
            db.Save(&payout)
        }
        
        // Send notification to host
        // TODO: WebSocket or email notification
    }
}

func processTransfer(payout *models.Payout, user *models.User) error {
    // Determine which API to use based on country
    if user.Country == "NG" || user.Country == "GH" || user.Country == "ZA" {
        return processPaystackTransfer(payout, user)
    } else {
        return processStripeTransfer(payout, user)
    }
}
```

**Pros:**
- ✅ Full control over payouts
- ✅ Can add fraud detection
- ✅ Works with current implementation
- ✅ Multi-currency support (USD, NGN, GHS, KES)
- ✅ You review large payouts before processing

**Cons:**
- ❌ You need sufficient balance in YOUR account
- ❌ Transfer fees ($0.25-$1 per payout)
- ❌ 2-5 business day settlement

**Cost:**
- Stripe Transfer: $0.25 per transfer (US) or 0.25% (international)
- Paystack Transfer: ₦50 (Nigeria), GH₵0.50 (Ghana)

**Best for:** MVP, <1000 hosts, full control needed

---

### **Option B: Stripe Connect (BEST FOR SCALE)** 🚀

**How it works:**
1. Host connects their Stripe account (one-time setup)
2. When user buys ticket, Stripe AUTOMATICALLY splits payment:
   - 85% → Host's Stripe account (instant)
   - 15% → Your platform account (instant)
3. Host manages withdrawals in their own Stripe dashboard
4. NO API calls needed from you!

**Implementation:**
```javascript
// Frontend: Connect Stripe button in Payment page
const connectStripe = async () => {
    const response = await fetch('/api/stripe/connect-onboarding', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
    });
    
    const { url } = await response.json();
    window.location.href = url; // Redirect to Stripe onboarding
};
```

```go
// Backend: Create Stripe Connect account
func CreateStripeConnectAccount(c *gin.Context) {
    user := c.MustGet("user").(*models.User)
    
    // Create Stripe Express account
    account, err := account.New(&stripe.AccountParams{
        Type: stripe.String("express"),
        Country: stripe.String(user.Country),
        Email: stripe.String(user.Email),
        Capabilities: &stripe.AccountCapabilitiesParams{
            CardPayments: &stripe.AccountCapabilitiesCardPaymentsParams{
                Requested: stripe.Bool(true),
            },
            Transfers: &stripe.AccountCapabilitiesTransfersParams{
                Requested: stripe.Bool(true),
            },
        },
    })
    
    // Save Stripe account ID
    user.StripeAccountID = account.ID
    db.Save(&user)
    
    // Create onboarding link
    accountLink, _ := accountlink.New(&stripe.AccountLinkParams{
        Account: stripe.String(account.ID),
        RefreshURL: stripe.String("https://wewatch.tv/payment"),
        ReturnURL: stripe.String("https://wewatch.tv/payment?connected=true"),
        Type: stripe.String("account_onboarding"),
    })
    
    c.JSON(200, gin.H{"url": accountLink.URL})
}

// When processing ticket purchase
func PurchaseTicketWithStripeConnect(ticket *models.SessionTicket, user *models.User) {
    // Create payment with destination (host's Stripe account)
    intent, _ := paymentintent.New(&stripe.PaymentIntentParams{
        Amount: stripe.Int64(ticket.TicketPriceAmount * 100),
        Currency: stripe.String("usd"),
        ApplicationFeeAmount: stripe.Int64(ticket.TicketPriceAmount * 15), // 15% platform fee
        TransferData: &stripe.PaymentIntentTransferDataParams{
            Destination: stripe.String(host.StripeAccountID), // 85% goes to host
        },
    })
    
    // Money splits automatically!
    // 85% → Host's Stripe account (instant)
    // 15% → Your platform account (instant)
}
```

**Pros:**
- ✅ Fully automated (zero work for you!)
- ✅ Instant payouts to host
- ✅ No transfer fees (Stripe handles it)
- ✅ Host manages their own withdrawals
- ✅ Scales to unlimited hosts

**Cons:**
- ❌ Host needs Stripe account (onboarding friction)
- ❌ International only (not for all African countries)
- ❌ Stripe takes 2.9% + $0.30 per transaction

**Cost:**
- Payment processing: 2.9% + $0.30 per transaction
- Transfers: FREE (automatic)

**Best for:** Scale (1000+ hosts), international markets

---

### **Option C: Paystack Subaccounts (AFRICA)** 🌍

**How it works:**
1. Platform creates Paystack subaccount for each host
2. When user buys ticket, Paystack splits payment:
   - 85% → Host's subaccount
   - 15% → Your platform account
3. Host withdraws via Paystack Transfer API

**Implementation:**
```go
// Backend: Create Paystack subaccount
func CreatePaystackSubaccount(user *models.User) (string, error) {
    url := "https://api.paystack.co/subaccount"
    
    payload := map[string]interface{}{
        "business_name": user.Username,
        "settlement_bank": user.BankCode,
        "account_number": user.AccountNumber,
        "percentage_charge": 15, // Platform takes 15%
    }
    
    // Make API call...
    // Returns subaccount_code
    
    // Save to user
    user.PaystackSubaccountCode = subaccountCode
    db.Save(&user)
    
    return subaccountCode, nil
}

// When processing ticket purchase
func PurchaseTicketWithPaystackSubaccount(ticket *models.SessionTicket) {
    url := "https://api.paystack.co/transaction/initialize"
    
    payload := map[string]interface{}{
        "email": user.Email,
        "amount": ticket.TicketPriceAmount * 100, // kobo
        "subaccount": host.PaystackSubaccountCode, // 85% goes here
        "transaction_charge": ticket.TicketPriceAmount * 15, // 15% to platform
    }
    
    // Money splits automatically!
}

// Host withdrawal
func ProcessPaystackWithdrawal(payout *models.Payout, user *models.User) {
    // Transfer from subaccount to host's bank
    url := "https://api.paystack.co/transfer"
    
    payload := map[string]interface{}{
        "source": "balance",
        "amount": payout.AmountNGN * 100,
        "recipient": user.PaystackRecipientCode,
        "reason": fmt.Sprintf("WeWatch Payout #%d", payout.ID),
    }
    
    // Make API call...
}
```

**Pros:**
- ✅ Automated split (85%/15%)
- ✅ Works in Nigeria, Ghana, South Africa
- ✅ Supports mobile money (M-Pesa, MTN, etc.)
- ✅ Lower fees than Stripe

**Cons:**
- ❌ Requires subaccount setup per host
- ❌ Limited to supported African countries
- ❌ Host must verify bank details

**Cost:**
- Payment processing: 1.5% (Nigeria), 2.5% (Ghana)
- Transfer fees: ₦50 per transfer

**Best for:** African markets (Nigeria, Ghana, South Africa)

---

## 📊 Comparison Matrix

| Feature | Option A (Platform-Managed) | Option B (Stripe Connect) | Option C (Paystack) |
|---------|---------------------------|--------------------------|---------------------|
| **Your Involvement** | Cron job setup | One-time setup | Subaccount creation |
| **Host Setup** | Bank details only | Stripe account | Bank verification |
| **Payout Speed** | 2-5 days | Instant | 1-2 days |
| **Transfer Fees** | $0.25-$1 | FREE | ₦50 |
| **Fraud Control** | ✅ Full control | ❌ Limited | ✅ Some control |
| **Scale** | Good (<1000 hosts) | Excellent (unlimited) | Good (Africa) |
| **Balance Required** | ✅ Yes (YOUR account) | ❌ No | ❌ No |
| **Multi-Currency** | ✅ Yes | ✅ Yes | ⚠️ Limited |
| **Implementation** | ✅ Current code works! | New integration | New integration |

---

## 🎯 Recommended Implementation Plan

### Phase 3A: MVP (Next 2 weeks) - Option A ⭐
1. ✅ Use current payout handlers (already built!)
2. ✅ Add Stripe Transfer API integration
3. ✅ Add Paystack Transfer API integration
4. ✅ Create Payment page UI
5. ✅ Add cron job to auto-process payouts every hour
6. ✅ Test with small amounts ($5-$10)

**Code to add:**
```go
// backend/internal/utils/stripe_transfer.go
func StripeTransfer(amount float64, accountID string) error {
    params := &stripe.TransferParams{
        Amount:      stripe.Int64(int64(amount * 100)),
        Currency:    stripe.String("usd"),
        Destination: stripe.String(accountID),
    }
    _, err := transfer.New(params)
    return err
}

// backend/internal/utils/paystack_transfer.go
func PaystackTransfer(amount float64, recipientCode string) error {
    url := "https://api.paystack.co/transfer"
    payload := map[string]interface{}{
        "source": "balance",
        "amount": int(amount * 100),
        "recipient": recipientCode,
    }
    // Make HTTP POST request
    return nil
}

// backend/cmd/server/main.go
// Add cron job
go func() {
    ticker := time.NewTicker(1 * time.Hour)
    for range ticker.C {
        AutoProcessPayoutsJob(DB)
    }
}()
```

---

### Phase 3B: Scale (3-6 months) - Option B/C
1. Add Stripe Connect onboarding
2. Add Paystack Subaccounts
3. Allow hosts to choose payout method
4. Migrate existing hosts gradually

---

## 🎨 Payment Page UI (Frontend)

**What the host sees:**

```
┌─────────────────────────────────────────┐
│          Payment Dashboard              │
├─────────────────────────────────────────┤
│                                         │
│  💰 Your Balance                        │
│  ┌─────────────────────────────────┐   │
│  │ Token Balance:    500 tokens    │   │
│  │ USD Value:        $50.00        │   │
│  │                                 │   │
│  │ Gateway Earnings:               │   │
│  │ • USD:            $25.00        │   │
│  │ • NGN:            ₦10,000       │   │
│  └─────────────────────────────────┘   │
│                                         │
│  🏦 Withdraw Funds                      │
│  ┌─────────────────────────────────┐   │
│  │ Amount: [    100 tokens    ] 💵 │   │
│  │ (Minimum: 50 tokens = $5)       │   │
│  │                                 │   │
│  │ Withdraw Method:                │   │
│  │ ○ Bank Transfer  ○ PayPal       │   │
│  │                                 │   │
│  │ Bank Details:                   │   │
│  │ Bank: [First Bank         ▾]   │   │
│  │ Account: [1234567890       ]   │   │
│  │ Name: [John Doe            ]   │   │
│  │                                 │   │
│  │ [   Withdraw $10.00   ]         │   │
│  └─────────────────────────────────┘   │
│                                         │
│  📜 Payout History                      │
│  ┌─────────────────────────────────┐   │
│  │ Dec 9  | $50.00 | ✅ Completed   │   │
│  │ Dec 5  | $25.00 | ⏳ Processing  │   │
│  │ Dec 1  | $100   | ✅ Completed   │   │
│  └─────────────────────────────────┘   │
│                                         │
│  ℹ️ KYC Status: ✅ Verified            │
│     (Required for payouts >$100)       │
│                                         │
└─────────────────────────────────────────┘
```

---

## 🔐 Security & Fraud Prevention

### Option A (Platform-Managed):
```go
// backend/internal/handlers/payout_handlers.go
func AutoProcessPayoutsJob(db *gorm.DB) {
    var pendingPayouts []models.Payout
    db.Where("status = ?", "pending").Find(&pendingPayouts)
    
    for _, payout := range pendingPayouts {
        // Fraud checks
        if payout.AmountUSD > 1000 {
            // Flag for manual review
            payout.Status = "under_review"
            db.Save(&payout)
            continue
        }
        
        // Check daily withdrawal limit
        var dailyTotal float64
        db.Model(&models.Payout{}).
            Where("user_id = ? AND created_at > ?", payout.UserID, time.Now().Add(-24*time.Hour)).
            Select("SUM(amount_usd)").Scan(&dailyTotal)
        
        if dailyTotal > 5000 {
            // Exceed daily limit
            payout.Status = "under_review"
            db.Save(&payout)
            continue
        }
        
        // Process payout...
    }
}
```

---

## 💡 Next Steps

### Immediate (Phase 3 - Week 1):
1. ✅ Enable "Payment" in LobbyLeftSidebar (done!)
2. Create Payment page component (`/frontend/src/pages/PaymentPage.jsx`)
3. Add Stripe Transfer API integration
4. Add Paystack Transfer API integration
5. Add payout auto-processing cron job
6. Test with Stripe/Paystack test accounts

### Future (Phase 4):
1. Add Stripe Connect integration
2. Add Paystack Subaccounts
3. Add email notifications for payout status
4. Add analytics dashboard for earnings

---

## 🎯 Summary

**Your Model: Self-Service Automated Payouts** ✅

- Hosts withdraw from Payment page (no manual work from you!)
- Platform automatically tracks 85%/15% split
- Backend processes payouts via Transfer APIs
- Cron job runs hourly to process pending payouts
- Current implementation (Option A) works perfectly for this!

**Just need to add:**
1. Stripe Transfer API calls
2. Paystack Transfer API calls
3. Payment page UI
4. Cron job for auto-processing

**Ready to implement Phase 3? Let me know and we'll build the Payment page!** 🚀
