# WeWatch — Project Rules & Architecture

## Stack

| Layer | Technology |
|---|---|
| Backend | Go 1.21 · Gin · GORM · PostgreSQL |
| Frontend | React 18 · Vite · Tailwind CSS · shadcn/ui |
| Realtime | WebSockets (custom Hub in `backend/internal/handlers/websocket.go`) |
| Video calls | LiveKit (self-hosted or cloud) |
| Auth | JWT (stored in localStorage) + Google OAuth |
| Payments | Paystack (tokens / tickets) |
| Storage | BunnyCDN (`BUNNY_STORAGE_ZONE`, `BUNNY_ACCESS_KEY`, `BUNNY_PULL_ZONE_URL`) |
| Deploy | Railway (backend), Vercel or Railway (frontend) |

## Repository Layout

```
WeWatch/
├── backend/
│   ├── cmd/server/main.go          # Route registration — all routes live here
│   ├── internal/
│   │   ├── handlers/               # One file per feature domain
│   │   │   ├── websocket.go        # Hub, Client, readPump/writePump, BroadcastToRoom/Users
│   │   │   ├── rooms.go            # Room CRUD, watch session start/end, auto-end
│   │   │   ├── room_membership.go  # Join, Leave, Kick, Ban, SetUserRole
│   │   │   ├── scheduled_events.go # CRUD + recurrence generation + GetUserCalendarHandler
│   │   │   ├── lobby_chats.go      # DM send/receive, BroadcastLobbyChatMessage
│   │   │   ├── watch_out_handler.go # WatchOut Layer 1 — live room sharing via DM
│   │   │   ├── room_favourite_handler.go # Toggle/list user room favourites
│   │   │   ├── session_helpers.go  # GetAllActiveSessionsHandler + scoring ORDER BY
│   │   │   ├── session_preview.go  # UploadSessionFramesHandler — poster JPEG + liveshare WebM clip
│   │   │   ├── posts.go            # Post CRUD, recording cap gate
│   │   │   ├── post_download_handler.go # MP4 pipeline: remux H.264, transcode VP8/VP9
│   │   │   └── ...
│   │   ├── models/                 # GORM models (one file per entity)
│   │   ├── services/
│   │   │   ├── preview_queue.go    # PreviewQueue: background JPEG→WebM clip pipeline
│   │   │   └── media_switch_handler.go # 30s debounced preview refresh on media change
│   │   └── utils/
│   │       ├── ffmpeg.go           # DetectVideoCodec(), TranscodeToMp4()
│   │       └── bunny_cdn.go        # DownloadFileToTemp(), UploadToBunny()
└── frontend/
    └── src/
        ├── components/             # Feature components (RoomPageNew, LobbyPage, etc.)
        ├── components/cinema/      # VideoWatch, LeftSidebar, VideoTiles, etc.
        ├── components/lobby/       # LobbyMessageBubble, WatchOutModal, LobbyAttachModal, etc.
        ├── hooks/                  # useWebSocket, useLiveKitRoom, useSessionRecording, etc.
        ├── services/api.js         # All Axios calls — add new endpoints here
        ├── contexts/AuthContext.jsx
        └── pages/                  # Route-level pages
```

## Critical Patterns

### Adding a new backend endpoint
1. Write handler in the relevant `handlers/*.go` file.
2. Register route in `backend/cmd/server/main.go` under the correct group.
3. Add Axios helper to `frontend/src/services/api.js`.

### WebSocket message flow
- Backend sends JSON `{ "type": "...", "data": { ... } }` via `hub.BroadcastToRoom` or `hub.BroadcastToUsers`.
- Frontend `useWebSocket` hook dispatches to `VideoWatch.jsx` via `messages` array — handled in a `switch(message.type)` block around line 3800.
- Room-page-level WS messages (non-session) are handled in the `ws.onmessage` listener in `RoomPageNew.jsx` around line 990.

### DB migrations
**Never run migrations for the user.** Always provide SQL to paste into psql. User runs psql themselves in WSL. Migration pattern:
```sql
ALTER TABLE table_name ADD COLUMN IF NOT EXISTS col_name TYPE DEFAULT value;
```

### Authentication
`c.Get("user_id")` in handlers returns `uint`. Always type-assert: `userID, ok := userIDValue.(uint)`.

## Features Built

### Rooms
- Public / private rooms (private → join requests, host approves in RoomJoinRequestsModal)
- Room types: Cinema, Church, Classroom, Podcast, etc.
- Room groups (sub-channels within a room)
- Room TV (playlist of media items, host controls)
- Room chat with reactions, polls, replies, edit/delete
- Room chat UI matches LobbyChat style (rounded card, textarea, icon row, circular send button) — upgraded 2026-05
- Non-super-admins are limited to 1 room (`main_room_id` on `User`). "Watch in Rooms" button in CreateNewModal changes to "Watch in Your Room" for users who already have a room — navigates to `/rooms/:id` with `{ state: { openSession: true } }` router state, which auto-opens WatchTypeModal (300 ms delay, guarded by `sessionAutoOpened` ref so it fires once). No-room case: behaves as before (opens create-room flow).
- **RoomPageNew header/sidebar layout** (updated 2026-05):
  - `useMobile` threshold: `window.innerWidth < 1024` (was 768) — mobile layout applies to all non-desktop screens.
  - Header padding: `px-0 md:px-3 lg:px-4` — no padding on phones, restored on tablet+.
  - Dynamic header height: `headerRef` + `ResizeObserver` → `mobileHeaderHeight` state → drives sidebar and chat area `paddingTop` via inline style. Default 80px until measured.
  - `RoomPageLeftSidebar` receives `mobileHeaderHeight` prop; uses `paddingTop: ${mobileHeaderHeight + 8}px` inline on mobile instead of hardcoded values.
  - Chat column is wrapped in `flex-1 flex flex-col min-h-0` inside the row after the sidebar, preventing desktop chat input from bleeding under the sidebar.

### Watch Sessions
- Session types: Live, Instant Watch (temporary room), Class, Podcast
- Ticketed sessions (Paystack integration, ticket cache in localStorage)
- Session ratings (after `session_ended` WS message)
- Auto-end on host timeout (15 min no heartbeat)
- Session heartbeat poll in `VideoWatch.jsx` (60 s interval calling `GET /api/rooms/:id/active-session`) to catch missed `session_ended` WS
- **Session end broadcast pattern** (`EndWatchSessionHandler` in `rooms.go`): single blocking DB write (`ended_at`, `is_active=false`), then broadcast `session_ended` + lobby broadcast immediately. All remaining cleanup (media, seating, chat, LiveKit, quizzes, etc.) runs in a background goroutine. This keeps navigation snappy — never add slow operations before the broadcast.
- `CleanupStaleSessions` goroutine (hourly, in `websocket.go`) sweeps both stale active sessions AND orphaned `watch_session_members` rows (active = true but session already ended within last 7 days). Safety net for background goroutine failures.

### Media Playback Sync (updated 2026-06)
Co-watch sync keeps host and member video positions within ~50ms. All sync logic lives in `VideoWatch.jsx` (frontend) and `websocket.go` (backend).

**Sync flow — initial play (new media)**
1. Host clicks play → `handlePlayMedia` → sets `currentMedia`, `isPlaying` locally → sends `playback_control { command:"play", seek_time: currentTime, timestamp: Date.now() }` via WS.
2. Backend (`websocket.go` `playback_control` handler): relays immediately with `server_ts` injected, then does DB work (playback time, preview) in a goroutine. **Relay always happens before any DB work.**
3. Member receives → `playback_control` case in WS switch:
   - Computes `transitLatency = max(0, arrivalTime - message.timestamp)` — uses **host browser clock only** (not `server_ts` which has WSL drift).
   - `adjustedTime = seek_time + transitLatency / 1000`
   - If different media: `setCurrentMedia`, `setPendingSeekTime(adjustedTime)`, `setIsPlaying(true)`, seeds `syncRefRef`.
   - If same media: direct `videoEl.currentTime = adjustedTime`, no reload.
4. `handleLoadedData` effect fires when video loads → seeks to `pendingSeekTime` → waits for `seeked` event → `doPlay()` applies post-play correction: `video.currentTime += (Date.now() - wsArrivalTimeRef.current) / 1000` (compensates for the full load+seek pipeline) → then calls `play()`.

**Key refs**
- `wsArrivalTimeRef` — set when `playback_control` arrives; consumed in `doPlay()` for post-play correction; cleared after use.
- `syncRefRef` — `{ hostTime, receivedAt }` — stores last known host position + local timestamp; seeded from `playback_control` and refreshed by `sync_heartbeat`; used by autonomous drift check.
- `pendingSeekTime` — state (triggers re-render); seek target for new media loads; consumed by `handleLoadedData`.

**Sync flow — ongoing drift correction**
- Host sends `sync_heartbeat { current_time, timestamp }` every 10s (just a reference, no correctional intent).
- Member `sync_heartbeat` case: stores `syncRefRef = { hostTime: current_time + transitLatency/1000, receivedAt: now }`. No immediate correction.
- Member autonomous drift-check (`useEffect`, 2s interval): `expected = syncRefRef.hostTime + elapsed` → if `|drift| > 1.0s && < 30s` → `videoEl.currentTime = expected`.
- Drift threshold is 1.0s (not 0.5s) — tolerates normal jitter without triggering corrections.

**Backend — `playback_control` in `websocket.go`**
- `SeekTime float64` (not int) — preserves subsecond precision.
- Relay fires first (before any DB work); DB writes run in a goroutine.
- `server_ts` is still injected into the relayed message for reference, but **frontend must not use it for latency calc** — use `message.timestamp` (host clock).

**`handleLoadedData` seek-then-play pattern**
- Setting `video.currentTime` is async (fires `seeking`, completes at `seeked`).
- Calling `play()` before `seeked` fires causes `AbortError` → video freezes on first frame.
- Always: set `currentTime` → wait for `seeked` → then call `play()`.
- Same pattern applies to the post-play correction seek inside `doPlay()`.

**Same-media commands (no reload)**
- For `seek` / `play` / `pause` commands where the same media is already loaded, operate directly on `videoPlayerRef.current` — never call `setCurrentMedia` (which reloads the video src, adding ~275ms load + ~318ms seek = ~593ms unnecessary delay).

**Clock skew gotcha (WSL dev environment)**
- WSL `time.Now().UnixMilli()` (`server_ts`) can be 600–700ms ahead of Windows `Date.now()`.
- Using `server_ts` for latency on the frontend makes `adjustedTime = seek_time - 0.66s` → member seeks backwards every correction → visible scene replays.
- Fix: always use `message.timestamp` (set by host browser `Date.now()`) for latency on both `playback_control` and `sync_heartbeat` handlers.

### Session Preview Pipeline (added 2026-05)
Live-session preview cards in LobbyPage show a looping video clip (or static poster) instead of a plain icon. The pipeline has three layers:

**Backend — frame upload & storage**
- `POST /api/sessions/:id/upload-frames` → `UploadSessionFramesHandler` in `session_preview.go`
  - `source_type = "liveshare_clip"`: receives a WebM blob in the `clip` field, saves to `uploads/previews/session_<id>_<ts>.webm`, updates `watch_sessions.preview_url`
  - All other source types: receive JPEG frames in the `frames` multipart field; copies first frame to `uploads/previews/session_<id>_poster.jpg` (updates `poster_url`), then enqueues a clip-generation job
- **Critical ordering**: read `source_type` from form BEFORE checking `form.File["frames"]` — liveshare clip uploads have no `frames` field and will 400 otherwise
- File handles inside the loop are closed explicitly (`out.Close()` per iteration), not with `defer` (which would batch all closes to function return)
- Static files served from `/uploads/*filepath` in `main.go` — path resolved with `strings.TrimPrefix(urlPath, "/")` before `filepath.Join("./uploads", trimmedPath)` to strip the leading slash that `c.Param` returns

**Backend — background clip generation**
- `PreviewQueue` in `internal/services/preview_queue.go`: single goroutine consuming a buffered channel; takes saved JPEG frames and encodes a short looping WebM using FFmpeg; stores result path on the session row
- `MediaSwitchHandler` in `internal/services/media_switch_handler.go`: debounces preview refresh 30 s after each media change; cancel-safe (new media change cancels pending timer); calls `StartRefreshTimer` after initial seed

**Backend — session response**
- `SessionResponse` in `session_helpers.go` includes `PreviewURL string` and `PosterURL string` from the session row
- `WatchSession` model has `PreviewURL string` and `PosterURL string` columns (added 2026-05)

**Frontend — `VideoWatch.jsx`**
- All multipart uploads to `/upload-frames` use `{ headers: { 'Content-Type': undefined } }` — lets axios/browser set the correct `multipart/form-data; boundary=...` header automatically. Passing nothing or `'multipart/form-data'` drops the boundary and causes a 400.
- Poster upload: snapshots canvas frame, posts JPEG blob with `source_type=poster`
- Clip upload: captures MediaRecorder WebM blob, posts with `source_type=liveshare_clip`

**Frontend — `SessionPreview.jsx`**
- State machine: `emoji` → `loading` → `poster` → `video`
  - `emoji`: W logo (`/icons/lwoIcon.png`) with `iconFloat` CSS animation on purple→blue gradient
  - `loading`: spinner while `isGenerating=true`
  - `poster`: static `<img>` fallback
  - `video`: lazy-loaded `<video loop muted playsInline>`; src set only after IntersectionObserver confirms card is on screen (`hasBeenVisible`)
- Play/pause driven by IntersectionObserver (`isVisible`) — off-screen videos are paused to reduce decode load
- `previewVersion` prop: incrementing integer passed as `key` and `?v=` cache-bust query param; forces video element remount when backend generates a new clip
- Data-saver mode: skips video, falls back to poster — auto-detected via `navigator.connection.effectiveType` + manual `localStorage.getItem('dataSaverMode')`
- Aspect ratio detection: `videoWidth / videoHeight ≤ 1.0` → `object-cover` (portrait/square); `> 1.0` → `object-contain` (landscape)

**DB migration (NOT YET RUN)**:
```sql
ALTER TABLE watch_sessions
  ADD COLUMN IF NOT EXISTS preview_url TEXT,
  ADD COLUMN IF NOT EXISTS poster_url  TEXT;
```

### Kick / Ban (added 2026-05)
- `DELETE /api/rooms/:id/members/:user_id` — kicks member (removes UserRoom row, can rejoin)
- `POST /api/rooms/:id/members/:user_id/ban` — bans member (sets `is_banned=true`, `status='banned'`; blocks future joins)
- Backend sends `{ type: "kicked_from_room", reason: "kicked"|"banned" }` WS to the target user
- `VideoWatch.jsx` handles `kicked_from_room` → `performCleanupAndExit()`
- `RoomPageNew.jsx` handles `kicked_from_room` → `navigate('/lobby')`
- UI: host sees 3-dot menu on each non-host MemberCard with Kick / Ban options

### Calendar & Scheduling
- `ScheduleEventModal.jsx`: create/edit events, attach trailer (locked until 7 days before event)
- Recurring events: `recurrence_type` (none/weekly/biweekly/monthly), max 52/26/12 instances, linked by `recurrence_group_id`
- Room calendar tab: month grid with event dots, click day to see details
- Personal calendar: `CalendarDaysIcon` button in LobbyPage taskbar opens right-side slide-out drawer showing upcoming events in Today / This Week / Later sections (replaced old calendar tab)
- Backend: `GET /api/user/upcoming-events` → `GetUserUpcomingEventsHandler` (next 30 days across all joined rooms)
- **Calendar badge** (added 2026-05): `upcomingEventsCount` state in LobbyPage, fetched on mount via `/api/user/upcoming-events`. Amber badge shown on taskbar `CalendarDaysIcon`. Cleared (`setUpcomingEventsCount(0)`) when drawer opens.

### LiveKit (A/V)
- `useLiveKitRoom.js` hook wraps LiveKit SDK
- `RemoteAudioPlayer.jsx` subscribes to remote audio tracks
- `VideoTiles.jsx` renders remote video participants
- Network quality banner via `useNetworkQuality.js`

### Recording
- `useSessionRecording.js` — capped at 30 min / 720p for beta
- mimeType priority: `video/mp4;codecs=h264,aac` → `video/webm;codecs=vp9` → `video/webm;codecs=vp8` (H.264 source → instant `-c copy` remux on server)
- Free users: 5 recordings max. Gate in `CreatePost` handler checks `IsPremium` + `PremiumExpiresAt`. Returns `403 { code: "recording_limit" }`. Frontend `useSessionRecording.js` catches this and shows toast.
- Premium fields on `User` model: `IsPremium bool`, `PremiumExpiresAt *time.Time`
- **Upload size limit**: Free = 1 GB (enforced in `LeftSidebar.jsx` `handleFileUpload`). Premium = higher limit (TBD, gate same place with `currentUser.is_premium` check before the `maxSize` constant).

### MP4 Download Pipeline
- `Post` model has `Mp4URL string`, `Mp4Ready bool`, `Mp4Processing bool`
- `GET /api/posts/:id/download` in `post_download_handler.go`: checks `Mp4Ready` → serve; checks `Mp4Processing` → 202; else → triggers `go transcodePostToMp4()`
- `utils/ffmpeg.go`: `DetectVideoCodec()`, `TranscodeToMp4()` — H.264 source is instant `-c copy` remux; VP8/VP9 triggers `libx264 -preset veryfast` transcode
- `utils/bunny_cdn.go`: `DownloadFileToTemp(remoteURL, suffix)` downloads from BunnyCDN to temp file for processing

### Room Favourites (added 2026-05)
- Separate `user_room_favourites` table — NOT a column on `user_rooms`. `UserRoomFavourite` model in `models/user_room_favourite.go` with composite unique index `(user_id, room_id)`.
- `POST /api/rooms/:id/favourite` → `ToggleRoomFavouriteHandler`: adds if absent, removes if present; returns `{ is_favourite: bool }`.
- `GET /api/rooms/favourites` → `GetFavouriteRoomsHandler`: returns `{ rooms: [{ room_id, name, image_url, room_type, is_public }] }`.
- Room model field is `ImageURL` (not `AvatarURL`) — use this when building `RoomItem` responses.
- Frontend state in LobbyPage: `savedRooms { [roomId]: bool }` + `joinedRooms { [roomId]: 'active'|'pending' }`.
- **Session preview card UI** (all 3 layouts — TikTok, grid, fullscreen): green `+` badge overlaid on bottom-right of room avatar → joins room; becomes blue `✓` after join. Bookmark icon below viewer count in right icon stack → toggles favourite. Hidden for temporary (instant-watch) sessions.
- **watch_out DM bubble** (`LobbyMessageBubble.jsx`): join `+` badge overlaid on bottom-right of the emoji span (not a row button); bookmark row below card body (BookmarkOutlineIcon + white `+` badge when unsaved → solid amber BookmarkIcon when saved). Join badge hidden for private watchouts.
- **Icon pattern**: unsaved = `BookmarkOutlineIcon` with white `+` badge at top-right; saved = solid `BookmarkIcon` amber, no badge. Import solid from `@heroicons/react/24/solid`, outline aliased as `BookmarkOutlineIcon` from `@heroicons/react/24/outline`.

### Session Preview Cards — Ranking & `is_member` (added 2026-05)
- `SessionResponse` struct in `session_helpers.go` has `IsMember bool \`json:"is_member"\`` — set to `true` if the requesting user has an active `user_rooms` row for that room OR is the host. Loaded via batch query (not N+1) before the main session fetch.
- Scoring ORDER BY (quality-first): `quality×0.4 + audience×0.3 + recency×0.2 + preview×0.1`
  - **Quality** (0.4): Bayesian credible rating = `(total_ratings × avg_rating + 5×3.0) / ((total_ratings + 5) × 5.0)` — normalised to 0–1. Prevents single-rating gaming.
  - **Audience** (0.3): `LEAST(live_member_count / 100.0, 1.0)` — caps at 100 viewers = 1.0.
  - **Recency** (0.2): `1 / (1 + hours_since_start)` — exponential decay.
  - **Preview** (0.1): `+0.1` bonus if `preview_url` is non-empty.
- Implemented via GORM `.Joins("JOIN rooms r ON r.id = watch_sessions.room_id")` + member count subquery LEFT JOIN; no raw query string needed for the SELECT.

### SessionChatPreviewModal (updated 2026-05)
- Renders as a **bottom-anchored sheet**, not a centred dialog. Container: `fixed inset-0 ... flex items-end justify-center`. Inner panel: `h-[90vh] rounded-t-2xl animate-slide-up`.
- Opens via `handleOpenChatPreview(session, e)` in LobbyPage — sets `selectedSessionForChat` + `isChatPreviewOpen(true)`. Does NOT call `connectToSessionChat` or set `activeChatSession` (those open the 70-30 split view).

### WatchOut Layer 1 — Live Session Sharing (added 2026-05)
- `GET /api/rooms/with-active-sessions` → `GetRoomsWithActiveSessionsHandler`: returns rooms the current user has joined that have a live `WatchSession`; response includes `room_id`, `room_name`, `room_type`, `watch_type`, `session_title`, `watching_count`, `is_private`, `session_id`, `host_id`
- `POST /api/lobby-chats/watch-out` → `SendWatchOutHandler`: sends a WatchOut DM card; enforces friendship + block + room-membership checks; private sessions can only be shared by the host
- Creates `LobbyChat` row with `message_type: "watch_out"` and `metadata` JSON containing room/session snapshot
- Frontend: `EyeIcon` button (with pulsing red dot) in LobbyChat input row — visible only when `liveRooms.length > 0`; LobbyPage polls `/api/rooms/with-active-sessions` every 30s while chats tab is active
- `WatchOutModal.jsx`: room picker showing type emoji, room name, session title, watching count; sends invite on confirm
- `LobbyMessageBubble.jsx`: `watch_out` message type renders as a card with live badge, room details, "Watch Now →" button that `navigate('/rooms/:room_id')`
- No new DB tables — reuses `lobby_chats` with `message_type` field

### Community Events Feed (added 2026-06)
A fullscreen horizontal carousel that appears every 5 live session cards in the WatchOuts vertical snap-scroll feed, but only when there are new items since the user last saw it.

**Placement & navigation:**
- Injected in `LobbyPage.jsx` `filtered.map()` section — every 5th card is a `CommunityEventsCard` wrapper
- Swiping up/down exits back to live session cards (standard snap-scroll)
- Within the card: swipe left/right navigates the horizontal carousel
- Carousel interleaves: scheduled event card → community request card → scheduled event card → ...

**`CommunityEventsCard.jsx`** (`frontend/src/components/community/`)
- Fullscreen horizontal carousel wrapper; touch/drag swiping + chevron buttons
- Dot indicators at bottom; "Make a Request" button (opens `MakeRequestSheet`)
- `buildInterleavedCards(events, requests)` alternates the two types

**`ScheduledEventPreviewCard.jsx`**
- Shows: room name, event title, content rating, watch type, date/time, host avatar + username
- Trailer video background if available; gradient fallback otherwise
- CTA: "RSVP — It's Free" or "Get Ticket · N tokens" → calls `onRSVP(event)` → opens existing `CalendarModal`

**`CommunityRequestCard.jsx`**
- Shows: title, content rating, description, preferred date, requester username, upvote count, list of claiming hosts (name + room rating)
- Upvote toggle: `POST /api/community-requests/:id/upvote` — optimistic update
- "I'll host this →" button: `POST /api/community-requests/:id/claim` → navigates to host's room with `{ openSchedule: true, schedulePrefill: { title, description, content_rating, preferred_date } }` router state

**`MakeRequestSheet.jsx`**
- Slide-up sheet (CSS transform, no portal needed); fields: title (required), content_rating (required), description, preferred_date (optional)

**`ScheduleEventModal.jsx` changes:**
- Added `prefill` prop: `{ title, description, content_rating, preferred_date }` — populates form when a host claims a request
- `RoomPageNew.jsx` reads `location.state?.openSchedule` → auto-opens modal after 300ms; passes `location.state?.schedulePrefill` as `prefill` prop

**Backend — `handlers/community_events_handler.go`:**
- `GET /api/community-events?since=<RFC3339>` → `{ scheduled_events, requests, has_new }`. Fetches public scheduled events within next 14 days (filtered by user content prefs) + community requests (open/claimed, sorted by upvotes desc). `has_new` compares item `created_at` against `since` param.
- `POST /api/community-requests` → create request (title, content_rating, description, preferred_date)
- `POST /api/community-requests/:id/upvote` → toggle upvote; returns `{ has_upvoted, upvote_count }`
- `POST /api/community-requests/:id/claim` → host claims; host must own a non-temporary room; returns `{ claim, prefill }` for ScheduleEventModal pre-fill. Updates request status to `claimed`. Multiple hosts can claim the same request.

**`has_new` gate in LobbyPage:**
- `communityEventsLastSeen` in localStorage (ISO timestamp)
- `fetchCommunityEvents()` passes `since` param; only updates state + refreshes timestamp if `has_new: true`
- Card not rendered in feed if `communityEventsData.scheduledEvents.length === 0 && requests.length === 0`

**DB tables (NOT YET RUN):**
```sql
CREATE TABLE IF NOT EXISTS community_requests (
  id BIGSERIAL PRIMARY KEY, user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL, content_rating VARCHAR(20) NOT NULL DEFAULT 'G',
  preferred_date DATE, description TEXT, status VARCHAR(20) NOT NULL DEFAULT 'open',
  upvote_count INT NOT NULL DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS community_request_upvotes (
  id BIGSERIAL PRIMARY KEY, request_id BIGINT NOT NULL REFERENCES community_requests(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(request_id, user_id)
);
CREATE TABLE IF NOT EXISTS community_request_claims (
  id BIGSERIAL PRIMARY KEY, request_id BIGINT NOT NULL REFERENCES community_requests(id) ON DELETE CASCADE,
  host_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_id BIGINT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  scheduled_event_id BIGINT REFERENCES scheduled_events(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ DEFAULT NOW(), UNIQUE(request_id, host_user_id)
);
```

### WatchOut Layer 2 — Streaks (designed, not yet built)
**Mechanic A — Friend daily co-watch streak (DM header)**
- Two friends both attend any session on the same calendar day = +1 streak
- Attendance = 5+ continuous minutes in an active watch session
- Surface: DM header shows flame icon + streak count between those two users
- Needs: `watch_streaks` table (`user_a_id`, `user_b_id`, `current_streak`, `last_co_watch_date`)

**Mechanic B — Room attendance ratio (per-room, per-member)**
- Tracks attendance across last 8 scheduled events in a room (all room types use `scheduled_events`)
- Attendance confirmed by 5+ minutes in actual watch session
- Visibility: member sees own ratio (e.g. "7/8"); host sees all members' ratios in Room Members modal
- Surface: Room Members modal (host view: badge next to each member); own Room Profile Card (member view)
- Needs: event attendance table (`user_id`, `event_id`, `attended_at`, `minutes_watched`)

### WatchOut Layer 3 — Game Challenges (designed, not yet built)
- `game_challenge` message type on LobbyChat: "I won [Game] in [Room] — think you can beat it?" with "Accept Challenge →" button
- Accepting navigates to `/rooms/:room_id` so recipient joins and plays the same game
- **Score handling**: RPS and TicTacToe are win/loss (no numeric score); future games (quiz, etc.) will include numeric score in metadata. `score` field is optional in metadata.
- **Frontend hook needed**: after a game-result WS message in `VideoWatch.jsx`, capture `lastGameResult = { game_type, result, score?, room_id, room_name }` in state and surface a "Challenge Friends" button in the game result overlay
- **Backend**: `POST /api/lobby-chats/game-challenge` — takes `recipient_id`, `room_id`, `game_type`, `score` (optional); verifies sender is a room member; creates `LobbyChat` with `message_type: "game_challenge"`; broadcasts via WS
- **Frontend bubble**: `game_challenge` card in `LobbyMessageBubble.jsx` — game emoji + name, result/score, "Accept Challenge →" → `navigate('/rooms/:room_id')`
- No new DB tables — reuses `lobby_chats`
- Pre-requisite: need to survey what game-result WS messages look like in `VideoWatch.jsx` before building

### New games — candidates surveyed, not yet integrated (noted 2026-06-23)
User wants to expand beyond RPS/TicTacToe with open-source, browser-friendly, voice-chat-friendly multiplayer games for the LeftSidebar games menu — ideally light 3D, in the spirit of the open-source DOOM/Quake engines already discussed for this project. Candidates surveyed (all real, verified via web search, not yet integrated):

- **Top pick — OpenArena / Q3JS**: `ioquake3` engine (id Tech 3, GPLv2) + OpenArena's own fully free, custom-made assets — no commercial-asset gray area at all, unlike Doom/Quake (which need Freedoom or shareware data). Browser/WASM ports already playable: openarena.live, q3js.com. Classic arena deathmatch — pairs naturally with existing LiveKit voice chat. Light by modern standards (1999 engine).
- **Quake 1/2 alternative aesthetic**: `NexQuake` (github.com/0xBrsm/NexQuake) — WASM, native browser multiplayer, self-hostable via Docker. `WebQuake` (github.com/Triang3l/WebQuake) — WebSocket multiplayer. Same legal pattern as Doom: engine is GPL, game data needs Quake 1 shareware WAD (no Freedoom-equivalent found for Quake).
- **Non-shooter variety**: `pmndrs/racing-game` (MIT, react-three-fiber — easiest to integrate given this app's React frontend) or `micro-racing` (vanilla WebGL kart racer, built-in multiplayer w/ client-side prediction). `NotBlox` (github.com/iErcann/Notblox) — Three.js + Node.js Roblox-like sandbox, more casual/social than competitive.
- **Niche pick**: `nickyvanurk/3d-multiplayer-browser-shooter` — light 3D space dogfight, three.js + plain WebSocket, small codebase if we want to bend a game to fit our room model rather than embed a black box.
- **Integration approach discussed**: drop in as a sandboxed component (iframe or isolated React subtree) — same isolation rationale as the GPL-compliance discussion (keep the GPL-licensed game module separate from proprietary code, source available). Each game's own multiplayer networking (WS/WebRTC) runs independently of LiveKit voice — no conflict.
- User said "I'll come for it later" — not scheduled, just parked here for when they're ready.

### Taskbar unreachable during games; Trivia round-advancement hardened (fixed 2026-06-23)
User reported: while a game was open they couldn't unmute (taskbar wouldn't show), and specifically in Trivia couldn't proceed to the next round.

**Taskbar bug — confirmed, not just a hypothesis.** `VideoWatch.jsx`'s `hasOpenModal={isLiveShareWizardOpen || !!activeGame || isGameLobbyOpen}` fed `Taskbar.jsx`'s `isSuppressed`, which set both `opacity: 0` **and** `pointerEvents: 'none'` on the taskbar pill, and the tap-anywhere-to-reveal gesture itself early-returned while suppressed — so the mute button was a genuine dead end for the entire duration any game was active, with no in-app way to recover it. The taskbar's own z-index (1000) is already well above every game overlay's (50-60), so this was never a stacking-order problem — purely an over-broad suppression condition. Fixed by removing `!!activeGame` from `hasOpenModal` (`isLiveShareWizardOpen`/`isGameLobbyOpen` left as-is — those are setup/wizard screens, not "during gameplay", and weren't part of the report).

**Trivia "can't proceed" — root cause was a local-state drift risk, not (necessarily) a network failure.** `TriviaGame.jsx`'s `sendQuestion()` optimistically incremented a local-only `questionIndex` on every click, regardless of whether the `trivia_question` WS move actually reached the backend (`onMove` → `sendMessage` is fire-and-forget, no ack). A single dropped send leaves `questionIndex` ahead of the backend's own `round` (the actual source of truth) forever after — every subsequent successful send then skips a question, and if sends kept failing, repeated clicks would silently exhaust the whole local `questions` array (`questionIndex >= questions.length` → the button's own handler becomes a no-op) with zero feedback, looking exactly like "stuck, can't proceed."

Fix: `sendQuestion` now sends `questions[round]` (the server-confirmed round) instead of a local pointer — a failed send leaves `round` unchanged, so the *next* click retries the same question instead of skipping ahead; `questionIndex` state removed entirely (had no other use). Added a 5s stuck-detection timeout (cleared immediately via a `useEffect` on `round` the moment the backend confirms the advance) that surfaces a `toast.error` if `round` never moved, plus a disabled/spinner state on both "Start Round 1" and "Next Round" buttons while a send is pending. Also added a member-side "Waiting for the host to start the next round…" hint for `phase === 'reveal'` (previously only `phase === 'question'` had a member hint — non-hosts had zero indication anything was happening while the host was between rounds).

**Verified for real, end-to-end, two real accounts (host + member) in the same room**: started a real Trivia game, advanced through 3 full rounds (question → reveal → next round, twice), confirmed each round's question text genuinely differed from the previous one (no repeat, no skip) — `round` 0→1→2 driving distinct `questions[round]` sends correctly across multiple advances, not just one. Confirmed the taskbar pill's computed style was `{opacity: "1", pointerEvents: "auto"}` after tapping the screen while Trivia was actively open (previously `{opacity: "0", pointerEvents: "none"}` with no way to recover it).

### Trivia winner/draw logic, End Game/Show Results buttons, spectating host (fixed 2026-06-23)
User reported real testing bugs against the Phase 19 fixes: a 300-300 tie still got a declared "winner" (trophy icon); the per-question reveal panel (labeled "Results") was being mistaken for a final game-over screen, which doesn't exist; "End Game", "Show Results", and the header X button all appeared to do nothing; and asked whether the host could set up two *other* members to play instead of always being a player themselves.

**Root cause, tie/winner bug**: purely client-side cosmetic — the score strip's trophy rendered on `sortedPlayers[0]` unconditionally (`{i === 0 && <Trophy/>}`), with no check for a tie. The backend never had any trivia winner-determination logic at all — `processTriviaMove`'s `reveal` case always returned `gameOver=false`, so `GameSession.WinnerID` was never set through the natural last-round path.

**Root cause, buttons "don't work"**: two compounding bugs, both confirmed by reading `handleGameEnd` (`games/websocket_handler.go`) and `TriviaGame.jsx` together. (1) The buttons *did* call `handleEndGame` → sent a real `end_game` WS message — but the backend's handler treats *every* `end_game` as a forfeit ("any participant can forfeit — the other player wins"), grabbing the first player in iteration order that isn't the caller — completely wrong semantics for "show me the final score-based result," and broken for trivia's actual >2-player support (only ever correct for exactly 2 players). (2) Even with a correct winner, nothing would have been visible anyway: `TriviaGame.jsx` only ever reads `gameState.game_state.phase` for rendering — it never checked `gameState.status` at all, so the screen would have kept showing whatever the last round looked like regardless of what the backend did.

**Fix — backend**: new `trivia_end` move type (`trivia.go`), routed through the existing `make_move`/`ProcessMove` path rather than the forfeit-style `end_game` path. Computes the winner from current `scores` for *all* players (not just 2) — multiple players tied for the top score (including an all-0 tie if nobody ever scored) leaves `winnerID` nil, which the frontend renders as a draw. Used for both "End Game" (mid-session) and "Show Results" (after the last round) — for a score-accumulation game, "I'm ending this" and "the last round just finished" both mean the same thing: settle the result from whatever points exist right now, never a forfeit.

**Fix — frontend**: `endOrLeave()` replaces `endGame()` — host sends `trivia_end` (ends for everyone, computes real result); non-host clicking the same X just calls `onClose()` locally without ending it for others (the header X's own tooltip already said "End game for everyone" vs "Leave game" — the code just never actually implemented that distinction). New `phase === 'ended'` render branch — a real Game Over screen with 🏆/🤝, the winner's name or "It's a Draw!", and the final per-player scoreboard; the dismiss button is a plain `onClose()` since the backend has already ended the session by this point. Score-strip trophy now requires `hasSoleLeader` (top score is unique among players) before showing at all. "End Game" restyled from a barely-visible gray link to a proper red destructive-action button.

**Feature — spectating host**: `GameLobbyModal.jsx`'s "host cannot deselect themselves" restriction removed — the host can now pick any 2+ room members (including or excluding themselves) for Trivia, gated only by the existing min/max player counts. Required threading `host_id` through every game WS broadcast (`game_started`, `game_state_update`, `game_ended` — `games/game_manager.go` + `websocket_handler.go`) since the frontend previously inferred "who's the host" from `players[0]`, which silently breaks the moment the host isn't a player at all. `VideoWatch.jsx`'s three `setActiveGame` call sites (one per broadcast type) all needed an explicit `host_id` field added — the backend sending it was necessary but not sufficient, since two of the three handlers construct a fresh object rather than spreading the previous state. `TriviaGame.jsx`'s `isHostUser` now reads `gameState.host_id` (falling back to `players[0]` only if that's ever missing) and a new `isPlayer` flag independently gates the answer-submission grid — a spectating host sees all the same controls (reveal, next round, end game) but not the answer grid, with a "You're hosting — sit back and watch!" hint in its place. Checked `TicTacToeGame.jsx` for the same assumption before touching the shared `GameLobbyModal`: it already derives "am I a player" via `players.findIndex(...)`, which safely returns -1 for a non-playing host — no change needed there.

**Verified for real, end-to-end, three real accounts (spectating host + 2 players) in the same room**: host deselected themselves in the lobby (confirmed "Host · spectating" label), selected two other members, started Trivia — confirmed the spectating host still saw the CategoryPicker, "Start Round 1", and the "You're hosting" hint (never the answer grid). Ran 3 rounds with both players deliberately picking the same option every time (a guaranteed, deterministic tie regardless of which questions appeared) — confirmed zero trophy icons in the score strip across all 3 rounds despite both players' scores being tracked identically. Host clicked the (confirmed red) "End Game" button mid-session — confirmed it sent `trivia_end` (not the old `end_game`), and confirmed **both** the host's and a player's screens independently rendered the identical "🤝 It's a Draw! / Tied scores — no single winner" screen with matching 0-0 scores — the broadcast reaches every connected client, not just whoever clicked the button.

### Lobby session preview reflects active games (added 2026-06-23)
User asked whether the lobby's WatchOuts feed card (`SessionPreview.jsx`, sourced from `watch_sessions.poster_url`/`preview_url`) can show that a game is being played, using the same static images already shown in `GameLobbyModal.jsx`'s game-picker list (`/images/ttt.webp`, `rps.webp`, `chess.webp`, `trivia.webp`), clearing back to the placeholder once the game ends.

**Before this**: zero integration existed. `handleGameStart`/`endGameLocked` (`backend/internal/handlers/games/`) never touched `watch_sessions` at all — starting or ending a game had no effect whatsoever on the lobby card.

**The one real risk, same class of bug already fixed for LiveShare/Watch-From transitions**: if a game starts while a device-stream's preview-refresh ticker (1 min dev / 5 min prod, `PreviewQueue`/`MediaSwitchHandler`) is still running, that ticker would fire minutes later, regenerate the *media's* preview, and silently overwrite the game poster — exactly the bug class documented elsewhere in this file for the LiveShare↔Watch-From transition. Had to be torn down the same way.

**Fix — `services/media_switch_handler.go`**: added `MediaTypeGame = "game"` alongside the existing `none`/`upload`/`liveshare`/`watchfrom` constants. New `HandleGameStart(sessionID, posterURL string)`: detects the previously-active media type, runs the same `cancelPendingTimer` + `ClearSessionPreview` + `StopRefreshTimer` sequence `ClearOldPreview` already uses for LiveShare/Watch-From transitions, sets `current_media_type="game"` + `poster_url` to the static asset + `preview_url=""` (games never get a looping clip — there's no video frame to extract one from), broadcasts to the lobby. Game-end reuses the *existing* `HandleMediaStop(sessionID)` unchanged (already does exactly "clear preview, stop ticker, reset to none") — no new method needed there.

**Plumbing gotcha**: `InitializeHub()` (which constructs the games WS handler) runs *before* `InitPreviewSystem()` (which constructs `mediaSwitchHandler`) in `main.go` — so `mediaSwitchHandler` can't be passed as a constructor argument to the games package (it'd be a nil pointer at construction time). Fixed by mirroring `PreviewQueue`'s existing singleton-getter pattern: added `services.GetMediaSwitchHandler()` (package-level var set inside `NewMediaSwitchHandler`), called *lazily* at game-start/game-end time rather than at construction time — by then both init functions have long since run.

**`backend/internal/handlers/games/websocket_handler.go`**: new `gamePosterURL(gameType)` maps each of the 4 game types to its existing static asset path (same ones `GameLobbyModal.jsx` already uses — `<img src={game.image}>` with the identical literal strings, confirming a bare `/images/...` path resolves correctly against the frontend's own origin with no CDN/backend prefix needed). `handleGameStart` resolves the room's active `WatchSession` (`WHERE room_id = ? AND ended_at IS NULL`) and calls `mediaSwitchHandler.HandleGameStart(sessionID, posterURL)` — best-effort, silently skipped if there's no active session or no matching asset, never blocks the game itself from starting.

**`backend/internal/handlers/games/game_manager.go`**: `endGameLocked` does the same room→session lookup and calls `mediaSwitchHandler.HandleMediaStop(sessionID)` right after the existing `game_ended` broadcast.

**Verified for real, end-to-end, two real accounts (host + member) in room 191**: queried the lobby feed endpoint (`GET /api/sessions/active`) directly before/after each transition. Before starting TicTacToe: `poster_url` absent (empty). Immediately after `start_game`: `poster_url="/images/ttt.webp"`. Immediately after the host clicked "Forfeit": `poster_url` back to absent — confirming the full start→show→end→clear lifecycle works against the real DB and the real lobby-facing API response, not just the broadcast.

**Real bug found and fixed (2026-06-24): the above only verified the eventual DB/REST state — the actual live WS-driven LobbyPage UI was broken.** User reported: starting a game never showed the poster live; ending a game left the card stuck on a spinner forever. Root cause was in `LobbyPage.jsx`'s `session_preview_updated` handler, pre-existing and shared by every media type, not introduced by this feature: an empty `{poster_url: "", preview_url: ""}` broadcast is *unconditionally* read as `isGenerating: true` (spinner) — correct for the upload flow's own "clearing the old preview because a real one is about to be generated in ~30s" case, but wrong for any "media genuinely stopped, nothing more is coming" case, where no follow-up broadcast will *ever* arrive to resolve the spinner. Two compounding issues, both in this single mechanism:
- **Game-start**: `HandleGameStart` reused `ClearOldPreview` (when switching away from a non-empty prior media type), which broadcasts that same empty/spinner payload *before* the real game-poster broadcast that follows immediately after — a real, observable spinner flash, made worse by `ClearOldPreview`'s file-deletion step (CDN delete can be slow) extending the gap.
- **Game-end**: `endGameLocked` reused `HandleMediaStop` as-is, which also broadcasts the same empty/spinner payload — but nothing *ever* sends a follow-up for a game that just ended, so the spinner was stuck **permanently by design, not by timing**.

**Fix**: split `PreviewQueue.ClearSessionPreview` into `clearSessionPreviewFiles` (file cleanup + DB nullify, no broadcast) and two callers: `ClearSessionPreview` (unchanged — broadcasts empty, used when a real preview *is* coming, e.g. uploads) and new `ClearSessionPreviewFinal` (broadcasts empty **plus `"final": true"`**, used when nothing further is coming). `HandleGameStart` now calls `clearSessionPreviewFiles` silently (no broadcast at all) before sending the single, real game-poster broadcast — eliminates the spinner flash entirely, not just shortens it. `HandleMediaStop` (used by game-end, and by every other genuine "media stopped" path — `media_stop` WS messages, LiveShare/Watch-From stopping) now calls `ClearSessionPreviewFinal` instead. `LobbyPage.jsx`'s handler checks `message.final`: when true, sets `isClearing: true` instead of `isGenerating: true`, which `SessionPreview.jsx`'s existing (previously dead) `isClearing` state resolves straight to the emoji placeholder rather than a spinner.

**Verified for real via the actual WS message stream**, not REST polling (which can't observe a transient/stuck spinner): connected directly to the room WS, forced a non-empty prior media type via `update_media_state`, started TicTacToe, and confirmed via a real LobbyPage instance's intercepted WebSocket traffic that **exactly one** `session_preview_updated` fired — `{"poster_url": "/images/ttt.webp", "preview_url": ""}` — with no empty broadcast before it. Ended the game and confirmed the broadcast was `{"final": true, "poster_url": "", "preview_url": ""}`. Also verified switching games (end TicTacToe → immediately start Rock Paper Scissors, the only sequence possible since a room can only have one active game at a time) correctly updates the poster from `ttt.webp` → cleared → `rps.webp` → cleared, with no stale image carried over at any step.

**Second real bug found and fixed (2026-06-24): the WS broadcast above is correct, but it's not the only path the lobby relies on — and the *other* path was silently broken.** User reported it again, still not showing live: started TicTacToe in their real room, lobby card stayed on the emoji/W-icon the whole time, never showed the poster. Root-caused from the user's own backend log (still running from the prior fix): `HandleGameStart`/`HandleMediaStop` both fired at the exact right millisecond (`🎮 [MediaSwitch] Handling game_start...` at the moment they clicked, `⏹️ ... media_stop` at the moment the game ended, matching a real 3-in-a-row win) — so the backend was never the problem. The actual gap: their lobby's own WS connection (a *separate* `/api/lobby/ws` endpoint from the room WS, confirmed by reading `LobbyPage.jsx`'s `connectWebSocket`) connected **10 seconds after** the broadcast had already fired and gone out to nobody — a real, easy-to-hit race, not a contrived one. `LobbyPage.jsx` *does* have a REST-poll fallback specifically for this ("Runs on every sessionsPage poll so previews appear without needing a live WS connection") — but reading its exact condition (`frontend/src/components/LobbyPage.jsx`, the `useEffect` keyed on `sessionsPage.data`) showed it only re-seeds `sessionPreviews` for a **brand-new** session (`!existing`) or when `preview_url` changes — never for a `poster_url`-only change on a session the lobby already knew about. A game never gets a `preview_url` (no video clip), so this fallback silently did nothing for every game-poster update, on every poll, forever — both paths (WS and its own designated backstop) were missing it for the same underlying reason: poster-only changes weren't a case anyone had written for.

**Fix**: added a `posterChanged` check (`existing && existing.posterUrl !== (newPosterUrl || null)`) alongside the existing `previewChanged`/`needsSeed` conditions in that same `useEffect`. `resolvePreviewUrl` is a pure string transform (no cache-busting), so the comparison is stable and doesn't cause spurious re-renders when nothing actually changed.

**Also fixed as a defensive hardening, found while chasing a flaky repro during verification**: `HandleGameStart`'s and `endGameLocked`'s room→session lookups (`WHERE room_id = ? AND ended_at IS NULL`) had no `ORDER BY`, so if a room ever ends up with more than one row satisfying that filter (shouldn't happen in normal use — a room can only have one active session by the app's own create-session check — but did happen repeatedly against test data from leftover sessions that failed to end), the lookup could nondeterministically grab the wrong one and silently set the poster on an unrelated session. Added `Order("started_at DESC")` to both, picking the most-recently-started session deterministically. Low risk, zero behavior change for the normal one-active-session-per-room case.

**Verified two ways**: (1) an isolated, backend/browser-free unit check of the exact fixed `useEffect` logic against realistic before/after data — confirmed the *old* logic leaves `posterUrl: null` forever after a poster-only change (reproducing the bug standalone), and the *new* logic correctly updates on game-start, correctly falls back to the room avatar on game-end, and produces zero spurious updates when nothing changed. (2) The original WS-level verification from the first fix (above) independently confirms the broadcast itself was never the problem — this fix closes the *other* path that's supposed to catch exactly the case where that broadcast arrives too late to matter.

**Third, final bug, found via real debug logging the user captured (2026-06-24): the actual root cause, and the reason every fix above couldn't have worked.** Added `🐛 [DEBUG]` logging at every layer (backend DB write/broadcast, frontend WS receipt, frontend poll tick, frontend merge) and had the user reproduce live. Logs proved the data pipeline was now 100% correct end-to-end — `sessionPreviews[sid].posterUrl` was exactly `http://localhost:8080/images/ttt.webp`, matching the backend. The poster still didn't render because of two separate, final issues:
1. **The 20s fallback poll's gate was inverted for this scenario.** It only called `fetchSessionsData()` when `!wsConnectedRef.current` (WS fully down). But the real-world failure mode is "WS connects a few seconds late, then stays connected for the rest of the session" — so the gate is never true again afterward and the poll never fires. Fixed: `fetchSessionsData()` now runs every 20s unconditionally; only the rooms/notifications/friends calls stay gated on WS being down.
2. **`resolvePreviewUrl` prepended the backend's `API_BASE_URL` to every relative path, including frontend-only static assets.** `/images/ttt.webp` (and the other 3 game posters) live in `frontend/public/images/`, served by whatever serves the frontend itself (Vite locally, Vercel in prod) — not the backend. Prepending the backend URL pointed the `<img>` at a route that doesn't exist on the backend; the browser's own opaque-response-blocking then silently failed the image load, which `SessionPreview.jsx`'s `onError` handler caught and fell back to the emoji/W-icon — looking exactly like "the poster never set," even though the underlying state was already correct. Fixed by special-casing `/images/` to return unprefixed (frontend-relative); `/uploads/...` (backend-hosted) and absolute BunnyCDN URLs are unaffected (the latter already short-circuit on the `startsWith('http')` check before reaching this branch). Confirmed safe in production too: `VITE_API_BASE_URL` is the Railway backend URL in prod, not the Vercel frontend's own origin — the bug would have been identical there.

Both fixes verified live by the user ("perfect it works"). All `🐛 [DEBUG]` logging was removed afterward — it served its purpose for this investigation and isn't needed permanently.

### Rock Paper Scissors forfeit didn't declare a winner or clear the lobby poster (fixed 2026-06-24)
Of the four games wired through `GameOverlay.jsx` (TicTacToe, RPS, Chess, Trivia), RPS was the *only* one never given an `onEndGame` prop at all — its "Forfeit" button called `onClose` directly, which just dismisses the overlay locally and never reaches the backend. No winner was ever computed (`endGameLocked` never ran), and the lobby session-preview poster never cleared either, since that logic lives inside `endGameLocked` (shared across all game types) — confirming this was purely a wiring gap, not a separate poster bug. Fixed: `GameOverlay.jsx` now passes `onEndGame` to `RockPaperScissorsGame`; the component's header X and footer Forfeit button both now call a `handleForfeit` (falls back to `onClose` if `onEndGame` is ever missing) before the reveal, and `onClose` directly after — mirroring `TicTacToeGame.jsx`'s existing `winner ? onClose : handleForfeit` pattern. Checked `ChessGame.jsx` for the same gap while in there — it already correctly used `onEndGame || onClose` for its Forfeit button, so no change needed there.

**Follow-up, same day: wiring `onEndGame` wasn't enough — RPS's own internal state never recognized a forfeit as "the game is over" at all.** After the fix above, the user reported the winner banner still didn't show and the X button still looked broken. Root cause was two compounding gaps specific to RPS (TicTacToe/Chess already handled both correctly, since they'd had a working forfeit path all along):
1. `revealed` (the state gating the winner banner *and* deciding whether X/Forfeit call `onClose` vs `handleForfeit` again) was only ever set `true` by `hasFinalPicks` — i.e. *both* players having actually made a pick. A forfeit ends the game before that happens, so `revealed` stayed `false` forever: the winner banner (gated on `revealed && winner`) never appeared, and clicking X kept calling `handleForfeit` again on an already-ended game, which the backend silently rejects (`"no active game"`) with no visible feedback — looking exactly like "the X button doesn't work."
2. Separately, the local `isOver` check (`status === 'finished' || status === 'completed'`) never included `'forfeited'` — the actual status both `handleEndGame`'s optimistic local update and the backend's `EndGame(..., "forfeited")` broadcast use. `TicTacToeGame.jsx` (`status === 'finished' || 'completed' || 'forfeited'`) and `ChessGame.jsx` (`['checkmate','stalemate','draw','finished','forfeited','completed'].includes(...)`) already included it — RPS was the one component missing it, unsurprising since it never had a reachable forfeit path to test against before the prior fix.

Fix: `revealed` is now also set `true` whenever `isOver` is true (not just `hasFinalPicks`), and `isOver` itself now includes `'forfeited'` alongside `'finished'`/`'completed'`. Both gaps had to be fixed together — fixing only the status check would still leave `revealed` stuck false (no banner, X still broken); fixing only `revealed`'s condition would have nothing to trigger off of, since `isOver` itself never recognized the forfeit status in the first place.

### Trivia CategoryPicker's X button looked broken; End Game button added next to Start (fixed 2026-06-24)
User reported the X button on Trivia's host-only topic-picker screen "isn't working." Root cause: `localPhase` (local React state, starts at `'picking'`) gates the component's early-return render branches, but nothing ever synced it when the backend confirmed the game had ended — clicking X correctly sent `trivia_end` and the backend correctly computed a result, but the screen never left `'picking'`, so the real Game Over screen (gated on the backend-derived `phase === 'ended'`, further down in the main render) was never reachable. Fixed with a `useEffect` that forces `localPhase` past `'picking'`/`'loading'` the moment `phase === 'ended'`. Also added an explicit red "End Game" button directly next to "Start — Random Mix" (previously the only way to end before starting was the small header X), so a host can end a Trivia session before or during round 1 without having to find the smaller icon.

### Taskbar auto-hide shortened during active games (fixed 2026-06-24)
User noted the taskbar pill (bottom-center, z-index 1000 — above every game overlay) could sit on top of a game's own bottom controls for the 2s it stays visible after a tap-to-reveal, even though it's only reachable that way during a game by design (see the unmute-during-games fix earlier in this file). Shortened the auto-hide window to 1s specifically while a game is active (`hideDelayMs = currentGame ? 1000 : 2000`), applied to both the tap-anywhere timer and the pill-hover-leave timer. Wiring this up surfaced that `currentGame` had never actually been passed from `VideoWatch.jsx` to `<Taskbar>` at all — and neither had `onGameClose`, meaning a separate, pre-existing taskbar "End Game" button (gated on `currentGame && watchType === '3d_cinema'`) had been completely invisible until now and would have been a silent no-op (`console.warn`, no action) if it ever had rendered. Removed that dead button rather than wire up a second end-game path that could drift out of sync with each game's own (now-correct) end-game logic — every game already has its own properly-wired controls inside its own overlay.

### DOOM — solo arcade mode via GPL-isolated iframe (added 2026-06-24)
User wanted a more immersive game beyond the existing turn-based set, identified `VectorPrivacy/DOOM` (GPL-2.0 fork of Chocolate Doom, itself built on id Software's 1997 GPL release) as a real, legally-clean option: the engine is GPL, and the bundled `doom1.wad` (shareware episode, exactly 4,196,020 bytes / 1264 lumps) is historically free-to-redistribute in unmodified form — confirmed via byte-identical match against multiple independent, reputable GitHub mirrors (e.g. `mattiasgustavsson/doom-crt`), not just one source.

**Architecture — single-player only, fully iframe-isolated:**
- New `arcadeGameTypes` map in `backend/internal/handlers/games/websocket_handler.go` relaxes `minPlayers` to 1 for `"doom"` only; `GameManager.StartGame`'s game-type allowlist extended to include it. No DB migration — `GameSession.GameType` is an unconstrained `VARCHAR(50)`.
- `gamePosterURL("doom")` → `/images/doom.webp` (custom poster, replaced the original placeholder SVG 2026-06-25), reusing the exact same `mediaSwitchHandler.HandleGameStart` lobby-poster integration the other 4 games already use.
- `frontend/src/components/Games/DoomGame.jsx` — lazy-loaded (`React.lazy`, first use of this pattern in the codebase, confirmed via a separate `DoomGame-*.js` build chunk) iframe pointed at a BunnyCDN-hosted build, `sandbox="allow-scripts allow-same-origin allow-pointer-lock"`. `allow-same-origin` is required for the WASM module's own same-origin `.wasm`/`.wad` fetches to succeed inside the sandbox. The only bridge between the iframe and the app is a single `postMessage({type:'doom:exit'})`, validated against the CDN's exact origin before acting on it.
- `GameOverlay.jsx`'s `case 'doom':` gates on `activeGame.host_id !== currentUserId` — every other room member sees a "X is playing DOOM" placeholder instead of independently loading the multi-MB WASM bundle. Members who want to actually watch use the pre-existing screen-share / Watch From feature — no new streaming mechanism was built for this.
- GPL attribution added to `CreditsModal.jsx`'s new "Open Source Software" section.

**Build pipeline (one-time, lives outside this repo's tooling):** Emscripten SDK 5.0.2 + Autotools (`emconfigure autoreconf -fiv` → `ac_cv_exeext=".html" emconfigure ./configure --host=none-none-none` → `emmake make`) against a clone of `VectorPrivacy/DOOM`, single-player launch args only (`-iwad doom1.wad -window -nogui -nomusic -config default.cfg` — no `-server`/`-connect`/`-deathmatch`, so the engine's P2P networking code is never invoked, no need to strip it). Default build is `-O3 -g` (debug symbols included) at 7.7MB; `wasm-opt -Oz --all-features --strip-debug --strip-producers` (Binaryen, bundled with Emscripten) brought it to 2.3MB with zero functional difference — `--all-features` was necessary since the module legitimately uses bulk-memory and nontrapping-float-to-int instructions that `wasm-opt`'s validator otherwise rejects by default. Final asset set (~6.7MB total: 2.3MB wasm + 4.2MB wad + ~350KB JS + cosmetic art) uploaded to BunnyCDN at `games/doom/v2/` (see gotcha below for why not `v1/`).

**Gotcha — BunnyCDN edge cache can get stuck on a broken first upload, with no way to force-refresh without an account-level API key.** The very first `games/doom/v1/` upload had a real bug (see next gotcha); re-uploading the fixed files to the *same path* repeatedly still served the original broken version indefinitely (`cache-control: public, max-age=2592000` — 30 days — and the Storage API's upload credential is a different, narrower key than the account-level key the `/purge` endpoint requires). Confirmed via direct `md5sum` comparison between local files and `curl`-fetched CDN content — they matched, ruling out a transfer/encoding bug, then confirmed via `grep -c` for a string only present in the newer version, which returned 0 against the live edge repeatedly across multiple re-uploads. Fix used: deploy to a new path (`v2/`) rather than fight the stuck cache — matches the project's own pre-planned versioning convention (`v1/`, `v2/`, ... with an instant frontend constant flip), so `v1/` is simply abandoned, not fixed.

**Real bug found and fixed in the build itself — a race condition, not a CDN issue, that the stuck cache above initially made hard to diagnose.** `Module.monitorRunDependencies(left)` fires multiple times during Emscripten's startup — including a *transient* `left === 0` for the WASM module's own compile/instantiate step, *before* `preRun`'s `FS.createPreloadedFile` calls have even registered `doom1.wad`/`default.cfg` as dependencies. The original shell wired `launchDoom()` (which calls `Module.callMain()`) off a fixed 300ms `setTimeout` from *that first* `left === 0` event. On `localhost` (near-zero latency), the real file-preload dependencies always finished within that 300ms window by coincidence, masking the bug entirely — every local test passed. Over a real network (even a fast CDN), the WAD's load took longer than 300ms, so `callMain()` ran before `doom1.wad` was actually in the virtual filesystem — main() silently no-op'd (confirmed via `Module.calledRun === true` but zero `print`/`printErr` output ever, not even the very first line) and the canvas never left its default 300×150 size. Fixed by switching to `Module.onRuntimeInitialized` — Emscripten's actual "everything, including every `preRun` dependency, is now ready" hook — instead of inferring readiness from `monitorRunDependencies`'s transient zero-crossings.

**Verified for real, end-to-end, in the live app (not just standalone CDN tests):** two real accounts (host + member) in a real room, real watch session. Host started DOOM via the actual Game Lobby UI → confirmed the genuine DOOM title screen render inside the real `GameOverlay` (not a standalone test page) → confirmed the member's client showed the "is playing DOOM" placeholder, never an independent WASM load → confirmed `watch_sessions.current_media_type`/`poster_url` flipped to `"game"`/`/images/doom.svg` while active (queried via the real `GET /api/sessions/active` lobby feed endpoint, not just the DB directly) → confirmed both cleared back to `"none"`/empty after a clean exit via DOOM's own in-overlay X button.

**Two real, pre-existing concurrency bugs found and fixed while verifying the exit flow** (both affect every game, not just DOOM — DOOM's testing was just what surfaced them):
1. **`Hub.Run()` self-deadlock.** `websocket.go`'s single event-loop goroutine, while handling a client disconnect, held `h.mutex.Lock()` (write lock) across a call into `gameWebSocketHandler.CleanupPlayerDisconnect` → `endGameLocked` → `mediaSwitchHandler.HandleMediaStop` → `hub.BroadcastToLobby`, which itself calls `h.mutex.RLock()`. Go's `sync.RWMutex` is not reentrant, so the same goroutine blocking on its own already-held write lock froze `Hub.Run()`'s single event loop forever — taking down WS register/unregister/broadcast for *every* room on the server, not just the one involved. Reliably triggered by a player disconnecting (e.g. closing their browser) while a game was active in a room with an active watch session. Confirmed via a `SIGQUIT` goroutine dump showing dozens of piled-up `(*Hub).GetRoomActiveUserIDs` callers all blocked on `RWMutex.RLock`, with `Hub.Run()` itself blocked deeper in the exact call chain above. Fixed by moving the `CleanupPlayerDisconnect` call to after `h.mutex.Unlock()`, matching the pattern the surrounding code already used (and documented in its own comment) for `registryMutex` cleanup one block below it.
2. **A closed game could be silently resurrected by a late WS message.** `VideoWatch.jsx`'s `game_state_update` handler used `setActiveGame(prev => ({...(prev || {}), ...}))` — the `prev || {}` fallback meant a stale/late update arriving *after* the user already closed the game locally (`activeGame === null`) would spread an empty object and produce a new, truthy result regardless, silently reopening the game overlay (with `GameOverlay`/`DoomGame` flashing back onto the screen seconds after being closed). Confirmed via a temporary render-level diagnostic log showing `activeGame` going `null` → `null` (correct, immediately after the exit click) → resurrected to `{...status:'forfeited'}` moments later, once the round-tripped `game_state_update` broadcast arrived. Fixed by changing the fallback to `prev ? {...} : null` — a closed game now stays closed regardless of what arrives afterward. Also fixed the adjacent `game_ended` handler's "It's a draw!" toast, which fired unconditionally whenever `winner_id` was null — including for a 1-player arcade game's own exit, where "draw" never makes sense; now gated on `players.length > 1`.

### DOOM — real multiplayer (host + drone spectators, late-join) (added 2026-06-24/25)

User wanted non-host room members to actually watch the host's live DOOM session (not just a static placeholder), framed as the same kind of broadcast the turn-based games already do. Investigation found the engine itself (a host-authoritative + ticcmd netcode model, not lockstep) already has a complete, working **drone** concept (`-drone` flag: connects, receives world-state snapshots, never sends input, doesn't occupy a player slot) and a complete **late-join** path (`NET_SV_HandleLateJoin` in `net_server.c`) — so the real work was wiring WeWatch's own WS relay in as the engine's transport, not building netcode from scratch.

**Architecture:**
- New `~/dev-tools/DOOM/src/net_wewatch.c`/`.h` — a `net_module_t` transport (mirrors `net_webxdc.c`'s shape) bridged into JS via Emscripten `EM_JS`: packets go out via `_wewatchSend`, arrive via a JS-side queue the C side polls. Registered in `d_loop.c`'s `D_InitNetGame`: `-server` path adds it alongside the loopback module (so the host's own local player still works via loopback while remote peers come in over the relay); `-connect`/`-drone` path uses it as the sole client transport.
- `frontend/src/components/Games/DoomGame.jsx` — `?role=host|spectator` query param picks `-server` vs `-connect 1 -drone` in the shell's `launchDoom()`. Bridges `postMessage({type:'doom:net-out'/'doom:net-in'})` to/from the WS layer via `onRelayPacket`/`registerRelayReceiver` props threaded from `VideoWatch.jsx`.
- `VideoWatch.jsx`: `handleDoomRelayPacket` sends `{type: 'relay_packet', data: {payload}}` (base64); a direct-ref receiver (`doomRelayHandlerRef`, no setState/re-render — this is a ~35Hz packet stream) feeds incoming relayed packets back into the iframe.
- Backend `handleRelayPacket` (`games/websocket_handler.go`) is a dumb pipe — never parses the opaque payload, just rebroadcasts to every other client in the room via `BroadcastJSONExceptUser` (new `Hub` method + `RoomBroadcastMessage.excludeUserID` field, alongside the existing sender-exclusion-by-`*Client` field — added because the games package can't hold a concrete `*Client` due to the import-cycle-avoidance `MessageHub interface{}` pattern).
- `GameOverlay.jsx`'s old host-only gate (`activeGame.host_id !== currentUserId` → placeholder) was **removed** — every room member now gets a real `DoomGame` iframe, just with `role=spectator`.

**Five real bugs found and fixed, in the order discovered (each one blocked verification of the next):**

1. **`relay_packet` never reached the games subsystem at all.** `websocket.go`'s top-level message dispatch only routes `msg.Type` values in `{"game", "start_game", "make_move", "end_game"}` to `gameWebSocketHandler.HandleGameMessage` — `"relay_packet"` (the client's own outgoing message type) wasn't in that list, so every relay packet fell through to a generic catch-all broadcast path instead, which echoes the message back to the room *unrouted* (no `type:"game"` wrapper). Both host and spectator clients logged `"Unknown WebSocket message type: relay_packet"` and silently dropped it — DOOM's own netcode never saw a single byte from the other peer. Fixed by adding `relay_packet` to that allowlist.
2. **A drone could never start the game it joined.** `NET_SV_AllNodesReady` (`net_server.c`) gates `StartGame()` on every *connected* client's `ready` flag — but `client->ready` is only ever set inside `NET_SV_ParseGameStart`, which a drone's own client-side flow does reach (`D_StartNetGame` calls `NET_CL_StartGame` unconditionally) *only if it's still in the early `SERVER_WAITING_LAUNCH` phase*. Since a 1-player host's game transitions to `SERVER_IN_GAME` near-instantly (`AllNodesReady` is trivially true with just the host), any spectator connecting even slightly later hits the **late-join** path instead (`NET_SV_ParseSYN`'s `if (server_state == SERVER_IN_GAME) NET_SV_HandleLateJoin(client)`) — which is the realistic, common case, not an edge case. Fixed by excluding drones from `AllNodesReady`'s readiness check entirely (`!clients[i].drone && !clients[i].ready`) — a drone should never gate game-start on its own readiness in the first place.
3. **`NET_SV_HandleLateJoin` unconditionally forced `drone = false` and assigned a real player slot.** This converted every late-joining spectator into a phantom second player (counted in `num_players`, given a `consoleplayer` slot, broadcast via `PLAYER_JOINED`) that never sends ticcmds — silently stalling the host's own authoritative simulation, which was now waiting on a "player" that would never act. Fixed with an explicit drone branch: skip slot assignment, `num_players` increment, and the `PLAYER_JOINED` broadcast entirely; still send `LAUNCH`+`GAMESTART` (using the *unmodified* real settings/player-count) so the drone's own client FSM unblocks out of `NET_WaitForLaunch`/`BlockUntilStart` and starts receiving world-state snapshots read-only.
4. **A room member who joined *after* `game_started` already broadcast never learned a game was running.** `game_started`/`game_state_update` are one-shot broadcasts; nothing rehydrates this state for a client that connects later (this gap exists for every game type, not just DOOM — DOOM's "host starts instantly, spectator joins moments later" pattern is just what surfaced it). New `GameWebSocketHandler.GetActiveGameMessage(roomID)` (wraps the already-existing `GameManager.GetActiveGame` in-memory lookup) is called from `websocket.go`'s `JoinWatchSession` flow, right after the existing `session_status` unicast — queues an identical `game_started`-shaped message directly into `client.send` if a game is currently active in that room.
5. **The actual root cause of every silent mid-session death, multiplayer or pure solo** (found only after the above four were fixed and a *solo* host session — zero spectators, zero relay code involved — was still dying within seconds): `R_InstallSpriteLump` in `doom/r_things.c` calls `I_Error` (fatal — runs every `exit_funcs` entry registered with `run_on_error=true`, including `D_QuitNetGame` → `NET_SV_Shutdown`) for a sprite frame that has both rotation-specific lumps *and* an all-rotations (`rot=0`) lump for the same frame. This is dozens of well-known, harmless quirks in id Software's own original `doom1.wad` sprite data (TROO/Imp alone has 13; SHTG, PUNG, PISG, POSS, SPOS, PLAY, and ~30 others all have at least one) — vanilla DOOM treats it as fatal, but the data is fine to just ignore (the frame already has correct per-rotation lumps; the extra lump is redundant). Every single game session — including the original Phase 1 solo-arcade build, since launch — was silently calling `I_Error` a few seconds after `G_InitNew`/level load, tearing down networking (`NET_SV_Shutdown`, hence the misleading `"SV: Shutting down server..."` log line that looked like normal teardown) and freezing the render loop, with **zero visible crash or error dialog** — found only by deliberately running a solo session for 15+ seconds and noticing the engine had gone completely silent (no further "alive" heartbeats meant anything past this point) while the page itself looked fine. Fixed by downgrading that one specific case (line ~122 of `R_InstallSpriteLump`, frame already `rotate==true` encountering a `rotation==0` lump) from `I_Error` to a `fprintf(stderr, ...)` warning + early return (skip the redundant lump, keep the existing per-rotation ones) — matching the precedent of later upstream Chocolate Doom releases, which relaxed this exact check for the same reason. The other two `I_Error` calls in the same function (genuinely malformed frame data, or a `rotate==false` frame seeing a *second* `rot=0` lump) were left fatal — those represent real corruption, not this known quirk.

**Debugging methodology note, since this took a full session:** the alignment-fault crash that opened this investigation (`Aborted(alignment fault)`, only visible after temporarily enabling `SAFE_HEAP=1`/`ASSERTIONS=2` in `configure.ac`) was bisected via `wasm-dis` (Binaryen) on the compiled module: matched the V8 stack trace's `wasm-function[N]` index to a disassembled function (accounting for the import-count offset — N minus the number of `(import ... (func ...))` entries gives the defined-function index), read its body to confirm it was a SAFE_HEAP-instrumented `i32.load` bounds/alignment check, then grepped the caller's own disassembly for every `call $<thatindex>` site to find the one with a non-4-aligned constant address. That address traced back to a 1-byte `boolean` global (`nomonsters`/`respawnparm`/`fastparm` in `doom/d_main.c`) being read as a 4-byte `int` — caused by `doomtype.h`'s `typedef bool boolean` vs `typedef enum {false,true} boolean` branch resolving *differently per translation unit*, depending on whether that `.c` file happened to transitively include `<stdbool.h>` before `doomtype.h` was processed (`d_main.c` does, via `<emscripten.h>` → `em_types.h`; `d_net.c` doesn't). Fixed at the source: `doomtype.h` now force-includes `<stdbool.h>` unconditionally before its own `#if` check, so `boolean` is always 1 byte everywhere. This was a real, pre-existing, silent cross-TU type mismatch in the upstream codebase — undefined behavior in C that happened to "work" (produce merely wrong values, not a visible crash) until `SAFE_HEAP` made the resulting misaligned access fatal.

**Known, unresolved issue (separate from all of the above, flagged not fixed):** in headless Playwright testing, the *host's* own WS connection reliably drops ~5–6 seconds into actual gameplay (after `"doom: 10, game started"`/`emscripten_set_main_loop()` — i.e. well past all the handshake/late-join code above), triggering the existing forfeit-on-disconnect path (`GameManager.HandlePlayerDisconnect`). Ruled out: the 60s server-side ping/pong timeout (far too slow to explain a 5s window); a reconnect-then-forfeit race (confirmed via backend logs — no new connection for that user ever registers afterward, this is a genuine, one-way `readPump` exit). Leading theory, not yet confirmed: DOOM's `emscripten_set_main_loop` render loop (continuous WebGL rendering + `GPU stall due to ReadPixels` warnings observed throughout testing) is CPU-intensive enough in a resource-constrained *headless* Chromium tab to starve the main JS thread long enough that the browser's own unresponsive-page handling tears down the WS connection — which would be a headless/automated-testing artifact (no real, actively-engaged user's tab gets treated this way) rather than a production bug, but this is **not yet confirmed** with a real, visible browser. Needs verification in a real, non-headless browser session before being ruled benign.

**Deployed:** `games/doom/v5/` on BunnyCDN (each fix in this section forced a new version path — `v1`-`v4` are stale/abandoned due to BunnyCDN's edge cache having no purge mechanism without an account-level key; same gotcha as documented in the Phase 1 section above). `DoomGame.jsx`'s `DOOM_BASE_URL` points at `v5`.

**Verified for real, end-to-end:** two real accounts (host + member), real room, real watch session, real backend (no mocking). Confirmed via raw WS/console log inspection (not just UI appearance): (a) solo host session runs cleanly for 15+ continuous seconds post-fix, full game loop running, zero disconnect — versus universally dying within seconds pre-fix; (b) host + member joining within seconds of each other both reach `"doom: 10, game started"` together, exchange real `SV got packet ... from wewatch peer <uid>` traffic in both directions (genuine cross-process relay, confirmed with host and member in **separate** browser processes, not just separate tabs/contexts, to rule out single-process resource contention as an explanation); (c) a member joining ~10s *after* the host already started (the realistic, common case given how fast a 1-player game auto-starts) correctly receives the rehydrated `game_started` message and its own drone connects and progresses through the same handshake.

### DOOM v6 — the actual root cause of the crash above, finally found and fixed (2026-06-26)

The "known, unresolved issue" directly above (WS drops ~5-6s into gameplay, theorized as a headless-only CPU-starvation artifact) turned out to be **the same bug as a separate, much more concrete report**: a real desktop (non-headless) user testing DOOM hit a hard black screen, frozen cursor, completely unresponsive — a genuine browser tab crash, not a graceful disconnect. The "headless WS drop" theory from the v5 section was never confirmed and was, in hindsight, almost certainly this exact same underlying crash manifesting slightly differently outside a real visible browser.

**Root cause, found via the same SAFE_HEAP/ASSERTIONS=2 debug-rebuild methodology used for the original alignment-fault bug (see Phase 1), but a much longer hunt this time** — reproduced via Playwright (`page.on('crash')` fired reliably ~3s into gameplay against the production build), then rebuilt locally with `~/dev-tools/DOOM/emsdk` (re-installed from scratch via `emsdk install/activate 5.0.2`, since `/tmp/emsdk` from the original session no longer existed) and `configure.ac`'s `EMFLAGS` temporarily flipped to `ASSERTIONS=2 -s SAFE_HEAP=1 -O1 -g`. This turned the silent, uncatchable native crash into a catchable `RuntimeError: Aborted(segmentation fault)` with a real stack trace, but the FIRST several fixes attempted — all individually reasonable, all ultimately red herrings — did **not** resolve it:
- `R_DrawVisSprite`'s `texturecolumn` bounds check (was `#ifdef RANGECHECK`-gated, i.e. compiled out)
- `R_DrawMaskedColumn`'s post-walking loop given a defensive 256-iteration cap (was completely unbounded, trusting a `topdelta==0xff` terminator that could theoretically be missing)
- `dc_yl`/`dc_yh` given an absolute `[0, viewheight)` clamp in `R_DrawMaskedColumn` (the existing `mfloorclip`/`mceilingclip` clipping only bounds them *relative to other geometry*, not to the screen itself)
- All 6 column-drawing functions in `r_draw.c` (`R_DrawColumn`, `R_DrawColumnLow`, `R_DrawFuzzColumn`, `R_DrawFuzzColumnLow`, `R_DrawTranslatedColumn`, `R_DrawTranslatedColumnLow`) given the same unconditional-instead-of-`#ifdef RANGECHECK` bounds check, failing safe via early `return` instead of `I_Error`
- A genuinely missing `&127` source-index mask in `R_DrawTranslatedColumn`/`R_DrawTranslatedColumnLow` (every other column function masks `dc_source[...]`'s index; these two didn't) — a real bug, fixed, but not *this* bug, since this function is for color-translated monster variants never reached in the solo repro

Each of these was verified safe via direct value-dumping (`EM_ASM` writing into a `window.__xdbg` array, read back via Playwright's `page.evaluate()` after the crash — far more reliable than `fprintf`/`console.log`, which were repeatedly found to silently lose buffered output when the WASM module aborted mid-frame) — `dc_x`, `dc_yl`, `dc_yh`, `dc_source`, `dc_colormap`, and even the fully-computed `dest`/`destEnd` framebuffer pointers were ALL confirmed sane, right up to and including the very last successful draw call before the crash.

**The actual bug**, found by adding the same diagnostic one level up, at the top of `R_DrawVisSprite` (which fires once per *sprite* rather than once per *column*): `vis->patch` — a sprite-frame lump index resolved earlier in `R_ProjectSprite` via `sprframe->lump[rot]` — was `-1` for the sprite immediately following the last successfully-drawn one. `-1` is `sprframe`'s own "no such rotation/frame" sentinel value, used internally, but **never checked before being passed to `W_CacheLumpNum(vis->patch+firstspritelump, ...)`** in `R_DrawVisSprite`. With `vis->patch=-1`, this resolves to `firstspritelump-1` — a real, but completely unrelated, WAD lump (off by one into whatever precedes the sprite lump range), reinterpreted as a `patch_t`. Its bytes happened to decode as `patchWidth=10776` — a width over 50x larger than any real sprite — which is *why* the existing `texturecolumn` bounds fix never caught it: the check passed against this nonsense width, just not against any data that was actually a valid sprite. Every downstream value derived from this (`column`, `dc_source`) was a coherent pointer into *some* real WAD lump data, which is exactly why all of those individually checked out as "sane, in-bounds" pointers right up until the moment a far-enough read finally crossed outside the entire allocated WASM heap.

**Fix**: a single `if (vis->patch < 0) return;` at the top of `R_DrawVisSprite`, before `W_CacheLumpNum` is ever called — skip drawing that one sprite for that one frame, same "ignore bad data, don't crash" precedent as the v5 fix and the missing-mask fix above.

**Verified for real**, methodically, at every stage: (1) the debug build with all 6 fixes ran cleanly for 25 continuous seconds (vs. crashing at ~3s on every single previous attempt) with steadily growing WS packet activity throughout, confirmed via Playwright against a local static server; (2) a full clean production rebuild (`configure.ac` flags reverted to the original `ASSERTIONS=0 -s SAFE_HEAP=0 -s STACK_OVERFLOW_CHECK=1 -O3`, no debug symbols) — confirmed byte-identical-sized output to the documented v5 baseline (7.7MB raw) before `wasm-opt -Oz --all-features --strip-debug --strip-producers` brought it to 2.32MB, matching the documented v5 target — re-ran the same 25-second test against this production build locally, zero crash, *more* activity than the debug build (faster without SAFE_HEAP's instrumentation overhead); (3) uploaded as `games/doom/v6/` and re-ran the identical 25-second test directly against the live BunnyCDN URL, zero crash, confirmed via screenshot showing real, correctly-rendered E1M1 gameplay (HUD, weapon, level geometry all intact).

**Deployed:** `games/doom/v6/` on BunnyCDN. `DoomGame.jsx`'s `DOOM_BASE_URL` now points at `v6` (`v1`-`v5` abandoned per the same stuck-edge-cache convention as before).

**Lesson for next time this class of bug shows up**: when chasing a WASM out-of-bounds crash, don't stop at "is the destination/index in bounds" — also check whether the *source* lookup that produced the pointer/index in the first place was ever validated. Every fix in this investigation except the last one assumed the corruption was in screen-coordinate math; the real corruption was one level higher, in a frame-lookup result that had its own internal "not found" sentinel that nothing downstream ever checked for.

### Space Shooter ("Stellar Swarm") — first true-simultaneous-multiplayer 3D game, VideoWatch-exclusive (added 2026-06-25)

User-facing display name is **"Stellar Swarm"** (`GameLobbyModal.jsx`'s `name` field, custom poster at `/images/stellarswarm.webp`, same path reused by the backend's `gamePosterURL()` lobby-preview mapping) — internal identifiers (`id`/`game_type`: `space_shooter`, the `ShooterGame.jsx` filename, the Railway service name, the `arcadeGameTypes`/`minPlayersOverride` map keys) intentionally stay `space_shooter` throughout the code, same pattern as any product where the marketing name differs from the internal codename. Per-match player cap stays at **8** (confirmed correct, not changed) — deliberately conservative while the feature is new; raise later once proven at scale, same reasoning as the Railway service's `MAX_PLAYERS`/`PLAYERS_PER_WORLD` env vars.

Following DOOM's solo-arcade model, the user wanted genuine simultaneous multiplayer (multiple real players in the same match, not host+spectators) to reinforce the platform's "meet and hang out together" value. First of three candidates scoped (racing game and Quake/OpenArena to follow later, one at a time). Built on `nickyvanurk/3d-multiplayer-browser-shooter` (MIT) — specifically its **`v3` branch**, not `master`: `master` is a newer `bitecs`-based rewrite with zero combat code (pure flying demo); `v3` (older, `ecsy`-based) has the real feature set — health, weapons, bullets, collision, aim-assist. Branch chosen only after grepping `master`'s full tree for `shoot|weapon|health|damage` and finding nothing.

**Architecture — genuinely separate deployed service, not folded into WeWatch's backend.** Unlike DOOM (whose netcode is tunneled through WeWatch's own WS relay since the engine has no native multiplayer transport), this game already has its own working client-server architecture (Node.js + `ws` + Express + `ecsy` ECS + `ammo.js` physics, server-authoritative). Deployed as its own Railway service (`space-shooter`) inside the existing `agile-nourishment` project, alongside the `WeWatch` backend and `Postgres` services already there — same Railway account/project the user already manages, not a new provider. WeWatch's Go backend's only role is the same one it already plays for Trivia/TicTacToe: announce a match started and who's in it (`GameSession.GameState` stays an empty `{}` for this game — all real game state lives entirely in the Railway service's own ECS world).

**The one real upstream change — per-room match isolation.** Originally, `server/src/index.js` pre-allocated N fixed `World` instances at boot and assigned new connections to "the first non-full world" — no concept of a specific room. Replaced with lazy per-room `World` creation, keyed by a `?room=<id>` query param the client now passes on its WS URL (`client/src/connection.js`): server (`server/src/server.js`) extracts it via `new URL(req.url, 'http://localhost').searchParams.get('room')` and attaches it to the connection object; `server/src/index.js` looks up or creates a `Map`-backed world per room id, routing connections to it. A `World.onEmpty(callback)` hook (mirroring the existing `onDisconnect` pattern already used throughout this codebase) fires when `connectedClients` hits 0, destroying the world (`clearInterval` on its 60Hz update loop) and removing it from the map — without this, every room that ever played a match would leave an empty world ticking forever.

**Real bug found and fixed: a race specific to *lazy* world creation, invisible in the original upfront-allocation design.** `World`'s constructor registers its ECS systems (including `NetworkMessageSystem`, whose `connections.added` query is what wires up a player's disconnect handler) only *after* `Ammo()` (the WASM physics module) resolves — an async `.then()`. In the original code, all worlds were created at server boot, long before any real player ever connected, so `Ammo()` had always resolved by the time `handlePlayerConnect` ran. With lazy creation, the *first* player to join a brand-new room creates the entity in the same tick as the `World` itself — before `Ammo()` resolves and the systems exist — so that player's `connections.added` event was silently missed forever; their disconnect handler never got registered, so `connectedClients` never reached 0, so the room's world never got cleaned up. Found via direct instrumentation (logged `hasCallback` on every raw `ws close` event) showing the *first* player's disconnect cleanly fired the raw close event but `hasCallback=false`, while the *second* player's disconnect worked correctly (joined after `Ammo()` had resolved). Fixed with a `ready`/`pendingConnections` queue on `World`: `handlePlayerConnect` defers (queues) if the world isn't ready yet, and `Ammo().then(...)` flushes the queue once systems are actually registered — robust regardless of how many players race ahead of the async resolution, not just the first one.

**Touch controls (additive, zero changes to existing keyboard/mouse path).** The upstream game had zero mobile input support — confirmed by reading every listener in `input-system.js`. Aiming there is **absolute mouse position relative to screen center** (not pointer-lock delta) feeding `input.aim.mouse.{x,y}` (range -1..1), which the server's `spaceship-controller-system.js` uses directly as yaw/pitch *angular velocity* — i.e. aim position *is* the turn-rate input, a flight-stick model, not an independent camera look. This made touch mapping straightforward: `client/src/touch-controls.js` (new file, ~feature-detected via `isTouchDevice()`) adds two `nipplejs` virtual joysticks — left (`forward`/`backward`/`strafeLeft`/`strafeRight`, dead-zone 0.15) and right (writes directly into the same `input.aim.mouse`, matching the desktop range exactly) — plus a dedicated tap-and-hold FIRE button (`weaponPrimary`). Roll and vertical strafe stay keyboard/mouse-only — deliberately left off the touch UI; 6 inputs on a small screen would hurt more than help for a casual mobile player. **Pinned `nipplejs@0.10.2`**, not the current `1.0.4` — the newer version's pre-built `dist` bundle uses modern syntax (`Object.hasOwn`, optional chaining) this project's webpack 4 parser can't handle even with `node_modules` excluded from babel-loader (a parse-time failure, not a transform one); 0.10.2 predates that rewrite and is plain ES5/ES2015. Verified via Playwright with CDP's `Input.dispatchTouchEvent` (not hand-rolled `TouchEvent` construction, which `nipplejs`'s internal identifier-tracking didn't reliably respond to) — confirmed the move stick's vector correctly maps `y>0` (drag up) to `forward=true`, the aim stick correctly updates `input.aim.mouse`, and the fire button correctly toggles `weaponPrimary` on press/release.

**Real backend gap found during WeWatch-side wiring: the generic `start_game` WS handler's min-player check didn't know this game could be played solo.** `games/websocket_handler.go` hardcoded `minPlayers := 2` for any non-arcade game type, relaxed to 1 only via the `arcadeGameTypes` map (currently just `doom`). Adding `space_shooter` to that map would have been semantically wrong — `arcadeGameTypes` specifically means "host is the only participant, ever" (still true and intentional for DOOM), not "also playable solo." Added a separate `minPlayersOverride map[string]int{"space_shooter": 1}` instead, checked only when the game isn't in `arcadeGameTypes` — keeps the two concepts (single-player-only vs. min-player-count) independent. Found by reading the actual rejection (`"at least 2 player(s) required"`) surfaced during real end-to-end testing with only the host selected as a player.

**WeWatch frontend wiring:**
- `frontend/src/components/Games/ShooterGame.jsx` — iframe wrapper mirroring `DoomGame.jsx`'s shape, but simpler: no relay-packet plumbing at all (this game's netcode talks directly from the iframe to the Railway WS server; WeWatch's backend never touches a single packet, unlike DOOM's relay). `src` is `https://space-shooter-production-6e0d.up.railway.app/?room=<roomId>` — the WeWatch room id is passed straight through as the query param the server-side per-room routing (above) reads. `sandbox="allow-scripts allow-same-origin"` — `allow-same-origin` is required for `location.origin` to resolve to a real value inside the iframe (a fully sandboxed iframe gets an opaque `null` origin, which would break the client's own `ws://`/`wss://` host derivation); no `allow-pointer-lock` needed since this game never uses the Pointer Lock API (confirmed via the absolute-mouse-position aim model above). Every player (host included) gets an identical real player view — no host/spectator split, unlike DOOM.
- **Exit semantics differ from DOOM on purpose**, reflecting true multiplayer vs. host-authoritative-with-spectators: a plain X close just calls `onClose()` for *that* player only (others keep playing, like leaving a real multiplayer match) — never `onEndGame()`. Only the WeWatch room host sees an additional, explicit "End for Everyone" button that calls `onEndGame()` (ends the WeWatch `GameSession`, broadcasts `game_ended`) before closing — mirrors Trivia's host-only-end pattern rather than DOOM's "anyone's X ends it" pattern, since there's no natural 2-player forfeit-loses semantic for an N-player arena shooter.
- `GameOverlay.jsx` — new `case 'space_shooter':`, lazy-loaded (`React.lazy`, same as `DoomGame`), passes `roomId` through (new prop on `GameOverlay` itself, threaded from `VideoWatch.jsx`'s existing `roomId` from `useParams()` — `CinemaScene3DDemo.jsx` doesn't need it since its `GameOverlay` render is commented out, see below).
- `GameLobbyModal.jsx` — new entry, `type: 'multiplayer'` (fits the existing generic player-picker UI with zero special-casing, same as Trivia), `minPlayers: 1, maxPlayers: 8` (matches the Railway service's `PLAYERS_PER_WORLD=8` env var), `heavy: true` flag (new field, also added to the existing `doom` entry).
- **Real, pre-existing bug fixed in the same pass, confirmed via direct testing**: `GameLobbyModal` was reachable from `CinemaScene3DDemo.jsx` (3D Cinema) showing every game with zero filtering, but `CinemaScene3DDemo.jsx`'s own `GameOverlay` render is *commented out* (games show on the in-scene 3D screen via a separate `GameScreenRenderer` mechanism instead) — meaning DOOM was already selectable-but-silently-broken there before this change, and Space Shooter would have been too. Fixed with a new `allowHeavyGames` prop on `GameLobbyModal` (default `true`): `visibleGames = allowHeavyGames ? games : games.filter(g => !g.heavy)`. `VideoWatch.jsx` doesn't pass it (defaults `true` — heavy games allowed there, by design, per the "VideoWatch-exclusive" decision). `CinemaScene3DDemo.jsx` explicitly passes `allowHeavyGames={false}`. `LectureHallPage.jsx` doesn't import `GameLobbyModal` at all — already structurally unreachable there, confirmed via grep, no change needed.
- `frontend/src/utils/devicePerformance.js` — new shared `checkDevicePerformance()` (soft warning only, never blocking, per explicit product decision: target floor is "a mid-range phone that can handle PUBG Mobile," underpowered devices get a dismissible toast, never a hard gate). Heuristic: `navigator.hardwareConcurrency <= 2` or `navigator.deviceMemory <= 2` (where available) → `isLowEnd`. Dismissal persisted per-game in `sessionStorage`. Wired into `ShooterGame.jsx` only for now (DOOM already shipped without it; not retrofitted here to keep this change scoped) — written to be reusable as-is for the racing game and Quake/OpenArena later.
- Backend: `games/game_manager.go`'s game-type allowlist and `games/websocket_handler.go`'s `gamePosterURL()` (lobby session-preview poster mapping, → `/images/space-shooter.svg`, a small original SVG icon, same pattern as `doom.svg`) both needed the new `"space_shooter"` case added — the otherwise-true "zero backend Go changes needed for a new game type" claim from the DOOM work applies to `GameState` initialization (no case needed, falls through to an empty `{}`) but not to these two explicit allowlists.

**Verified for real, end-to-end, in the actual WeWatch app (not just against the bare Railway service):** real test account, real room, real watch session. Confirmed via direct WS/console log inspection: `GameLobbyModal` correctly shows "Space Shooter" (custom SVG poster rendering correctly) alongside the other 4 games; selecting it shows the correct `Min: 1 | Max: 8` from the real per-game config; starting it sends `start_game` → backend logs `🎮 [VideoWatch] Game started: {game_type: space_shooter, ...}` → `GameOverlay` renders `ShooterGame` → the iframe's actual `src` attribute is the exact expected `https://space-shooter-production-6e0d.up.railway.app/?room=195` → screenshotted the *real, loaded, rendering* 3D ship-and-starfield scene inside that iframe, embedded in the live WeWatch UI (taskbar, "End for Everyone" button all visible simultaneously) — not a mock or a standalone test page. Clicking "End for Everyone" correctly sent `end_game`, logged `🎮 [VideoWatch] Game ended: {..., reason: forfeited}`, and the overlay/iframe correctly unmounted. Separately confirmed via raw WS clients (bypassing the browser entirely) against the real deployed Railway service: two connections to the same room id land in the same world (see each other's asteroid-field spawn stream); a third connection to a different room id gets a fully separate world; both rooms' worlds correctly self-destruct (`"Room X is empty, destroying its world"`) once their last player disconnects, including under near-simultaneous multi-room disconnects.

**Known, accepted test-environment quirk (not a product bug):** the local Postgres `watch_sessions` row's `is_active` flag and the `/active-session` GET endpoint's own "is there a live session" check can disagree after an abrupt disconnect (e.g. closing a test browser without a clean WS close) — a session can be `is_active=true` in the DB (blocking a fresh `CreateWatchSession` call with "Active session already exists") while the GET check reports `is_existing:false`. Pre-existing, unrelated to this game integration; surfaced repeatedly during automated testing and worked around by ending the stale row directly via `POST /sessions/:id/end`. Not investigated further — flagged here in case it resurfaces during future testing.

### Posts (updated 2026-05)
- `Post` model has **no `Title` field** — removed from Go struct (DB column still exists but is ignored by GORM; optionally drop with `ALTER TABLE posts DROP COLUMN IF EXISTS title`).
- Use `description` as the display text everywhere title was shown (truncate to ~60–80 chars where needed). Do not add a title field back.
- `PostType` values: `"recording"` | `"upload"` | `"text"`. `MediaType` values: `"video"` | `"image"` | `"gif"`.
- **Text posts** (`post_type = "text"`): store raw text in `text_content TEXT` column (added 2026-05); no file upload, no canvas thumbnail. Frontend detects `post.post_type === 'text'` and renders a dark text card instead of media.
- `CreatePostRequest` and `UpdatePostRequest` have no `Title` field. Search in `GetDiscoverFeed` covers `description ILIKE` + `username ILIKE` only (title clause removed).
- Notification body for new room posts uses `post.Description[:60]` preview.
- `generateDownloadFilename` in `post_download_handler.go` uses description preview instead of title.
- **DB migration needed** for text posts (add `text_content` column — see DB section below).

### LobbyPage Feed Structure (updated 2026-05)
- **Two sub-tabs only**: "Watching Live" and "Feed". No Following tab. `useFeedAlgorithm` is stripped to For You only (following feed code removed).
- **Swipe**: bidirectional between Watching Live ↔ Feed only. No third level.
- **FABs**:
  - Watching Live sub-tab: W icon (`/icons/lwoIcon.png`) FAB → opens `CreateNewModal` with `hidePosts={true}` (Watch Now + Watch in Rooms only, no Post option).
  - Feed sub-tab: Plus icon FAB → opens `PostUploadModal` directly.
  - Rooms tab: Plus icon FAB → opens `CreateNewModal` with `hidePosts={false}` (all options).
- **CreateNewModal** has `hidePosts = false` prop. When `true`, the Post button is hidden.
- **Feed search**: always-visible search bar at top of Feed content (not collapsible), same style as sessions search bar.
- **Post dividers**: `divide-y divide-gray-200 dark:divide-gray-700` on the posts list (not `space-y`).
- **Tab font sizes**: main tabs (`text-sm sm:text-base`), sub-tabs (`text-base font-semibold`).
- **Room ordering**: `sortRooms()` pins owned rooms first, then sorts member rooms by content-rating proximity to the user's own room rating using `RATING_ORDER` index distance.
- **Room cards**: no "Your Room" badge text — purple ring border only (`ring-2 ring-purple-500`).

### Content Rating
- Ratings: G, PG, Educational, Religious, 13+, 16+, 18+, Mature
- `User.CanViewContent(rating)` enforces age gate based on `User.DateOfBirth`
- Mature rating = adult content firewall, NOT a porn hosting feature. App store hard wall: Capacitor (Phase 3) build variant will disable Mature content for iOS/Android App Store compliance.
- `UserPreferences` model already handles client-side content filtering

### Church Mode / LiveShare Studio Controls
- Church-mode studio panel uses an **icon-button launcher pattern** — three small toggle buttons (BookOpen / Music / FileText icons) that open Bible, Hymn, and Sermon controls on demand, like the Upload tab in LeftSidebar. Controls are NOT auto-rendered inline.
- State: `showBibleControl`, `showHymnControl`, `showSermonControl` (all `false`); reset in the `!liveShareMode` cleanup effect.
- `SermonControl.jsx` supports two input paths: `.txt` file upload (via hidden `<input type="file">` + `FileReader`) and paste/type in textarea. File name becomes the default title. Only accepts `text/plain`.
- `handleShowSermon({ pages, title })` in `LiveShareManager.jsx`: sends `sermon_update` WS message with pages array, then closes the control (`setShowSermonControl(false)`).
- The Sermon button is **not gated on `presentationUrl`** — sermon and presentation slides are independent features.
- `PresentationControl` is only for slide decks (when `presentationUrl` is set); `SermonControl` is always available in church mode.

### LectureHallPage Performance Patterns
These patterns were applied to `LectureHallPage.jsx` (2026-05) for network resilience and stability:
- **`withRetry(fn, maxAttempts=3)`** — module-level helper, exponential backoff (100ms × 2^attempt), skips 4xx errors and `AbortError` (don't retry client errors or intentional cancels).
- **`cancelled` flag pattern** — every async `useEffect` sets `let cancelled = false` at the top and returns `() => { cancelled = true }`. All `setState` calls are guarded by `if (cancelled) return`.
- **`approvedSpeakersRef` in subscription effects** — subscription effects that depend on a frequently-changing object (e.g. `approvedSpeakers`) should read from a ref (`approvedSpeakersRef.current`) instead of listing the object as a dep. The ref is already kept in sync via a separate `useEffect`. This prevents subscription teardown/rebuild on every speaker change.
- **`captureAbortRef`** for long async loops — set `captureAbortRef.current = false` at the start of the loop, check it after each frame, each sleep, and before CDN upload. Set `captureAbortRef.current = true` in the unmount cleanup.
- **`LectureHallErrorBoundary`** — class component wrapping `<Canvas>` to catch 3D renderer crashes without crashing the whole page.
- **200-message chat cap** — all three `setSessionChatMessages` call sites cap the array: `const next = [...prev, msg]; return next.length > 200 ? next.slice(next.length - 200) : next`.
- **5s member fetch dedup cache** — `memberFetchCacheRef = { lastFetch: 0, data: null }`; skip network call if `Date.now() - lastFetch < 5000` and return cached data.
- **Single mousemove handler** — one `useEffect` with `[]` deps registers a single `mousemove` listener for the lifetime of the component. Dynamic state (e.g. `isMediaFullscreen`, `blackboardMedia`) is read via refs synced in separate effects, not via closure.
- **`updateIntervalRunningRef` guard** — periodic 30s update interval checks `if (updateIntervalRunningRef.current) return` before running, preventing stacked intervals.
- **Parallel fetch on join** — `fetchTemporaryMedia` + `fetchTokenBalance` combined into one `Promise.allSettled` effect; `fetchQuizData` host path uses `Promise.allSettled` for quizzes + progress in parallel.

### Notifications (added 2026-05)
**Backend — `handlers/notifications.go`**
- `CreateNotification(userID, type, title, body, entityType, entityID)` — inserts DB row + pushes `notification_new` WS event to user. Call via `go CreateNotification(...)`.
- `UpsertDMNotification(recipientID, senderID, senderUsername, messagePreview)` — batches DM notifications: if an unread `dm_received` from the same sender already exists, increments the count in the title ("2 unread messages from @alice") and updates `created_at` to bubble it up. Creates new if none found.
- `Notification` model fields: `UserID`, `Type` (varchar 50), `Title`, `Body`, `EntityType`, `EntityID`, `IsRead`, `CreatedAt`

**Notification type values and where each fires:**
| Type | Fires in | EntityType | EntityID |
|---|---|---|---|
| `room_post` | `posts.go` CreatePost | `room` | room ID |
| `session_started` | `rooms.go` StartWatchSession | `room` | room ID |
| `session_ended` | `rooms.go` background goroutine (non-instant rooms, non-host members) | `room` | room ID |
| `post_like` | `posts.go` LikePost | `post` | post ID |
| `post_comment` | `posts.go` CreatePostComment (top-level only) | `post` | post ID |
| `reply` | `posts.go` CreatePostComment (reply only) | `post_comment` | parent comment ID |
| `event_booking_confirm` | `ticket_handlers.go` after commit | `session` | session ID |
| `event_booking` | `ticket_handlers.go` after commit (→ host) | `session` | session ID |
| `token_gift` | `donation_handlers.go` GiftTokensHandler | `user` | donor ID |
| `dm_received` | `lobby_chats.go` SendLobbyChatMessageHandler (UPSERT) | `user` | sender ID |
| `missed_call` | `lobby_calls.go` logMissedCall | `user` | caller ID |
| `watch_invite` | `watch_out_handler.go` SendWatchOutHandler | `room` | room ID |

**Frontend — `LobbyPage.jsx`**
- `handleNotificationClick(n)`: reads `n.notif_type || n.type` (WS pushes `notif_type`; API returns `type`); marks notification read via PATCH; routes:
  - Room types (`room_post`, `session_started`, `session_ended`, `event_booking*`, `gift_ticket`, `watch_invite`) → `navigate('/rooms/:entity_id')`
  - Post types (`post_like`, `post_comment`, `reply`) → switch to Watching Live tab (no post-specific URL yet)
  - `dm_received` / `missed_call` → switch to Chats tab + `handleOpenChat(friend)` if found in `friendsList`
  - `token_gift` → `navigate('/payment')`
- Notification panel rows are `<button>` elements — were plain `<div>` before.

### Content Rating UI Framing (TODO — revisit before marketing push)
Current state: raw rating strings ("G", "PG", "Religious", "Mature") appear as labels in some UI surfaces.

Planned improvement: show human category labels instead of rating codes wherever users see them:
- `Religious` → ✝️ Church / Fellowship
- `Educational` → 📚 Learning
- `G` / `PG` → 🎬 General
- `18+` / `Mature` → 🔒 18+ (access control framing, not content warning framing)

The rating string drives all backend logic unchanged — this is purely a display layer change. Rating labels should be **invisible infrastructure** in the feed (filtering happens silently). The only place a label earns its place is at the session join gate ("This is an 18+ session").

Twitter iOS precedent: sensitive content toggle removed entirely from iOS App Store build. Mature content accessible via web only. Capacitor iOS build variant should disable Mature the same way (already noted in CLAUDE.md deploy section).

### Encryption
- Transport: WSS (TLS) — sufficient for beta
- No E2E: kills server-side moderation and adds huge complexity; revisit post-beta

## 3D Cinema (added 2026-06)

### Key files
| File | Role |
|---|---|
| `frontend/src/components/cinema/3d-cinema/CinemaScene3DDemo.jsx` | Main 3D cinema component (~280KB). All playback, sync, WS handling, LiveShare, seats. |
| `frontend/src/components/cinema/3d-cinema/CinemaScene3D.jsx` | R3F Canvas + lighting + camera controls + avatar manager |
| `frontend/src/components/cinema/3d-cinema/CinemaTheaterGLB.jsx` | Three.js GLB model + VideoTexture + `useFrame` loop |
| `frontend/src/hooks/usePlaybackSync.js` | Broadcasts `playback_control` seek from host every 8s |

### Canvas rendering pipeline
- `THREE.VideoTexture` wraps the `<video>` element ref
- `useFrame` in `CinemaTheaterGLB` sets `videoTextureRef.current.needsUpdate = true` every RAF
- Canvas runs `frameloop="always"` — renders every RAF unconditionally
- **Critical**: if `useFrame` misses any frame (main thread blocked), the GPU shows a stale video frame → visible stutter
- `CinemaTheaterGLB` is `React.memo`'d with a custom `arePropsEqual` comparator — only re-renders when `videoElement`, `cameraVideoElement`, `gameCanvas`, `podcastCanvas`, or `liveShareMode` changes

### Sync architecture (current state — 2026-06)
Two-layer sync for members:

**Layer 1 — Direct handler (every 8s, zero re-renders)**
- Host's `usePlaybackSync` broadcasts `playback_control` seek every 8s
- `registerDirectMessageHandler` in `CinemaScene3DDemo` intercepts these BEFORE `setMessages()`
- For same-media seeks: applies smooth `playbackRate` correction (0.8–5s drift) or hard seek (>5s drift) directly on `videoRef.current` — no React state, no re-render, no RAF gap
- Also refreshes `syncRefRef` on every intercept so Layer 2 stays current

**Layer 2 — Autonomous drift check (every 2s, zero WS)**
- `syncRefRef = { hostTime, receivedAt }` seeded from the initial `playback_control` play message
- 2s `setInterval` computes `expected = hostTime + elapsed` and corrects `video.currentTime` directly if drift > 1s
- No WS round-trip, no setState — purely local arithmetic

**Why host never jitters**: backend filters sender from their own broadcasts — host never receives own `playback_control` echoes → no re-renders for host.

**Shadow refs pattern** (prevents effect re-runs on every WS message):
`isPlayingRef`, `pendingSeekTimeRef`, `sendMessageRef`, `isHostRef`, `currentMediaRef` mirror state/callbacks so the media loading `useEffect` can read current values without listing volatile deps. Effect deps reduced to `[currentMedia, liveShareMode, roomId, finalSessionId]`.

### Browser vs native performance
**Jitter observed in Firefox is unavoidable** — Firefox's WebGL pipeline for `THREE.VideoTexture` is significantly slower than Chrome's. Chrome uses `CHROMIUM_copy_texture` internally; Firefox goes through a slower path. **Chrome is the supported browser for 3D cinema.** Consider adding a browser detection warning for Firefox users.

The general browser overhead vs native apps (COD Mobile etc.):
- JS → WebGL API → Chrome GPU process (sandboxed) → driver → GPU vs C++ → driver → GPU directly
- Chrome security-validates every WebGL call (native apps don't pay this)
- JS main thread shared between React, WS, and render loop (native render runs on dedicated thread)
- No hardware texture compression access (KTX2/ASTC) without explicit pipeline
- Phase 3 Capacitor build will improve this — WKWebView/WebView has better GPU access and no browser process sandboxing

### Scalability
- **Backend**: Scales well. Overfill system distributes users across isolated 42-seat rooms. 1000 users = ~24 rooms, each running independently. WS + LiveKit per room is lightweight.
- **Mobile browser**: Not yet optimised. Current scene (GLB model + 20 lights + 42 avatars + VideoTexture) is heavy for mid-range Android in a browser context.

### Mobile performance — pending optimisations (priority order)
1. **Pause RAF when tab hidden** — `document.visibilityState === 'hidden'` → stop `invalidate()`. Zero GPU/battery when user switches apps.
2. **Behind-seat avatar culling** — skip rendering avatars whose seat Z > current user's seat Z. Users cannot look behind them (OrbitControls constrained to left/right/center). Could eliminate 30–50% of avatar draw calls.
3. **Service worker cache** — cache GLB, seat JSON, JS bundles on first load. Repeat visits load from disk.
4. **`THREE.Cache.enabled = true`** — one line at app startup, caches geometries/textures in memory for the session.
5. **Disable OrbitControls damping on mobile** — damping keeps animating after finger lift → continuous `invalidate()` calls for nothing.
6. **Reduce lights on mobile** — detect `isMobile` and render 4-5 lights (ambient + screen + 2 ceiling + 1 fill) instead of 20+.
7. **Device tier detection → 2D fallback** — `navigator.hardwareConcurrency <= 4` or frame-rate probe on load → route low-end devices to existing 2D fullscreen view.
8. **Sprite/billboard avatars at distance** — replace distant avatar meshes with flat `PlaneGeometry` sprites. One draw call per distant avatar.
9. **`THREE.InstancedMesh` for avatars** — all 42 avatars share same geometry → one draw call total instead of 42.
10. **KTX2 compressed textures in GLB** — re-export cinema.glb with KTX2/Basis textures; decompresses directly on GPU → less VRAM + faster upload.

### Caching opportunities
- `cinemaSeats.json` — cache in `sessionStorage` on first fetch; never changes mid-session
- GLB model — confirm Railway serves with `Cache-Control: max-age` and `ETag` headers
- Service worker (PWA) — cache GLB + JS bundles for offline/repeat-visit instant load
- KTX2 textures — GPU-native format, decompress on GPU not CPU

### Avatar speech indicator system (added 2026-06)
`FlatUserIcon` has a `speechStyle` prop that switches between two speech modes. Set by the avatar manager, not by FlatUserIcon itself.

| Prop value | Set by | Behaviour |
|---|---|---|
| `'pulse'` | `LectureHallAvatarManager` | Sonar-ping ring + orb lightness shift |
| `'glow'` | `CinemaAvatarManager` | Orb brightness only, no ring |

**Glow mode (`speechStyle="glow"`)** — cinema dark environment:
- Orb rests at 30% HSL lightness (nearly invisible), brightens 30%→85% with `audioLevel`
- No ring mesh rendered — zero extra draw calls
- `dimColor` memo returns `hsl(h, s%, 30%)` as the JSX initial color so the orb starts dim without waiting for the first `useFrame`

**Pulse mode (`speechStyle="pulse"`)** — lecture hall bright environment:
- Orb lightness shifts 50%→85% with `audioLevel`
- Sonar-ping ring (`ringGeometry [0.022, 0.032]`): expands scale 1→3.5× over 2.8s cycle, opacity 0.55→0 linearly
- **Ghost-fix**: ring only activates when `isSpeaking && audioLevel > 0.01` — prevents the frozen last-frame artifact when user mutes mid-speech
- `pulseColor`: user's hue mapped into 220°–280° blue-purple arc — distinct from the orb's `userColor` so the two elements never merge into one mass

**Key memos in FlatUserIcon:**
- `orbBaseHSL` — extracts `{ h, s }` from `userColor` HSL string; `null` for hex colors (host/premium) which stay static
- `dimColor` — `hsl(h, s%, 30%)` for glow mode; falls back to `userColor` for hex colors and pulse mode
- `pulseColor` — `hsl(mappedHue, 75%, 65%)` where `mappedHue = 220 + (hue/360)*60`

### LobbyPage Efficiency Patterns (added 2026-06)
Applied to `LobbyPage.jsx` and `SessionPreview.jsx`:

- **`filteredRooms` / `filteredSessions` as `useMemo`** — were `useState` + `useEffect`, which caused a double-render on every search/session update. Now computed inline as `useMemo([rooms/sessions, searchTerm])`. Never use `setFilteredRooms` / `setFilteredSessions` — they no longer exist as state.
- **Rooms lazy-load with `roomsFetchedRef`** — `fetchRoomsData()` is no longer called unconditionally on mount. On mount: if `_lobbyCache.rooms` is warm, serve instantly from cache without network; else fetch only if starting on `'rooms'` tab. A separate `useEffect([activeTab])` fires `fetchRoomsData()` on the user's first visit to the rooms tab. WS events still call `fetchRoomsData()` directly.
- **Unified 30s poll** — replaces two separate intervals (30s liveRooms + 60s WS-fallback). One stable `setInterval` (empty dep array) reads current values via `wsConnectedPollRef` + `activeTabPollRef` refs, never restarts. Covers both: WS-fallback refreshes (rooms + sessions when WS down) and liveRooms refresh (when in chats tab). Immediate liveRooms fetch on entering chats tab is a separate `useEffect([activeTab])`.
- **`SessionPreview` wrapped in `React.memo`** — custom 7-prop comparator (`previewUrl`, `posterUrl`, `isGenerating`, `isClearing`, `muted`, `previewVersion`, `session.session_id`). When any one session's preview updates via WS, only that card re-renders; unchanged cards skip.
- **`videoMuted` default `false`** — previews unmuted by default (stored in `localStorage('videoAutoplayMuted')`). Browser autoplay policy still applies — audio plays only after user interaction.
- **`showChatBubbles` default `false`** — cinema chat bubbles are off until the user explicitly enables them in Settings (`localStorage('cinema_show_chat_bubbles')`).

### SettingsModal / LectureHallPage debug gating (added 2026-06)
- All debug sections in `SettingsModal.jsx` are already gated by `currentUser?.role === 'super_admin'` — no change needed there.
- `LectureHallPage.jsx`: four debug overlays (camera markers, position overlay, seat management panel, LiveKit audio debug) now also check `currentUser?.role === 'super_admin'` at the render site, as belt-and-suspenders protection even if the boolean flags are somehow set to `true`.

## Device Streaming via HLS (added 2026-06-20)

**Problem this solves:** uploading a local file to BunnyCDN before anyone (including the host) can watch it is slow for large files — the original "wait for everything" friction. This feature lets a host pick a file from their own device and start watching immediately, with segments becoming playable *while the file is still uploading*, without routing any of it through LiveKit (keeps LiveKit reserved for voice/video talk only — bandwidth-cost reasons).

**High-level flow:** host clicks "Stream from Device" in `LeftSidebar.jsx` → file uploads via the *existing* chunked-upload pipeline → backend tries to detect "fast-start" (structural index near the front) using only a *partial* prefix of chunks → if detected, commits to a live FIFO→ffmpeg→HLS pipeline that produces segments *while later chunks are still arriving*; if never detected, falls back to today's wait-for-everything-then-segment-once path. Either way, the result is an HLS manifest (`.m3u8`) played via `hls.js`, broadcast to the whole room as soon as the first segment exists — not after the whole file is processed.

### Backend — key files
- **`backend/internal/utils/hls.go`** — `SegmentToHLS(inputPath, outputDir, segmentSeconds)`: one-shot ffmpeg invocation (`-c copy` when source is H.264, `-sn` always — see Gotchas) used by the **fallback** path on a complete, already-assembled file.
- **`backend/internal/utils/hls_progressive.go`** — the progressive pipeline:
  - `GetOrCreateProgressiveUpload` / `ForgetProgressiveUpload` — per-upload state in a package-level `map[string]*ProgressiveUploadState` + mutex (same idiom as `activeCalls`/`activeCallsMutex` in `lobby_calls.go`).
  - `MaybeStartProgressiveProbe` — called after every chunk save; tests the **largest contiguous partial prefix** with `ffprobe`; never tests the complete file (see Gotchas).
  - `commitProgressiveMode` — creates a named pipe (`golang.org/x/sys/unix.Mkfifo`, already a dependency), starts a long-running `ffmpeg -i <fifo> ...` process, then launches the drainer + manifest-watcher goroutines.
  - `drainChunksToFIFO` — copies chunk files into the FIFO strictly in index order (catching up on whatever already landed), deletes each chunk once drained, closes the FIFO on the last chunk (ffmpeg sees EOF → finalizes `#EXT-X-ENDLIST` → exits), then computes final duration and cleans up.
  - `watchManifestForFirstSegment` — polls the manifest for the first `#EXTINF` entry, then fires the registered ready-callback.
  - `ResolveFinalMode` — called when the last chunk lands; waits out any in-flight probe and returns the decided mode. Deliberately does **not** retry probing the now-complete file.
  - `SetProgressiveReadyCallback` / `SetProgressiveDurationCallback` / `SetProgressiveMediaItemID` — injection points so `utils` (which `handlers` already imports) never has to import `handlers` back.
- **`backend/internal/handlers/chunk_upload.go`** — `ChunkUploadHandler`: chunk writes are now atomic (temp+rename, closes a race with the drainer reading a chunk mid-overwrite on retry). After every chunk save (for `isTemporary` + video uploads), calls into the probe gate. On the last chunk, branches on `ResolveFinalMode`: progressive → respond 202, let the async pipeline finish; otherwise → today's original `assembleChunks`/`SegmentToHLS` one-shot path, untouched. `onProgressiveStreamReady` creates the `TemporaryMediaItem` row (`IsStream: true`, `MimeType: "application/vnd.apple.mpegurl"`) and broadcasts `device_stream_ready`. `onProgressiveDurationKnown` patches `Duration` once ffmpeg finishes (unknowable any earlier) and broadcasts `playlist_duration_updated`.
- **`backend/cmd/server/main.go`** static handler (`/uploads/*filepath`) — unchanged from before this feature; still sets `Cache-Control: public, max-age=3600` for everything, including in-progress manifests (this is the **session-end cleanup / CDN distribution gap**, see Known Gaps below).

### Frontend — key files
- **`frontend/src/components/cinema/ui/CinemaVideoPlayer.jsx`** — new `mediaUrl.endsWith('.m3u8')` branch: `Hls.isSupported()` → `new Hls({ startPosition: 0 })` (the explicit `startPosition: 0` is required — see Gotchas) → `loadSource` + `attachMedia`; Safari falls through to native `video.src` (no library needed). `hlsRef` torn down with `hls.destroy()` on cleanup.
- **`frontend/src/components/cinema/VideoWatch.jsx`** — new `case "device_stream_ready"` in the WS message switch: resets `playbackPositionRef.current = 0` (critical — see Gotchas), then `setCurrentMedia` + `setPendingSeekTime(0)` + `setIsPlaying(true)`. Reaches every client (host included, no sender exclusion on this broadcast) — this is the *only* mechanism both host and members rely on to start watching a progressive stream. Also: fixed a pre-existing, unrelated bug in the `applyLoad`/`loadeddata` seek effect — `pt >= 0` → `pt > 0`, since seeking to `0` when `video.currentTime` is already `0` never fires `seeked`, so `play()` was never called for any late-joiner whose estimated position rounded to exactly 0.
- **`frontend/src/components/cinema/ui/LeftSidebar.jsx`** — "📱 Stream from Device" button next to "Browse Files"/"🔗 URL"; sets `pendingAutoPlayRef.current = true` before triggering the same hidden file input. A `uploading`-flip `useEffect` is the fallback auto-play trigger (fetches latest temporary-media + calls `onMediaSelect`) for when `device_stream_ready` is missed or the upload resolved to fallback mode.

### Critical gotchas (all found via real end-to-end testing, not theoretical)
- **Embedded subtitle tracks crash ffmpeg's HLS muxer.** `-c copy` can't convert `mov_text` → WebVTT; ffmpeg aborts the whole process (`Could not write header for output file #0`), which looks like a "broken pipe" on the Go side. Fix: always pass `-sn` to both `SegmentToHLS` and the progressive ffmpeg invocation. Any real movie/show rip can have this — it's not an edge case.
- **Never probe the complete file as a fallback-before-fallback.** A complete file is *always* `ffprobe`-able regardless of where its structural index (`moov` atom) sits, because regular files support seeking. Testing the complete file (e.g. "if no partial prefix worked, try once more with everything") will "succeed" even for files whose index is at the very end — and then incorrectly commit them to the FIFO pipeline, where ffmpeg reads from a **non-seekable pipe** and produces zero segments. The only valid FIFO-safety signal is a genuine *partial-prefix* probe success. `MaybeStartProgressiveProbe` explicitly skips `prefix >= state.totalChunks`; `ResolveFinalMode` does not retry probing on the last chunk, it only waits out an already-in-flight attempt.
- **Progressive output must live in a directory *sibling* to the chunk upload dir, never inside it.** The fallback path's cleanup does `os.RemoveAll(uploadDir)` right after assembly — if the FIFO/output directory is nested inside `uploadDir`, that cleanup (which still runs for every non-progressive upload, including ones that *almost* went progressive) deletes the FIFO and segments out from under the drainer. Convention used: `state.uploadDir + "_progressive"`.
- **`device_stream_ready` (and any new custom WS broadcast meant to be read like `playback_control`) must be flat, no `"data"` wrapper.** Some broadcasts in this codebase use `{"type", "data": {...}}`; `playback_control` does not — it's flat (`type`, `command`, `file_path` as siblings). `VideoWatch.jsx`'s switch reads fields directly off `message`, so a nested broadcast causes `Cannot read properties of undefined (reading 'startsWith')` on the frontend, not a clean error.
- **`hls.js` defaults to live-edge start position for any manifest without `#EXT-X-ENDLIST` yet.** A progressive upload's manifest has no ENDLIST until the whole file finishes — hls.js treats that as a live stream and starts playback near the live edge instead of position 0 (observed: jumping straight to ~450s into an ~890s file). Fix: always construct `new Hls({ startPosition: 0 })` for this use case.
- **`playbackPositionRef` (latency-compensated-seek ref in `VideoWatch.jsx`) is never auto-cleared.** It's continuously updated by `handleTimeUpdate` while *any* video plays. A new `device_stream_ready` stream must explicitly reset it to `0` before `setCurrentMedia`, or the new video inherits whatever position the previous video happened to be at and immediately seeks there.
- **Chunk writes must be atomic (temp+rename).** The progressive drainer reads chunk files that a parallel retry-POST could be rewriting at the same path. `c.SaveUploadedFile` writes to `chunkPath + ".tmp"`, then `os.Rename` into place — rename is atomic on the same filesystem, so a reader never sees a half-written file.
- **`go run cmd/server/main.go` spawns a child process distinct from the wrapper** — `pkill -f 'go run cmd/server/main.go'` (or killing the wrapper's PID) leaves the actual compiled binary running. Always also kill the `/tmp/go-build*/b001/exe/main` PID when restarting during local dev.

### Phase 3 — cleanup, CDN distribution, audio support (completed 2026-06-21)
All three gaps from Phase 2 are now built and verified (real two-browser/real-CDN testing, not just code review).

**1. Session-end cleanup — fixed at the root, not the call sites**
- `utils.DeleteMediaFile(filePathOrURL string)` (`bunny_cdn.go`) is the single function every session-end/cleanup path in `rooms.go`, `temporary_media_items.go`, and the hourly `CleanupAllTemporaryMedia` sweep already calls per `TemporaryMediaItem.FilePath` — there are 7+ call sites across the codebase, all unchanged. Rather than touching every call site, `DeleteMediaFile` itself now detects a locally-produced `.m3u8` (any local, non-`http`, `.m3u8`-suffixed path — externally-linked streams from `HandleStreamURL` are always real `http(s)` URLs and are handled by the branch above this check, so reaching the `.m3u8` branch unambiguously means "ours") and removes the whole output directory instead of just the manifest file.
- **Real bug found and fixed during testing**: the two HLS pipelines nest the manifest at *different depths* relative to their per-upload directory — progressive is `{uploadID}_progressive/output/playlist.m3u8` (two levels: removing the grandparent is correct and required, since the FIFO/chunks are already gone by session-end time), but fallback is `uploads/temp/hls/{name}/playlist.m3u8` (one level: the manifest's immediate parent already *is* the per-item directory; its own parent, `temp/hls/`, is shared across every fallback upload). The first version of this fix always went two levels up, which for the fallback case deleted the entire shared `temp/hls/` directory — wiping out every other in-flight or completed fallback-HLS item, not just the one being cleaned up. Fixed by checking whether the grandparent directory name ends in `_progressive` before going up the extra level; otherwise only the immediate parent is removed. Verified with a manual two-sibling-directory test for each pipeline shape.

**2. BunnyCDN segment distribution**
- Design: the **manifest stays on the origin** (served fresh via the existing static handler — `main.go`'s `/uploads/*filepath` handler now sets `Cache-Control: no-cache` specifically for `.m3u8` responses, leaving `.ts` segments on the existing `max-age=3600`, since segments never change once written but a manifest does while a progressive upload is still in flight). Only **segments** move to BunnyCDN — the actual bulk bandwidth, and the part that's immutable once produced.
- `progressiveCDNPaths(uploadID string) (hlsBaseURL, cdnRemotePrefix string)` in `chunk_upload.go` is the single place that decides whether CDN distribution is active (`bunnyConfigured()`) and computes both values every other piece needs: `hlsBaseURL` is the full public CDN URL ffmpeg writes into the manifest via `-hls_base_url` (e.g. `https://x.b-cdn.net/device_streams/{uploadID}/`); `cdnRemotePrefix` is the storage-relative prefix the actual upload calls need (`device_streams/{uploadID}/` — `UploadLocalFileToBunnyCDN` combines this with the storage zone itself, so it must *not* include the pull-zone host). Both are empty strings on local dev or without credentials, which every downstream caller treats as "skip CDN, keep local-disk-only behavior" — verified this leaves local dev byte-for-byte unchanged (no `-hls_base_url` flag added, no upload goroutine started).
- **Fallback path** (`hls.go`): `SegmentToHLS` gained an `hlsBaseURL string` parameter (empty = today's relative-path behavior, unchanged). New `UploadHLSSegmentsToCDN(outputDir, remotePrefix string) error` batch-uploads every `.ts` already on disk with the same 8-way semaphore+WaitGroup concurrency pattern `AssembleUploadHandler` uses for parallel chunk downloads, deleting each local copy once its CDN URL is confirmed. Called once, synchronously, right after `SegmentToHLS` returns and before the item is ever exposed to a client — no manifest-freshness race to worry about here, since every segment already exists by the time this runs.
- **Progressive path** (`hls_progressive.go`): `commitProgressiveMode`'s ffmpeg invocation gets `-hls_base_url` conditionally. New `uploadProgressiveSegmentsToCDN` goroutine (started alongside the drainer + manifest watcher only when CDN mode is active) polls the manifest on the same ~500ms cadence as `watchManifestForFirstSegment`, uploading each newly-discovered segment **sequentially** (not concurrently) — deliberately, since ffmpeg only writes a segment's manifest line once that segment file is completely written, and processing one at a time keeps every upload's completion ordered before the loop even looks for the next one. `extractHLSSegmentNames(manifestContent string) []string` parses segment lines (works identically whether ffmpeg wrote bare relative filenames or full CDN URLs — verified with a unit test against real captured CDN-URL manifest content). Loops until `#EXT-X-ENDLIST` appears and every listed segment has uploaded.
- **Known, accepted race** (documented in code, not engineered away): the very first segment's CDN upload and `watchManifestForFirstSegment`'s ready-callback poll the same manifest independently — in the timings that actually occur, a single ~6s segment's upload finishes well before a client receives the WS broadcast and hls.js requests it, so this isn't airtight by construction, just airtight in practice; hls.js's own segment-load retry absorbs it if a genuinely slow upload ever loses the race.
- **Verified against the real CDN** (with explicit go-ahead, since it writes to live storage): a standalone test program loaded real `.env` credentials, ran `SegmentToHLS` with a real `hlsBaseURL`, confirmed the manifest's segment lines were full CDN URLs, ran `UploadHLSSegmentsToCDN`, confirmed both segments uploaded and local copies were deleted, fetched a segment back from the live CDN URL (200, correct byte count), then deleted both test objects from BunnyCDN storage to leave no residue.

**3. Audio support**
- Gate change in `chunk_upload.go`: `strings.HasPrefix(mimeType, "video/")` → also accepts `audio/`, in three places (progressive-candidate check, fallback HLS-ification gate, duration-probe gate — `GetVideoDuration` is ffprobe-backed and format-agnostic despite the name).
- **The real wrinkle**: once segmented, `TemporaryMediaItem.MimeType` used to get hardcoded to `application/vnd.apple.mpegurl` for every HLS item, losing the audio/video distinction entirely (an HLS manifest ends in `.m3u8` regardless of source, so `VideoWatch.jsx`'s extension-sniffing `AUDIO_URL_RE` can't tell). Fixed by preserving the **original source mime type** on the row instead — nothing actually depended on the literal mpegurl string (confirmed via grep: only the two assignment sites referenced it; `CinemaVideoPlayer.jsx`'s hls.js decision and the static handler's `Content-Type` are both purely URL-suffix-based). `ProgressiveReadyInfo.OriginalMimeType` threads the value from `ProgressiveUploadState.mimeType` through to `onProgressiveStreamReady`; the fallback path just stopped overwriting `streamMimeType` after segmenting succeeds.
- Frontend: `device_stream_ready` case in `VideoWatch.jsx` now includes `mime_type: message.mime_type` in the `setCurrentMedia` call (was missing it — the regular playlist-click path already gets this for free via its `{...item}` spread). VinylPlayer trigger condition is now `AUDIO_URL_RE.test(currentMedia.mediaUrl || '') || currentMedia.mime_type?.startsWith('audio/')` — additive, doesn't disturb the existing extension-sniffing path for non-HLS audio.
- No ffmpeg changes needed — `-c copy -sn -f hls` already handles audio-only inputs (same mechanism as audio-only live-radio HLS).
- Verified end-to-end: streamed a 6-minute MP3 through "Stream from Device," confirmed the backend computed the correct duration and preserved `audio/mpeg` as the mime type, clicked the resulting playlist item and confirmed hls.js loaded and played it (`readyState: 4`, advancing `currentTime`, via a `blob:` MediaSource URL), and confirmed the VinylPlayer overlay rendered with the correct title text (extension stripped, matching `VinylPlayer.jsx`'s own rendering logic) — not just that audio played silently.

### Phase 4 — production routing fix + client-side MP4 fast-start relocation (completed 2026-06-21)

**Strategic context**: the user is positioning "Stream from Device" as a genuine differentiator versus Rave/Twitch/Kosmi — the bar is "a perfectly working system," not just a localhost demo. Investigating that bar surfaced one critical, previously-unknown gap and the originally-requested fast-start limitation.

**1. Critical gap: progressive HLS only ever worked in local dev, never in production.**
- Production builds (`import.meta.env.PROD`) routed every upload through `uploadFileDirect` (chunks → BunnyCDN via a Vercel proxy → one `assembleUpload` call that downloads, glues into a single flat file, re-uploads to BunnyCDN). That path never touches `chunk_upload.go` at all — no segmenting, no FIFO, no progressive probing, `IsStream` never set. The entire Phase 1–3 pipeline only ever received traffic when `import.meta.env.PROD` was false. This predates the progressive-HLS work (the direct-to-CDN path exists purely to save Railway bandwidth on regular uploads) and nobody had reconciled the two.
- **Fix** (`useMediaUploadManager.js`, `handleFileUpload`): compute `isProgressiveCandidate` (mirrors `chunk_upload.go`'s own condition — `sessionId` present + video/audio mime) *before* the `PROD` branch, and route through `uploadFileChunked` whenever it's true, regardless of environment. This is not optional/preferential — ffmpeg needs the bytes in real time to segment them, and only the Railway origin can run that; BunnyCDN storage can't. Regular non-streaming uploads keep the existing PROD/dev branching untouched.
- Verified by building with real production semantics (`vite build`, no `--mode development`) and serving via `vite preview` pointed at the local backend: confirmed the chunked endpoint gets hit and progressive probing engages exactly like dev mode, and confirmed a regular (non-session) upload through the *same* production build still uses the unchanged direct-to-BunnyCDN path (`🚀 [DirectUpload] Starting:` log, not `📦 [Chunked Upload]`).
- **Two more pre-existing bugs found and fixed while wiring this up, both in the "resume an interrupted upload" feature** (it was half-built — the UI already detected an interrupted dev-path upload and showed a "Resume Upload?" prompt, but never actually consumed the saved state):
  1. The mount-time detection effect read `localStorage.getItem(\`upload_chunks_${uploadId}\`)`, but `saveChunkUploadState` actually writes to `wewatch_chunk_upload_${uploadId}` — a different key. The prompt could show, but the saved state was effectively never found. Fixed by using the existing `loadChunkUploadState` helper, which reads the correct key.
  2. `resumeUpload()` (the "Resume" button's handler) explicitly checked `if (data.uploadPath !== 'bunny') { ...; setPendingResumeData(null); return; }` — actively clearing the dev-path's resume data before the user could even re-select the file. Removed the dev-specific early bail; both paths now keep `pendingResumeData` so `handleFileUpload`'s name+size match can pick it up on re-selection.
  - `uploadFileChunked` now accepts a `resumeState` param (mirroring `uploadFileDirect`'s existing signature): reuses the *same* `uploadId` (critical — a fresh id would leave previously-uploaded chunks orphaned in a directory nothing will ever assemble) and the *same* `chunkSize` (a different size produces entirely different byte ranges per index, making "skip these indices" meaningless) — both now persisted in `saveChunkUploadState`, which didn't carry `chunkSize` before.
  - `uploadChunksParallel` (`uploadChunker.js`) gained an `alreadyUploadedIndices` param: filters those out of the `chunks` array before the batch loop, seeds the `completedChunks` counter at that count so progress %/ETA stay correct from the resume point.
  - **Verified end-to-end** (interrupt mid-upload via a Playwright route delay, reload, resume): confirmed the same `uploadId` is reused, confirmed the skip-count logged (`"resuming — N/71 already done"`) exactly matches the persisted snapshot, confirmed the upload completes successfully afterward.
- **Bonus bug found and fixed along the way, unrelated to this feature but actively corrupting upload responses**: `upload_rate_limiter.go` set `c.Header("X-RateLimit-Limit", string(rune(limiter.limit)))` — `string(rune(N))` converts an integer into a single UTF-8 *code point* (e.g. `rune(10)` is a literal newline byte), not the decimal string `"10"`. Injecting that raw control character into an HTTP header value corrupts the response framing client-side — observed as `net::ERR_INVALID_HTTP_RESPONSE` on a subset of chunk-upload responses, intermittently, depending on which byte the current limit/remaining count happened to map to. Fixed with `strconv.Itoa`. This was actively interfering with verification testing before it was caught and fixed.

**2. Client-side MP4 fast-start (moov) relocation — the original ask.**
- New module `frontend/src/utils/mp4FastStart.js`, framework-agnostic (pure functions over `File`/`Blob`/`DataView`), directly unit-tested with `vitest` (`mp4FastStart.test.js`).
- **Why this doesn't require "scanning the whole 600MB"**: MP4 box headers are 8–16 bytes. Walking top-level boxes means reading only headers and *skipping* each box's content via `offset += box.size` — `File.slice()` costs nothing until read, so locating `moov` even behind a 590MB `mdat` is a handful of microsecond-scale local reads, never proportional to file size. Only `moov` itself (typically hundreds of KB) gets read into memory, to rewrite its `stco`/`co64` chunk-offset tables.
- Algorithm: walk top-level boxes from the front; if `ftyp` isn't first, bail (non-standard file, use original unchanged); if `moov` is found before any `mdat`, it's already fast-start, bail (no wasted work); otherwise read `moov` fully, shift every `stco`/`co64` chunk-offset entry by `+moov.size` (moving moov ahead of mdat pushes every absolute mdat-relative offset forward by exactly moov's own byte length), bail on `mvex` (fragmented MP4 — different streaming model, not this fix's target) or on 32-bit overflow in any `stco` entry; reassemble via `new File([ftypSlice, rewrittenMoovBuffer, ...everyOtherBoxInOriginalOrder])` (lazy/zero-copy `Blob` parts — never duplicates `mdat` in memory) and return a `File` (not a plain `Blob` — callers read `.name`/`.lastModified` off it same as the original).
- Wired into `useMediaUploadManager.js`: called immediately before chunking, only inside the `isProgressiveCandidate` branch (the only uploads that benefit). Deterministic given the same input file, so re-running it on a resume produces byte-identical chunks to skip against — no special-casing needed for the resume interaction.
- **A real, serious bug found only by genuine end-to-end testing, not by the unit tests**: the initial implementation walked `moov`'s child boxes starting at offset 0 of the in-memory `moov` buffer — but offset 0 of that buffer is `moov`'s *own* `[size][type]` header, not its first child. The walker misread moov's own header as a single unrecognized child box (type `"moov"`, not in the recurse-into set), did nothing, and exited — meaning **zero offsets were ever actually shifted**, silently. Unit tests checking `ffprobe`-reported duration/codec/dimensions all still passed, because none of those fields are derived from `stco`/`co64` at all — they're pure `mdhd`/`tkhd` metadata. The bug only became visible when actually piping a relocated real-world file (640×360, H.264+AAC, 10 minutes, two interleaved tracks) through `ffmpeg` non-seekably — exactly what the backend's real FIFO does — which failed with `Invalid data found when processing input` / `stream 1, offset 0x30: partial file`, because a non-seekable reader has no way to paper over a wrong cumulative byte position the way a seekable one can. Root-caused by writing a standalone diagnostic that dumped first-5 `stco` entries from both the original and "relocated" files side by side — they were byte-identical, proving the shift never applied. Fixed by skipping `moov`'s own header (8 or 16 bytes, depending on whether moov itself uses the 64-bit largesize extension) before starting the child-box walk. **The unit test suite was then strengthened** with a pipe-decode check (`assertPipeDecodable` — pipes the relocated buffer through `ffmpeg -i - -f null -` via stdin and fails on any decode error) specifically because this is the only check that actually caught the bug; confirmed by temporarily re-reverting the fix and watching the new check fail as expected, then re-applying it.
- **Verified end-to-end for real**: generated a genuinely moov-at-end 74MB/10-minute test movie (confirmed via raw byte-offset inspection: `moov` at byte ~73.59M of a ~73.94M file — i.e., at the very end), streamed it through the real UI. Backend log: `✅ [Progressive] Fast-start confirmed ... at prefix=1 chunks` (this file, unrelocated, would need nearly the entire upload before any partial-prefix probe could succeed) → committed to progressive mode → `ffmpeg finished ... manifest finalized` with zero errors → `Duration patched ... 00:10:00` (the full, correct duration, proving the entire file was processed correctly through the FIFO, not just a truncated piece) → and actual playback confirmed in the browser (`readyState` advancing, `currentTime` advancing) within ~3 seconds of file selection.

### Phase 5 — format coverage audit (completed 2026-06-21)

The user asked to cover every media format "Stream from Device" can reasonably support, and show a clear "use Upload instead" message for the ones it can't. Investigating turned up several real bugs; the actual finding after fixing them was that **no format needs an unsupported-format gate at all** — everything the file picker already advertises (`.mp4`, `.mov`, `.m4v`, `.m4a`, `.3gp`, `.webm`, `.ts`, `.mkv`, `.avi`, `.wmv`) genuinely works once the bugs below are fixed. The "Phase 5" work item is therefore the bug fixes themselves, not a gate — there was nothing left to gate.

**Real bugs found and fixed:**
- `getMimeType()` (`upload.go`) had no mapping for `.3gp`, `.ts`, `.m4v`, or `.wmv` — all four are in the frontend's `allowedExtensions` (file picker accepts them) but fell through to `application/octet-stream` server-side, which fails every video/audio gate in `chunk_upload.go` (progressive-candidate check, duration-probe, fallback HLS-ification). Any of these four would have silently produced a non-HLS, wrong-Content-Type item that wouldn't actually play. Fixed by adding the four missing cases.
- **A genuinely surprising one, found only by testing on this Linux environment**: picking a `.ts` file, the browser reported `file.type` as `"text/vnd.trolltech.linguist"` — a Qt Linguist translation-file format that also happens to use the `.ts` extension — not `video/mp2t`. The frontend's validation gate (`useMediaUploadManager.js`) trusted a *present* `file.type` over the file's own extension, so this correctly-allowed extension got rejected with "Invalid file type." Fixed by changing the gate to accept the file if *either* `file.type` or the extension is in the allowlist, rather than only falling back to extension when `file.type` is empty — justified because the backend already re-derives the real mime type from the extension server-side regardless of what the client reports, so there was no correctness reason to let a present-but-wrong client-reported type override a deliberately-allowlisted extension. The same fix was needed in the `isProgressiveCandidate` check (`file.type?.startsWith('video/')`), which had the identical blind spot — a `.ts` file that passed the (now-fixed) validation gate would otherwise still silently skip progressive treatment entirely.
- Extended `mp4FastStart.js`'s `ISO_BMFF_EXTENSIONS` to include `.3gp` — it's a constrained profile of the same MP4 box format (`ftyp`/`moov`/`mdat`), so the existing relocation algorithm applies unchanged. Confirmed with a real moov-at-end `.3gp` test file: relocation fired, progressive mode committed at prefix=3 chunks, played correctly.

**Per-format verification (real files, real upload, real playback — not just "should work" reasoning):**
| Format | Path taken | Confirmed working? |
|---|---|---|
| `.3gp` | Progressive (after the extension fix above) | ✅ Yes — prefix=3 chunks |
| `.ts` | Fallback (test file only had 2 chunks — too small to attempt progressive by design, `totalChunks <= 2` short-circuits to fallback) | ✅ Yes |
| `.mkv` | **Progressive** — surprising, in a good way: MKV's own structure let the existing ffprobe partial-prefix probe succeed at prefix=1 with zero new code. The "MKV needs transcoding because browsers can't play it directly" concern from an earlier conversation doesn't actually apply to the device-streaming path — `TranscodeMkvToMp4IfNeeded` only runs in the fallback one-shot branch, *after* assembly; a progressive MKV never reaches it, since the FIFO→ffmpeg→HLS pipeline is container-agnostic and the *output* is always HLS regardless of source container | ✅ Yes |
| `.avi` | Fallback (source had mpeg4/mp3 codecs in this test, triggering the full-transcode branch rather than `-c copy`) | ✅ Yes |
| `.wmv` | Fallback | ✅ Yes |

**A secondary, non-blocking observation from this testing**: for all three fallback-path formats above, the "auto-play the file the moment upload finishes" convenience feature (`LeftSidebar.jsx`'s `wasUploadingRef`/`pendingAutoPlayRef` effect) did not visibly fire within a 40-second test window, even though the upload completion log (`✅ [Chunked Upload] Complete`) appeared well within that window. Manually clicking the resulting playlist item always worked instantly in every case. This looks like a real, narrow gap in the auto-play convenience path specifically for slower (fallback-mode) uploads — distinct from "does the format work," which it does. **Fixed in Phase 6 below**, as a side effect of unifying the two paths' "ready" signal.

### Phase 6 — 1-segment buffer + holding message (completed 2026-06-21)

Two small follow-ups, plus a fix that fell out of making the second one work correctly.

**1. Require 2 segments (not 1) before announcing ready.** `watchManifestForFirstSegment` (`hls_progressive.go`) used to fire the ready-callback the instant a *single* HLS segment existed in the manifest — zero cushion against a rough patch in the host's upload right at the start. Changed the check from `strings.Contains(data, "#EXTINF")` to `strings.Count(data, "#EXTINF") >= 2`. One-line change; polling interval (500ms) and timeout (5 min) untouched. Verified against a real upload: by the time the ready-callback fired, the manifest already had well more than 2 segments (the test file processes near-instantly on localhost, so the timing delta itself isn't observable in dev — but the gate logic itself is unambiguous and was confirmed to evaluate and fire correctly against a real multi-segment manifest).

**2. Unified the "ready" signal across progressive and fallback paths — a real bug, not just a refactor.** There were two different "this file is ready" broadcasts: `device_stream_ready` (progressive path, fully wired to a `VideoWatch.jsx` handler that auto-plays for every client in the room) and `temporary_media_item_added` (fallback path's completion signal). **Nothing in the frontend listened for the second one at all** (confirmed via grep — zero matches). This meant fallback-path uploads (too-small-to-probe files, or non-H.264 sources needing a full transcode) had no member-visible "it's ready" signal whatsoever — only the uploading host's own local auto-play was supposed to fire, and Phase 5 testing had already observed that not firing reliably. Fix, in `chunk_upload.go`'s fallback completion broadcast: when `isStream` is true, send the same flat `device_stream_ready` shape the progressive path uses (sourced from the already-fully-populated `newTempMediaItem` row — no new queries needed); when `isStream` is false (a plain document/image upload), the original `temporary_media_item_added` broadcast is untouched. Verified two ways: (a) a real fallback-shaped upload reaching a second ("member") browser context, which auto-played correctly with `currentTime` starting near 0, not some stale/inherited position; (b) a direct single-chunk PDF upload via curl, confirming the non-stream branch still produces the original `{"data": {...}}`-shaped broadcast, byte-for-byte unchanged.

**3. Holding message for room members.** Before this, members saw nothing between "host started a device-stream upload" and "it's playing" — just the bare idle state. New flat broadcast `device_stream_preparing` (`{type, session_id, room_id, uploader_id}`, no `data` wrapper, matching `device_stream_ready`'s convention) fires from `chunk_upload.go` the moment chunk 0 of any progressive-candidate upload lands — gated on `chunkIndex == 0` so it's a single broadcast per upload, not per chunk. Fires before the eventual progressive-vs-fallback outcome is even known, since both need the same holding treatment. `VideoWatch.jsx`: new `isPreparingStream` state, set `true` on `device_stream_preparing`, cleared on `device_stream_ready` (now firing for both paths per fix #2 above) or by a 90s safety-net `useEffect` timeout if neither arrives (covers silent upload failures/cancellations without needing a dedicated cancel-broadcast). Renders a small centered spinner + "Host is preparing a stream..." text when `isPreparingStream && !currentMedia` — never overlaps actual playback, and the existing 20s DVD-bounce screensaver is gated with `!isPreparingStream` so the two don't fight for the same space. Verified end-to-end with two real browser contexts (host + a second "member" connection in the same room): the member saw the banner appear ~0.3s after the host started the upload, and confirmed it cleared at the exact moment playback began, not before or with a lag.

No frontend upload-hook changes were needed for any of this — `device_stream_preparing` and `device_stream_ready` are both entirely server-originated broadcasts, so `useMediaUploadManager.js` and `LeftSidebar.jsx` (and their 4 call sites) were untouched.

### Phase 7 — real posters for progressive uploads (completed 2026-06-21)

Manual testing found progressive HLS uploads (`onProgressiveStreamReady` in `chunk_upload.go`) always got a hardcoded generic placeholder poster (`/icons/placeholder-poster.jpg`), never a real frame — unlike the fallback path, which already runs real thumbnail extraction (`utils.ExtractThumbnail`) after assembly. Fixed by mirroring that exact existing pattern instead of inventing a new one.

**Key fact that made this simple**: the first HLS segment (`seg_000.ts`) is a complete, valid, independently-readable video file the moment the ready-callback fires — ffmpeg only appends a segment's `#EXTINF` line to the manifest once that segment file is fully closed to disk. So real poster extraction just means running `ExtractThumbnail` against `seg_000.ts` instead of a fully-assembled source file — no new race condition, no new extraction logic.

New function `generateAndBroadcastProgressivePoster(info, mediaItemID)` in `chunk_upload.go`, called via `go generateAndBroadcastProgressivePoster(info, item.ID)` right after the existing `device_stream_ready` broadcast inside `onProgressiveStreamReady` — deferred to its own goroutine specifically so it never delays that broadcast (the whole point of progressive streaming is showing video as fast as possible). Mirrors the fallback path's async poster block field-for-field: same `ExtractThumbnail` call, same CDN-upload-if-`bunnyConfigured()` branching, same flat `playlist_poster_updated` broadcast (`VideoWatch.jsx` already has a working handler for this — zero frontend changes needed), and the same `session_preview_updated` lobby broadcast when `info.SessionID` is set. `item.ID` (not `info.MediaItemID`, which is only populated later via `SetProgressiveMediaItemID` against the package-level state map, not this local `info` value) is passed in explicitly since it's the only place that ID is actually available at this point.

**Verified for real, not just code review**: streamed a real H.264 MP4 through a full chunked-upload sequence (curl, mirroring the frontend's exact chunking), confirmed via backend log the poster goroutine ran and updated the DB row, then opened the resulting JPEG directly — a genuine frame from the video (not blank/corrupt), correct resolution. Separately confirmed the fallback path's pre-existing poster mechanism is completely untouched (same log pattern, same broadcast, unaffected by this change). Also tested the edge case directly: an audio-only progressive stream (MP3) correctly fails extraction ("all strategies failed" — no video frame to grab) and gracefully keeps the placeholder, no crash, no broken broadcast — the existing failure handling in `ExtractThumbnail`'s caller covers this for free, no special-casing needed.

**A real, related test-methodology gotcha worth remembering**: a test source file generated with ffmpeg's *default* MP4 layout (moov-at-end, no `+faststart`) reliably fails the progressive probe when chunks arrive **all at once** (e.g. via rapid sequential curl requests on localhost) — the probe gets exactly one shot at `prefix=1` before the final chunk lands and `ResolveFinalMode` stops retrying, so it correctly and safely falls back rather than risk a broken FIFO attempt. This is *correct* backend behavior, not a bug — but it means any future curl-based (non-browser) testing of the progressive path needs a `+faststart` source file (or genuinely throttled/delayed chunk delivery) to reliably exercise progressive mode at all.

### Phase 8 — sync "Playing Now" with the playlist's poster/duration (completed 2026-06-21)

Manual testing found the "Playing Now" card in `LeftSidebar.jsx` stuck on the placeholder poster and `00:00` duration even after the playlist entry for the exact same item correctly showed both — confirmed real, not a fluke, by reading the actual code rather than guessing.

**Root cause, layer 1**: `device_stream_ready`'s handler builds `currentMedia` from a deliberately minimal payload (`ID`, `file_path`, `mediaUrl`, `original_name`, `mime_type` only — the broadcast was never designed to carry poster/duration). The "Playing Now" card reads straight off `currentMedia` with hardcoded fallbacks, so it shows those forever unless something later patches the object. The initial fix: patch `currentMedia` (not just `playlist`) inside `playlist_poster_updated`'s handler, and add a previously-entirely-missing `playlist_duration_updated` handler (the backend already broadcasts this — `chunk_upload.go`'s `onProgressiveDurationKnown` — but nothing in the frontend consumed it at all, confirmed via grep).

**Root cause, layer 2 — found only through real end-to-end testing, not code review**: shipping layer 1 alone and testing it for real showed the playlist's poster updating correctly while "Playing Now" stayed stuck — meaning the WS broadcast wasn't actually what was keeping the playlist current. Methodically traced it: added a temporary catch-all log of every WS message type received, confirmed `playlist_poster_updated` never showed up in that list at all (despite the backend confirmably broadcasting it, and other broadcasts from the same room arriving fine) — then found the real mechanism in `fetchAndGeneratePosters` (`VideoWatch.jsx`): a full REST refetch of the room's temporary-media list, called both on mount and via `useMediaUploadManager`'s `onUploadComplete` (including its 5-second-later "poster retry" pass). **This refetch, not the WS broadcast, is what's actually been keeping the playlist's poster current in practice** — and it only ever called `setPlaylist`, never reconciling `currentMedia`. Fixed by patching `fetchAndGeneratePosters` to also find the matching item by ID and patch `currentMedia`'s `poster_url`/`duration` from the same freshly-fetched data. (Whether `playlist_poster_updated` genuinely never reaches this client or some other quirk is involved remains unresolved — but with the refetch now also covering `currentMedia`, the user-visible bug is fixed regardless of that mystery, and the layer-1 WS-handler patches stay in as defense in depth for any case where they do fire, e.g. for a member who never triggers a refetch of their own.)

**Verified for real**: streamed a real 20-second H.264 MP4 through "Stream from Device" and watched the actual "Playing Now" card in the browser — confirmed the poster updated from placeholder to the real frame, and confirmed duration updated from `00:00` to the correct `00:00:20`, both within 15 seconds, matching the playlist entry exactly. Also discovered along the way: duration specifically can take as long as the *entire source's playback duration* to become known for a progressive upload (ffmpeg processes the FIFO in real time, so a 90-second video's duration isn't known until ~90 seconds in) — expected, not a bug, just worth remembering when testing this again with a longer file.

### Phase 9 — client-supplied poster/duration, skip server ffmpeg when possible (completed 2026-06-21)

Phase 8's finding ("duration can take as long as the entire video to become known for a progressive upload") led to a discussion: the browser already has free, instant access to a video's duration (container header metadata) and can cheaply grab a poster frame itself (`<video>` + `<canvas>`). Both techniques already existed *elsewhere* in this codebase (`getVideoDurationFromFile` in the BunnyCDN-direct path; canvas frame-grabs in the lobby session-preview pipeline) but were never wired into "Stream from Device." This phase wires them in, with the explicit goal of letting the backend skip its own ffmpeg-based poster extraction (`ExtractThumbnail`) whenever the browser can supply an equivalent frame — a real, scale-sensitive CPU cost (every device-stream upload triggers a dedicated extra ffmpeg process purely to grab one frame; 100 concurrent sessions × 5 videos each is up to 500 avoidable processes).

**Two different wins, stated honestly**: poster-skipping is a genuine CPU saving (an entire ffmpeg invocation avoided). Duration-skipping is mainly a *latency* win for the progressive path specifically — server-side duration there isn't slow due to wasted CPU, it's slow because ffmpeg genuinely can't know a still-arriving FIFO stream's length until the whole source has been processed. For the fallback path, server-side duration was already fast (ffprobe on the complete file), so skipping it there is a minor bonus, not the main point.

**Frontend** (`useMediaUploadManager.js`): new `captureClientPosterFromFile(file)` — creates a hidden `<video>`, seeks to `min(1s, 10% of duration)` to avoid a black opening frame, draws to `<canvas>`, exports a JPEG blob. Resolves `null` on any failure (decode error, security/taint restriction, 8s timeout) — never throws, caller always falls back cleanly. In `handleFileUpload`'s `isProgressiveCandidate` branch, runs this concurrently with the existing `getVideoDurationFromFile` via `Promise.all` (both are local/instant), then passes `{ clientDuration, clientPosterBlob }` through `uploadFileChunked` → `uploadChunksParallel` → `uploadChunk` (api.js), which attaches them as `client_duration`/`client_poster` form fields **only on chunk 0** (no point resending the same blob with every chunk). `getVideoDurationFromFile` resolves the literal string `'00:00:00'` on its own failure (a pre-existing, shared convention with the BunnyCDN path) — treated as "no value" rather than risked as a fake duration.

**Backend** (`hls_progressive.go` + `chunk_upload.go`): chunk 0's handler reads `client_duration`/`client_poster` (only inside the existing `isProgressiveCandidate` block, since that's the only case with a `ProgressiveUploadState` to stash them in) and calls new `utils.SetClientUploadMetadata(uploadID, duration, posterPath)` — mirroring the existing `SetProgressiveMediaItemID` setter pattern. A matching `GetClientUploadMetadata(uploadID)` getter serves the fallback path, which only has the `uploadID` in scope, not the `ProgressiveReadyInfo` struct the progressive path gets. **Critical ordering gotcha**: the fallback path's final-chunk handler must read `GetClientUploadMetadata` *before* calling `ForgetProgressiveUpload(uploadID)` — the latter deletes the state the former reads from; got this backwards on the first pass and fixed it before testing.

Extracted a shared `resolvePosterURL(posterPath string) string` helper (CDN-upload-if-`bunnyConfigured()`, else local `/uploads/temp/...` URL) — was duplicated three ways (progressive extraction, fallback extraction, and now the new client-poster path); now lives in one place. `onProgressiveStreamReady` uses `info.ClientPosterPath`/`info.ClientDuration` directly on the new item when present and skips `generateAndBroadcastProgressivePoster` entirely; `onProgressiveDurationKnown` skips its own redundant DB-patch-and-broadcast when client duration was already used. The fallback path's final-chunk handler does the same for `GetVideoDuration` and the async `ExtractThumbnail` goroutine — the goroutine itself gained a `skipPoster bool` param so its *unrelated* second responsibility (video CDN upload in production) still runs unconditionally even when the poster half is skipped.

**A real, time-consuming red herring during verification**: early test runs showed neither the new code's logs nor any behavior change, despite the code looking correct on review. Root cause: a *stale backend process* (`/tmp/go-build.../exe/main`, started hours earlier) was still bound to port 8080 and serving every test — `pkill -f 'go run cmd/server/main.go'` kills the wrapper, not the actual compiled binary it spawns (a gotcha already documented in this file from Phase 2, re-learned the hard way here). Fixed by killing via `fuser -k 8080/tcp` instead of pattern-matching process names, which is more reliable for this specific failure mode.

**Verified for real, once testing against the actual fresh backend**: a 30-second fallback-path upload's saved poster file was byte-identical in size to the client-captured blob (18612 bytes both sides) and visually confirmed as a genuine frame at the expected ~1s offset; "Playing Now" showed the real poster and correct `00:00:30` duration within ~7 seconds (no waiting on any ffmpeg pass). A 60-second progressive-path upload showed the correct `00:01:00` duration within the same window — proof the value didn't come from `onProgressiveDurationKnown` (which for a real 60s source wouldn't fire for close to 60 real seconds) and confirmed via log that neither `generateAndBroadcastProgressivePoster` nor the redundant duration patch ran at all. A direct PDF upload (non-candidate, no video/audio mime) confirmed completely unaffected — original behavior, untouched.

### Phase 10 — fix redundant playback restarts + stream-prep UX (completed 2026-06-22)

Manual testing of a large (39.5MB, 79-chunk) "Stream from Device" upload surfaced a visible "restarts playback 2 times then begins playing" bug, plus a "Browse Files shows Uploading at 0%/0B forever" report and a question about why the upload bar takes a few seconds to appear at all. Root-caused all three from the user's own pasted console log plus direct code reading — two were real, confirmed bugs; the third turned out not to be a bug at all.

**Confirmed cause #1 — redundant auto-play after upload completes.** The pasted log showed it directly: `device_stream_ready` starts playback early (around chunk 13/79, while still uploading — the progressive pipeline working as intended). Then, once all 79 chunks finish, a *second* `Loading HLS stream` log and a *new* `playback_control` send fired for the same item. Cause: `LeftSidebar.jsx`'s `wasUploadingRef` effect auto-selects the freshly-uploaded item the moment `uploading` flips `true → false`, with no check for whether something already started it. This effect predates progressive streaming making "already playing before upload finishes" the common case. Fixed: compare the freshly-fetched item's ID against `currentMedia?.ID` (already available as a prop, set by `device_stream_ready`'s handler) and only call `onMediaSelect` when they don't match.

**Confirmed cause #2 — Phase 8's own poster/duration fix was itself causing a second restart.** `CinemaVideoPlayer.jsx`'s media-loading `useEffect` depended on the whole `mediaItem` object: `[track, localScreenTrack, isHost, mediaItem, muted, onError]`. Phase 8 patches `currentMedia` via `{...prev, poster_url, duration}` whenever a poster/duration update arrives — a spread always produces a new object reference even when `mediaUrl` itself is unchanged. Since the effect depended on `mediaItem` by reference, this metadata-only patch was independently triggering a full `hls.loadSource()` reload. Fixed by depending on the specific fields the effect body actually reads instead: `mediaItem?.mediaUrl`, `mediaItem?.type`, `mediaItem?.stream`, `mediaItem?.cameraStream`. Together, fixes #1 and #2 explain "restarts 2 times then begins playing" precisely (original start + these two redundant reloads).

**Answered directly — yes, shared state, by design.** "Stream from Device" and "Browse Files" read the exact same `uploading`/`uploadProgress`/`uploadedBytes`/`totalBytes` from the one shared `useMediaUploadManager()` hook instance (owned by the parent so an upload survives sidebar close/reopen). Confirmed precisely *why* "Browse Files shows Uploading": that button's own label is `{uploading ? (uploadPaused ? 'Paused…' : 'Uploading...') : 'Browse Files'}` — it's not a separate stuck progress display, it's the same button's text reacting to the same shared state regardless of which button actually triggered the upload.

**Investigated, found not to be a bug — "stuck at Uploading, 0%, 0B/39.5MB."** Read every reset path in `uploadFileChunked` (`finally` block, unconditional — no `shouldPause`-style guard like the separate `uploadFileDirect`/BunnyCDN path has) and found no code path that explains a stuck-true `uploading` with reset progress. Added a `useEffect`-based logger (deliberately *not* a `console.log` inside `uploadFileChunked` itself — an early version of this logging read `uploadProgress`/`uploadedBytes`/`totalBytes` directly inside the async function, which is a real stale-closure trap: those reads reflect whatever the values were at the moment the function was *invoked*, not their live value, since the function isn't a component re-rendering on every state change) and confirmed the full real lifecycle on a real 39MB upload: `isPreparing: true` → `uploading: true, totalBytes: 39064411` → `uploadProgress: 84, uploadedBytes: 33554432` → final reset to `uploading: false, totalBytes: 0`. The state never actually sticks. Most likely explanation for the report: the user was looking at the screen during the brief, entirely normal "just started, 0%" moment — made more likely to be misread as "stuck" by the new Phase 9 client-capture delay (see below) making it feel like more time had already passed than it had.

**Fixed — the "it takes a few seconds before anything shows" delay.** This is a real, expected cost of Phase 9: `getVideoDurationFromFile` + `captureClientPosterFromFile` now run (via `Promise.all`) *before* `uploadFileChunked` is called, and neither sets `uploading=true`, so nothing previously indicated this window was happening. New `isPreparing` state in `useMediaUploadManager.js`, true only during this client-capture window (wrapped in `try/finally` so a capture failure never leaves it stuck), false the moment the real upload starts. `LeftSidebar.jsx` renders a distinct "Preparing your stream..." spinner when `isPreparing && !uploading` — never shown at the same time as the real progress bar. The "Stream from Device" button is now also disabled during this window (previously only `uploading` disabled it), preventing a second file pick from racing the first while it's still being captured.

**Verified for real**: a 39MB/150-second test file (matching the user's repro shape) through the actual upload flow confirmed zero redundant `playback_control` sends (down from the original bug's one extra send) and confirmed via the new state logger that `isPreparing`/`uploading`/progress all transition correctly through the complete lifecycle with no stuck states anywhere. (A `Loading HLS stream` log count of 2 instead of 1 remains, consistent with React StrictMode's dev-only double-invoke of effects — not a new restart, since no second `playback_control` accompanies it.)

### Phase 11 — merged "Stream from Device" into "Browse Files"; load bar clears on playback-ready, not upload-complete (completed 2026-06-22)

Investigating the button-merge request confirmed "Stream from Device" and "Browse Files" already ran through the identical pipeline (`handleFileUpload`, `isProgressiveCandidate`, chunking, `device_stream_ready`) — the only behavioral difference was `pendingAutoPlayRef.current = true` before opening the file picker. Decided: remove the separate button, fold that one flag-set into "Browse Files" unconditionally (confirmed acceptable that a PDF/image upload via "Browse Files" now also auto-displays for the room, same as any video/audio file already did).

**Button merge** (`LeftSidebar.jsx`): deleted the "📱 Stream from Device" button entirely. "Browse Files"'s `onClick` now sets `pendingAutoPlayRef.current = true` before `fileInputRef.current?.click()` — copying the deleted button's exact behavior. `disabled` changed from `uploading` to `uploading || isPreparing` (matching what the deleted button already had, so a second pick can't race the Phase 9 client-capture window). Row went from 3 buttons (Browse Files / URL / Stream from Device) to 2 (Browse Files / URL), same container, no repositioning needed.

**Label rename**: `'Uploading...'` → `'Loading...'` in Browse Files' own label (`{uploading ? (uploadPaused ? 'Paused…' : 'Loading...') : 'Browse Files'}`) — "uploading" wrongly implied the whole file transfer had to finish before anything useful happened, when in fact playback can already be underway.

**Load bar now clears the moment THIS upload's stream is ready, not when every chunk finishes sending.** Before this fix, `uploading` stayed `true` (and the progress bar stayed visible) for the entire chunk-sending duration regardless of when `device_stream_ready` fired partway through and playback began — on a large/slow upload the bar could keep showing "Loading... 60%" well after the host was already watching it.
- **Backend** (`chunk_upload.go`): added `"upload_id"` to both existing `device_stream_ready` broadcasts — `onProgressiveStreamReady` (`info.UploadID`, already on `ProgressiveReadyInfo`) and the fallback path's unified broadcast (`uploadID`, already a local var in `ChunkUploadHandler`). Neither broadcast carried this field before.
- **`useMediaUploadManager.js`**: new `isUploadReady` state (reset to `false` at the top of every `uploadFileChunked` call, alongside `currentUploadIdRef.current = uploadId`). New exposed `notifyUploadStreamReady(uploadId)`: sets `isUploadReady = true` only if the passed id matches `currentUploadIdRef.current` — this match is what prevents an *earlier*, already-playing item's upload from incorrectly clearing a *different*, currently-in-progress upload's bar.
- **`VideoWatch.jsx`**: `device_stream_ready` handler now also calls `mediaUploadManager.notifyUploadStreamReady(message.upload_id)` after its existing `setCurrentMedia`/`setIsPlaying` calls — `mediaUploadManager` is the same hook instance already declared in this component, no new wiring needed.
- **`LeftSidebar.jsx`**: progress bar's condition changed from `{uploading && (...)}` to `{uploading && !isUploadReady && (...)}`. `uploading` itself is untouched — still gates the button's `disabled` state and all existing resume/retry logic for the entire real upload duration — only the *visual bar* hides early.
- **Known, accepted scope gap**: non-stream items (images/documents) still use the original `temporary_media_item_added` broadcast, not `device_stream_ready` — Phase 6 only unified the broadcast for stream items. `isUploadReady` has no signal to key off for these; their bar keeps clearing only once the whole upload finishes, same as before this phase. Acceptable: these are typically small, fast uploads with no early "playback start" moment to begin with.

**Verified for real, with network throttling** (CDP `Network.emulateNetworkConditions`, ~5 Mbps, applied only *after* the app had already loaded — applying it before page load caused the initial bundle fetch itself to time out, since the app's JS bundle is large enough that 5 Mbps materially slows the unthrottled-by-default localhost load too): confirmed only "Browse Files" and "🔗 URL" remain after the merge; confirmed the button reads "Loading..." while in progress; confirmed `device_stream_ready` fired at t=11.0s and the progress bar disappeared in that exact same poll tick, while the button kept reading "Loading..." (proving `uploading` was still `true`, i.e. the background chunk upload was genuinely still running) for the following 10+ seconds the test watched it. On an *un*throttled localhost run, the entire 39MB upload finished before ffmpeg ever produced 2 HLS segments, making the fix a no-op in that environment — confirms a slow/large enough real-world upload is required to observe the gap this phase closes, and that the throttled test was the right way to verify it.

### Phase 12 — fixed black client-captured posters (completed 2026-06-22)

User reported the "Playing Now"/playlist poster was black for 2 different files. Root-caused as a real, intermittent race condition in `captureClientPosterFromFile` (`useMediaUploadManager.js`, added Phase 9): the `<video>` element's `seeked` event can fire *before* the browser has actually decoded and painted the target frame, so drawing to canvas immediately sometimes grabs a stale black frame. Confirmed this empirically, not just by inspection — scanned 65 real poster files already saved on disk from earlier test sessions and found a handful with avg pixel brightness near 0 (essentially black) alongside the majority correctly showing the real, colorful test pattern; critically, the black and correct captures came from runs against the *exact same source file*, proving it's a pure timing race, not something content/codec-dependent.

**First attempted fix, found unreliable**: tried gating the canvas draw on `video.requestVideoFrameCallback()` where supported (the API specifically designed to signal "a frame is ready to composite"), falling back to a double `requestAnimationFrame` otherwise. Built a standalone test harness (a static HTML page replicating the exact capture function, driven via Playwright through many iterations) to verify — and found `requestVideoFrameCallback`'s callback **never fires at all** for a paused, already-seeked (non-playing) video in this environment, confirmed via explicit logging (`loadedmetadata` and `seeked` both fired correctly with `readyState=4`, but the rVFC callback simply never followed). This makes sense in retrolect: rVFC is specified around live frame presentation during active playback, not "a seek completed while paused" — relying on it here was the wrong tool even though it looked like the precise fix on paper.

**Actual fix**: removed the rVFC branch entirely; kept only the double-`requestAnimationFrame` after `seeked`, which reliably gives the decode pipeline enough time to land before the canvas grab. Also hardened the capture function defensively while in there: `video.preload` changed from `'metadata'` to `'auto'` (the source is a local blob URL, so this costs disk I/O only, no network), and the video element is now briefly attached to the DOM off-screen (`position: fixed`, 1×1px, `opacity: 0`, `pointer-events: none`, removed on cleanup) rather than left fully detached — some browsers are lazier about decoding frames for a `<video>` that's never been in the document at all.

**Verified for real, at volume, given the bug was intermittent**: built two harder test videos (large-GOP H.264 with B-frames, and a high-motion mandelbrot pattern — both more likely to expose a decode-readiness race than a simple flat test pattern) and ran the standalone harness 40 times against each (80 total) — zero black/suspicious frames (`avg brightness < 15`) across all 80, versus the original code's confirmed real-world failures. Then ran the actual fix through the real app two more times end-to-end (real upload, real `device_stream_ready`, real poster file written to disk) — both came back with healthy brightness values (127.9 and 149.1 out of 255, full pixel range), confirming the fix holds inside the real upload pipeline, not just the isolated test harness.

### Phase 13 — fixed missing WatchOuts/lobby session-preview images for device-streamed sessions (completed 2026-06-22)

User reported the LobbyPage's WatchOuts feed (`SessionPreview.jsx` cards, sourced from `watch_sessions.poster_url`/`preview_url`) was showing no images at all for sessions playing media via "Stream from Device" (the progressive HLS path). This is a **separate poster system** from the "Playing Now"/playlist poster fixed in Phase 12 — that one lives on `TemporaryMediaItem.PosterURL` (room-scoped, used inside the room's own UI); this one lives on `WatchSession.PosterURL`/`PreviewURL` (session-scoped, used by the LobbyPage feed card before anyone has even joined the room).

**Root cause**: the fallback (non-progressive) upload path already worked correctly — `chunk_upload.go`'s final-chunk handler calls `services.GetPreviewQueue().QueuePreview(...)`, and `PreviewQueue.generateUploadPreview` (`preview_queue.go:183-209`) persists both `poster_url` and `preview_url` onto the `watch_sessions` row before broadcasting. The **progressive path never had an equivalent call at all** — `onProgressiveStreamReady` and `generateAndBroadcastProgressivePoster` (both `chunk_upload.go`) only ever broadcast a `session_preview_updated` WS message; neither ever wrote to the `watch_sessions` table. A client connected to the lobby WS at the exact moment of that broadcast would see the poster appear, but anyone who joined the lobby afterward, or refreshed, or reconnected, would fetch the session list via REST and get nothing — since the column the REST handler reads from was never written.

**Fix**: new shared helper `persistAndBroadcastSessionPoster(sessionID, posterURL string)` in `chunk_upload.go` — does the `DB.Table("watch_sessions").Where(...).Update("poster_url", ...)` write (mirroring `generateUploadPreview`'s existing pattern) and then the same WS broadcast as before. Called from two places: (1) `onProgressiveStreamReady`, immediately, when a client-supplied poster (Phase 9) is already available — this is the common, fast path and was previously not persisted *at all*, not even via the WS broadcast; (2) `generateAndBroadcastProgressivePoster`, after its own ffmpeg-extracted poster (the slower fallback when no client poster exists) — this path *was* already broadcasting, just never persisting.

**Known, scoped-out gap**: this fix only restores the **static poster**. The session-level **video clip** preview (`SessionPreview.jsx`'s `'video'` state, a short looping MP4) is still never generated for progressive/device-stream sessions — `QueuePreview`'s `generateUploadPreview` runs `ffmpeg` against a flat, complete file path, which doesn't straightforwardly apply to a still-arriving HLS manifest. Sessions using "Browse Files" now correctly show a static poster in the WatchOuts feed instead of the generic emoji fallback, but never advance to the animated video-clip state the fallback path's sessions do. Flagged, not fixed in this pass — would need a separate approach (e.g., a short clip cut from the first HLS segment, the same source `generateAndBroadcastProgressivePoster` already extracts a single frame from).

**Verified for real**: ran a small file through "Browse Files" unthrottled (took the fallback path) — confirmed `watch_sessions.poster_url` *and* `preview_url` both populated, unaffected baseline. Ran a larger file through with network throttling (forcing the progressive path, confirmed via the `/uploads/chunks/.../  _progressive/output/playlist.m3u8` URL shape in `device_stream_ready`) — confirmed `watch_sessions.poster_url` now populated with a real, non-placeholder JPEG (31KB, not the tiny generic icon) immediately after `device_stream_ready`, `preview_url` correctly still empty (the known, scoped-out gap above).

### Phase 14 — closed the two sweep-gap bugs, dead-playlist-item auto-removal, animated previews for progressive uploads (completed 2026-06-22)

Three follow-ups from the orphaned-row incident at the end of Phase 13.

**1. Fixed the two real sweep gaps.** `CleanupAllTemporaryMedia` (`rooms.go`) and `DeleteTemporaryMediaItemsForRoomHandler` (`temporary_media_items.go`) both had a `continue` immediately after a `DeleteMediaFile` failure, which skipped the DB row delete entirely — a transient file-delete error (or a file that's already gone for any reason) left the row orphaned forever, exactly the shape of bug that caused the original "failed to play video" report. Fixed by removing both `continue`s so the DB row delete always runs regardless of the file-delete outcome — matches the already-correct pattern in `CleanupExpiredSessions` and `DeleteSingleTemporaryMediaItemHandler`, which never had this bug. (A third suspected gap, `CleanupOrphanedInstantWatchRooms`, was re-audited and found to already correctly delete `TemporaryMediaItem` rows via its unconditional bulk `tx.Unscoped().Where(...).Delete(...)` — the earlier audit was wrong about this one specifically.)
- **Verified with a real failure, not a fake one**: `DeleteMediaFile` treats a missing file (`os.IsNotExist`) as success, not failure (confirmed in `bunny_cdn.go`) — so pointing a test row at a nonexistent path doesn't actually exercise the bug. Built a standalone test program (`cmd/test_sweep_fix`, deleted after use) that creates a file inside a directory with its write bit removed (`chmod 555` — Unix file deletion requires write permission on the *parent* directory, not the file), which reliably produces a genuine permission-denied error. Confirmed: `⚠️ Failed to delete file ...: permission denied` followed by `✅ Cleanup complete: 0 files deleted, 1 DB records removed, 1 failures` — the row was removed despite the failure.

**2. Dead playlist items now auto-remove instead of erroring forever.** `VideoWatch.jsx`'s `handleError` (the function behind the "❌ Failed to play video" alert) now specifically detects hls.js's fatal `networkError`/`manifestLoadError` (a confirmed-gone manifest, as opposed to `manifestLoadTimeOut`, which is left alone since that's more likely a transient slow-network case, not a confirmed-dead file). On a match: removes the item from local `playlist` state, clears `currentMedia`/`isPlaying`, shows a toast instead of the blocking alert, and — host only, since the delete endpoint requires it — calls the existing `deleteSingleTemporaryMediaItem` API to actually purge the file + DB row.
- **Found and fixed a real, separate bug while wiring this up**: `DeleteSingleTemporaryMediaItemHandler`'s room broadcast was commented out (and using a stale, pre-`OutgoingMessage`-wrapper signature even if uncommented) — meaning a host manually deleting an item (the pre-existing "delete" button, unrelated to this new auto-detection) never updated *other* connected members' playlists in real time either, before this fix. Implemented it properly (`playlist_item_removed`, flat shape matching `playlist_poster_updated`'s convention) and added the matching frontend case.
- **Verified for real, end to end**: uploaded a file, used the backend's own REST endpoint (not console-log scraping, which proved unreliable mid-test) to find the item's real `file_path`, deleted *only* that upload's own narrow output directory (never a shared one — the exact mistake that caused the original incident), then re-clicked the same playlist entry to force a fresh hls.js load against the now-404 manifest. Confirmed: hls.js reported the expected `manifestLoadError`, the item disappeared from the DOM (0 remaining matches), the DELETE request hit the backend and returned 200, and the row was confirmed gone from the application's perspective (`deleted_at IS NULL` returns 0 rows — it's a GORM soft-delete, so a raw `SELECT *` without that filter is misleading and looks like the row "still exists"). The room broadcast (`playlist_item_removed`) was also confirmed sent with the correct shape.

**3. Animated session previews now generate for progressive/device-stream uploads too.** Previously only the static poster was fixed (Phase 13) — the lobby WatchOuts feed never advanced past the poster state to the looping video-clip state for these sessions, unlike fallback-path sessions. New `utils.GeneratePreviewMP4FromHLSSegments(segmentDir, outputPath, maxSegments)` (`hls_progressive.go`) concatenates the first few already-completed `.ts` segments via ffmpeg's concat protocol (not the concat demuxer — no list file needed, since MPEG-TS segments from one continuous encode concatenate cleanly at the byte level) and re-encodes to a ~15s/540p H.264+AAC clip, mirroring `GeneratePreviewMP4`'s existing quality target for the fallback path. `generateAndBroadcastProgressivePoster` (`chunk_upload.go`) was restructured to always run this clip generation (previously it didn't run at all when a client poster was already supplied) — it now takes `existingPosterURL` instead of a plain boolean, since `resolvePosterURL` deletes the local file after a successful CDN upload and isn't safe to call a second time on the same path.
- **Real bug found and fixed during testing**: `GetVideoResolution` (`ffmpeg.go`, previously only ever called against complete MP4 files) failed against a raw `.ts` segment with `invalid resolution output: 854,480` — ffprobe had printed the *same* resolution on two separate lines (transport streams periodically repeat their PAT/PMT tables, which can make ffprobe's stream enumeration appear to report a single elementary stream more than once), and the naive single-line comma-split choked on the second line. Fixed by taking only the first line of ffprobe's output before splitting — a general robustness improvement, not narrowly scoped to this one caller.
- No frontend changes were needed — `LobbyPage.jsx`'s `session_preview_updated` handler already correctly branched on "poster only" vs "poster + clip" payloads (built once, generically, well before this phase), so the entire gap was backend-only.
- **Verified for real**: forced the progressive path via network throttling, confirmed via `ffprobe` that the generated file is a genuine, valid 15.0s H.264 (854×480) + AAC clip (1.1MB), and confirmed `watch_sessions.preview_url` populated correctly in the database — not just a broadcast that happens to look right.

### Phase 15 — playlist items always removed on finish; session preview refresh extended to cinema/video-watch rooms (completed 2026-06-22)

Two follow-ups from a user Q&A about exactly how the playlist and lobby preview behave.

**1. Finished playlist items are now always removed, including the last one.** `handleVideoEnd` (`VideoWatch.jsx`) previously only removed the just-finished item from `playlist` when there was a *next* item to advance to — if it was the last item, `currentMedia` cleared but the dead entry stayed in the playlist. Confirmed via the user's own reasoning why this matters: re-selecting a finished item doesn't actually restart it from the beginning, since `CinemaVideoPlayer`'s media-loading effect only reloads on an actual `mediaUrl`/`type`/`stream`/`cameraStream` change (Phase 10's fix) — re-clicking the same already-finished item is a no-op, leaving the video sitting at its end position. A playlist entry that can't be usefully re-selected has no reason to stay visible. Fix: moved the `setPlaylist` filter outside the if/else so it always runs. Still entirely local/per-client and unbroadcast, same as the existing "has a next item" behavior — each client's own video ends at roughly the same wall-clock moment since playback is synced, so this doesn't need server coordination the way Phase 14's dead-item removal does.

**2. Session preview refresh (1 min dev / 5 min prod) now applies to cinema/video-watch rooms, not just classroom/lecture-hall.** Investigating the user's question on this surfaced that `PreviewQueue.StartRefreshTimer` was only ever started via `MediaSwitchHandler.HandleMediaPlay`, which itself only fires on a `media_play` WebSocket message — and that message is *only* ever sent from `LectureHallPage.jsx`, `PositionCalculatorPage.jsx`, and a classroom-gated branch in `LeftSidebar.jsx`. Cinema/video-watch rooms (where "Browse Files"/device-streaming lives) already got a one-shot initial preview at upload time (`chunk_upload.go`'s direct `QueuePreview` call, both pipelines) but never anything after that — the lobby card would freeze on whatever the very first preview happened to show, for the entire life of the session.

- New `startSessionPreviewRefresh(sessionID, mediaID, mediaPath, mediaURL)` in `chunk_upload.go`: persists the same `current_media_type`/`current_media_id`/`current_media_path`/`current_media_url` fields `HandleMediaPlay` already writes for classroom rooms, then calls `PreviewQueue.StartRefreshTimer` directly — skipping `HandleMediaPlay`'s own redundant initial-preview step (already covered by the existing direct `QueuePreview` call) and skipping its 30-second delay (not needed here; the initial preview already happened synchronously at upload time). Called from both the progressive path (`onProgressiveStreamReady`) and the fallback path (right after its own existing `QueuePreview` call), right after item creation in both cases.
- **Stop side needed no changes** — `StopRefreshTimer`/`ClearSessionPreview` were already wired into `EndWatchSessionHandler`'s background cleanup goroutine, which runs for every room type, not just classroom. Confirmed by letting a test ticker run for ~35 minutes (real time, not by design) before actually calling session-end, then confirming zero further refreshes after that call — versus dozens of on-schedule refreshes before it.
- **Real architectural problem found while wiring this up**: `refreshPreview`'s existing flat-file path (`generateUploadPreview`, which seeks into a complete file with `ffmpeg -ss/-t`) would have been silently wrong for *any* `IsStream: true` item — and testing showed this is nearly all of them, since `chunk_upload.go`'s fallback path HLS-ifies essentially every video/audio upload regardless of which pipeline produced it, not just ones that went through the progressive FIFO. Running `-ss/-t` against a `.m3u8` manifest path is a fundamentally different operation than seeking into a flat file. Fixed by branching in `refreshPreview` on `tempItem.IsStream`: stream items go through a new callback (`services.StreamPreviewRefreshCallback`, registered by `chunk_upload.go`'s `init()` — same cross-package-without-cycle pattern already established for `SetProgressiveReadyCallback`) that handles them correctly via HLS segments instead.
- New `refreshStreamSessionPreview(sessionID, mediaItem)` in `chunk_upload.go`: calls `GeneratePreviewMP4FromHLSSegments` with `fromLatest=true` (a new parameter — `false` for the original one-shot initial preview, which only has the first few segments to work with anyway; `true` for refreshes, which pick the *most recently completed* segments instead, so a refresh well into a long upload shows different, fresher content rather than replaying the same opening seconds every cycle). Unified the initial preview's filename with the refresh's (`temp_item_{id}_preview.mp4`, keyed by the stable DB ID rather than the upload ID string, which isn't stored on the model) specifically so refreshes overwrite the *same* file in place instead of leaving the first one orphaned the moment a refresh creates a separately-named one — same "replaces older previews" semantics as the fallback path's own deterministic-filename/atomic-rename pattern.
- **Verified for real**: forced the progressive path via throttling and let it run un-ended for an extended period — confirmed `refreshPreview` fired repeatedly on the correct ~55-60s cadence (dev), each time correctly identifying the item as a stream and routing through the new callback, each time overwriting the same `temp_item_{id}_preview.mp4`. Separately verified session-end correctly stops the ticker (zero further refreshes after the end call, dozens before it — confirmed by timestamp, not just "no errors"). Also verified a tiny (194KB, 1-chunk, guaranteed-fallback-pipeline) upload — confirmed it *also* came back `IsStream: true` (the fallback path's blanket HLS-ification applies regardless of size) and correctly refreshed via the same new path, meaning the realistic case for almost every video/audio upload is now covered; the original flat-file `generateUploadPreview` refresh path remains for the narrower remaining cases (permanent `MediaItem`s, or any upload where HLS-ification itself fails) and was left untouched.

### Phase 16 — chunk uploads now survive an expired token (completed 2026-06-22)

User hit a real "failed to upload chunks" error after a system restart. Root-caused as a genuine, expected JWT expiry (7-day token lifetime — the token's `exp` was 22 seconds in the past at request time, confirmed via exact Unix arithmetic), **not** caused by any of the Phases 14/15 changes (confirmed no auth files were touched, and no stale duplicate backend process was serving with a mismatched secret).

**The actual, fixable gap found alongside it**: `uploadChunk` (`api.js`) made its request via a raw `axios.post(...)` call instead of the shared `apiClient` instance — bypassing the app's existing auto-refresh-on-401 interceptor entirely. Every other API call in the app already silently refreshes an expired token and retries; this one just failed outright after 3 attempts, with no recovery.

**Fix**: switched `uploadChunk` to use `apiClient.post(...)`. Required one supporting change — `apiClient`'s request interceptor unconditionally overwrote any `Authorization` header with the plain `localStorage` token, which would have clobbered both (a) `uploadChunk`'s own sessionStorage-preferring token lookup on the initial request, and (b) the refresh-retry's freshly-refreshed token on the retry (since retrying via `apiClient(originalRequest)` re-runs the request interceptor). Changed the interceptor to only set `Authorization` if not already present on the request.

**Verified for real, not just by reasoning about it**: registered a brand-new test account to get genuine access+refresh tokens, deliberately poisoned `localStorage`'s access token with a garbage string (guaranteeing an immediate 401, worse than mere expiry), then ran a real chunked upload through the actual UI. Confirmed: the very first chunk attempt succeeded (the interceptor's refresh-and-retry happened transparently inside that single attempt, never even reaching the outer per-chunk retry loop), `device_stream_ready` fired normally, and the token in `localStorage` afterward was a genuine fresh JWT, not the garbage string.

### Phase 17 — fixed `device_stream_ready` silently lost on slow/throttled uploads; load bar now clears early (completed 2026-06-22)

User reported that on a slow/large "Browse Files" upload (139MB+, throttled network), the lobby session preview showed the playing media *before* the LeftSidebar's own progress bar disappeared — the Phase 11 `isUploadReady` mechanism (meant to hide the bar the moment `device_stream_ready` arrives, while `uploading` stays true for the rest of the background chunk transfer) never fired at all; the bar only cleared at full upload completion, contradicting the explicit Phase 11 design intent. Root-caused via real Playwright tests driving the actual dev backend (not reasoning about the code) — two independent, compounding bugs in `useWebSocket.js`, both upstream of `VideoWatch.jsx`'s `device_stream_ready` handler:

**Bug 1 — a `CONNECTING` (not yet `OPEN`) pool connection was treated as a stale zombie and deleted.** `connectWebSocket()`'s pool-reuse check (`useWebSocket.js`) only reused an existing `activeConnections` entry if its socket was already `OPEN`; a `CONNECTING` socket under the same key fell through to an `else` branch that logged "Removing stale connection" and deleted the pool entry outright. In React StrictMode's dev-only double-mount (confirmed via `main.jsx`'s `<React.StrictMode>` wrapper — this is dev-only, since StrictMode's effect double-invoke does not happen in a production build), the *second* mount's effect calls `connectWebSocket()` again while the *first* mount's own socket is still mid-handshake (`CONNECTING`, not a cross-tab zombie — the key already includes `tabId`, so a same-key `CONNECTING` entry within one tab's lifetime is always this same logical attempt). Deleting it, combined with the `isConnectingRef.current` guard immediately after, made the second mount bail out without registering any subscriber of its own — leaving only the first mount's subscriber alive in a now-orphaned pool-entry object still referenced by the original socket's `onmessage` closure. Fixed: the reuse condition now also accepts `CONNECTING` (`existingWs.readyState === WebSocket.OPEN || existingWs.readyState === WebSocket.CONNECTING`), so the second mount re-subscribes to the in-flight connection instead of abandoning it.

**Bug 2 — the real, deeper one: `clearMessages()` did a non-functional `setMessages([])`, racing with and silently discarding concurrently-queued messages.** `VideoWatch.jsx`'s WS-message-processing effect snapshots `messages`, processes everything new, then calls `clearMessages()` to truncate the array back down (instead of letting it grow for the session's lifetime). `clearMessages` was implemented as `() => setMessages([])` — a **direct value reset**, not a functional updater. When a WS message arrives (queued via the correct functional form, `setMessages(prev => [...prev, message])`) in the narrow window after the effect took its snapshot but before its own `clearMessages()` call has committed, React processes the queued updates in order: the functional append applies against the *current* state, but the direct-value `[]` immediately after it discards that result entirely — the appended message is gone before any render ever reflected it. This is exactly what happened to `device_stream_ready`: confirmed via diagnostic logging that the message's `setMessages` updater callback *did* run (proving it reached the subscriber correctly) and computed a 2-element array including `device_stream_ready` — but the very next effect run only ever saw the *other* message that had been in flight at the same time, with `device_stream_ready` simply absent, forever. Fixed by changing `clearMessages` to `useCallback((count) => setMessages(prev => prev.slice(count)), [])` and having `VideoWatch.jsx` pass its own snapshot length (`clearMessages(messages.length)`) instead of calling it bare — slicing off only what was actually processed, against whatever the *latest* `prev` is at commit time, so anything appended after the snapshot survives. `clearMessages` had exactly one caller in the whole codebase (`VideoWatch.jsx`), confirmed via grep before changing its signature.

**Scope note**: Bug 2 is not specific to `device_stream_ready` — any WS message type is vulnerable to this same race if it happens to arrive in that narrow window, on any page using this hook's message-processing-then-clear pattern. Bug 1 is StrictMode/dev-mode-specific (production builds don't double-invoke effects) but was still worth fixing on its own merits — it avoided unnecessary connection churn even outside the exact bug chain.

**Verified for real, end-to-end, multiple times**: real Playwright browser driving the actual dev backend with CDP network throttling (1.5 Mbps, to reliably reproduce the "upload takes long enough for the timing window to matter" condition) and a real `+faststart` test MP4 through the real chunked-upload → progressive-HLS pipeline. Before the fix: `device_stream_ready` confirmed sent by the backend (verified in the backend's own log) but never once appeared in `VideoWatch.jsx`'s processed-message stream across 3 independent runs; `isUploadReady` stayed `false` and the progress bar stayed visible for the entire upload. After both fixes: `device_stream_ready` correctly appears in a subsequent effect run, `isUploadReady` flips to `true`, the progress bar disappears immediately (while the button correctly still reads "Loading..." since the background chunk transfer continues), and playback starts successfully shortly after — confirmed via a real `play()` promise resolution, not just state flags. Re-ran once more after stripping all diagnostic logging to confirm the fix holds without it.

### Phase 18 — fixed redundant reload on upload completion; lobby preview now tracks actual playback position after stream completion (completed 2026-06-22)

User confirmed Phase 17's progress-bar fix worked, but reported two further issues from real testing: (1) the player visibly restarted exactly when the background upload finished; (2) the lobby preview updates a couple of times early on but then never advances further as the session continues.

**Issue 1 root cause — different from the initial hypothesis.** First suspected `handlePlayMedia`'s missing idempotency guard (`LeftSidebar.jsx`'s `wasUploadingRef` fallback re-selecting an already-playing item) and added one (`if (currentMedia?.ID === id) return;` at the top of `handlePlayMedia` in `VideoWatch.jsx`) as defense-in-depth — but a real Playwright test with a diagnostic confirmed `handlePlayMedia` was never even called for this symptom. The actual cause: `CinemaVideoPlayer.jsx`'s media-loading effect and its "BOTH streams" sibling effect both list `onError` in their dependency arrays, and `VideoWatch.jsx` passes a fresh `onError` function reference on every render (not wrapped in `useCallback`). A real parent re-render at the exact moment the upload completes (and again ~5s later, during the poster-retry pass) re-ran the effect and reloaded the player from scratch — confirmed via diagnostic logging showing `onErrorChanged=true` on every single effect run, and via the video element's own `currentSrc` (a fresh `blob:` URL each time, with `readyState` reset to `0`) genuinely changing twice despite `mediaUrl` staying byte-identical in the logs. Fixed with an `onErrorRef` shadow ref (the same pattern already used in `CinemaScene3DDemo.jsx` for this exact class of problem) — both effects now read `onErrorRef.current` instead of `onError` directly, and `onError` was removed from both dependency arrays. The second effect's `mediaItem` dependency was also narrowed to `mediaItem?.mediaUrl` (it was depending on the whole object, the same mistake Phase 10 had already fixed in the first effect).

**Issue 2 root cause.** Phase 17's own segment-milestone poller (`watchManifestForPreviewRefresh`) only runs while a progressive upload is still producing new segments — it deliberately stops once `#EXT-X-ENDLIST` appears, since there's nothing further for it to chase. After that point, only `PreviewQueue`'s wall-clock ticker (1 min dev / 5 min prod) remains, and it kept calling `GeneratePreviewMP4FromHLSSegments(..., fromLatest=true)` — which, for a *complete* file, permanently means "the last 3 segments of the whole file," frozen forever regardless of where anyone is actually watching. Every later tick regenerated byte-identical content, which is indistinguishable from "stopped updating" from the user's side.

**Fix**: `refreshStreamSessionPreview` (`chunk_upload.go`) now reads the manifest and checks for `#EXT-X-ENDLIST`. While still uploading, behavior is unchanged (`fromLatest=true`). Once complete, it instead calls new `utils.GeneratePreviewMP4FromHLSSegmentsAtPosition(segDir, previewPath, 3, session.CurrentPlaybackTime)` — `CurrentPlaybackTime` is a field that already exists and is already kept fresh every 30s by `VideoWatch.jsx`'s pre-existing periodic `playback_control` "seek" heartbeat (`websocket.go`'s `playback_control` handler persists `current_playback_time` on every such message), the same field the flat-file preview path already relies on for this identical purpose — no new tracking mechanism needed. `GeneratePreviewMP4FromHLSSegments` and the new `...AtPosition` variant share one internal implementation (`generatePreviewMP4FromSegmentWindow`); a `centerIndex >= 0` selects a `maxSegments`-wide window centered on that segment (computed as `positionSeconds / hlsSegmentSeconds`, a new shared constant for the `-hls_time 6` value `commitProgressiveMode` already passes to ffmpeg), clamped to the available range, instead of the original first/last-N logic.

**Verified for real, end-to-end**: a real 180-second test video, uploaded with no throttling so the stream completed almost immediately, then left playing for 150 real seconds while the host's own page stayed open (confirming `currentTime` advanced continuously and naturally the whole time, driving the real 30s heartbeat). Backend log confirmed, across three consecutive 1-minute ticker fires: `CurrentPlaybackTime=34` → segment window `[004,005,006]`; `CurrentPlaybackTime=93` → `[014,015,016]`; `CurrentPlaybackTime=124` → `[019,020,021]` — each refresh genuinely tracking the advancing position in a 30-segment file, never repeating the same window and never collapsing to the last-3-segments-of-180s the old code would have returned every single time. For issue 1, the same test's `currentSrc` and `currentTime` were confirmed stable and monotonically increasing across the entire upload-completion window, with zero reloads and zero redundant `playback_control` broadcasts (down from 2 redundant reloads observed before the fix, none after).

### Phase 19 — fixed late-joiner media URL (relative path resolved against the wrong origin); stopped the preview ticker from orphaning across a media-type switch (completed 2026-06-23)

User asked two forward-looking questions before more real testing: (1) does the lobby preview update correctly if the host switches from a device-stream upload to LiveShare or Watch-From mid-session; (2) for a late joiner (not already connected when `device_stream_ready` fired), would they see what the host sees with no out-of-sync issues, given late joiners rely on `session_status` rather than the broadcast. Investigating both surfaced two real, independent bugs — confirmed via code tracing first, then fixed and verified end-to-end.

**Bug 1 — late joiners got a fundamentally broken media URL, not just an out-of-sync one.** Both upload pipelines store `current_media_url` as a relative path (`manifestURL := "/uploads/" + ...` in `chunk_upload.go`, same for the fallback path's `publicURL`). This flows untouched through `session_status` → `useWebSocket.js`'s `currentMediaUrl: data.current_media_url || null` with zero normalization, into the dedicated late-join restoration effect (`VideoWatch.jsx`, the one gated by `if (isHost) return; if (!sessionStatus?.currentMediaUrl) return;`), which used the raw relative URL directly as `mediaUrl`. Unlike `device_stream_ready`'s own handler (which explicitly resolves `readyUrl.startsWith('http') ? readyUrl : `${baseUrl}...``), the late-join path had no equivalent — so a late joiner's browser resolved the path against the *frontend's* own origin instead of the backend's, a guaranteed 404, not a sync-drift edge case. Confirmed this exact "construct absolute URL from a possibly-relative one" snippet was independently duplicated in five places across the file (`device_stream_ready`'s handler, `handlePlayMedia`, `handleOpenDoc`, the member-side `playback_control` handler, and the late-join effect). Fixed by extracting one module-level `resolveMediaUrl(url)` helper and using it at all five call sites — the late-join effect now resolves the URL the same way every other path already did.

**Bug 2 — the preview ticker doesn't know when the host stops uploading and starts something else.** Investigating question (1) found the backend already has the right machinery — `update_media_state` and `screen_share_started`/`screen_share_stopped` WS handlers correctly call `mediaSwitchHandler.ClearOldPreview`/`HandleMediaStateChanged` on a real type change, which stops `PreviewQueue`'s refresh ticker and clears the stale preview — but cinema rooms (`VideoWatch.jsx`/`LeftSidebar.jsx`) never send either message type; they're only ever sent by `LectureHallPage.jsx`/`PositionCalculatorPage.jsx`. Starting LiveShare/Watch-From in a cinema room only sent `liveshare_mode_selected` (updates liveshare-specific columns only) and `update_room_status` (room-level UI state, no DB type-change detection) — so `watch_sessions.current_media_type` stayed `"upload"` forever, and `startSessionPreviewRefresh`'s ticker (added in Phase 17) kept running indefinitely against the old upload's HLS segments, periodically overwriting the fresh LiveShare poster (captured separately via WebRTC frame upload) with stale content. Fixed by sending `update_media_state` from both `handleStartLiveShare` (right after the existing `update_room_status` send, once LiveKit tracks are confirmed live — `current_media_type` set to `'watchfrom'` or `'liveshare'` based on the function's own existing `source` parameter, which already distinguishes the two) and `handleEndScreenShare` (symmetric stop-side message, `is_screen_sharing_active: false`, resets type to `"none"` via `HandleMediaStop` so a later late-join or media switch doesn't inherit a stale type).

**Verified for real, end-to-end, with two independent tests.** Late-joiner fix: real two-user-account test — host uploaded a 90s video, played for ~75 real seconds (long enough for the 30s playback heartbeat to persist a non-trivial `current_playback_time`), then a second, separate account joined the same session late. Confirmed the late joiner's video had a genuine `blob:` src (proof hls.js successfully fetched the manifest from the correct, now-absolute origin — a relative-URL bug would never get this far) at `readyState: 4`, actively playing, and landed at `currentTime≈47.5s` against an estimated actual host position of roughly 50s — close enough to confirm the existing staleness-compensated estimate is doing real work, not coincidence — then continued advancing smoothly and continuously for the next 30 seconds with no stalls or jumps.

Media-switch fix: LiveKit isn't available in this dev environment, so `handleStartLiveShare`'s real UI button can't be exercised (it returns early on the `!localParticipant || !room` guard before ever reaching the new code) — verified instead by sending the *exact* `update_media_state` payload the new code constructs over a raw WebSocket connection to a session whose ticker had been confirmed actively firing every ~60-65s for 18+ minutes straight (item 468, "Stream preview refreshed" recurring on schedule). Backend log confirmed, in order: message received verbatim, `Type change detected: upload → liveshare`, `Clearing old upload preview`, session `switched to liveshare`, lobby broadcast sent. The next naturally-due tick (~65s after the prior one, which would have landed *after* this message was processed) never fired, and none fired in the 75 seconds watched afterward — confirming the ticker was genuinely stopped, not just coincidentally delayed.

## Follow Model

### Known issue — orphaned `TemporaryMediaItem` rows from manual disk cleanup during testing (found 2026-06-22)

Separately, the user hit a "failed to play video" error clicking a playlist item whose underlying HLS manifest 404'd. Root-caused: this was **caused by Claude's own test cleanup commands** during Phases 9-12 — `rm -rf ./uploads/chunks/* ./uploads/temp/* ./uploads/device_streams/*` run directly against the shared upload directories (rather than scoping deletion to only the specific test-created paths) deleted real, concurrently-uploaded files — including the user's own real "Stream from Device" test upload — without going through the app's own deletion path, which would have also removed the corresponding DB row. This left `TemporaryMediaItem` rows pointing at files that no longer exist, surfacing as a 404 + hls.js fatal error when clicked.

Auditing the app's *own* cleanup logic (independent of this incident) found it is correctly paired in the normal flow (`EndWatchSessionHandler`, `AutoEndSession`, `CleanupExpiredSessions`, the WS `leave_session` handler — all delete the file then the DB row inside the same transaction), but found two narrow, pre-existing latent gaps worth fixing separately:
- `CleanupAllTemporaryMedia` and `DeleteTemporaryMediaItemsForRoomHandler` (`rooms.go`, `temporary_media_items.go`) both `continue` (skipping the DB row delete) when `DeleteMediaFile` returns an error — a transient failure (network blip, already-404 CDN object) leaves the row orphaned forever, never retried.
- `CleanupOrphanedInstantWatchRooms` (`rooms.go`) deletes the file but never deletes the room's `TemporaryMediaItem` rows at all.
- Frontend has no proactive eviction of a playlist item when its manifest genuinely 404s during playback (`CinemaVideoPlayer.jsx`'s hls.js error handler) — it surfaces the error but never removes the dead entry from the playlist, so it stays clickable (and broken) until the next full playlist refetch.

Not yet fixed — pending user decision on whether to (a) clean up the specific orphaned rows now (touches the user's own room 108 data, not just the test room 186 — asked before acting), and (b) prioritize the two backend sweep-function gaps + the frontend graceful-degradation gap as a follow-up.

## Follow Model
"Follow" = join the host's main room. There is **no separate follows table**. Do not add one.

## Premium Model
`User.IsPremium bool` + `User.PremiumExpiresAt *time.Time` — checked inline in handlers. No subscriptions table until billing is wired up (Phase 3). To grant premium: `UPDATE users SET is_premium=true WHERE id=?`.

**Planned premium-only features (implement when billing is wired):**
- Upload size limit: Free = 1 GB, Premium = higher limit (TBD — gate in `LeftSidebar.jsx` `handleFileUpload` with `currentUser.is_premium`)
- Recording count: Free = 5 lifetime, Premium = unlimited

## DB Migration SQL (pending — user must run in psql)

```sql
-- Recurring events (confirmed run 2026-05)
ALTER TABLE scheduled_events
  ADD COLUMN IF NOT EXISTS recurrence_type VARCHAR(20) DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS recurrence_group_id VARCHAR(36),
  ADD COLUMN IF NOT EXISTS recurrence_end_date TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_scheduled_events_recurrence_group
  ON scheduled_events (recurrence_group_id)
  WHERE recurrence_group_id IS NOT NULL;

-- Watch sessions (confirmed run 2026-05)
ALTER TABLE watch_sessions ADD COLUMN IF NOT EXISTS current_sermon TEXT;

-- Session preview (NOT YET RUN — 2026-05)
ALTER TABLE watch_sessions
  ADD COLUMN IF NOT EXISTS preview_url TEXT,
  ADD COLUMN IF NOT EXISTS poster_url  TEXT;

-- Kick/ban (confirmed run 2026-05)
ALTER TABLE user_rooms
  ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS banned_at TIMESTAMPTZ;

-- Premium (confirmed run 2026-05)
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS is_premium BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS premium_expires_at TIMESTAMPTZ;

-- Text posts (confirmed run 2026-05)
ALTER TABLE posts ADD COLUMN IF NOT EXISTS text_content TEXT;
-- Optional cleanup (title column is ignored by GORM but still exists in DB):
-- ALTER TABLE posts DROP COLUMN IF EXISTS title;

-- Community Events (NOT YET RUN — 2026-06)
CREATE TABLE IF NOT EXISTS community_requests (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  content_rating VARCHAR(20) NOT NULL DEFAULT 'G',
  preferred_date DATE,
  description TEXT,
  status VARCHAR(20) NOT NULL DEFAULT 'open',
  upvote_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS community_request_upvotes (
  id BIGSERIAL PRIMARY KEY,
  request_id BIGINT NOT NULL REFERENCES community_requests(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(request_id, user_id)
);
CREATE TABLE IF NOT EXISTS community_request_claims (
  id BIGSERIAL PRIMARY KEY,
  request_id BIGINT NOT NULL REFERENCES community_requests(id) ON DELETE CASCADE,
  host_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_id BIGINT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  scheduled_event_id BIGINT REFERENCES scheduled_events(id) ON DELETE SET NULL,
  claimed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(request_id, host_user_id)
);

-- Room favourites (NOT YET RUN — 2026-05)
CREATE TABLE IF NOT EXISTS user_room_favourites (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room_id BIGINT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, room_id)
);

-- WatchOut Layer 2: Streaks (NOT YET RUN — build when implementing)
-- CREATE TABLE watch_streaks (
--   id BIGSERIAL PRIMARY KEY,
--   user_a_id BIGINT NOT NULL REFERENCES users(id),
--   user_b_id BIGINT NOT NULL REFERENCES users(id),
--   current_streak INT NOT NULL DEFAULT 0,
--   longest_streak INT NOT NULL DEFAULT 0,
--   last_co_watch_date DATE,
--   created_at TIMESTAMPTZ DEFAULT NOW(),
--   updated_at TIMESTAMPTZ DEFAULT NOW(),
--   UNIQUE(user_a_id, user_b_id)
-- );
-- CREATE TABLE event_attendances (
--   id BIGSERIAL PRIMARY KEY,
--   user_id BIGINT NOT NULL REFERENCES users(id),
--   event_id BIGINT NOT NULL REFERENCES scheduled_events(id),
--   room_id BIGINT NOT NULL REFERENCES rooms(id),
--   attended_at TIMESTAMPTZ NOT NULL,
--   minutes_watched INT NOT NULL DEFAULT 0,
--   UNIQUE(user_id, event_id)
-- );
```

## Environment Variables (backend)
Key vars expected in `.env` or Railway config:
- `DATABASE_URL` — PostgreSQL connection string
- `JWT_SECRET`
- `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_WS_URL`
- `PAYSTACK_SECRET_KEY`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `FRONTEND_URL` — for CORS and OAuth redirects
- `BUNNY_STORAGE_ZONE`, `BUNNY_ACCESS_KEY`, `BUNNY_PULL_ZONE_URL` — BunnyCDN file storage

## Common Gotchas
- The `members/:user_id` route param conflicts with `members/join-requests` if not careful — use distinct path segments.
- `gorm.ErrRecordNotFound` must be imported from `gorm.io/gorm`, not `github.com/jinzhu/gorm`.
- `BroadcastToUsers` takes `[]uint` for user IDs.
- Frontend `isHost` is derived from `room.host_id === currentUser.id` — don't trust `user_role` alone (host may also have role 'host' or 'admin').
- `performCleanupAndExit` in VideoWatch is `async` — await it when calling from WS handlers.
- Gin's trie router (httprouter) always matches static segments before parameterized ones — `GET /api/rooms/with-active-sessions` will never be captured by `GET /api/rooms/:id`; registration order doesn't matter for static vs. param segments.
- **Banner style switching**: never use double-`setTimeout` to toggle a banner off then on again — the second call captures a stale closure and both fire as "hide". Use `rebroadcastBannerWithLayout(newLayout)` which directly broadcasts `active: true` with the new layout in one call.
- **Mute All toggle pill shape**: the toggle container must use `flex items-center justify-between` in a horizontal row at all screen sizes. Using `flex-col` as the outer container causes `align-items: stretch` to override the `w-11` width and breaks the pill shape. The description text goes below in a separate element, not alongside the toggle.
- **Subscription effects reading frequently-changing objects**: if a `useEffect` subscribes/unsubscribes based on a value that changes on every render (like a participant map), read it from a ref instead of listing it as a dep. Keep the ref in sync with a tiny 2-line `useEffect([value])`. This avoids subscription churn without stale-closure risk.
- **Duplicate exports in `api.js`**: Vite/esbuild will hard-fail with "Multiple exports with the same name" — check for duplicate `export const funcName` before adding new API helpers. The canonical single definition lives near related endpoints; never paste a second version at the bottom.
- **FormData axios uploads**: never set `Content-Type: 'multipart/form-data'` manually — pass `{ headers: { 'Content-Type': undefined } }` so the browser fills in the correct `multipart/form-data; boundary=...` value. Setting it manually drops the boundary and the server gets a 400.
- **Go multipart handler field ordering**: always read `c.PostForm("source_type")` BEFORE calling `c.Request.MultipartForm` or checking `form.File["frames"]`. Some upload paths (e.g. liveshare clip) send a `clip` field instead of `frames` — checking for frames first returns a false 400.
- **`http.ServeFile` leading-slash path**: `c.Param("filepath")` returns a path starting with `/` (e.g. `/previews/foo.jpg`). Use `strings.TrimPrefix(urlPath, "/")` before `filepath.Join("./uploads", trimmedPath)` — a leading slash causes `filepath.Join` to treat the segment as an absolute path and `http.ServeFile` returns 404.
- **`ERR_CANCELED` / `CanceledError` in axios interceptors**: React StrictMode double-invokes effects, causing in-flight requests to be aborted on the first unmount. These produce `error.code === 'ERR_CANCELED'` — check for this (and `error.name === 'CanceledError'` / `'AbortError'`) in the response error interceptor and return early without logging. They are not real errors.
- **`video.play()` after `currentTime` assignment**: Setting `video.currentTime` is async — the browser fires `seeking` and only completes at `seeked`. Calling `play()` before `seeked` causes `AbortError` (swallowed silently) and leaves video frozen on the first frame. Always attach a one-time `seeked` listener and call `play()` from inside it.
- **`playback_control` latency clock**: Always use `message.timestamp` (host browser `Date.now()`) for transit latency, never `message.server_ts`. On WSL dev setups, `server_ts` (WSL Linux clock) runs 600–700ms ahead of Windows `Date.now()`, making every `adjustedTime` negative — member seeks backwards and replays scenes. On production, NTP-synced devices make `timestamp` equally accurate.
- **Same-media seek must not reload `video.src`**: For `playback_control` commands where the media is already loaded, operate directly on the video element (`videoEl.currentTime = adjustedTime`). Calling `setCurrentMedia` for a seek-only command reloads the src, adding ~275ms load + ~318ms seek = ~593ms of unnecessary pipeline delay.
- **`sync_heartbeat` drift corrections replaying scenes**: If heartbeat corrections cause the member to repeatedly seek backwards, the `sync_heartbeat` handler is using `server_ts` instead of `message.timestamp` for latency. The handler's `_latency = Date.now() - _hb.timestamp` line must use `timestamp`, not `server_ts || timestamp`.
- **VolumeControl dismiss button**: The × button must be the last child in the flex column (below the mute icon), not `absolute top-1 right-1`. Absolute positioning takes it out of flow; being the last flex item keeps it centered as a natural bottom cap of the bar.
- **Avatar ring ghost on mute**: In `FlatUserIcon` pulse mode, the sonar ring must check `isSpeaking && audioLevel > 0.01` (not `isSpeaking` alone). LiveKit's `isSpeaking` flag has a ~300–500ms cooldown after audio drops, so the ring keeps animating briefly after muting. The `audioLevel > 0.01` guard kills it instantly.
- **`filteredRooms`/`filteredSessions` are not state**: They are `useMemo` values derived from `rooms`, `sessions`, and `searchTerm`. Do not add `setFilteredRooms` or `setFilteredSessions` calls — they don't exist. Filter the source arrays and `setRooms`/`setSessions` instead, and the memo will recompute.
- **`roomsFetchedRef` controls rooms initial fetch**: Don't add a bare `fetchRoomsData()` call to new mount effects in LobbyPage — it would bypass the lazy-load gate. Check `roomsFetchedRef.current` first, or just let the existing unified effect handle it.
