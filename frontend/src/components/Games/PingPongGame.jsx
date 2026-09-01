import React, { useRef, useEffect, useCallback, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import GameWinnerBanner from './GameWinnerBanner';
import GameRulesButton from './GameRulesButton';

// Sound — hosted WAV files on BunnyCDN, same convention as every other game's
// SFX in this app (see utils/audio.js, and Pool's identical setup). Synthesized
// from scratch (no external samples) for the same reason as Pool's SFX: no
// licensing question, self-contained.
const SOUND_BASE = 'https://letswatchout.b-cdn.net/games/sounds/ping_pong';
const SOUND_FILES = {
  paddle_hit:    `${SOUND_BASE}/paddle_hit.wav`,
  wall_bounce:   `${SOUND_BASE}/wall_bounce.wav`,
  smash_hit:     `${SOUND_BASE}/smash_hit.wav`,
  serve:         `${SOUND_BASE}/serve.wav`,
  goal:          `${SOUND_BASE}/goal.wav`,
  pickup_spawn:  `${SOUND_BASE}/pickup_spawn.wav`,
  pickup_grab:   `${SOUND_BASE}/pickup_grab.wav`,
  effect_freeze: `${SOUND_BASE}/effect_freeze.wav`,
  effect_slow:   `${SOUND_BASE}/effect_slow.wav`,
  effect_ghost:  `${SOUND_BASE}/effect_ghost.wav`,
};
// Module-level (not component state) since the plain physics loop below isn't
// a hook and needs to read it directly — same imperative style as Pool's
// playPoolSound / utils/audio.js elsewhere in this app.
let pingPongSoundEnabled = true;
function playPingPongSound(name, { volume = 0.5, rate = 1 } = {}) {
  if (!pingPongSoundEnabled) return;
  const url = SOUND_FILES[name];
  if (!url) return;
  const audio = new Audio(url);
  audio.volume = Math.max(0, Math.min(1, volume));
  audio.playbackRate = rate;
  audio.play().catch(() => {}); // autoplay-policy rejections are expected before the first user gesture
}

// Mobile haptic feedback for impact moments (paddle hits, smashes, goals,
// pickups) — same technique already used in SpaceAttackGame.jsx
// (navigator.vibrate, feature-detected since Safari/iOS has no Vibration API
// at all). Deliberately independent of the sound-mute toggle, matching that
// existing convention — a silent room doesn't mean no haptic feedback wanted.
function hapticImpact(pattern) {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(pattern);
  }
}
// Hits at or above this speed sound like a "smash" instead of a normal hit —
// ties into the existing rally-speedup mechanic (SPEED_UP) rather than a
// separate, not-yet-built smash-meter feature.
const SMASH_SPEED_THRESHOLD_RATIO = 0.72;

// Canvas logical dimensions — must match backend rtW/rtH constants.
const W = 400, H = 600;
const P1_CY = 48;   // P1 paddle center Y (top player)
const P2_CY = 552;  // P2 paddle center Y (bottom player)
const PAD_W = 80, PAD_H = 12;
const BALL_R = 9;
const SPEED_UP = 1.03;  // velocity multiplier each paddle hit
const MAX_SPEED = 560;
const MAX_VX_RATIO = 0.75;
const SYNC_EVERY = 6;      // send state_sync every N frames (~10 Hz at 60 fps)
// 50→30ms: mobile users reported the ball "passing through" their paddle — see
// the extrapolation/tolerance block below for the actual fix, this just trims
// a bit of self-inflicted staleness off the top of it for free.
const PADDLE_SEND_MS = 30; // throttle paddle_move to ~33 Hz
// 340→480: mobile's directional buttons were objectively too slow to cross the
// table in time against a ball that can reach MAX_SPEED and compounds every
// hit via SPEED_UP — independent of any network latency at all.
const PADDLE_BTN_SPEED = 480; // px/sec — directional-button paddle movement

// P1 is the sole physics authority (see file-level architecture note above) —
// P2's paddle position, as P1's collision check sees it, is only as fresh as
// the last paddle_move that's made the full round trip. On a laggy (typically
// mobile) connection that gap is large enough that P1's physics genuinely
// believes P2's paddle isn't where it actually is, missing real hits — this is
// what was reported as "the ball passes through my paddle" from the mobile
// side and "the member doesn't move fast enough" from the host side: two
// symptoms of the exact same staleness, not two separate bugs.
//
// Fix: dead-reckon the remote paddle forward from its last known position +
// velocity (same technique already used for the ball itself, extrapolated for
// P2/spectators below), and widen the hit window proportionally to how stale
// that reckoning is — a hit that would've been a clean miss against a fresh
// position becomes forgivable exactly in proportion to how long it's been
// since we last actually heard from the other side.
const BASE_HIT_TOLERANCE = 1.20;        // was a flat 1.15 for every hit, including P1's own (always instantly fresh)
const MAX_EXTRA_HIT_FORGIVENESS = 0.25; // additional tolerance at maximum staleness, remote paddle only
const REMOTE_PADDLE_EXTRAPOLATION_CAP_S = 0.35; // don't dead-reckon further forward than this — a stale-enough guess is worse than none

// Secant-based velocity estimate between two actual sends of one logical
// paddle track — measured once per send (not per frame, which would be noisy
// from touchmove/RAF jitter), since human paddle input rarely reverses
// direction within one send interval. `track` is a small {x, t} object the
// caller owns; each send site below (P1's state_sync, P2's paddle_move) keeps
// its own track since they're different logical paddles sent at different
// cadences.
function estimateSendVelocity(track, currentX, now) {
  const dtSec = Math.max((now - (track.t || now)) / 1000, 0.001);
  const rawVx = (currentX - (track.x ?? currentX)) / dtSec;
  track.x = currentX;
  track.t = now;
  return Math.max(-PADDLE_BTN_SPEED * 4, Math.min(PADDLE_BTN_SPEED * 4, rawVx));
}

// Dead-reckons a paddle anchor {x, vx, t} forward by however long it's been
// since the last update, capped so a stale-enough prediction doesn't overshoot
// into nonsense. Returns both the predicted position and how stale the anchor
// was, so callers can also scale a forgiveness margin off the same number.
function extrapolatePaddleX(anchor, now) {
  const elapsedS = Math.min(Math.max((now - anchor.t) / 1000, 0), REMOTE_PADDLE_EXTRAPOLATION_CAP_S);
  const x = Math.max(PAD_W / 2, Math.min(W - PAD_W / 2, anchor.x + anchor.vx * elapsedS));
  return { x, elapsedS };
}

// Power-up pickups — spawned locally by P1 (the physics authority) on a
// random timer and relayed through the existing state_sync channel, same
// trust model as ball physics itself. Durations must match the backend's
// pingPongPickupDurations exactly (see ping_pong.go) so both sides agree on
// when an effect actually ends.
// "invisible" is kept as the internal type key everywhere (backend included —
// see pingPongPickupDurations in ping_pong.go) since it's just an identifier;
// only the player-facing name is "Ghost Ball" (icon, label, banner text).
const PICKUP_TYPES = ['freeze', 'slow', 'invisible'];
const PICKUP_EMOJI = { freeze: '❄️', slow: '🐌', invisible: '👻' }; // used only in the small JSX status banner text, not the canvas
const PICKUP_COLOR = { freeze: '#60a5fa', slow: '#a3e635', invisible: '#c084fc' };
const PICKUP_LABEL = { freeze: 'FREEZE', slow: 'SLOW', invisible: 'GHOST BALL' }; // canvas label under each pickup — same "Ghost Ball" player-facing name as EFFECT_MESSAGE/PICKUP_EMOJI below
const EFFECT_MESSAGE = {
  freeze:    { mine: "You're Frozen!",              opp: 'Opponent is Frozen!' },
  slow:      { mine: "You're Slowed!",               opp: 'Opponent is Slowed!' },
  invisible: { mine: "Ghost Ball — you can't see it!", opp: 'Opponent has Ghost Ball!' },
};
const PICKUP_R = 14;
const PICKUP_MAX_COUNT = 2;
const PICKUP_SPAWN_MIN_MS = 4000;
const PICKUP_SPAWN_MAX_MS = 8000;
const PICKUP_DESPAWN_MS = 7000;
const SLOW_MULTIPLIER = 0.35; // paddle speed while slowed
const SLOW_DRAG_EASE = 0.12;  // per-move-event ease rate while slowed (drag control)

function randomPickupPosition() {
  // Middle band of the table, away from paddles and side walls.
  return {
    x: PICKUP_R * 2 + Math.random() * (W - PICKUP_R * 4),
    y: H * 0.32 + Math.random() * (H * 0.36),
  };
}

// Procedural pickup icons — drawn as real vector shapes rather than emoji
// glyphs, which render inconsistently (soft/blurry, platform-dependent) at
// small canvas sizes. Same reasoning as the Pool table's card/ball redesign
// earlier this project.
function drawSnowflakeIcon(ctx, cx, cy, r) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = '#eff6ff';
  ctx.lineWidth = Math.max(1, r * 0.14);
  ctx.lineCap = 'round';
  for (let arm = 0; arm < 3; arm++) {
    ctx.save();
    ctx.rotate((Math.PI / 3) * arm);
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.82);
    ctx.lineTo(0, r * 0.82);
    ctx.stroke();
    for (const t of [-0.42, 0, 0.42]) {
      const y = t * r * 1.5;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(r * 0.24, y - r * 0.2);
      ctx.moveTo(0, y);
      ctx.lineTo(-r * 0.24, y - r * 0.2);
      ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}

function drawTurtleIcon(ctx, cx, cy, r) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = '#4d7c0f';
  // Legs
  for (const [lx, ly] of [[-0.55, 0.35], [0.55, 0.35], [-0.55, -0.15], [0.55, -0.15]]) {
    ctx.beginPath();
    ctx.arc(lx * r, ly * r, r * 0.15, 0, Math.PI * 2);
    ctx.fill();
  }
  // Head
  ctx.beginPath();
  ctx.arc(0, -r * 0.68, r * 0.22, 0, Math.PI * 2);
  ctx.fill();
  // Shell
  ctx.fillStyle = '#84cc16';
  ctx.beginPath();
  ctx.ellipse(0, r * 0.05, r * 0.78, r * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // Shell pattern
  ctx.beginPath();
  ctx.moveTo(-r * 0.42, -r * 0.15); ctx.lineTo(r * 0.42, -r * 0.15);
  ctx.moveTo(-r * 0.58, r * 0.18); ctx.lineTo(r * 0.58, r * 0.18);
  ctx.moveTo(0, -r * 0.4); ctx.lineTo(0, r * 0.5);
  ctx.stroke();
  ctx.restore();
}

// Ghost Ball icon: the real in-game ball (same gradient as drawBall's ball
// rendering) with a translucent ghost silhouette peeking out behind it —
// directly reuses this app's own Ghost Mode emoji (👻, see LeftSidebar's
// Ghost Mode toggle) as the concept, rendered as a sharp vector shape instead
// of a raw glyph.
function drawGhostBallIcon(ctx, cx, cy, r) {
  ctx.save();
  ctx.translate(cx, cy);

  // Ghost silhouette (offset up-left, behind the ball)
  ctx.save();
  ctx.translate(-r * 0.22, -r * 0.18);
  ctx.globalAlpha = 0.85;
  const gr = r * 0.68;
  ctx.beginPath();
  ctx.arc(0, -gr * 0.15, gr * 0.78, Math.PI, 0, false);
  ctx.lineTo(gr * 0.78, gr * 0.55);
  const scallops = 3;
  const waveW = (gr * 1.56) / scallops;
  for (let i = 0; i < scallops; i++) {
    const xTo = gr * 0.78 - waveW * (i + 1);
    const xMid = gr * 0.78 - waveW * (i + 0.5);
    ctx.quadraticCurveTo(xMid, gr * 0.85, xTo, gr * 0.55);
  }
  ctx.closePath();
  ctx.fillStyle = '#e9d5ff';
  ctx.fill();
  ctx.strokeStyle = 'rgba(168,85,247,0.6)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = '#4c1d95';
  ctx.beginPath();
  ctx.arc(-gr * 0.26, -gr * 0.15, gr * 0.11, 0, Math.PI * 2);
  ctx.arc(gr * 0.26, -gr * 0.15, gr * 0.11, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // The real ball, offset down-right, drawn on top
  const bx = r * 0.28, by = r * 0.22, br = r * 0.6;
  const grad = ctx.createRadialGradient(bx - br * 0.3, by - br * 0.3, br * 0.1, bx, by, br);
  grad.addColorStop(0, '#fef08a');
  grad.addColorStop(1, '#ca8a04');
  ctx.beginPath();
  ctx.arc(bx, by, br, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.restore();
}

function drawPickupIcon(ctx, type, cx, cy, r) {
  if (type === 'freeze') drawSnowflakeIcon(ctx, cx, cy, r);
  else if (type === 'slow') drawTurtleIcon(ctx, cx, cy, r);
  else if (type === 'invisible') drawGhostBallIcon(ctx, cx, cy, r);
}

// Same touch-capability check already used elsewhere in this app (DOOM,
// Stellar Swarm) to decide whether to render on-screen touch controls.
const isTouchDevice =
  typeof window !== 'undefined' && 'ontouchstart' in window && navigator.maxTouchPoints > 0;

export default function PingPongGame({ gameState, players, currentUserId, onMove, onClose, onPostResult, onPlayAgain }) {
  const gs = gameState?.game_state || {};
  const p1Id = String(gs.p1_id || '');
  const p2Id = String(gs.p2_id || '');
  const myId = String(currentUserId);
  const isP1 = myId === p1Id;
  const isP2 = myId === p2Id;
  const scores = gs.scores || {};
  const rally = gs.rally || 0;
  const winScore = gs.win_score || 7;
  const phase = gs.phase || 'serving';
  const isEnded = phase === 'ended';
  const isServing = phase === 'serving';
  const serveBy = String(gs.serve_by || '');
  const noWallsActive = !!gs.no_walls;

  const p1Name = players?.find(p => String(p.user_id) === p1Id)?.username || 'Player 1';
  const p2Name = players?.find(p => String(p.user_id) === p2Id)?.username || 'Player 2';
  const serverName = serveBy === p1Id ? p1Name : serveBy === p2Id ? p2Name : '';
  const isMyServe = isServing && ((isP1 && serveBy === p1Id) || (isP2 && serveBy === p2Id));

  const canvasRef = useRef(null);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try { return localStorage.getItem('ping_pong_sound_enabled') !== 'false'; } catch { return true; }
  });
  useEffect(() => {
    pingPongSoundEnabled = soundEnabled;
    try { localStorage.setItem('ping_pong_sound_enabled', String(soundEnabled)); } catch { /* ignore */ }
  }, [soundEnabled]);

  // Connection-staleness indicator — P2/spectator side only. P1 (the
  // physics authority) generates state_sync locally every ~100ms during
  // 'playing' regardless of whether it's actually reaching anyone, so a
  // healthy P2/spectator connection should see gameState update on roughly
  // that same cadence; a gap much longer than that while still nominally
  // 'playing' is a reliable sign something's actually wrong on the wire —
  // not just a quiet moment, since nothing here is naturally quiet during a
  // live rally. P1 doesn't get an equally reliable version of this signal
  // (whether P1's OWN outgoing broadcasts are echoed back to itself isn't
  // guaranteed, so "time since I last received a game_state_update" could
  // produce false positives for P1 during perfectly healthy play with no
  // discrete events happening) — deliberately not shown for P1 to avoid
  // that risk. Checked on a plain interval, not the 60fps RAF loop, since
  // this only needs to drive a rare, cheap boolean-state UI change.
  const [connectionStale, setConnectionStale] = useState(false);
  useEffect(() => {
    if (isP1) return undefined;
    const STALE_AFTER_MS = 1500;
    const check = () => {
      const stale = phase === 'playing' && Date.now() - S.current.lastGameStateAt > STALE_AFTER_MS;
      setConnectionStale(stale);
    };
    const id = setInterval(check, 400);
    return () => clearInterval(id);
  }, [isP1, phase]);

  // All mutable game state in a single object ref — never triggers re-renders.
  // balls is always an array (even with exactly one ball in play today) so a
  // future multiply-ball power is "append another entry," not a second data
  // shape bolted on afterward — every consumer below already iterates it.
  const S = useRef({
    balls: [{ id: 0, x: W / 2, y: H / 2, vx: 0, vy: 0 }],
    myPaddle: W / 2,
    remotePaddle: W / 2,
    // Dead-reckoning anchors for the OTHER player's paddle — {x, vx, t}.
    // remotePaddleAnchor: P1's view of P2 (collision-critical — see the
    // BASE_HIT_TOLERANCE block above). localP1Anchor: P2/spectator's view of
    // P1 (visual smoothness only, P2 never runs collision detection).
    remotePaddleAnchor: { x: W / 2, vx: 0, t: Date.now() },
    localP1Anchor: { x: W / 2, vx: 0, t: Date.now() },
    // Outgoing-velocity trackers for estimateSendVelocity — separate from the
    // anchors above since these track MY OWN paddle at the moment I send it,
    // not what I've received from the other side.
    p1SendTrack: { x: W / 2, t: 0 },
    p2SendTrack: { x: W / 2, t: 0 },
    // Local latch: set the instant a goal is detected locally (P1 only, the
    // physics authority), cleared once the server confirms via a phase
    // transition. Needed to bridge the round-trip gap — without it, the next
    // frame would still see the ball past the goal line and re-fire the same
    // goal event again before the server ever hears about the first one.
    pendingGoal: false,
    lastKnownPhase: phase,
    lastTouch: null, // 'p1' | 'p2' | null — tracks who last hit the ball for no-walls scoring
    // P2 extrapolation anchors (updated from gameState prop changes), one per ball
    syncAnchors: [{ id: 0, x: W / 2, y: H / 2, vx: 0, vy: 0, t: Date.now() }],
    frameCount: 0,
    lastTime: 0,
    lastPaddleSend: 0,
    buttonDir: 0, // -1 = left, 0 = none, 1 = right — directional-button control
    // Pickups: P1's locally-authoritative list (same self-reporting model as
    // ball physics). [{id, type, x, y, spawnedAt}]. P2/spectators just read
    // gsRef.current.pickups directly at draw time — no local copy needed.
    pickups: [],
    nextPickupId: 0,
    nextPickupSpawnAt: 0, // set on the first playing-phase frame
    // Sound bookkeeping — P2/spectators infer hit/bounce/pickup sounds from
    // what changed between consecutive relayed states (no new backend fields
    // needed); P1 always has direct, immediate knowledge from its own physics.
    justServedLocally: false, // set in handleServeTap, consumed once in the sync effect so the actual server never hears their own serve sound twice
    knownPickupIds: new Set(),
    knownEffectExpiresAt: null,
    // Last time gameState actually changed — used for the connection-
    // staleness indicator below (P2/spectator side only; see its own
    // comment for why P1 doesn't have an equally reliable version of this).
    lastGameStateAt: Date.now(),
    // Read-only copies of ids — kept here so RAF callbacks don't close over stale prop values
    p1Id, p2Id, myId, isP1, isP2,
  });

  // Sync the latest gameState from props into our ref for RAF callbacks to read.
  const gsRef = useRef(gs);
  useEffect(() => {
    gsRef.current = gameState?.game_state || {};
    const gsCurrent = gsRef.current;
    const s = S.current;
    s.lastGameStateAt = Date.now();
    const prevPhase = s.lastKnownPhase;
    s.lastKnownPhase = gsCurrent.phase;
    const justEnteredPlaying = prevPhase !== 'playing' && gsCurrent.phase === 'playing';
    const justEnteredServing = prevPhase !== 'serving' && gsCurrent.phase === 'serving';

    if (isP1) {
      // P1: update remote (P2) paddle from WS relay — both the raw last-known
      // value (kept for anything simpler that still wants it) and the
      // dead-reckoning anchor the collision check + draw() actually use.
      if (gsCurrent.p2x != null) {
        s.remotePaddle = gsCurrent.p2x;
        s.remotePaddleAnchor = { x: gsCurrent.p2x, vx: gsCurrent.p2vx || 0, t: Date.now() };
      }
      // Just served (initial serve, or after a goal + tap) — adopt the
      // server-authoritative served ball(s) exactly once, at the transition
      // edge. This is the only place the physics-authority client's ball
      // state ever gets reset from the network, replacing the old
      // "optimistic local reset, then a second server-confirmed reset"
      // double-pop with a single, deliberate handoff.
      if (justEnteredPlaying) {
        const serverBalls = Array.isArray(gsCurrent.balls) ? gsCurrent.balls : [];
        s.balls = serverBalls.length > 0
          ? serverBalls.map(b => ({ id: b.id ?? 0, x: b.x ?? W / 2, y: b.y ?? H / 2, vx: b.vx ?? 0, vy: b.vy ?? 0 }))
          : [{ id: 0, x: W / 2, y: H / 2, vx: 0, vy: 0 }];
        s.pendingGoal = false;
        s.lastTouch = null;
        // A fresh rally — the backend already clears pickups/effects on the
        // goal that led here; keep P1's local pickup list in sync so it
        // doesn't keep offering up pickups from the previous rally.
        s.pickups = [];
        s.nextPickupSpawnAt = Date.now() + PICKUP_SPAWN_MIN_MS + Math.random() * (PICKUP_SPAWN_MAX_MS - PICKUP_SPAWN_MIN_MS);
      }
    } else {
      // P2 / spectator: update extrapolation anchors from relayed state.
      // Goal sound: P1 always plays it directly, the instant it detects a
      // goal in its own physics loop — this branch is the ONLY place it fires
      // for everyone else, so no double-play guard is needed here. Haptic
      // gated on isP2 specifically (not just !isP1) — a spectator watching
      // shouldn't feel their phone buzz for a game they're not playing.
      if (justEnteredServing) {
        playPingPongSound('goal', { volume: 0.55 });
        if (s.isP2) hapticImpact([20, 40, 20]);
      }

      if (gsCurrent.p1x != null) {
        s.remotePaddle = gsCurrent.p1x;
        s.localP1Anchor = { x: gsCurrent.p1x, vx: gsCurrent.p1vx || 0, t: Date.now() };
      }
      if (gsCurrent.phase === 'playing' && Array.isArray(gsCurrent.balls)) {
        const now = Date.now();
        // Infer hit/bounce sounds from what changed since the last sync —
        // P2/spectators have no local physics of their own to hook a sound
        // to directly. A paddle hit always flips vy's sign in this game's
        // physics (paddles are strictly top/bottom); a side-wall bounce
        // flips vx without touching vy at all. That's not a fuzzy heuristic —
        // it's the exact rule the physics itself already follows.
        for (const b of gsCurrent.balls) {
          const prevAnchor = s.syncAnchors.find(a => a.id === (b.id ?? 0));
          if (prevAnchor && prevAnchor.vy !== 0 && b.vy != null && Math.sign(b.vy) !== Math.sign(prevAnchor.vy)) {
            const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
            const isSmash = speed >= MAX_SPEED * SMASH_SPEED_THRESHOLD_RATIO;
            playPingPongSound(isSmash ? 'smash_hit' : 'paddle_hit', { volume: 0.4, rate: 0.95 + Math.random() * 0.1 });
            if (s.isP2) hapticImpact(isSmash ? [25, 15, 25] : 15);
          } else if (prevAnchor && prevAnchor.vx !== 0 && b.vx != null && Math.sign(b.vx) !== Math.sign(prevAnchor.vx)) {
            playPingPongSound('wall_bounce', { volume: 0.3, rate: 0.95 + Math.random() * 0.1 });
          }
        }
        s.syncAnchors = gsCurrent.balls.map(b => ({
          id: b.id ?? 0, x: b.x ?? W / 2, y: b.y ?? H / 2, vx: b.vx ?? 0, vy: b.vy ?? 0, t: now,
        }));
      }
    }

    // Serve sound — shared: either role can hold serve. Whoever actually
    // tapped already heard it instantly via handleServeTap's optimistic
    // play; this only needs to cover the OTHER player hearing the confirmed
    // serve arrive over the network.
    if (justEnteredPlaying) {
      if (s.justServedLocally) s.justServedLocally = false;
      else playPingPongSound('serve', { volume: 0.4 });
    }

    // Pickup spawn / grab / effect-activation inference — only P1 can ever
    // detect these directly (only P1 runs collision detection at all, for
    // any pickup regardless of who benefits from it), and does so instantly
    // in the physics loop below. This block exists purely to cover
    // P2/spectators, who have no local pickup simulation of their own —
    // gating it on !isP1 is what prevents P1 from also hearing its own
    // already-instant spawn/grab sounds a second time once the round-trip
    // confirmation arrives.
    if (!isP1) {
      const pickups = Array.isArray(gsCurrent.pickups) ? gsCurrent.pickups : [];
      const currentIds = new Set(pickups.map(p => p.id));
      for (const p of pickups) {
        if (!s.knownPickupIds.has(p.id)) playPingPongSound('pickup_spawn', { volume: 0.3 });
      }
      s.knownPickupIds = currentIds;

      const eff = gsCurrent.active_effect;
      const effKey = eff ? eff.expires_at : null;
      if (effKey && effKey !== s.knownEffectExpiresAt) {
        const iAmTarget = eff.target_player === s.myId;
        playPingPongSound('pickup_grab', { volume: 0.45 });
        if (s.isP2) hapticImpact(10);
        const effectSound = eff.type === 'freeze' ? 'effect_freeze' : eff.type === 'slow' ? 'effect_slow' : 'effect_ghost';
        playPingPongSound(effectSound, { volume: iAmTarget ? 0.6 : 0.4 });
        // Only the player it's actually happening TO feels it — hearing that
        // your opponent got debuffed shouldn't buzz your own phone.
        if (s.isP2 && iAmTarget) hapticImpact([10, 50, 10, 50, 10]);
      }
      s.knownEffectExpiresAt = effKey;
    }
  }, [gameState, isP1]);

  // Draw one frame onto the canvas.
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const s = S.current;
    const gsCurrent = gsRef.current;
    const curPhase = gsCurrent.phase || 'serving';
    const nowDraw = Date.now();

    // Table background
    ctx.fillStyle = '#14532d';
    ctx.fillRect(0, 0, W, H);

    // Centre line (dashed)
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 10]);
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
    ctx.setLineDash([]);

    // Table border
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 3;
    ctx.strokeRect(6, 6, W - 12, H - 12);

    // P1 paddle (blue, top) — non-P1 viewers see the dead-reckoned position
    // (visual smoothness only; P2/spectators never run collision detection).
    const p1x = s.isP1 ? s.myPaddle : extrapolatePaddleX(s.localP1Anchor, nowDraw).x;
    ctx.beginPath();
    ctx.roundRect(p1x - PAD_W / 2, P1_CY - PAD_H / 2, PAD_W, PAD_H, 6);
    ctx.fillStyle = '#3b82f6'; ctx.fill();
    ctx.strokeStyle = '#93c5fd'; ctx.lineWidth = 2; ctx.stroke();

    // P2 paddle (red, bottom) — P1 draws the SAME dead-reckoned position its
    // own collision check uses, so what the host sees matches what actually
    // determines a hit.
    const p2x = s.isP2 ? s.myPaddle : extrapolatePaddleX(s.remotePaddleAnchor, nowDraw).x;
    ctx.beginPath();
    ctx.roundRect(p2x - PAD_W / 2, P2_CY - PAD_H / 2, PAD_W, PAD_H, 6);
    ctx.fillStyle = '#ef4444'; ctx.fill();
    ctx.strokeStyle = '#fca5a5'; ctx.lineWidth = 2; ctx.stroke();

    // Player name labels on their paddle
    ctx.font = '11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(s.isP1 ? 'You' : s.p1Id, p1x, P1_CY - PAD_H / 2 - 5);
    ctx.fillText(s.isP2 ? 'You' : s.p2Id, p2x, P2_CY + PAD_H / 2 + 14);

    // Power-up pickups — P1 draws its own authoritative list; everyone else
    // draws whatever was last relayed (no local timer needed on their end).
    const pickupsToRender = curPhase === 'playing' ? (s.isP1 ? s.pickups : (gsCurrent.pickups || [])) : [];
    for (const p of pickupsToRender) {
      // Phase-offset by p.x so multiple pickups on screen at once don't all
      // pulse in lockstep — same trick already used for the glow ring below.
      const t = Date.now() / 180 + p.x;
      const pulse = 1 + 0.15 * Math.sin(t);
      const glowAlpha = 0.28 + 0.24 * (0.5 + 0.5 * Math.sin(t)); // breathes between ~0.16 and ~0.52
      const color = PICKUP_COLOR[p.type] || '#fff';

      ctx.beginPath();
      ctx.arc(p.x, p.y, PICKUP_R * pulse, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.globalAlpha = glowAlpha;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Icon itself scales with the same pulse (previously only the outer
      // glow ring pulsed — the icon sat at a fixed size, making the effect
      // easy to miss).
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(pulse, pulse);
      ctx.translate(-p.x, -p.y);
      drawPickupIcon(ctx, p.type, p.x, p.y, PICKUP_R);
      ctx.restore();

      // Name label underneath, so players don't need to already know what
      // each icon means at a glance.
      const label = PICKUP_LABEL[p.type];
      if (label) {
        ctx.font = 'bold 9px system-ui';
        ctx.textAlign = 'center';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.75)';
        ctx.strokeText(label, p.x, p.y + PICKUP_R * pulse + 12);
        ctx.fillStyle = color;
        ctx.fillText(label, p.x, p.y + PICKUP_R * pulse + 12);
      }
    }

    // Invisible-ball effect: skip drawing the ball entirely for whichever
    // player it targets — physics/collision are completely unaffected, this
    // is purely a render-time omission.
    const activeEff = gsCurrent.active_effect;
    const ballHiddenFromMe = activeEff && Date.now() < activeEff.expires_at &&
      activeEff.type === 'invisible' && activeEff.target_player === s.myId;
    if (ballHiddenFromMe && curPhase === 'playing') return;

    // Ball position(s) — while serving, the single ball sits still right in
    // front of whoever has the serve (the paddle positions computed above),
    // not mid-table. Once playing, draw every ball currently in play (today
    // that's always exactly one; multiply-ball will just mean more entries).
    let ballPositions;
    if (curPhase === 'serving') {
      const serveByP1 = String(gsCurrent.serve_by || '') === s.p1Id;
      ballPositions = serveByP1
        ? [{ x: p1x, y: P1_CY + PAD_H / 2 + BALL_R + 6 }]
        : [{ x: p2x, y: P2_CY - PAD_H / 2 - BALL_R - 6 }];
    } else if (s.isP1) {
      ballPositions = s.balls.map(b => ({ x: b.x, y: b.y }));
    } else {
      // Extrapolate forward from last sync anchors (capped at 200 ms to avoid runaway)
      const now = Date.now();
      ballPositions = s.syncAnchors.map(a => {
        const elapsed = Math.min((now - a.t) / 1000, 0.2);
        return { x: a.x + a.vx * elapsed, y: a.y + a.vy * elapsed };
      });
    }

    for (const { x: bx, y: by } of ballPositions) {
      const grad = ctx.createRadialGradient(bx - 2, by - 2, 1, bx, by, BALL_R);
      grad.addColorStop(0, '#fef08a');
      grad.addColorStop(1, '#ca8a04');
      ctx.beginPath(); ctx.arc(bx, by, BALL_R, 0, Math.PI * 2);
      ctx.fillStyle = grad; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();

      // Pulsing highlight ring while the ball is waiting to be served — draws
      // the eye to exactly what needs tapping.
      if (curPhase === 'serving') {
        const pulse = 1 + 0.25 * Math.sin(Date.now() / 220);
        ctx.beginPath();
        ctx.arc(bx, by, BALL_R * 1.8 * pulse, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(253,224,71,0.55)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }
  }, []); // no deps — reads from refs at call time

  // P1's physics + sync loop
  useEffect(() => {
    if (!isP1) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const s = S.current;

    let rafId;
    function loop(time) {
      const dt = Math.min((time - (s.lastTime || time)) / 1000, 0.05);
      s.lastTime = time;
      s.frameCount++;
      const gsCurrent = gsRef.current;
      const now = Date.now();

      // Active power-up effect, read fresh from the ref every frame (never
      // from a closed-over prop) so it's never stale for longer than one tick.
      const eff = gsCurrent.active_effect;
      const effLive = eff && now < eff.expires_at;
      const iAmFrozen = effLive && eff.type === 'freeze' && eff.target_player === s.myId;
      const iAmSlowed = effLive && eff.type === 'slow' && eff.target_player === s.myId;

      // Directional-button paddle movement — works during serving too, so
      // players can line up before the point actually starts. Frozen blocks
      // it entirely; slowed just cuts the speed.
      if (s.buttonDir !== 0 && !iAmFrozen) {
        const speed = PADDLE_BTN_SPEED * (iAmSlowed ? SLOW_MULTIPLIER : 1);
        s.myPaddle = Math.max(PAD_W / 2, Math.min(W - PAD_W / 2, s.myPaddle + s.buttonDir * speed * dt));
      }

      if (gsCurrent.phase === 'playing' && !s.pendingGoal) {
        const noWalls = !!gsCurrent.no_walls;

        // Pickup spawn/despawn — P1-authoritative, relayed via state_sync
        // below (same trust model as ball physics itself).
        if (s.pickups.length < PICKUP_MAX_COUNT && now >= s.nextPickupSpawnAt) {
          const type = PICKUP_TYPES[Math.floor(Math.random() * PICKUP_TYPES.length)];
          const pos = randomPickupPosition();
          s.pickups.push({ id: `pu${s.nextPickupId++}`, type, x: pos.x, y: pos.y, spawnedAt: now });
          s.nextPickupSpawnAt = now + PICKUP_SPAWN_MIN_MS + Math.random() * (PICKUP_SPAWN_MAX_MS - PICKUP_SPAWN_MIN_MS);
          playPingPongSound('pickup_spawn', { volume: 0.3 });
        }
        if (s.pickups.length > 0) {
          s.pickups = s.pickups.filter(p => now - p.spawnedAt < PICKUP_DESPAWN_MS);
        }

        // Multiply-ball note: with more than one ball in play, the FIRST one
        // to cross a goal line ends the rally immediately — the others are
        // discarded (not individually resolved), so this loop bails via
        // `goalScorer` the moment any ball triggers one, same as the old
        // single-ball code just did implicitly.
        let goalScorer = null;
        for (const b of s.balls) {
          b.x += b.vx * dt;
          b.y += b.vy * dt;

          // Side walls: bounce normally, OR exit and score if no-walls is active.
          // A side exit only scores if someone has already touched the ball
          // (lastTouch is set) — on a fresh serve the ball can clip a wall
          // without attributing blame.
          if (noWalls && s.lastTouch !== null) {
            if (b.x < BALL_R || b.x > W - BALL_R) {
              goalScorer = s.lastTouch === 'p1' ? s.p2Id : s.p1Id;
              break;
            }
          } else {
            if (b.x < BALL_R) { b.x = BALL_R; b.vx = Math.abs(b.vx); playPingPongSound('wall_bounce', { volume: 0.35, rate: 0.95 + Math.random() * 0.1 }); }
            if (b.x > W - BALL_R) { b.x = W - BALL_R; b.vx = -Math.abs(b.vx); playPingPongSound('wall_bounce', { volume: 0.35, rate: 0.95 + Math.random() * 0.1 }); }
          }

          // P1 paddle collision (ball moving UP — vy < 0). s.myPaddle is
          // always instantly fresh (same process), so no staleness forgiveness
          // needed here — just the flat BASE_HIT_TOLERANCE.
          if (b.vy < 0 && b.y - BALL_R <= P1_CY + PAD_H / 2 && b.y + BALL_R >= P1_CY - PAD_H / 2) {
            const hit = (b.x - s.myPaddle) / (PAD_W / 2);
            if (Math.abs(hit) <= BASE_HIT_TOLERANCE) {
              s.lastTouch = 'p1';
              b.y = P1_CY + PAD_H / 2 + BALL_R + 1;
              const speed = Math.min(Math.abs(b.vy) * SPEED_UP, MAX_SPEED);
              b.vx = hit * speed * MAX_VX_RATIO;
              b.vy = speed;
              const isSmash = speed >= MAX_SPEED * SMASH_SPEED_THRESHOLD_RATIO;
              playPingPongSound(isSmash ? 'smash_hit' : 'paddle_hit', { volume: 0.5, rate: 0.95 + Math.random() * 0.1 });
              hapticImpact(isSmash ? [25, 15, 25] : 15);
            }
          }

          // P2 paddle collision (ball moving DOWN — vy > 0). P2's paddle
          // position is only as fresh as the last paddle_move that made the
          // round trip — dead-reckon it forward from its last known
          // position+velocity, and widen the hit window proportionally to how
          // stale that reckoning is (see the BASE_HIT_TOLERANCE block up top).
          if (b.vy > 0 && b.y + BALL_R >= P2_CY - PAD_H / 2 && b.y - BALL_R <= P2_CY + PAD_H / 2) {
            const { x: remoteX, elapsedS } = extrapolatePaddleX(s.remotePaddleAnchor, now);
            const tolerance = BASE_HIT_TOLERANCE + MAX_EXTRA_HIT_FORGIVENESS * (elapsedS / REMOTE_PADDLE_EXTRAPOLATION_CAP_S);
            const hit = (b.x - remoteX) / (PAD_W / 2);
            if (Math.abs(hit) <= tolerance) {
              s.lastTouch = 'p2';
              b.y = P2_CY - PAD_H / 2 - BALL_R - 1;
              const speed = Math.min(Math.abs(b.vy) * SPEED_UP, MAX_SPEED);
              b.vx = hit * speed * MAX_VX_RATIO;
              b.vy = -speed;
              const isSmash = speed >= MAX_SPEED * SMASH_SPEED_THRESHOLD_RATIO;
              playPingPongSound(isSmash ? 'smash_hit' : 'paddle_hit', { volume: 0.5, rate: 0.95 + Math.random() * 0.1 });
              hapticImpact(isSmash ? [25, 15, 25] : 15);
            }
          }

          // Pickup collision — whoever most recently touched the ball is the
          // one "driving" it, so they're the beneficiary; the debuff lands on
          // their opponent. A fresh, never-touched serve defaults to the
          // server (they're the one who put the ball in play).
          if (s.pickups.length > 0) {
            for (const p of s.pickups) {
              const dx = b.x - p.x, dy = b.y - p.y;
              if (dx * dx + dy * dy < (BALL_R + PICKUP_R) ** 2) {
                const beneficiary = s.lastTouch === 'p1' ? s.p1Id
                  : s.lastTouch === 'p2' ? s.p2Id
                  : (gsCurrent.serve_by || s.p1Id);
                const target = beneficiary === s.p1Id ? s.p2Id : s.p1Id;
                s.pickups = s.pickups.filter(other => other.id !== p.id);
                onMove({ move_type: 'grab_pickup', pickup_id: p.id, effect_type: p.type, target_player: target });
                playPingPongSound('pickup_grab', { volume: 0.45 });
                hapticImpact(10);
                const effectSound = p.type === 'freeze' ? 'effect_freeze' : p.type === 'slow' ? 'effect_slow' : 'effect_ghost';
                playPingPongSound(effectSound, { volume: target === s.myId ? 0.6 : 0.4 });
                // Only the player it's actually happening TO feels it.
                if (target === s.myId) hapticImpact([10, 50, 10, 50, 10]);
                break; // at most one pickup per ball per frame
              }
            }
          }

          // Goal detection (top/bottom edges) — no local ball reset here; the
          // ball just stops updating (frozen wherever it exited) since the
          // "serving" phase's UI takes over the visual entirely once the
          // server confirms.
          if (b.y < -BALL_R) { goalScorer = s.p2Id; break; }
          if (b.y > H + BALL_R) { goalScorer = s.p1Id; break; }
        }

        if (goalScorer) {
          s.pendingGoal = true;
          playPingPongSound('goal', { volume: 0.55 });
          hapticImpact([20, 40, 20]);
          onMove({ move_type: 'goal', scorer_id: goalScorer });
        } else if (s.frameCount % SYNC_EVERY === 0) {
          // Throttled state sync to P2
          onMove({
            move_type: 'state_sync',
            balls: s.balls.map(b => ({ id: b.id, x: b.x, y: b.y, vx: b.vx, vy: b.vy })),
            pickups: s.pickups.map(p => ({ id: p.id, type: p.type, x: p.x, y: p.y })),
            p1x: s.myPaddle,
            p1vx: estimateSendVelocity(s.p1SendTrack, s.myPaddle, now),
          });
        }
      } else if (gsCurrent.phase === 'serving' && s.frameCount % SYNC_EVERY === 0) {
        // Still relay paddle position during the serving pause, so the other
        // player can see P1 lining up before the point starts.
        onMove({
          move_type: 'state_sync',
          balls: s.balls.map(b => ({ id: b.id, x: b.x, y: b.y, vx: 0, vy: 0 })),
          p1x: s.myPaddle,
          p1vx: estimateSendVelocity(s.p1SendTrack, s.myPaddle, now),
        });
      }

      draw();
      rafId = requestAnimationFrame(loop);
    }

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [isP1, draw, onMove]); // stable — onMove/draw don't change

  // P2 / spectator loop — no ball physics (P1 is the sole physics authority),
  // but still needs its own per-frame tick for directional-button movement.
  useEffect(() => {
    if (isP1) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const s = S.current;
    let rafId;
    let lastTime = 0;
    function loop(time) {
      const dt = Math.min((time - (lastTime || time)) / 1000, 0.05);
      lastTime = time;
      const now = Date.now();
      if (isP2 && s.buttonDir !== 0) {
        const eff = gsRef.current.active_effect;
        const effLive = eff && now < eff.expires_at;
        const iAmFrozen = effLive && eff.type === 'freeze' && eff.target_player === s.myId;
        const iAmSlowed = effLive && eff.type === 'slow' && eff.target_player === s.myId;
        if (!iAmFrozen) {
          const speed = PADDLE_BTN_SPEED * (iAmSlowed ? SLOW_MULTIPLIER : 1);
          s.myPaddle = Math.max(PAD_W / 2, Math.min(W - PAD_W / 2, s.myPaddle + s.buttonDir * speed * dt));
          if (now - s.lastPaddleSend > PADDLE_SEND_MS) {
            const vx = estimateSendVelocity(s.p2SendTrack, s.myPaddle, now);
            s.lastPaddleSend = now;
            onMove({ move_type: 'paddle_move', p2x: s.myPaddle, p2vx: vx });
          }
        }
      }
      draw();
      rafId = requestAnimationFrame(loop);
    }
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [isP1, isP2, draw, onMove]);

  // Pointer / touch drag control — updates my own paddle and sends to opponent
  const handlePointerMove = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = W / rect.width;
    const clientX = e.touches ? e.touches[0]?.clientX : e.clientX;
    if (clientX == null) return;
    const target = Math.max(PAD_W / 2, Math.min(W - PAD_W / 2, (clientX - rect.left) * scaleX));

    const s = S.current;
    const now = Date.now();
    const eff = gsRef.current.active_effect;
    const effLive = eff && now < eff.expires_at;
    const iAmFrozen = effLive && eff.type === 'freeze' && eff.target_player === s.myId;
    const iAmSlowed = effLive && eff.type === 'slow' && eff.target_player === s.myId;
    if (iAmFrozen) return; // paddle ignores input entirely while frozen

    // Slowed: ease toward the pointer instead of snapping to it — makes the
    // paddle visibly lag rather than just teleporting at reduced frequency.
    // Unaffected: snap straight to the pointer, same as before.
    s.myPaddle = iAmSlowed ? s.myPaddle + (target - s.myPaddle) * SLOW_DRAG_EASE : target;

    if (isP2) {
      if (now - s.lastPaddleSend > PADDLE_SEND_MS) {
        const vx = estimateSendVelocity(s.p2SendTrack, s.myPaddle, now);
        s.lastPaddleSend = now;
        onMove({ move_type: 'paddle_move', p2x: s.myPaddle, p2vx: vx });
      }
    }
  }, [isP2, onMove]);

  // Tap-to-serve — tapping anywhere on the table serves when it's your turn;
  // a no-op otherwise. The dedicated "Tap to Serve" button (below) fires the
  // same handler for a more discoverable, explicit affordance.
  const handleServeTap = useCallback(() => {
    if (!isMyServe) return;
    const s = S.current;
    // Instant local feedback for whoever actually tapped — the sync effect's
    // `justServedLocally` guard is what stops this same player from hearing
    // the confirmed round-trip play a second copy of the same sound.
    s.justServedLocally = true;
    playPingPongSound('serve', { volume: 0.5 });
    if (isP1) {
      // Optimistic local launch — P1 is the physics authority, so don't make
      // them wait on their own round-trip before the rally visibly starts.
      s.balls = [{ id: 0, x: W / 2, y: H / 2, vx: 50, vy: -260 }]; // P1 always serves upward, toward their own side
      s.lastKnownPhase = 'playing';
      s.pendingGoal = false;
      s.lastTouch = null;
      s.pickups = [];
      s.nextPickupSpawnAt = Date.now() + PICKUP_SPAWN_MIN_MS + Math.random() * (PICKUP_SPAWN_MAX_MS - PICKUP_SPAWN_MIN_MS);
    }
    onMove({ move_type: 'serve' });
  }, [isMyServe, isP1, onMove]);

  // Directional-button paddle control (mobile).
  const startButtonMove = useCallback((dir) => { S.current.buttonDir = dir; }, []);
  const stopButtonMove = useCallback(() => { S.current.buttonDir = 0; }, []);

  const p1Score = scores[p1Id] || 0;
  const p2Score = scores[p2Id] || 0;

  // Active power-up effect status, for the small banner below. Prop-derived
  // (refreshes on every state_sync-driven re-render, ~10/sec while playing —
  // frequent enough for a status banner; the actual gameplay enforcement
  // inside the RAF loops/draw() always re-checks the live timestamp fresh
  // every frame regardless of render timing, so this is display-only).
  const activeEffect = gs.active_effect;
  const activeEffectLive = activeEffect && Date.now() < activeEffect.expires_at;
  const iAmAffected = activeEffectLive && activeEffect.target_player === myId;
  const opponentAffected = activeEffectLive && !iAmAffected && (activeEffect.target_player === p1Id || activeEffect.target_player === p2Id);

  // Winner: the backend's own authoritative winner_id (set by both a normal
  // win and a mid-game rt_end forfeit) — matches every other game's pattern
  // in this codebase, rather than re-deriving it from scores here.
  const winner = gameState?.winner_id
    ? (players || []).find(p => p.user_id === gameState.winner_id) || null
    : null;
  const gameStats = {
    lines: [
      { label: p1Name, value: `${p1Score} pts` },
      { label: p2Name, value: `${p2Score} pts` },
      { label: 'Rallies', value: String(rally) },
    ],
  };

  const handleEndGame = () => onMove({ move_type: 'rt_end' });

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950 text-white select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-700 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-lg">🏓</span>
          <div>
            <h2 className="text-sm font-bold text-blue-300 leading-tight">Ping Pong{noWallsActive ? ' · No Walls' : ''}</h2>
            <p className="text-xs text-gray-400">First to {winScore} · Rally {rally}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Score */}
          <div className="flex items-center gap-2 text-lg font-black">
            <span className="text-blue-400">{p1Score}</span>
            <span className="text-gray-500 text-sm">vs</span>
            <span className="text-red-400">{p2Score}</span>
          </div>
          <button
            onClick={() => setSoundEnabled(v => !v)}
            className="p-1 hover:text-gray-300 text-gray-500"
            title={soundEnabled ? 'Mute sounds' : 'Unmute sounds'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          <GameRulesButton gameType="ping_pong" className="text-gray-400 hover:text-white" />
          {(isP1 || isP2) && !isEnded && (
            <button onClick={handleEndGame} className="px-2 py-1 text-xs bg-red-700 hover:bg-red-600 rounded font-medium">End Game</button>
          )}
          <button onClick={isP1 || isP2 ? (isEnded ? onClose : handleEndGame) : onClose} className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded">✕</button>
        </div>
      </div>

      {/* Player labels */}
      <div className="flex justify-between px-4 pt-1 pb-0.5 shrink-0 text-xs">
        <span className={`font-semibold ${isP1 ? 'text-blue-300' : 'text-blue-400/70'}`}>{p1Name} {isP1 ? '(You ↑)' : '↑'}</span>
        <span className={`font-semibold ${isP2 ? 'text-red-300' : 'text-red-400/70'}`}>{isP2 ? '(You ↓) ' : '↓ '}{p2Name}</span>
      </div>

      {/* Active power-up status */}
      {activeEffectLive && (isP1 || isP2) && (
        <div className={`text-center text-xs font-semibold py-1 shrink-0 ${
          iAmAffected ? 'bg-red-900/60 text-red-200' : opponentAffected ? 'bg-green-900/60 text-green-200' : 'hidden'
        }`}>
          {PICKUP_EMOJI[activeEffect.type]} {iAmAffected
            ? EFFECT_MESSAGE[activeEffect.type]?.mine
            : EFFECT_MESSAGE[activeEffect.type]?.opp}
        </div>
      )}

      {/* Connection-unstable notice — see the connectionStale effect's own
          comment for why this is P2/spectator-only. A thin bar rather than a
          blocking overlay: the game itself keeps rendering (frozen at its
          last known position via the extrapolation cap) underneath, this
          just tells the player WHY, instead of an unexplained freeze. */}
      {connectionStale && (
        <div className="text-center text-xs font-semibold py-1 shrink-0 bg-amber-900/70 text-amber-200 animate-pulse">
          ⚠️ Connection unstable — reconnecting…
        </div>
      )}

      {/* Canvas — fills remaining space with aspect ratio preserved */}
      <div className="flex-1 min-h-0 relative flex items-center justify-center overflow-hidden px-2 py-1">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          onMouseMove={handlePointerMove}
          onTouchMove={handlePointerMove}
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            width: 'auto',
            height: 'auto',
            aspectRatio: `${W} / ${H}`,
            cursor: 'none',
            touchAction: 'none',
            display: 'block',
          }}
        />

        {/* Serving pause — replaces the old instant/flickery goal flash with a
            real, held state: shows the score, then either a tap-to-serve
            prompt (your turn) or a wait message (opponent's turn).
            This overlay covers the whole canvas (absolute inset-0), so it's
            the ONLY thing that can ever receive a tap while it's showing —
            the canvas's own onClick underneath is unreachable the entire
            time this is visible. The handler therefore lives on THIS outer
            div (whenever it's your serve, the entire panel is one big tap
            target, not just the small button) rather than relying on the
            canvas's tap-anywhere handler, which never actually fires here. */}
        {isServing && !isEnded && (
          <div
            className={`absolute inset-0 z-10 flex items-center justify-center bg-black/50 ${isMyServe ? 'cursor-pointer' : ''}`}
            onClick={isMyServe ? handleServeTap : undefined}
            onTouchStart={isMyServe ? (e) => { e.preventDefault(); handleServeTap(); } : undefined}
          >
            <div className="bg-gray-900/95 border border-gray-700 rounded-2xl px-6 py-5 text-center shadow-2xl mx-4">
              {rally > 0 ? (
                <p className="text-yellow-300 font-black text-xl mb-1">⚡ Goal! {serverName} scores</p>
              ) : (
                <p className="text-blue-300 font-black text-xl mb-1">🏓 Get Ready!</p>
              )}
              <p className="text-gray-300 text-lg font-bold mb-3">{p1Score} – {p2Score}</p>
              {isMyServe ? (
                <button className="px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-white animate-pulse pointer-events-none">
                  Tap to Serve
                </button>
              ) : (
                <p className="text-gray-400 text-sm">Waiting for {serverName} to serve…</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Mobile directional paddle buttons */}
      {isTouchDevice && (isP1 || isP2) && !isEnded && (
        <div className="flex items-center justify-center gap-6 py-3 bg-gray-900 border-t border-gray-800 shrink-0">
          <button
            onMouseDown={() => startButtonMove(-1)}
            onMouseUp={stopButtonMove}
            onMouseLeave={stopButtonMove}
            onTouchStart={(e) => { e.preventDefault(); startButtonMove(-1); }}
            onTouchEnd={(e) => { e.preventDefault(); stopButtonMove(); }}
            className="w-16 h-16 flex items-center justify-center text-2xl bg-gray-800 hover:bg-gray-700 active:bg-blue-700 rounded-full border border-gray-600 select-none"
            aria-label="Move paddle left"
          >
            ◀
          </button>
          <button
            onMouseDown={() => startButtonMove(1)}
            onMouseUp={stopButtonMove}
            onMouseLeave={stopButtonMove}
            onTouchStart={(e) => { e.preventDefault(); startButtonMove(1); }}
            onTouchEnd={(e) => { e.preventDefault(); stopButtonMove(); }}
            className="w-16 h-16 flex items-center justify-center text-2xl bg-gray-800 hover:bg-gray-700 active:bg-blue-700 rounded-full border border-gray-600 select-none"
            aria-label="Move paddle right"
          >
            ▶
          </button>
        </div>
      )}

      {/* Game over — shared winner banner (stats: score + rallies), same as every other game */}
      {isEnded && (
        <GameWinnerBanner
          winner={winner}
          players={players}
          gameType="ping_pong"
          gameStats={gameStats}
          onClose={onClose}
          onPostResult={onPostResult}
          secondaryAction={(gameState?.host_id ?? players?.[0]?.user_id) === currentUserId && onPlayAgain ? { label: 'Play Again 🔄', onClick: onPlayAgain } : undefined}
        />
      )}

      {/* "Waiting — you're a spectator" hint */}
      {!isP1 && !isP2 && !isEnded && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 text-gray-300 text-xs px-3 py-1.5 rounded-full pointer-events-none">
          👀 Spectating
        </div>
      )}
    </div>
  );
}
