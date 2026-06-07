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
