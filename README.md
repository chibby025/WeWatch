# WeWatch - Social Video Watching Platform

A real-time social video watching experience with integrated payments, 3D cinema environments, and live interaction.

---

## 🚀 Quick Start

### Backend
```bash
cd backend
./main
# Server running on http://localhost:8080
```

### Frontend
```bash
cd frontend
npm run dev
# App running on http://localhost:5173
```

---

## 📚 Documentation

**All technical documentation is in the [documentation/](./documentation/) folder.**

### ⚡ Quick Setup
- **[QUICK_START_PAYSTACK.md](./QUICK_START_PAYSTACK.md)** - 5-minute setup for automated transfers (START HERE!)

### Essential Docs
- **[INDEX.md](./documentation/INDEX.md)** - Complete documentation index
- **[AUTOMATED_PAYMENTS_COMPLETE.md](./documentation/AUTOMATED_PAYMENTS_COMPLETE.md)** - Automated payment system overview
- **[PAYSTACK_TRANSFER_SETUP.md](./documentation/PAYSTACK_TRANSFER_SETUP.md)** - Detailed transfer setup guide
- **[PLATFORM_PAYMENT_SETUP.md](./documentation/PLATFORM_PAYMENT_SETUP.md)** - Payment account setup
- **[PAYMENT_API_REFERENCE.md](./documentation/PAYMENT_API_REFERENCE.md)** - API documentation
- **[TOKEN_PRICING.md](./backend/TOKEN_PRICING.md)** - Token economics & pricing

---

## 💰 Payment System (COMPLETE! ✅)

### Backend Features (44 API Endpoints)
- ✅ Token-based economy (1 token = $0.10 USD)
- ✅ Stripe & Paystack integration
- ✅ Session tickets & donations
- ✅ **Automated host withdrawals** (Stripe Connect + Paystack Transfer API)
- ✅ **Goroutine-based async transfer processing**
- ✅ **Payment account management** (bank verification, Stripe onboarding)
- ✅ KYC verification (for payouts >$100)
- ✅ Refund management (24-hour window)
- ✅ Multi-currency support (6 currencies: NGN, GHS, KES, USD, EUR, GBP)
- ✅ 15% platform commission (hosts receive 85%)

### Frontend Features (10 React Components)
- ✅ **Wallet Dashboard** - Balance, transactions, stats
- ✅ **Token Purchase** - Buy tokens with Stripe/Paystack
- ✅ **Donation Widget** - Send tips to hosts
- ✅ **Ticket Purchase** - Buy session tickets
- ✅ **Payment Accounts** - Manage withdrawal accounts
- ✅ **Withdrawal Request** - Request payouts
- ✅ **KYC Submission** - Upload identity documents
- ✅ **Multi-currency UI** - USD, NGN, EUR, GBP
- ✅ **Dark theme** - Professional, modern design
- ✅ **Responsive** - Mobile, tablet, desktop

### API Endpoints
**44 payment-related endpoints** across:
- Wallet management
- Token purchases
- Tickets & donations
- Payment accounts (Paystack + Stripe Connect)
- Automated withdrawals (dual gateway support)
- Payouts & KYC
- Refunds & webhooks

See [PAYMENT_API_REFERENCE.md](./documentation/PAYMENT_API_REFERENCE.md) for details.

---

## 🎬 Features

- 🎥 Real-time video watching with friends
- 🏛️ 3D cinema environments (Three.js)
- 👥 Avatar system with spatial audio
- 💬 Live chat & reactions
- 📅 Scheduled events
- 🎟️ Ticketed sessions
- 💝 Host donations
- 🔐 KYC verification
- 💸 Automated webhooks

---

## 🏗️ Tech Stack

### Backend
- Go 1.x + Gin framework
- PostgreSQL + GORM
- WebSockets + LiveKit
- Stripe + Paystack

### Frontend
- React + Vite
- Three.js for 3D
- Tailwind CSS

---

## 🔧 Environment Setup

```bash
# Create .env file in backend/
cp backend/.env.example backend/.env

# Add your payment keys:
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
PAYSTACK_PUBLIC_KEY=pk_test_...
PAYSTACK_SECRET_KEY=sk_test_...
```

See [PLATFORM_PAYMENT_SETUP.md](./documentation/PLATFORM_PAYMENT_SETUP.md) for complete setup guide.

---

## 📊 Project Status

### ✅ Completed
- Database schema (15+ tables)
- Payment backend (36 APIs)
- Room management
- 3D cinema theater
- Real-time features

### 🚧 In Progress
- Frontend payment components
- Admin dashboard

### 📋 Planned
- Automated payouts
- Email notifications
- Analytics dashboard

---

## 📁 Project Structure

```
WeWatch/
├── backend/           # Go backend
│   ├── cmd/server/    # Main entry point
│   ├── internal/      # Handlers, models, utils
│   └── uploads/       # User uploads
├── frontend/          # React frontend
│   ├── src/           # Components, pages, hooks
│   └── public/        # Static assets
└── documentation/     # All technical docs
    ├── INDEX.md       # Documentation index
    └── *.md           # Feature-specific docs
```

---

## 🎯 Getting Started

1. **Read the docs**: Start with [documentation/INDEX.md](./documentation/INDEX.md)
2. **Set up payments**: Follow [PLATFORM_PAYMENT_SETUP.md](./documentation/PLATFORM_PAYMENT_SETUP.md)
3. **Run the backend**: `cd backend && ./main`
4. **Run the frontend**: `cd frontend && npm run dev`
5. **Test payments**: Use [PAYMENT_API_REFERENCE.md](./documentation/PAYMENT_API_REFERENCE.md)

---

## 📞 Support

- Check `backend/server.log` for backend issues
- Check `documentation/` for feature guides
- Check Stripe/Paystack dashboards for payment issues

---

**Built with ❤️ for social watching**

*Version: 1.0.0 | Last Updated: December 9, 2024*
