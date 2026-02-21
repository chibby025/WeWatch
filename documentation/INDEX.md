# WeWatch Platform Documentation

**Last Updated**: December 30, 2025  
**Platform Version**: 2.0.0  

Welcome to the complete technical documentation for the WeWatch platform - a real-time social video watching experience with integrated payments, 3D immersive environments, and educational features.

---

## 📚 Documentation Index

### 🚀 Getting Started
- [README.md](./README.md) - Platform overview
- [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) - Quick command reference

---

## 💰 Payment System (COMPLETE! Backend + Frontend ✅)

### 🎯 START HERE
- **[PAYMENT_FLOW_EXPLAINED.md](./PAYMENT_FLOW_EXPLAINED.md)** 📖 **NEW!**  
  **Complete payment flow explanation - READ THIS FIRST!**
  - How the 85/15 split works
  - Token payment vs Direct gateway payment
  - Revenue tracking and accounting
  - Full user journey examples
  - Backend code locations

- **[PAYMENT_SETUP_TODO.md](./PAYMENT_SETUP_TODO.md)** 🔧  
  Setup checklist and configuration guide
  - Paystack account setup (✅ COMPLETE)
  - Environment variables
  - Database migrations (✅ COMPLETE)
  - Testing guide

### Implementation Guides - Backend
- **[PAYMENT_PHASE_2_WEEK1_COMPLETE.md](./PAYMENT_PHASE_2_WEEK1_COMPLETE.md)** ✅  
  Phase 2 Week 1: Core payment APIs (wallets, tokens, tickets, donations)
  - 10 API endpoints
  - 4 handler files
  - Database schema setup

- **[PHASE2_WEEK2_COMPLETE.md](./PHASE2_WEEK2_COMPLETE.md)** ✅  
  Phase 2 Week 2: Advanced payment features (payouts, KYC, refunds, webhooks)
  - 26 API endpoints
  - 5 handler files + 1 utility service
  - File upload system

- **[PHASE3_WEEK1_COMPLETE.md](./PHASE3_WEEK1_COMPLETE.md)** ✅  
  Phase 3 Week 1: Payment Account Management (Automated Payouts Foundation)
  - 5 API endpoints for bank account management
  - Paystack bank verification integration
  - Multiple accounts support with primary designation
  - Database migration (payment_accounts table)
  - Backend models and handlers complete

- **[PHASE3_WEEK2_COMPLETE.md](./PHASE3_WEEK2_COMPLETE.md)** ✅  
  Phase 3 Week 2: Withdrawal Flow & Stripe Connect (Automated Payouts Complete!)
  - 4 API endpoints (Stripe Connect + withdrawals)
  - Goroutine-based async transfer processing
  - Paystack Transfer API + Stripe Transfer API integration
  - Status polling system (30s intervals, 10 min max)
  - Dual source withdrawals (tokens + gateway earnings)
  - **Total Payment APIs: 44 endpoints** 🎉

### Implementation Guides - Frontend
- **[PHASE4_WEEK1_SESSION_COMPLETE.md](./PHASE4_WEEK1_SESSION_COMPLETE.md)** ✅  
  Phase 4 Session 1: First 7 Payment Components
  - Payment API Service (850 lines, 44 endpoints)
  - Payment Context (258 lines)
  - Wallet Dashboard (300 lines)
  - Token Purchase Modal (400 lines)
  - Donation Widget (200 lines)
  - Ticket Purchase Modal (330 lines)
  - Integration into App (routes, navigation)

- **[PHASE4_COMPLETE.md](./PHASE4_COMPLETE.md)** ✅ **NEW!**  
  **Phase 4: Frontend Payment Components - 100% COMPLETE!**
  - All 10 React components built (~4,200 lines)
  - Payment Account Management (550 lines)
  - Withdrawal Request Form (420 lines)
  - KYC Submission Form (520 lines)
  - Full integration with backend (44 endpoints)
  - Dark theme, responsive design
  - **Payment system production-ready!** 🚀

### Visual Guides
- **[PAYMENT_UI_GUIDE.md](./PAYMENT_UI_GUIDE.md)** 🎨 **NEW!**  
  Visual component guide with ASCII layouts
  - Screenshots and UI descriptions
  - Component layouts and features
  - Design system documentation
  - Responsive breakpoints
  - Accessibility notes

### API Reference
- **[PAYMENT_API_REFERENCE.md](./PAYMENT_API_REFERENCE.md)** 📖  
  Complete API documentation with request/response examples
  - **44 payment endpoints** (10 + 26 + 5 + 4) ✅
  - cURL examples
  - Error handling
  - Common flows

### Setup & Configuration
- **[PLATFORM_PAYMENT_SETUP.md](./PLATFORM_PAYMENT_SETUP.md)** 🔧  
  **READ THIS FIRST!** Platform owner payment setup guide
  - Stripe account setup
  - Paystack account setup
  - Manual vs automated payouts
  - Platform revenue collection (15% commission)
  - Environment variables
  - Going live checklist

---

## 🎭 Room Features

### Room Management
- **[BACKEND_ROOM_UPDATES.md](./BACKEND_ROOM_UPDATES.md)**  
  Room creation, management, and membership system

- **[ROOMPAGE_REDESIGN_PLAN.md](./ROOMPAGE_REDESIGN_PLAN.md)**  
  UI/UX redesign plan for room interface

- **[ROOMPAGE_TESTING_PLAN.md](./ROOMPAGE_TESTING_PLAN.md)**  
  Comprehensive testing plan for room features

### RoomTV Content System
- **[ROOMTV_FEATURE_SUMMARY.md](./ROOMTV_FEATURE_SUMMARY.md)**  
  RoomTV content sharing system overview

- **[ROOMTV_ANIMATIONS_IMPLEMENTATION.md](./ROOMTV_ANIMATIONS_IMPLEMENTATION.md)**  
  Animation system for RoomTV content transitions

- **[ROOMTV_MEDIA_LIFECYCLE.md](./ROOMTV_MEDIA_LIFECYCLE.md)**  
  Media item lifecycle and state management

---

## 📅 Scheduled Events
- **[SCHEDULED_EVENTS_IMPROVEMENTS.md](./SCHEDULED_EVENTS_IMPROVEMENTS.md)**  
  Event scheduling system with calendar integration

---

## 🎬 Theater System
- **[THEATER_TESTING_PLAN.md](./THEATER_TESTING_PLAN.md)**  
  3D cinema theater testing and validation

- **[CINEMA_3D_SUMMARY.md](./CINEMA_3D_SUMMARY.md)**  
  3D cinema implementation summary

---

## 🎓 Lecture Hall System (NEW - December 2025)

### Complete Educational Platform
- **[LECTURE_HALL_COMPLETE_SUMMARY.md](./LECTURE_HALL_COMPLETE_SUMMARY.md)** 📖 **START HERE!**  
  Complete lecture hall implementation overview
  - 145-seat capacity (1 teacher + 144 students)
  - 3D visualization with GLB model
  - Row-based audio routing
  - Raise hand approval system
  - Integrated quiz system with auto-grading
  - Architecture diagrams and data flow

- **[LECTURE_HALL_TESTING_GUIDE.md](./LECTURE_HALL_TESTING_GUIDE.md)** 🧪  
  Comprehensive testing guide
  - 9 test suites with 50+ scenarios
  - Audio routing test cases
  - Raise hand system tests
  - Members modal validation
  - Performance benchmarks

- **[LECTURE_HALL_RAISE_HAND_COMPLETE.md](./LECTURE_HALL_RAISE_HAND_COMPLETE.md)**  
  Raise hand system documentation
  - Request/approve/revoke workflow
  - WebSocket message handlers
  - UI states and indicators
  - Host notification system

- **[LECTURE_HALL_AUDIO_ROUTING.md](./LECTURE_HALL_AUDIO_ROUTING.md)**  
  Audio routing architecture
  - Row-based audio (8 rows × 18 seats)
  - Approved speaker broadcasting
  - Bandwidth optimization
  - Recipient filtering logic

### Quiz System (COMPLETE ✅)
- **[QUIZ_COMPLETE_SUMMARY.md](./QUIZ_COMPLETE_SUMMARY.md)** 📋 **IMPLEMENTATION COMPLETE!**  
  Complete quiz system summary
  - Backend + Frontend + Integration ✅
  - 4 modals (~1,000 lines)
  - Auto-grading system
  - Real-time WebSocket communication
  - Ready for testing

- **[QUIZ_SYSTEM_SPECIFICATION.md](./QUIZ_SYSTEM_SPECIFICATION.md)**  
  Technical specification
  - Database schema (JSONB questions/answers)
  - Question types (text input, multiple choice)
  - Auto-grading logic
  - Security and validation

- **[QUIZ_INTEGRATION_GUIDE.md](./QUIZ_INTEGRATION_GUIDE.md)**  
  VideoWatch.jsx integration guide
  - Step-by-step integration instructions
  - State management setup
  - WebSocket handler implementation
  - Modal rendering and props

- **[QUIZ_PHASE1_COMPLETE.md](./QUIZ_PHASE1_COMPLETE.md)**  
  Backend implementation (Phase 1)
  - Database migration
  - Models, services, handlers
  - 438 lines of backend code

- **[QUIZ_PHASE2_COMPLETE.md](./QUIZ_PHASE2_COMPLETE.md)**  
  Frontend implementation (Phase 2)
  - 4 modal components
  - Taskbar and LeftSidebar integration
  - ~1,000 lines of React code

---

## 🎨 Avatar & Camera Systems
- **[AVATAR_CAMERA_SEPARATION.md](./AVATAR_CAMERA_SEPARATION.md)**  
  3D cinema implementation summary

- **[AVATAR_CAMERA_SEPARATION.md](./AVATAR_CAMERA_SEPARATION.md)**  
  Avatar positioning and camera system

---

## 🐛 Debugging & Troubleshooting
- **[WEBSOCKET_DEBUG_GUIDE.md](./WEBSOCKET_DEBUG_GUIDE.md)**  
  WebSocket connection debugging guide

---

## 🗂️ Documentation by Category

### For Platform Owners
1. [PLATFORM_PAYMENT_SETUP.md](./PLATFORM_PAYMENT_SETUP.md) - **Start here!**
2. [PAYMENT_API_REFERENCE.md](./PAYMENT_API_REFERENCE.md)
3. [PHASE2_WEEK2_COMPLETE.md](./PHASE2_WEEK2_COMPLETE.md)

### For Backend Developers
1. [PAYMENT_PHASE_2_WEEK1_COMPLETE.md](./PAYMENT_PHASE_2_WEEK1_COMPLETE.md)
2. [PHASE2_WEEK2_COMPLETE.md](./PHASE2_WEEK2_COMPLETE.md)
3. [BACKEND_ROOM_UPDATES.md](./BACKEND_ROOM_UPDATES.md)
4. [ROOMTV_MEDIA_LIFECYCLE.md](./ROOMTV_MEDIA_LIFECYCLE.md)

### For Frontend Developers
1. [ROOMPAGE_REDESIGN_PLAN.md](./ROOMPAGE_REDESIGN_PLAN.md)
2. [ROOMTV_ANIMATIONS_IMPLEMENTATION.md](./ROOMTV_ANIMATIONS_IMPLEMENTATION.md)
3. [CINEMA_3D_SUMMARY.md](./CINEMA_3D_SUMMARY.md)
4. [AVATAR_CAMERA_SEPARATION.md](./AVATAR_CAMERA_SEPARATION.md)

### For QA/Testing
1. [ROOMPAGE_TESTING_PLAN.md](./ROOMPAGE_TESTING_PLAN.md)
2. [THEATER_TESTING_PLAN.md](./THEATER_TESTING_PLAN.md)
3. [WEBSOCKET_DEBUG_GUIDE.md](./WEBSOCKET_DEBUG_GUIDE.md)

---

## 📊 Implementation Status

### ✅ Completed Features

#### Payment System (Phase 1-4) ✅
- [x] Database schema (11 migrations, 9 tables)
- [x] Core payment models (10 model files)
- [x] Wallet management (balance, transactions)
- [x] Token purchases (Stripe, Paystack)
- [x] Session tickets (token & gateway payments)
- [x] Donations (with leaderboard)
- [x] Earnings dashboard
- [x] Payout requests (manual processing)
- [x] KYC verification (file upload, admin approval)
- [x] Refund management (24-hour window)
- [x] Currency conversion (6 currencies)
- [x] Payment webhooks (Stripe, Paystack)
- [x] 15% platform commission system
- [x] Frontend payment components (10 React components, ~4,200 lines)

#### Lecture Hall System (COMPLETE ✅ December 2025)
- [x] 145-seat 3D lecture hall with GLB model
- [x] Row-based audio routing (8 rows × 18 seats)
- [x] Raise hand approval system (request/approve/revoke)
- [x] Specialized members modal with 3 sections
- [x] Speaker broadcasting to all students
- [x] Host-controlled participation
- [x] **Quiz System** (NEW ✅)
  - [x] Backend: Database schema, models, services, handlers
  - [x] Frontend: 4 modals (Management, Create, Take, Results)
  - [x] Integration: VideoWatch.jsx fully integrated
  - [x] Auto-grading: Text input + Multiple choice
  - [x] Real-time: WebSocket quiz_published, quiz_data, quiz_results
  - [x] Timer with auto-submit
  - [x] One attempt per student (DB constraint)

#### Room Features
- [x] Room creation/management
- [x] Media item uploads
- [x] RoomTV content system
- [x] Persistent chat
- [x] Scheduled events
- [x] Room invitations

#### Theater Features
- [x] 3D cinema environment
- [x] Avatar system
- [x] Camera controls
- [x] Theater seating

#### Real-time Features
- [x] WebSocket communication
- [x] Live playback sync
- [x] Real-time chat
- [x] Presence system

### 🧪 Ready for Testing
- [ ] Quiz system end-to-end testing (database migration + multiple users)
- [ ] Lecture hall comprehensive testing (audio + raise hand + quiz)

### 📋 Planned Features
- [ ] Automated payouts (Stripe Connect, Paystack Transfer API)
- [ ] Email notifications (payment confirmations, KYC status)
- [ ] Push notifications
- [ ] Analytics dashboard
- [ ] Fraud detection
- [ ] Multi-signature payouts (>$10,000)
- [ ] Lecture hall whiteboard/screen sharing
- [ ] Quiz history in lobby
- [ ] Quiz templates and question banks

---

## 🏗️ System Architecture

### Backend Stack
- **Language**: Go 1.x
- **Framework**: Gin
- **Database**: PostgreSQL (GORM ORM)
- **Real-time**: WebSockets + LiveKit
- **File Upload**: Multipart form-data, UUID filenames
- **Payment Gateways**: Stripe, Paystack
- **Currency API**: exchangerate-api.com
- **Geolocation**: ipapi.co

### Frontend Stack
- **Framework**: React + Vite
- **3D Engine**: Three.js
- **UI Library**: Custom components
- **State Management**: Context API + Hooks
- **Styling**: Tailwind CSS

### Database Schema
```
Users
  ├── UserWallet (1:1)
  ├── TokenTransaction (1:N)
  ├── SessionTicket (1:N)
  ├── Donation (1:N)
  ├── GatewayEarning (1:N)
  ├── Payout (1:N)
  ├── KYCVerification (1:1)
  └── RefundRequest (1:N)

Rooms
  ├── MediaItem (1:N)
  ├── RoomTVContent (1:N)
  ├── WatchSession (1:N)
  └── ScheduledEvent (1:N)

WatchSession
  ├── SessionTicket (1:N)
  ├── Donation (1:N)
  └── Theater (1:N)
```

---

## 🔑 Key Concepts

### Token Economy
- **1 token = $0.10 USD** (no bulk discounts)
- Users buy tokens via Stripe/Paystack
- Tokens used for tickets and donations
- Hosts earn tokens (85% after 15% commission)
- Hosts can cash out tokens via payouts

### Payment Flow
```
1. User → Buys 100 tokens for $10 USD
2. Money → Goes to YOUR platform Stripe/Paystack account
3. User → Receives 100 tokens in wallet
4. User → Buys ticket with 50 tokens
5. Host → Receives 42.5 tokens (85%)
6. Platform → Keeps 7.5 tokens (15% commission)
7. Host → Requests payout (100 tokens = $10 USD)
8. You → Manually transfer $10 to host's bank
9. Platform → Already kept commission from step 6
```

### KYC Requirements
- Required for payouts >$100 USD
- Documents: ID + selfie
- ID types: Passport, National ID, Driver's License, Voter's Card
- Admin approval required
- 2-year expiration

### Refund Policy
- 24-hour window from ticket purchase
- Host approval required
- Token refunds: Automatic wallet credit/debit
- Gateway refunds: Manual processing (TODO: API integration)

---

## 🚀 Quick Start

### 1. Set Up Payment Accounts
```bash
# Read this first!
cat documentation/PLATFORM_PAYMENT_SETUP.md

# Create accounts:
# - Stripe: https://stripe.com
# - Paystack: https://paystack.com

# Add keys to .env:
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
PAYSTACK_PUBLIC_KEY=pk_test_...
PAYSTACK_SECRET_KEY=sk_test_...
```

### 2. Run Backend
```bash
cd ~/WeWatch/backend
./main
# Backend running on :8080
```

### 3. Run Frontend
```bash
cd ~/WeWatch/frontend
npm run dev
# Frontend running on :5173
```

### 4. Test Payments
```bash
# Read API reference:
cat documentation/PAYMENT_API_REFERENCE.md

# Test token purchase
curl -X POST http://localhost:8080/api/tokens/purchase \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"amount": 100, "payment_method": "stripe"}'
```

---

## 📞 Support

### Common Issues
1. **Payment not working?** → Check `PLATFORM_PAYMENT_SETUP.md`
2. **WebSocket disconnecting?** → Check `WEBSOCKET_DEBUG_GUIDE.md`
3. **RoomTV not showing?** → Check `ROOMTV_MEDIA_LIFECYCLE.md`
4. **3D theater issues?** → Check `THEATER_TESTING_PLAN.md`

### Contact
- **Platform Issues**: Check server logs at `~/WeWatch/backend/server.log`
- **Database Issues**: `psql -U wewatch_user -d wewatch_db`
- **Payment Issues**: Check Stripe/Paystack dashboards

---

## 🎯 Development Roadmap

### Phase 1: Database Setup ✅
- [x] 11 payment-related migrations
- [x] 9 database tables created

### Phase 2: Backend APIs ✅
- [x] Week 1: Core payment APIs (10 endpoints)
- [x] Week 2: Advanced APIs (26 endpoints)

### Phase 3: Frontend Components 🚧
- [ ] Wallet dashboard
- [ ] Token purchase flow
- [ ] Ticket purchase modal
- [ ] Donation widget
- [ ] Payout request form
- [ ] KYC submission form
- [ ] Admin KYC dashboard

### Phase 4: Automation & Scale 📋
- [ ] Automated payouts
- [ ] Fraud detection
- [ ] Analytics dashboard
- [ ] Email notifications
- [ ] Performance optimization

---

## 📝 Contributing

### Adding New Documentation
1. Create markdown file in `~/WeWatch/documentation/`
2. Add entry to this INDEX.md
3. Use clear section headers and examples
4. Include code snippets where relevant

### Documentation Standards
- Use emoji for visual hierarchy (📚 🚀 💰 etc.)
- Include "Last Updated" date
- Provide code examples
- Add troubleshooting section
- Link to related docs

---

## 📊 Statistics

**Total Documentation Files**: 40+ files  
**Total Payment Endpoints**: 44 APIs  
**Total Database Tables**: 20+ tables (payment + room + quiz)  
**Lines of Payment Code**: 8,000+ lines (backend + frontend)  
**Lines of Lecture Hall Code**: 6,000+ lines (3D + audio + raise hand + quiz)  
**Quiz System**: ~3,800 lines (backend + frontend + integration)  
**Supported Currencies**: 6 currencies (USD, NGN, GHS, KES, EUR, GBP)  
**Lecture Hall Capacity**: 145 users (1 teacher + 144 students)  

---

**Built with ❤️ for the WeWatch community**

*Last updated: December 30, 2025*
