# WeWatch Premium Tier — Spec & Design Notes

## Overview

Premium is a monthly token-based subscription available to any user. It unlocks a set of
enhanced features and signals verified/committed membership with a blue tick badge.

---

## Pricing

| Detail | Value |
|---|---|
| Cost | 20 tokens / month |
| Naira equivalent | ≈ ₦2,440 (at ₦122/token) |
| Benchmark | Slightly cheaper than X Premium Nigeria (₦3,200–₦4,800/month) |

Rationale: 20 tokens is a clean number, accessible for an engaged Nigerian user, and
positions LetsWatchOut premium as better value than X Premium given the feature set.

---

## Features

### ✅ Blue Tick (Verified Badge)
- Displays next to the username everywhere in the app
- Surfaces: lobby chat bubbles, room member list, UserProfileModal, session seat labels,
  3D cinema avatar labels, LectureHall participant list
- Badge is purely cosmetic/social signal — not an admin verification, just a premium indicator
- Revoked immediately on premium lapse

### ✅ Unlimited Recordings
- Free users: 5 recordings max (already gated via `403 { code: "recording_limit" }` in
  `CreatePost` handler, checked against `IsPremium` + `PremiumExpiresAt`)
- Premium users: no recording count cap
- Quality uplift TBD — currently all users are capped at 30 min / 720p (beta cap);
  decision pending on whether premium lifts the time cap, quality cap, or both

### ✅ Ad-Free Experience
- Pre-roll video ads: skipped entirely for premium users
- In-session banner ads: not shown to premium users
- Note: pre-roll ads have been commented out for ALL users (UX decision — the join
  experience should feel classy). In-session banner ads remain for free users only.
- Implementation: check `currentUser.is_premium` before rendering `AdVideoPreroll`
  and before fetching/rendering the in-session banner

### ✅ Unlimited Post Uploads
- Free users: upload cap TBD (not yet gated in code — limit needs to be decided before build)
- Premium users: no cap
- Applies to all post types: recording, upload, text

### ✅ Custom Watch Type (Signature Feature)
- Premium users can request a custom 3D room environment (e.g. 3D game house, 3D club,
  custom 3D church, branded 3D space)
- Each custom environment is tied to the user's specific room — members who join that
  room see the unique 3D scene
- Example use case: a Nigerian church community gets a 3D church interior matching
  their branding; their members join a space that feels like *their* church

**Request flow:**
1. Premium user submits a request form describing the environment (name, style,
   reference images, branding assets)
2. Request appears in admin dashboard as a ticket
3. WeWatch team reviews and builds the GLB scene
4. Scene is delivered and linked to the room's `watch_type` in the DB

**Cancellation behavior:**
- Custom 3D scene is NOT deleted when premium lapses
- Room falls back to one of the 3 standard watch types (VideoWatch, 3D Cinema, LectureHall)
- If the user renews premium, their custom scene is restored automatically
- Implementation: `watch_type` on the room stores the custom type slug;
  a premium-check gate in the room-load path falls back to `'video'` if `!IsPremium`

**In-app pitch copy (shown to non-premium users):**
> "Define your watch type. Meet in your own way."
> "Create a 3D game house, club, church, or anything you imagine — exclusively for your room."

---

## Purchase Flow (Planned)

1. "Request Premium" button in `UserProfileModal`
2. Opens a benefits modal (lists all features above with pricing)
3. User confirms → Paystack payment flow (token purchase if needed, then subscription)
4. On success: `is_premium = true`, `premium_expires_at = now + 30 days` on `users` table
5. Backend already has `IsPremium bool` + `PremiumExpiresAt *time.Time` on `User` model

---

## Renewal & Lapse (Open Questions)

- **Auto-renew:** Should 20 tokens be auto-debited monthly, or does user manually renew?
- **Insufficient tokens on renewal:** Grace period duration? Immediate lock?
- **Notification:** Remind user X days before expiry if token balance is low

---

## Open Questions (Pending Decisions)

1. **Recording quality uplift** — does premium lift the 30 min time cap, the 720p quality
   cap, or both? (Current caps are beta-wide, not premium-specific yet)
2. **Blue tick in 3D spaces** — confirm it should show above avatar in 3D cinema and
   LectureHall participant list
3. **Post upload cap for free users** — no gate exists yet; what is the free-tier limit?
4. **Custom watch type ownership** — only the room host can request, or any premium member?
5. **Auto-renew vs manual renewal** — affects token deduction logic in backend
6. **Grace period** — if premium lapses mid-month, how long before features are locked?

---

## DB Schema (Already Exists)

```sql
-- Already on users table (confirmed run 2026-05)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_premium BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS premium_expires_at TIMESTAMPTZ;
```

No new columns needed to ship the basic feature gates. Custom watch type may need a
`custom_watch_type_slug VARCHAR` on `rooms` and a `custom_watch_type_requests` table
(design pending).

---

## Implementation Checklist (Not Yet Started)

- [ ] Blue tick badge component (reusable, takes `is_premium` bool)
- [ ] Blue tick rendered in: LobbyChat bubbles, UserProfileModal, room member list,
      session seat labels, 3D cinema avatar labels
- [ ] Ad-free gate: skip AdVideoPreroll render if `currentUser.is_premium`
- [ ] Ad-free gate: skip in-session banner fetch if `currentUser.is_premium`
- [ ] Recording gate already exists — verify it reads `IsPremium` correctly
- [ ] Post upload cap gate (free user limit TBD)
- [ ] "Request Premium" button in UserProfileModal
- [ ] Premium benefits modal UI
- [ ] Paystack monthly subscription flow (20 tokens/month)
- [ ] Backend: premium grant endpoint + expiry check middleware
- [ ] Custom watch type request form
- [ ] Admin dashboard: custom watch type request ticket queue
- [ ] Room load: fall back to standard watch type if premium lapsed
- [ ] Custom watch type restore on premium renewal
