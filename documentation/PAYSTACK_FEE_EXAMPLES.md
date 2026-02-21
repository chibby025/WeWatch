# Paystack Fee Calculation Examples

**Official Pricing:** https://paystack.com/pricing  
**Support Article:** https://support.paystack.com/en/articles/2130306

---

## Local Cards (Nigerian)

### Tier 1: Small Transactions (< ₦2,500)
**Rule:** 1.5% only (₦100 fee waived)

| Amount | Fee Calculation | Fee | Net Received | User Gets |
|--------|----------------|-----|--------------|-----------|
| ₦100 | 100 × 0.015 | ₦1.50 | ₦98.50 | 0.61 tokens |
| ₦200 | 200 × 0.015 | **₦3.00** | **₦197.00** ✅ | **1.21 tokens** |
| ₦500 | 500 × 0.015 | ₦7.50 | ₦492.50 | 3.03 tokens |
| ₦1,000 | 1000 × 0.015 | ₦15.00 | ₦985.00 | 6.06 tokens |
| ₦2,000 | 2000 × 0.015 | ₦30.00 | ₦1,970.00 | 12.12 tokens |
| ₦2,499 | 2499 × 0.015 | ₦37.49 | ₦2,461.51 | 15.14 tokens |

**Key Point:** For amounts under ₦2,500, the ₦100 flat fee is waived!

---

### Tier 2: Medium Transactions (₦2,500 - ₦133,333)
**Rule:** 1.5% + ₦100 (not yet capped)

| Amount | Fee Calculation | Fee | Net Received | User Gets |
|--------|----------------|-----|--------------|-----------|
| ₦2,500 | (2500 × 0.015) + 100 | ₦137.50 | ₦2,362.50 | 15.15 tokens |
| ₦3,000 | (3000 × 0.015) + 100 | ₦145.00 | ₦2,855.00 | 18.18 tokens |
| ₦5,000 | (5000 × 0.015) + 100 | ₦175.00 | ₦4,825.00 | 30.30 tokens |
| ₦10,000 | (10000 × 0.015) + 100 | ₦250.00 | ₦9,750.00 | 60.61 tokens |
| ₦20,000 | (20000 × 0.015) + 100 | ₦400.00 | ₦19,600.00 | 121.21 tokens |
| ₦50,000 | (50000 × 0.015) + 100 | ₦850.00 | ₦49,150.00 | 303.03 tokens |
| ₦100,000 | (100000 × 0.015) + 100 | ₦1,600.00 | ₦98,400.00 | 606.06 tokens |

**Note:** Fee increases linearly with amount until cap is reached.

---

### Tier 3: Large Transactions (> ₦133,333)
**Rule:** Fee capped at ₦2,000

| Amount | Uncapped Fee | Actual Fee | Net Received | User Gets |
|--------|-------------|------------|--------------|-----------|
| ₦133,333 | (133333 × 0.015) + 100 = ₦2,100 | **₦2,000** (capped) | ₦131,333.00 | 808.08 tokens |
| ₦150,000 | (150000 × 0.015) + 100 = ₦2,350 | **₦2,000** (capped) | ₦148,000.00 | 909.09 tokens |
| ₦200,000 | (200000 × 0.015) + 100 = ₦3,100 | **₦2,000** (capped) | ₦198,000.00 | 1,218.18 tokens |
| ₦500,000 | (500000 × 0.015) + 100 = ₦7,600 | **₦2,000** (capped) | ₦498,000.00 | 3,063.64 tokens |
| ₦1,000,000 | (1000000 × 0.015) + 100 = ₦15,100 | **₦2,000** (capped) | ₦998,000.00 | 6,145.45 tokens |

**Key Point:** Fee NEVER exceeds ₦2,000 for local Nigerian cards!

---

## International Cards

**Rule:** 3.9% + ₦100 (no waiver, no cap)

| Amount | Fee Calculation | Fee | Net Received | User Gets |
|--------|----------------|-----|--------------|-----------|
| ₦100 | (100 × 0.039) + 100 | ₦103.90 | **-₦3.90** ⚠️ | Loss |
| ₦200 | (200 × 0.039) + 100 | ₦107.80 | ₦92.20 | 0.58 tokens |
| ₦500 | (500 × 0.039) + 100 | ₦119.50 | ₦380.50 | 2.33 tokens |
| ₦1,000 | (1000 × 0.039) + 100 | ₦139.00 | ₦861.00 | 5.30 tokens |
| ₦2,000 | (2000 × 0.039) + 100 | ₦178.00 | ₦1,822.00 | 11.19 tokens |
| ₦5,000 | (5000 × 0.039) + 100 | ₦295.00 | ₦4,705.00 | 28.91 tokens |
| ₦10,000 | (10000 × 0.039) + 100 | ₦490.00 | ₦9,510.00 | 58.45 tokens |
| ₦100,000 | (100000 × 0.039) + 100 | ₦4,000.00 | ₦96,000.00 | 590.91 tokens |
| ₦200,000 | (200000 × 0.039) + 100 | ₦7,900.00 | ₦192,100.00 | 1,182.42 tokens |

**Key Points:**
- ⚠️ International cards MUCH more expensive!
- No ₦100 waiver (always charged)
- No ₦2,000 cap (fee can be very high)
- Small transactions unprofitable

---

## WeWatch Token Calculations

**Token Rate:** ₦165 per token  
**Storage:** Token cents (multiply by 100)  
**Display:** Divide by 100

### Example: ₦200 Purchase (Local Card)

```
User Payment Flow:
1. User pays: ₦200
2. Paystack fee: ₦3 (1.5% only, ₦100 waived)
3. Platform receives: ₦197
4. Token calculation: ₦200 ÷ ₦165 = 1.212121 tokens
5. Stored as: 121 token cents (rounded)
6. User sees: 1.21 tokens
```

**Database State:**
```sql
-- User wallet
token_balance: 121  -- Display as 1.21 tokens

-- Platform accounting
lifetime_user_spend: 200.00      -- User paid ₦200
platform_revenue_balance: 197.00 -- Platform received ₦197
lifetime_gateway_fees: 3.00      -- Paystack fee ₦3
```

**Key Insight:** User gets tokens based on GROSS (₦200), platform tracks NET (₦197).

---

## Code Implementation

### Helper Function

```go
func calculatePaystackFee(amountNGN float64, countryCode string) float64 {
    isInternational := countryCode != "" && countryCode != "NG"
    
    if isInternational {
        // International: 3.9% + ₦100 (no waiver, no cap)
        return (amountNGN * 0.039) + 100.0
    }
    
    // Local Nigerian cards
    if amountNGN < 2500.0 {
        // Small: 1.5% only (₦100 waived)
        return amountNGN * 0.015
    }
    
    // Medium/Large: 1.5% + ₦100 (capped at ₦2,000)
    fee := (amountNGN * 0.015) + 100.0
    if fee > 2000.0 {
        return 2000.0
    }
    return fee
}
```

### Usage in Webhook Handler

```go
// Convert from kobo to naira
grossAmount := float64(event.Data.Amount) / 100.0

// Calculate fee based on card country
countryCode := event.Data.Authorization.CountryCode
gatewayFee := calculatePaystackFee(grossAmount, countryCode)
netAmount := grossAmount - gatewayFee

// Update accounting
accounting.AddTokenPurchaseWithFee(grossAmount, netAmount, gatewayFee)
```

---

## Testing Checklist

### Local Card Tests (Nigerian)

- [ ] ₦100 purchase → Fee: ₦1.50, Net: ₦98.50 ✅
- [ ] **₦200 purchase → Fee: ₦3.00, Net: ₦197.00** ✅ (Your actual transaction)
- [ ] ₦2,000 purchase → Fee: ₦30.00, Net: ₦1,970.00 ✅
- [ ] ₦2,499 purchase → Fee: ₦37.49, Net: ₦2,461.51 ✅ (Last waiver amount)
- [ ] ₦2,500 purchase → Fee: ₦137.50, Net: ₦2,362.50 ✅ (First ₦100 charged)
- [ ] ₦10,000 purchase → Fee: ₦250.00, Net: ₦9,750.00 ✅
- [ ] ₦150,000 purchase → Fee: ₦2,000.00, Net: ₦148,000.00 ✅ (Capped)

### International Card Tests

- [ ] ₦200 purchase → Fee: ₦107.80, Net: ₦92.20 ✅
- [ ] ₦5,000 purchase → Fee: ₦295.00, Net: ₦4,705.00 ✅
- [ ] ₦100,000 purchase → Fee: ₦4,000.00, Net: ₦96,000.00 ✅

### Edge Cases

- [ ] Exactly ₦2,500 → Should charge ₦100 (no waiver) ✅
- [ ] Exactly ₦133,333.33 → Fee should be ₦2,000 (first capped amount) ✅
- [ ] Very large amount (₦10,000,000) → Fee should still be ₦2,000 ✅

---

## Validation Script

Run this in PostgreSQL to validate fee calculations:

```sql
-- Test various amounts
WITH test_amounts AS (
    SELECT amount::DECIMAL FROM (VALUES 
        (100), (200), (500), (1000), (2000), (2499), (2500),
        (3000), (5000), (10000), (50000), (100000), (150000), (200000)
    ) AS t(amount)
)
SELECT 
    amount,
    CASE 
        WHEN amount < 2500 THEN amount * 0.015
        WHEN (amount * 0.015 + 100) > 2000 THEN 2000
        ELSE amount * 0.015 + 100
    END AS fee,
    amount - CASE 
        WHEN amount < 2500 THEN amount * 0.015
        WHEN (amount * 0.015 + 100) > 2000 THEN 2000
        ELSE amount * 0.015 + 100
    END AS net_received,
    ROUND((amount / 165.0) * 100) AS tokens_stored,
    ROUND(amount / 165.0, 2) AS tokens_display
FROM test_amounts
ORDER BY amount;
```

**Expected output:**
```
 amount  |   fee    | net_received | tokens_stored | tokens_display
---------|----------|--------------|---------------|---------------
  100.00 |     1.50 |        98.50 |            61 |           0.61
  200.00 |     3.00 |       197.00 |           121 |           1.21 ✅
  500.00 |     7.50 |       492.50 |           303 |           3.03
 1000.00 |    15.00 |       985.00 |           606 |           6.06
 2000.00 |    30.00 |      1970.00 |          1212 |          12.12
 2499.00 |    37.49 |      2461.51 |          1515 |          15.14
 2500.00 |   137.50 |      2362.50 |          1515 |          15.15
 3000.00 |   145.00 |      2855.00 |          1818 |          18.18
 5000.00 |   175.00 |      4825.00 |          3030 |          30.30
10000.00 |   250.00 |      9750.00 |          6061 |          60.61
50000.00 |   850.00 |     49150.00 |         30303 |         303.03
100000.00|  1600.00 |     98400.00 |         60606 |         606.06
150000.00|  2000.00 |    148000.00 |         90909 |         909.09 ✅
200000.00|  2000.00 |    198000.00 |        121212 |        1212.12 ✅
```

---

## Summary

✅ **Local cards < ₦2,500:** Most cost-effective (1.5% only)  
✅ **Local cards ≥ ₦2,500:** Add ₦100, capped at ₦2,000  
⚠️ **International cards:** Very expensive (3.9% + ₦100, no cap)

**Your ₦200 transaction:** ✅ Correctly calculated as ₦3 fee (1.5% only, ₦100 waived)

