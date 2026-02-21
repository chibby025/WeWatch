# 🎨 WeWatch Payment System - Visual Component Guide

## Component Screenshots & UI Descriptions

This document provides visual descriptions of all 10 payment components built in Phase 4.

---

## 1. 💳 Wallet Dashboard

**Route:** `/wallet`  
**Size:** 300 lines  
**Purpose:** Main wallet interface

### Layout
```
┌─────────────────────────────────────────────────────────────┐
│ [← Back] 💳 Wallet                        [🪙 Buy Tokens]  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ 🪙 TOKENS    │  │ 💰 EARNINGS  │  │ 📊 LIFETIME  │     │
│  │              │  │              │  │              │     │
│  │   1,234      │  │   $567.89    │  │ ↗ $2,345    │     │
│  │   tokens     │  │   available  │  │ ↘ $1,234    │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ 🎟️ TICKETS   │  │ 💝 DONATIONS │  │ 💸 WITHDRAWN │     │
│  │   45 sold    │  │   $123.45    │  │   $890.12    │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
│                                                              │
│  📋 Transaction History                                     │
│  [All] [Purchase] [Ticket] [Donation] [Payout]            │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Date       │ Type      │ Amount      │ Status        │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ Dec 15     │ Purchase  │ +100 tokens │ ✅ Completed │   │
│  │ Dec 14     │ Donation  │ -50 tokens  │ ✅ Completed │   │
│  │ Dec 13     │ Ticket    │ -30 tokens  │ ✅ Completed │   │
│  │ Dec 12     │ Payout    │ $50.00      │ ⏳ Pending   │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  [← Previous] Page 1 of 5 [Next →]                         │
└─────────────────────────────────────────────────────────────┘
```

### Features
- **Balance Cards:** Gradient backgrounds, large numbers
- **Stats Grid:** 6 quick stat cards
- **Transaction Table:** Sortable, filterable, paginated
- **Color Coding:** Green (income), Red (expense), Yellow (pending)

---

## 2. 🪙 Token Purchase Modal

**Component:** `TokenPurchaseModal`  
**Size:** 400 lines  
**Purpose:** Buy tokens with credit card

### Layout
```
┌─────────────────────────────────────────────────────────────┐
│ 🪙 Buy Tokens                                          [X]  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Select Currency                                            │
│  [USD] [NGN] [EUR] [GBP]                                   │
│                                                              │
│  Select Payment Gateway                                     │
│  [💳 Stripe] [🏦 Paystack]                                 │
│                                                              │
│  Choose Package                                             │
│                                                              │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐      │
│  │  100    │  │  500    │  │  1,000  │  │  5,000  │      │
│  │ tokens  │  │ tokens  │  │ tokens  │  │ tokens  │      │
│  │         │  │ +10%    │  │ +15%    │  │ +20%    │      │
│  │  $5.00  │  │ $20.00  │  │ $40.00  │  │ $200.00 │      │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘      │
│                                                              │
│  ℹ️ You'll be redirected to complete payment securely      │
│                                                              │
│                    [Purchase Tokens]                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Features
- **Currency Tabs:** USD, NGN, EUR, GBP with auto-conversion
- **Gateway Selection:** Stripe (international), Paystack (Africa)
- **Package Grid:** 4 packages with bonus tokens
- **Visual Feedback:** Selected package highlights in blue
- **Secure Notice:** Redirect to official payment gateway

---

## 3. 💝 Donation Widget

**Component:** `DonationWidget`  
**Size:** 200 lines  
**Purpose:** Send tips to hosts during sessions

### Layout
```
┌─────────────────────────────────────────────┐
│ 💝 Send Donation to John Doe                │
├─────────────────────────────────────────────┤
│                                              │
│  Your Balance: 1,234 tokens                 │
│                                              │
│  Quick Amounts:                             │
│  [10] [25] [50] [100] [250] [500]          │
│                                              │
│  Or enter custom amount:                    │
│  [ 75 tokens                         ]      │
│                                              │
│  Add a message (optional):                  │
│  ┌──────────────────────────────────────┐   │
│  │ Great stream! Thanks for hosting! 😊 │   │
│  │                                      │   │
│  └──────────────────────────────────────┘   │
│  0/200 characters                           │
│                                              │
│  [Send Donation 💝]                         │
│                                              │
└─────────────────────────────────────────────┘
```

### Features
- **Balance Display:** Real-time token balance
- **Preset Buttons:** 6 common amounts
- **Custom Input:** Any amount within balance
- **Message Field:** 200 character limit with counter
- **Success Animation:** Confetti effect after donation
- **Validation:** Prevents insufficient balance

---

## 4. 🎟️ Ticket Purchase Modal

**Component:** `TicketPurchaseModal`  
**Size:** 330 lines  
**Purpose:** Buy tickets for scheduled sessions

### Layout
```
┌─────────────────────────────────────────────────────────────┐
│ 🎟️ Purchase Ticket                                    [X]  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Friday Movie Night                                         │
│  Hosted by: @johndoe | Type: Watch Party                   │
│  📅 Dec 20, 2024 at 8:00 PM EST | ⏱️ 2 hours              │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 🎉 EARLY BIRD SPECIAL!                               │   │
│  │                                                       │   │
│  │ Regular Price: 50 tokens                             │   │
│  │ Early Bird:    30 tokens    You Save: 20 tokens!    │   │
│  │                                                       │   │
│  │ ⏰ Offer ends in: 2 days 5 hours                     │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  □ Gift this ticket to a friend                             │
│    Username: [____________]                                 │
│    Message:  [____________]                                 │
│                                                              │
│  Payment Method:                                            │
│  ● Tokens (Instant) ○ Credit Card                          │
│                                                              │
│  Total: 30 tokens                                           │
│                                                              │
│  [Purchase Ticket]                                          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Features
- **Session Info:** Host, type, date/time, duration
- **Early Bird Pricing:** Highlighted savings
- **Countdown Timer:** Creates urgency
- **Gift Option:** Send to friend with message
- **Payment Methods:** Tokens (instant) or card (redirect)
- **Purchase Summary:** Clear pricing breakdown

---

## 5. 🏦 Payment Account Management

**Route:** `/wallet/accounts`  
**Size:** 550 lines  
**Purpose:** Manage withdrawal accounts

### Layout
```
┌─────────────────────────────────────────────────────────────┐
│ 🏦 Payment Accounts                      [+ Add Account]   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ [🏦 Paystack] [⭐ Primary] [✓ Verified]             │   │
│  │                                                       │   │
│  │ GTBank - 0123456789                                  │   │
│  │ Currency: NGN                                        │   │
│  │ Added: Dec 10, 2024                                  │   │
│  │                                                       │   │
│  │                                          [Delete]    │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ [💳 Stripe Connect] [⏳ Pending]                     │   │
│  │                                                       │   │
│  │ United States Account                                │   │
│  │ Currency: USD                                        │   │
│  │ Added: Dec 12, 2024                                  │   │
│  │                                                       │   │
│  │ [Complete Setup] [Set Primary] [Delete]              │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Add Account Modal
```
┌─────────────────────────────────────────────────────────────┐
│ Add Payment Account                                    [X]  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Select Account Type                                        │
│                                                              │
│  ┌──────────────────┐     ┌──────────────────┐            │
│  │      🏦          │     │      💳          │            │
│  │   Paystack      │     │ Stripe Connect   │            │
│  │ For African     │     │ For international│            │
│  │ bank accounts   │     │    accounts      │            │
│  └──────────────────┘     └──────────────────┘            │
│                                                              │
│  Bank *                                                     │
│  [Select your bank ▼]                                      │
│                                                              │
│  Account Number *                                           │
│  [0123456789_____]                                         │
│                                                              │
│  ℹ️ We'll verify your account automatically                │
│                                                              │
│  [Add Paystack Account]                                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Features
- **Account List:** Shows all connected accounts
- **Status Badges:** Verified, Pending, Primary
- **Add Paystack:** Bank selector + account number
- **Add Stripe:** Country selector + redirect to onboarding
- **Set Primary:** One-click primary account switch
- **Delete:** Confirmation before removal

---

## 6. 💸 Withdrawal Request Form

**Route:** `/wallet/withdraw`  
**Size:** 420 lines  
**Purpose:** Request payouts to bank account

### Layout
```
┌─────────────────────────────────────────────────────────────┐
│ 💸 Request Withdrawal                                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Withdrawal Source                                          │
│                                                              │
│  ┌─────────────────┐     ┌─────────────────┐              │
│  │   🪙 TOKENS     │     │  💰 GATEWAY     │              │
│  │                 │     │   EARNINGS      │              │
│  │     1,234       │     │                 │              │
│  │     tokens      │     │  Paystack: $123 │              │
│  │                 │     │  Stripe: $456   │              │
│  └─────────────────┘     └─────────────────┘              │
│                                                              │
│  Payment Account *                                          │
│  [GTBank - 0123456789 (NGN) ▼]                            │
│                                                              │
│  Amount (NGN) *                                             │
│  [5000_________]                           [Use Max]       │
│  Available: ₦10,000                                         │
│                                                              │
│  ℹ️ Withdrawal Information:                                │
│  • Minimum: ₦2,000                                          │
│  • Processing: 2-3 business days                           │
│  • No fees for amounts above minimum                       │
│                                                              │
│  [Request Withdrawal]                                       │
│                                                              │
│  ─────────────────────────────────────────────────────────  │
│                                                              │
│  📋 Withdrawal History                              [▼]    │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Date    │ Amount     │ Account        │ Status      │   │
│  ├─────────────────────────────────────────────────────┤   │
│  │ Dec 15  │ ₦5,000    │ GTBank         │ ⏳ Pending  │   │
│  │ Dec 10  │ $50.00    │ Stripe         │ ✅ Complete │   │
│  │ Dec 5   │ ₦3,000    │ GTBank         │ ✅ Complete │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Features
- **Source Selection:** Token balance vs gateway earnings
- **Account Selector:** Dropdown of verified accounts
- **Amount Input:** With min/max validation
- **Use Max Button:** Quick fill available balance
- **Info Box:** Clear processing details
- **History Table:** Past withdrawals with status
- **Cancel Option:** Cancel pending withdrawals

---

## 7. 🔐 KYC Submission Form

**Route:** `/wallet/kyc`  
**Size:** 520 lines  
**Purpose:** Submit identity verification

### Layout
```
┌─────────────────────────────────────────────────────────────┐
│ 🔐 KYC Verification                                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ✅ Current Verification Status                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ [⏳ Pending]                                          │   │
│  │ Submitted: Dec 15, 2024                              │   │
│  │                                                       │   │
│  │ ⏳ Your documents are being reviewed.                │   │
│  │    This usually takes 24-48 hours.                   │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ───────────────────────────────────────────────────────────│
│                                                              │
│  Personal Information                                       │
│                                                              │
│  Full Name (as on document) *                               │
│  [John Doe__________]                                       │
│                                                              │
│  Date of Birth *                                            │
│  [12/31/1990_______]                                        │
│                                                              │
│  Residential Address *                                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ 123 Main Street, City, State, Country                │   │
│  │                                                       │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  Document Type                                              │
│  ○ 🪪 National ID Card                                     │
│  ● 📘 International Passport                               │
│  ○ 🚗 Driver's License                                     │
│                                                              │
│  Upload Document - Front Side *                             │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                                                       │   │
│  │                   📤                                  │   │
│  │       Click or drag to upload                        │   │
│  │       JPG, PNG, or PDF (max 5MB)                     │   │
│  │                                                       │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  [Submit for Verification]                                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Features
- **Status Display:** Current KYC status with badge
- **Personal Info:** Name, DOB, address fields
- **Document Types:** ID card, passport, driver's license
- **Drag-and-Drop Upload:** Visual upload area
- **Image Preview:** Show uploaded image before submit
- **File Validation:** Size (5MB) and format (jpg/png/pdf)
- **Status Updates:** Pending, approved, rejected with reasons
- **Resubmit:** If rejected, can resubmit with corrections

---

## 8. Navigation Integration

### WalletPage Navigation Bar
```
┌─────────────────────────────────────────────────────────────┐
│ [← Back] 💳 Wallet                        [🪙 Buy Tokens]  │
├─────────────────────────────────────────────────────────────┤
│ [🏦 Payment Accounts (2)] [💸 Withdraw] [🔐 KYC ✓]       │
└─────────────────────────────────────────────────────────────┘
```

### Home Page Quick Actions
```
┌─────────────────────────────────────────────────────────────┐
│                    WeWatch                                   │
│              Your balance: 1,234 🪙                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Quick Actions:                                             │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   🎬        │  │   ➕        │  │   💳        │        │
│  │   Rooms     │  │   Create    │  │   Wallet    │        │
│  └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 🎨 Design System

### Colors
- **Primary:** Purple-Pink gradient (`from-purple-600 to-pink-600`)
- **Success:** Green (`green-500`)
- **Warning:** Yellow (`yellow-500`)
- **Error:** Red (`red-500`)
- **Info:** Blue (`blue-500`)
- **Background:** Dark gray (`gray-900`, `gray-800`, `gray-750`)
- **Text:** White, Gray-400, Gray-300

### Typography
- **Headings:** Bold, Large (2xl-3xl)
- **Body:** Regular, Medium (sm-base)
- **Buttons:** Medium, Font-medium/bold
- **Status:** Small, Font-medium

### Spacing
- **Cards:** Padding 6 (24px)
- **Sections:** Gap 6 (24px)
- **Grid:** Gap 4 (16px)
- **Inline:** Gap 2-3 (8-12px)

### Borders
- **Radius:** Rounded-lg (8px), Rounded-xl (12px), Rounded-2xl (16px)
- **Width:** Border-2 for emphasis, Border for default
- **Colors:** Gray-700 (default), Color-500 (active)

### Shadows
- **Cards:** Shadow-lg with color/20 opacity
- **Buttons:** Shadow-lg on gradients
- **Hover:** Increase shadow on hover

---

## 🎯 Responsive Breakpoints

All components are responsive:
- **Mobile:** Stack vertically, full width
- **Tablet:** 2-column grids
- **Desktop:** 3-4 column grids, max-width containers

Max widths:
- Wallet Dashboard: `max-w-7xl`
- Forms: `max-w-3xl`
- Account Management: `max-w-5xl`
- Modals: `max-w-2xl`

---

## 🚀 Interaction States

### Buttons
- **Default:** Solid color or gradient
- **Hover:** Darker shade, transform scale
- **Active:** Even darker, pressed effect
- **Disabled:** Opacity 50%, no pointer events
- **Loading:** Spinner or "Loading..." text

### Forms
- **Default:** Gray background, gray border
- **Focus:** Colored border, outline removed
- **Error:** Red border, error text below
- **Success:** Green border, checkmark

### Cards
- **Default:** Gray background, no border
- **Hover:** Lighter background, border appears
- **Selected:** Colored background, colored border
- **Active:** Shadow increase, scale up slightly

---

## 📱 Mobile Optimizations

- **Touch Targets:** Minimum 44x44px
- **Spacing:** Increased tap area padding
- **Modals:** Full-screen on mobile
- **Tables:** Horizontal scroll or card layout
- **Navigation:** Hamburger menu (if needed)
- **Inputs:** Large text (16px) to prevent zoom

---

## ♿ Accessibility

- **Semantic HTML:** Proper heading hierarchy, labels
- **ARIA Labels:** Screen reader descriptions
- **Keyboard Navigation:** Tab order, focus indicators
- **Color Contrast:** WCAG AA compliant
- **Focus Visible:** Clear focus rings
- **Error Messages:** Associated with inputs

---

## 🎉 Summary

All 10 components follow consistent design patterns:
- ✅ Dark theme throughout
- ✅ Gradient accents for primary actions
- ✅ Clear status indicators (badges, colors)
- ✅ Loading and error states
- ✅ Responsive layouts
- ✅ Smooth animations and transitions
- ✅ Professional, modern UI

**The WeWatch payment system has a cohesive, polished design!** 🚀
