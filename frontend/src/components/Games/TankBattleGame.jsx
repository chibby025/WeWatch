import React, { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { X, Volume2, VolumeX, ZoomIn, ZoomOut } from 'lucide-react';
import GameWinnerBanner from './GameWinnerBanner';
import GameRulesButton from './GameRulesButton';
import ControlsTutorialOverlay from './ControlsTutorialOverlay';

// Tank Battle — genuine real-time free-for-all PvP (2-8 players). Every tank
// is symmetric and self-controlled: each client owns and self-reports its OWN
// tank's position/rotation/turret angle via state_sync at ~16Hz, and every
// client independently, identically simulates every bullet in play (fired by
// anyone) from a relayed origin/angle/speed — deterministic given the same
// physics constants, so no physics-authority round-trip is needed for bullets
// either. The one thing that DOES need a single source of truth is "did a
// shot land": the SHOOTER is authoritative over their own bullets, detects a
// collision locally against whichever target's last-known (extrapolated)
// position it actually struck, and reports it via a "hit" move — same trust
// level already accepted throughout this game package (see tank_battle.go).
// This same model is what let the game generalize cleanly from a strict 1v1
// duel to an N-player free-for-all: nothing about "I own my tank, the shooter
// judges their own shots" assumes exactly one opponent.

const SOUND_BASE = 'https://letswatchout.b-cdn.net/games/sounds/tank_battle';
const SOUND_FILES = {
  fire: `${SOUND_BASE}/fire.wav`,
  hit: `${SOUND_BASE}/hit.wav`,
  explosion: `${SOUND_BASE}/explosion.wav`,
  pickup: `${SOUND_BASE}/pickup.wav`,
  low_hp: `${SOUND_BASE}/low_hp_warning.wav`,
  wall_break: `${SOUND_BASE}/wall_break.wav`,
  victory: `${SOUND_BASE}/victory.wav`,
  defeat: `${SOUND_BASE}/defeat.wav`,
};
let tankBattleSoundEnabled = true;
function playTankSound(name, { volume = 0.5 } = {}) {
  if (!tankBattleSoundEnabled) return;
  const url = SOUND_FILES[name];
  if (!url) return;
  const audio = new Audio(url);
  audio.volume = Math.max(0, Math.min(1, volume));
  audio.play().catch(() => {});
}
function hapticImpact(pattern) {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(pattern);
  }
}
const isTouchDevice =
  typeof window !== 'undefined' && 'ontouchstart' in window && navigator.maxTouchPoints > 0;

// Logical arena size — matches the fixed aspect ratio the canvas is drawn at
// regardless of actual on-screen pixel size (scaled via CSS/transform).
// 2000x1200 (same 5:3 ratio as the original 800x480, 6.25x the area) gives
// up to 8 tanks real room to maneuver.
const W = 2000;
const H = 1200;
const TANK_R = 28;
const MAX_HP = 100;
const TANK_SPEED = 190; // px/sec
const BULLET_SPEED = 420; // px/sec
const BULLET_R = 4;
const FIRE_COOLDOWN_MS = 380;
const HIT_RADIUS = TANK_R * 0.95;
const STATE_SYNC_MS = 55; // ~18Hz

// Camera — always follows your own tank (unlike the old 2-player design,
// which only followed past zoom>1 and showed the whole tiny-by-comparison
// 800x480 arena by default). DEFAULT_VIEW_W/H is a fixed reference viewport
// size, independent of the full arena dimensions, so zoom=1 shows a
// reasonably tight "local combat" view (similar in feel to the old arena's
// full-screen view) with zooming out being how you see more of the wider
// free-for-all.
const DEFAULT_VIEW_W = 700;
const DEFAULT_VIEW_H = 420;
const ZOOM_MIN = 0.35;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.25;

// 8 fixed spawn points around the arena's perimeter — each player is
// assigned one by their index in gs.player_ids (stable for the match), so
// however many players actually join, they land as evenly spread as this
// fixed ordering allows rather than bunched into one corner.
const SPAWN_POINTS = [
  { x: 130, y: 600 }, // W
  { x: 1870, y: 600 }, // E
  { x: 1000, y: 130 }, // N
  { x: 1000, y: 1070 }, // S
  { x: 380, y: 280 }, // NW
  { x: 1620, y: 280 }, // NE
  { x: 380, y: 920 }, // SW
  { x: 1620, y: 920 }, // SE
];

// A distinct color per player index (stable for the match, not tied to
// "always blue/red" the way the old 2-player version was — that scheme
// doesn't generalize past 2 tanks). isSelf (drawTank) adds a thin white ring
// on top so you can always spot your own tank regardless of its color.
const TANK_COLOR_PALETTE = ['#3b82f6', '#ef4444', '#22c55e', '#eab308', '#a855f7', '#06b6d4', '#f97316', '#ec4899'];

// Obstacles — fixed, deterministic positions both/every client computes
// identically just by loading the same file, matching how bullet physics
// already needs zero network sync for its constants (see the file-level note
// above). Roughly symmetric (mirrored left-right and top-bottom) so no spawn
// side gets a positional advantage. Only each wall's remaining HP is ever
// server-tracked/broadcast (see tank_battle.go) — ids here must match the
// ids seeded in tankBattleInitialState exactly.
const WALL_MAX_HP = 60; // must match tankBattleWallMaxHP in tank_battle.go
const WALLS = [
  { id: 'w0', x: 940, y: 550, w: 120, h: 60 }, // center block
  { id: 'w1', x: 600, y: 574, w: 30, h: 52 }, // W-inner
  { id: 'w2', x: 1370, y: 574, w: 30, h: 52 }, // E-inner
  { id: 'w3', x: 970, y: 300, w: 60, h: 26 }, // N-inner
  { id: 'w4', x: 970, y: 874, w: 60, h: 26 }, // S-inner
  { id: 'w5', x: 730, y: 350, w: 56, h: 26 }, // NW
  { id: 'w6', x: 1214, y: 350, w: 56, h: 26 }, // NE
  { id: 'w7', x: 730, y: 824, w: 56, h: 26 }, // SW
  { id: 'w8', x: 1214, y: 824, w: 56, h: 26 }, // SE
  { id: 'w9', x: 480, y: 460, w: 26, h: 56 }, // outer W (north)
  { id: 'w10', x: 1494, y: 460, w: 26, h: 56 }, // outer E (north)
  { id: 'w11', x: 480, y: 684, w: 26, h: 56 }, // outer W (south)
  { id: 'w12', x: 1494, y: 684, w: 26, h: 56 }, // outer E (south)
];

// Power-ups — spawn timing/position/type are ALSO deterministic (elapsed
// time since match start, divided into fixed cycles), same reasoning as
// walls above: the only thing that genuinely needs a shared source of truth
// is WHO grabbed a given cycle's pickup (see grab_pickup in tank_battle.go)
// — never sync-needed for whether/where/what one currently exists. 3
// independent spawn points (each on its own cycle) means up to 3 pickups can
// be live on the map simultaneously — with 6-8 players competing over one
// bigger map, a single pickup at a time would barely matter.
const PICKUP_CYCLE_MS = 12000; // one pickup opportunity every 12s, per point
const PICKUP_TYPES = ['health', 'speed', 'shield', 'rapidfire', 'powershot'];
const PICKUP_SPAWN_POINTS = [
  { x: 1000, y: 440 },
  { x: 660, y: 600 },
  { x: 1340, y: 600 },
];
const PICKUP_R = 16;
const PICKUP_GRAB_RADIUS = TANK_R + PICKUP_R;
const PICKUP_META = {
  health: { color: '#22c55e', label: '+HP' },
  speed: { color: '#eab308', label: 'SPEED' },
  shield: { color: '#3b82f6', label: 'SHIELD' },
  rapidfire: { color: '#f97316', label: 'RAPID' },
  powershot: { color: '#a855f7', label: 'POWER' },
};
const SPEED_BOOST_MULTIPLIER = 1.6;
const RAPIDFIRE_COOLDOWN_MULTIPLIER = 0.4; // 40% of the normal cooldown
const SHIELD_DAMAGE_MULTIPLIER = 0.4; // shooter voluntarily reports reduced damage against a shielded target
const POWER_SHOT_DAMAGE = 40; // double a normal shot's 20

// Soft tank-vs-tank push (not a hard block, per design decision — a hard
// block risks one player deliberately body-blocking a chokepoint, worse
// with 3+ tanks than it ever was at 2).
const TANK_PUSH_MIN_DIST = TANK_R * 2;

// Death/destruction animation — a fading, shrinking hull instead of an
// instant disappearance, paired with a real explosion particle burst
// (spawned separately, see spawnExplosion).
const DEATH_ANIM_MS = 700;
const LOW_HP_WARNING_INTERVAL_MS = 4000;

// Dead-reckoning constants — same technique already proven in
// PingPongGame.jsx/AirHockeyGame.jsx for a laggy remote object: extrapolate
// another tank forward from its last known position + self-reported
// velocity, capped so a stale-enough guess doesn't overshoot into nonsense.
const REMOTE_EXTRAPOLATION_CAP_S = 0.3;

function estimateSendVelocity(track, x, y, now) {
  const dtSec = Math.max((now - (track.t || now)) / 1000, 0.001);
  const vx = (x - (track.x ?? x)) / dtSec;
  const vy = (y - (track.y ?? y)) / dtSec;
  track.x = x;
  track.y = y;
  track.t = now;
  const cap = TANK_SPEED * 3;
  return { vx: Math.max(-cap, Math.min(cap, vx)), vy: Math.max(-cap, Math.min(cap, vy)) };
}

function extrapolateTank(anchor, now) {
  const elapsedS = Math.min(Math.max((now - anchor.t) / 1000, 0), REMOTE_EXTRAPOLATION_CAP_S);
  return {
    x: Math.max(TANK_R, Math.min(W - TANK_R, anchor.x + anchor.vx * elapsedS)),
    y: Math.max(TANK_R, Math.min(H - TANK_R, anchor.y + anchor.vy * elapsedS)),
    angle: anchor.angle,
    turretAngle: anchor.turretAngle,
  };
}

// ── Wall / pickup / effect / color helpers ──────────────────────────────

function colorForPlayerIndex(index) {
  const i = index >= 0 ? index : 0;
  return TANK_COLOR_PALETTE[i % TANK_COLOR_PALETTE.length];
}

function isWallStanding(wallId, wallsHP) {
  const hp = wallsHP?.[wallId];
  // undefined means the broadcast hasn't relayed walls yet (e.g. the very
  // first frame before game_state_update lands) — treat as standing rather
  // than letting a tank drive straight through where a wall will shortly
  // turn out to be.
  return hp === undefined ? true : hp > 0;
}

function circleRectCollide(cx, cy, r, rect) {
  const closestX = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const closestY = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dx = cx - closestX;
  const dy = cy - closestY;
  return dx * dx + dy * dy < r * r;
}

// Resolves a tank's tentative move against every standing wall. On a direct
// collision, tries sliding along a single axis first (lets a tank graze
// along a wall's edge instead of stopping dead the instant it touches one);
// only if BOTH axes are independently blocked does it fully cancel the move.
function resolveTankWallCollision(prevX, prevY, nextX, nextY, wallsHP) {
  const standing = WALLS.filter((w) => isWallStanding(w.id, wallsHP));
  if (standing.length === 0) return { x: nextX, y: nextY };
  const collides = (px, py) => standing.some((w) => circleRectCollide(px, py, TANK_R, w));
  if (!collides(nextX, nextY)) return { x: nextX, y: nextY };
  const xOnlyClear = !collides(nextX, prevY);
  const yOnlyClear = !collides(prevX, nextY);
  if (xOnlyClear) return { x: nextX, y: prevY };
  if (yOnlyClear) return { x: prevX, y: nextY };
  return { x: prevX, y: prevY };
}

// Returns the id of the first standing wall a bullet is currently touching,
// or null. Bullets are small and fast enough relative to the per-frame
// timestep that a plain point-in-time check (no swept/continuous collision)
// is good enough here — same tolerance already accepted for bullet-vs-tank
// collision in the main render loop below.
function bulletHitsAnyWall(bx, by, wallsHP) {
  for (const wall of WALLS) {
    if (!isWallStanding(wall.id, wallsHP)) continue;
    if (circleRectCollide(bx, by, BULLET_R, wall)) return wall.id;
  }
  return null;
}

// Deterministically computes which pickups are "live" right now, purely from
// elapsed time since match start — every client gets the identical set of
// ids/types/positions without any network round-trip, matching how no
// client needs to ask another where a wall is either. One entry per spawn
// point, each on its own independent cycle (offset by point index so all 3
// points don't always show the same type at once).
function computeCurrentPickups(startedAt, now) {
  const elapsed = Math.max(0, now - startedAt);
  const cycleIndex = Math.floor(elapsed / PICKUP_CYCLE_MS);
  return PICKUP_SPAWN_POINTS.map((point, i) => ({
    id: `p${i}_${cycleIndex}`,
    type: PICKUP_TYPES[(cycleIndex + i) % PICKUP_TYPES.length],
    x: point.x,
    y: point.y,
  }));
}

// Recovers a pickup's type from its id alone (id encodes both the spawn
// point index and the cycle index, e.g. "p1_7" -> point 1, cycle 7) — used
// when reacting to a grab broadcast, which only ever carries the id, not the
// type, since the type is just as deterministically derivable as the id.
function pickupTypeFromId(pickupId) {
  const match = /^p(\d+)_(\d+)$/.exec(String(pickupId));
  if (!match) return null;
  const pointIndex = parseInt(match[1], 10);
  const cycleIndex = parseInt(match[2], 10);
  return PICKUP_TYPES[(cycleIndex + pointIndex) % PICKUP_TYPES.length];
}

// Reads a player's currently-active temporary effect (speed/shield/
// rapidfire/powershot), treating one whose expires_at has already passed as
// absent — a purely client-side, cosmetic/gameplay-feel check (the
// corresponding clamp that actually matters for balance, shield damage
// reduction, is applied by the SHOOTER's own client at the same trust tier
// already accepted for hit damage throughout this game package; see
// tank_battle.go's file-level comment).
function getActiveEffectType(effectsMap, playerIdStr, now) {
  const entry = effectsMap?.[playerIdStr];
  if (!entry || typeof entry !== 'object') return null;
  if (typeof entry.expires_at === 'number' && entry.expires_at < now) return null;
  return entry.type || null;
}

// Computes the camera's effective scale + translation offset for a given
// canvas size/zoom/self-position — shared by both the render loop and
// canvasPointFromEvent (aim inversion) so the two can never drift out of
// sync with each other. Clamped so the visible viewport never shows area
// outside the arena bounds when the current zoom level allows it to fit;
// falls back to centering on the arena if the viewport is bigger than the
// whole arena (e.g. zoomed far out).
function computeCameraTransform(canvasWidth, canvasHeight, zoom, myX, myY) {
  const baseScale = Math.min(canvasWidth / DEFAULT_VIEW_W, canvasHeight / DEFAULT_VIEW_H);
  const effScale = baseScale * zoom;
  const viewHalfW = canvasWidth / 2 / effScale;
  const viewHalfH = canvasHeight / 2 / effScale;
  const centerX = viewHalfW * 2 <= W ? Math.max(viewHalfW, Math.min(W - viewHalfW, myX)) : W / 2;
  const centerY = viewHalfH * 2 <= H ? Math.max(viewHalfH, Math.min(H - viewHalfH, myY)) : H / 2;
  return {
    effScale,
    offsetX: canvasWidth / 2 - centerX * effScale,
    offsetY: canvasHeight / 2 - centerY * effScale,
  };
}

// Loads a player's avatar as an Image once, cached by URL — reused by
// drawTank so a hit tank shows a real player photo instead of a plain
// colored dot. Falls back silently (drawTank just skips the image and keeps
// its existing colored-dot rendering) on any load failure — same "cosmetic
// only, never blocks gameplay" tolerance already used throughout this game
// for sound.
const avatarImageCache = new Map();
function loadAvatarImage(url) {
  if (!url) return null;
  let entry = avatarImageCache.get(url);
  if (!entry) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    entry = { img, loaded: false };
    img.onload = () => { entry.loaded = true; };
    img.onerror = () => { entry.loaded = false; };
    img.src = url;
    avatarImageCache.set(url, entry);
  }
  return entry.loaded ? entry.img : null;
}

// Particle effects — hit sparks, low-HP smoke, tank-destruction explosions
// (bigger sparks + expanding shockwave rings), and wall-break rubble. All
// pure client-side cosmetics, same trust model/architecture as every other
// visual flourish in this game (no server involvement, no new wire fields).
const HIT_PARTICLE_COUNT = 14;
const EXPLOSION_PARTICLE_COUNT = 34;
const RUBBLE_PARTICLE_COUNT = 16;
const LOW_HP_SMOKE_THRESHOLD = 40; // % HP below which a tank starts smoking
const SMOKE_INTERVAL_MS = 140;

function spawnHitBurst(particles, x, y) {
  for (let i = 0; i < HIT_PARTICLE_COUNT; i++) {
    const a = Math.random() * Math.PI * 2;
    const speed = 60 + Math.random() * 220;
    particles.push({
      kind: 'spark',
      x, y,
      vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      life: 0, maxLife: 0.28 + Math.random() * 0.22,
      size: 2 + Math.random() * 3,
      color: Math.random() < 0.5 ? '#ffb347' : '#ff5a3c',
    });
  }
}

function spawnSmoke(particles, x, y) {
  particles.push({
    kind: 'smoke',
    x: x + (Math.random() - 0.5) * TANK_R * 0.6,
    y: y + (Math.random() - 0.5) * TANK_R * 0.6,
    vx: (Math.random() - 0.5) * 12,
    vy: -18 - Math.random() * 22,
    life: 0, maxLife: 0.6 + Math.random() * 0.5,
    size: TANK_R * 0.3 + Math.random() * TANK_R * 0.25,
  });
}

// A tank's destruction — a bigger, more dramatic burst than a normal hit,
// plus a couple of expanding shockwave rings, paired with drawTank's own
// fade-and-shrink death animation on the hull itself.
function spawnExplosion(particles, x, y) {
  for (let i = 0; i < EXPLOSION_PARTICLE_COUNT; i++) {
    const a = Math.random() * Math.PI * 2;
    const speed = 80 + Math.random() * 260;
    particles.push({
      kind: 'spark',
      x, y,
      vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
      life: 0, maxLife: 0.4 + Math.random() * 0.5,
      size: 3 + Math.random() * 5,
      color: ['#ffb347', '#ff5a3c', '#ffe066', '#ff8c42'][Math.floor(Math.random() * 4)],
    });
  }
  particles.push({ kind: 'ring', x, y, life: 0, maxLife: 0.5, size: 4 });
  particles.push({ kind: 'ring', x, y, life: 0, maxLife: 0.35, size: 4 });
}

// A wall breaking — small debris chunks that pop out and fall (gravity),
// distinct from both the metallic tank-hit sparks and the soft smoke puffs.
function spawnRubble(particles, x, y) {
  for (let i = 0; i < RUBBLE_PARTICLE_COUNT; i++) {
    const a = Math.random() * Math.PI * 2;
    const speed = 30 + Math.random() * 90;
    particles.push({
      kind: 'rubble',
      x, y,
      vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 40,
      life: 0, maxLife: 0.5 + Math.random() * 0.4,
      size: 2 + Math.random() * 3,
    });
  }
}

export default function TankBattleGame({ gameState, players, currentUserId, onMove, onClose, onEndGame, onPostResult, onPlayAgain }) {
  const gs = gameState?.game_state || {};
  const myId = String(currentUserId);

  // player_ids is the ordered participant list tank_battle.go seeds at match
  // start — memoized on its stringified value (not the raw array) since gs
  // itself gets a fresh object reference on every broadcast even when this
  // specific field never actually changes after the match begins.
  const playerIds = useMemo(
    () => (Array.isArray(gs.player_ids) ? gs.player_ids.map(String) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(gs.player_ids)]
  );
  const myIndex = playerIds.indexOf(myId);
  const isParticipant = myIndex !== -1;
  const otherIds = useMemo(() => playerIds.filter((id) => id !== myId), [playerIds, myId]);

  const scores = gs.scores || {};
  const phase = gs.phase || 'playing';
  const isEnded = phase === 'ended' || gameState?.status === 'completed' || gameState?.status === 'forfeited';
  // Deliberately a plain function, not useCallback -- scores is a fresh
  // object reference from `gs` on every broadcast even when HP hasn't
  // changed, so memoizing this against it would just produce a new function
  // reference at the same frequency anyway. Every real call site here just
  // invokes it directly (never uses it as a dependency-array entry) -- the
  // one place that DOES need a stable value across broadcasts (the render
  // loop) reads scoresRef directly instead, see that ref's own comment.
  const getHP = (id) => Number(scores[id] ?? MAX_HP);
  const myHP = getHP(myId);
  const aliveCount = playerIds.filter((id) => getHP(id) > 0).length;

  // p.avatar is the established field this broadcast already resolves
  // player avatars into (see VideoWatch.jsx's enrichedPlayers) — matches the
  // same convention already used by BowlingGame.jsx's scoreboard.
  const playerInfoById = useMemo(() => {
    const map = {};
    (players || []).forEach((p) => {
      map[String(p.user_id)] = { username: p.username || 'Player', avatar: p.avatar || null };
    });
    return map;
  }, [players]);
  const myAvatarUrl = playerInfoById[myId]?.avatar || null;
  const myColor = colorForPlayerIndex(myIndex);
  const colorForId = useCallback((id) => colorForPlayerIndex(playerIds.indexOf(id)), [playerIds]);

  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try { return localStorage.getItem('tank_battle_sound_enabled') !== 'false'; } catch { return true; }
  });
  // Personal-only zoom (per-viewer display preference, not synced between
  // players — everyone just needs to see the SAME logical game state, at
  // whatever zoom level they individually prefer). A ref mirror lets the
  // render loop below read the current value every frame without needing to
  // be in that effect's own dependency array (which would tear down/rebuild
  // the canvas/RAF loop on every zoom click).
  const [zoomLevel, setZoomLevel] = useState(1);
  const zoomRef = useRef(1);
  useEffect(() => { zoomRef.current = zoomLevel; }, [zoomLevel]);

  // CONFIRMED root cause of an earlier "jagged/slow/freezing/unresponsive"
  // report: onMove (GameOverlay's handleMove) is a plain, unmemoized
  // function recreated on every render — and every tank broadcasts its own
  // position via state_sync at ~18Hz each, so every connected client
  // re-renders roughly 18*N times/second. With `onMove` listed directly in
  // the render-loop effect's dependency array (and in tryFire's), React was
  // tearing down and rebuilding the ENTIRE canvas/RAF loop AND the keyboard
  // listeners on every single one of those broadcasts. Same fix as before:
  // mirror onMove into a ref, read the ref inside the loop, never list
  // onMove itself as a dependency anywhere in this file.
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  useEffect(() => {
    tankBattleSoundEnabled = soundEnabled;
    try { localStorage.setItem('tank_battle_sound_enabled', String(soundEnabled)); } catch { /* ignore */ }
  }, [soundEnabled]);

  const [countingDown, setCountingDown] = useState(3);
  useEffect(() => {
    if (isEnded) return undefined;
    setCountingDown(3);
    const t1 = setTimeout(() => setCountingDown(2), 700);
    const t2 = setTimeout(() => setCountingDown(1), 1400);
    const t3 = setTimeout(() => setCountingDown(0), 2100);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [isEnded]);

  // S.current holds every piece of fast-moving game state that must never
  // trigger a React re-render on its own (position, bullets, particles,
  // per-opponent extrapolation anchors, timers) — same architecture as the
  // original 2-player version, just with "one opponent" generalized to
  // "a map of every other player, keyed by id" throughout.
  const S = useRef((() => {
    const spawnIdx = myIndex >= 0 ? myIndex : 0;
    const sp = SPAWN_POINTS[spawnIdx % SPAWN_POINTS.length];
    const angleToCenter = Math.atan2(H / 2 - sp.y, W / 2 - sp.x);
    return {
      my: { x: sp.x, y: sp.y, angle: angleToCenter, turretAngle: angleToCenter, vx: 0, vy: 0 },
      // Extrapolation anchors for every OTHER tank — playerId -> {x, y, vx, vy, angle, turretAngle, t}, lazily seeded the first time we see each one.
      others: {},
      sendTrack: { x: 0, y: 0, t: 0 },
      bullets: [], // {id, x, y, vx, vy, mine, powered}
      nextBulletId: 1,
      keys: { w: false, a: false, s: false, d: false },
      aim: { x: W / 2, y: H / 2 }, // desktop mouse / touch aim point, in canvas-logical coords
      lastFireAt: 0,
      lastStateSyncAt: 0,
      lastSeenFireSeq: gs.fire_seq || 0,
      startedAt: Date.now(),
      // Touch joystick state (mobile only)
      joyActive: false,
      joyVec: { x: 0, y: 0 },
      // Collision spark bursts + continuous low-HP smoke + explosions/rubble
      // — {kind, x, y, vx, vy, life, maxLife, size, color?}
      particles: [],
      lastMySmokeAt: 0,
      lastOthersSmokeAt: {}, // playerId -> timestamp
      lastLowHpWarningAt: 0,
      // Power-ups: which pickup ids I've already sent a grab_pickup for,
      // throttling the request to exactly once per pickup while lingering in
      // its radius (the backend handler is idempotent either way — this is
      // purely to avoid spamming the WS with redundant messages).
      lastGrabAttemptIds: new Set(),
      // Set true the instant MY OWN grab_pickup for a "powershot" pickup is
      // confirmed in the broadcast; consumed (cleared) the moment I next
      // fire, whether or not that shot actually lands — see tryFire below.
      powerShotReady: false,
      // Brief "just got hit" flash timestamps (performance.now()-based),
      // read by drawTank to tint a tank white/bright for ~150ms after impact.
      myFlashUntil: 0,
      othersFlashUntil: {}, // playerId -> timestamp
      // Death/destruction fade-out window — see DEATH_ANIM_MS.
      myDeathAnimUntil: 0,
      othersDeathAnimUntil: {}, // playerId -> timestamp
    };
  })());

  // Walls/pickups/effects are broadcast as part of the same game_state
  // payload every state_sync already rides on (~18Hz combined across every
  // player) — reading them directly off `gs` inside the render loop's own
  // dependency array would reintroduce the exact performance bug fixed
  // elsewhere in this file for `onMove` (a fresh object reference on every
  // broadcast, even when the VALUE is unchanged, forces an effect
  // teardown/rebuild). Same fix here: mirror into refs via a small effect
  // keyed on JSON.stringify (only re-fires when the value itself actually
  // changes), and have the render loop/tryFire read the refs — never gs
  // directly, never in a dependency array.
  const wallsHPRef = useRef({});
  const prevWallsHPRef = useRef({});
  useEffect(() => {
    const newWalls = gs.walls || {};
    const prev = prevWallsHPRef.current;
    for (const wall of WALLS) {
      const prevHP = prev[wall.id] ?? WALL_MAX_HP;
      const newHP = newWalls[wall.id] ?? WALL_MAX_HP;
      if (prevHP > 0 && newHP <= 0) {
        spawnRubble(S.current.particles, wall.x + wall.w / 2, wall.y + wall.h / 2);
        playTankSound('wall_break', { volume: 0.45 });
      }
    }
    prevWallsHPRef.current = newWalls;
    wallsHPRef.current = newWalls;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(gs.walls)]);

  const effectsRef = useRef({});
  useEffect(() => {
    effectsRef.current = gs.effects || {};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(gs.effects)]);

  // scores gets a fresh object reference from `gs` on every broadcast
  // (state_sync included, ~18Hz per player) even when HP hasn't actually
  // changed — so getHP (a useCallback keyed on `scores`) is NOT safe to put
  // in the render loop's own dependency array below, for the exact same
  // reason `onMove` wasn't (see that comment). getHP itself stays as-is for
  // every other-than-render-loop use (JSX, the score-change-detection
  // effect keyed on JSON.stringify(scores) itself) — this ref is purely for
  // the render loop to read OTHER players' HP without needing getHP as a
  // dependency. My own HP still safely uses the `myHP` primitive directly
  // (a plain number, unaffected by `scores`'s reference instability).
  const scoresRef = useRef({});
  useEffect(() => {
    scoresRef.current = scores;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(scores)]);

  const pickupsGrabbedRef = useRef({});
  // Tracks which pickup ids this client has already reacted to (played
  // feedback for / applied the local powerShotReady flag for), so a later,
  // unrelated broadcast that still happens to include an old grabbed id
  // doesn't re-trigger the same reaction a second time.
  const processedGrabIdsRef = useRef(new Set());
  useEffect(() => {
    const grabbed = gs.pickups_grabbed || {};
    pickupsGrabbedRef.current = grabbed;
    for (const [pid, grabberId] of Object.entries(grabbed)) {
      if (processedGrabIdsRef.current.has(pid)) continue;
      processedGrabIdsRef.current.add(pid);
      if (String(grabberId) === myId) {
        const type = pickupTypeFromId(pid);
        if (type === 'powershot') S.current.powerShotReady = true;
        playTankSound('pickup', { volume: 0.5 });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(gs.pickups_grabbed)]);

  // Ingest every OTHER player's relayed tank state whenever the broadcast
  // updates. Lazily seeds a fresh extrapolation anchor at that player's own
  // spawn point the first time we see them, so they don't visually snap in
  // from (0,0) before their first real state_sync arrives.
  useEffect(() => {
    for (const id of otherIds) {
      const snap = gs[`tank_${id}`];
      if (!snap || typeof snap !== 'object') continue;
      if (!S.current.others[id]) {
        const idx = playerIds.indexOf(id);
        const sp = SPAWN_POINTS[(idx >= 0 ? idx : 0) % SPAWN_POINTS.length];
        S.current.others[id] = { x: sp.x, y: sp.y, vx: 0, vy: 0, angle: 0, turretAngle: 0, t: Date.now() };
      }
      const a = S.current.others[id];
      a.x = typeof snap.x === 'number' ? snap.x : a.x;
      a.y = typeof snap.y === 'number' ? snap.y : a.y;
      a.vx = typeof snap.vx === 'number' ? snap.vx : 0;
      a.vy = typeof snap.vy === 'number' ? snap.vy : 0;
      a.angle = typeof snap.angle === 'number' ? snap.angle : a.angle;
      a.turretAngle = typeof snap.turret_angle === 'number' ? snap.turret_angle : a.turretAngle;
      a.t = Date.now();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(otherIds.map((id) => gs[`tank_${id}`]))]);

  // Ingest a new fire event from anyone else — spawn an identical bullet
  // locally so every client agrees on the trajectory going forward. Fully
  // generic already: shooter_id tells us who fired, and if it's not me, the
  // bullet spawns the same way regardless of which other player it was.
  useEffect(() => {
    const seq = gs.fire_seq || 0;
    if (seq <= S.current.lastSeenFireSeq) return;
    S.current.lastSeenFireSeq = seq;
    const lf = gs.last_fire;
    if (!lf || String(lf.shooter_id) === myId) return; // my own echo, or malformed
    const bullet = {
      id: S.current.nextBulletId++,
      x: lf.x, y: lf.y,
      vx: Math.cos(lf.angle) * BULLET_SPEED,
      vy: Math.sin(lf.angle) * BULLET_SPEED,
      mine: false,
      powered: !!lf.powered,
    };
    S.current.bullets.push(bullet);
    playTankSound('fire', { volume: 0.35 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gs.fire_seq]);

  // Damage feedback for whichever player(s) just got hit or eliminated —
  // generalizes the old single-opponent prevOppHP/prevMyHP comparison into
  // one loop over every known participant, keyed on the whole scores object
  // changing. Elimination (HP crossing to 0) gets a bigger explosion + the
  // fade-out death animation; an ordinary hit gets the existing spark burst
  // + flash ring.
  const prevScoresRef = useRef({});
  useEffect(() => {
    const prev = prevScoresRef.current;
    const allIds = [myId, ...otherIds];
    for (const id of allIds) {
      const prevHP = prev[id] ?? MAX_HP;
      const newHP = getHP(id);
      if (newHP >= prevHP) continue;
      const isMe = id === myId;
      const pos = isMe
        ? { x: S.current.my.x, y: S.current.my.y }
        : extrapolateTank(S.current.others[id] || { x: W / 2, y: H / 2, vx: 0, vy: 0, angle: 0, turretAngle: 0, t: Date.now() }, Date.now());
      if (newHP <= 0 && prevHP > 0) {
        spawnExplosion(S.current.particles, pos.x, pos.y);
        playTankSound('explosion', { volume: isMe ? 0.6 : 0.45 });
        if (isMe) {
          hapticImpact([30, 60, 30]);
          S.current.myDeathAnimUntil = performance.now() + DEATH_ANIM_MS;
        } else {
          S.current.othersDeathAnimUntil[id] = performance.now() + DEATH_ANIM_MS;
        }
      } else {
        spawnHitBurst(S.current.particles, pos.x, pos.y);
        playTankSound('hit', { volume: isMe ? 0.5 : 0.4 });
        if (isMe) {
          hapticImpact([15, 30, 15]);
          S.current.myFlashUntil = performance.now() + 150;
        } else {
          S.current.othersFlashUntil[id] = performance.now() + 150;
        }
      }
    }
    const nextPrev = { ...prev };
    for (const id of allIds) nextPrev[id] = getHP(id);
    prevScoresRef.current = nextPrev;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(scores)]);

  // Match-end sting — victory for the actual winner, defeat for everyone
  // else, or the original neutral explosion cue for a genuine draw/forced
  // end with no single winner.
  useEffect(() => {
    if (!isEnded) return;
    const winnerId = gameState?.winner_id != null ? String(gameState.winner_id) : null;
    if (winnerId === myId) {
      playTankSound('victory', { volume: 0.55 });
      hapticImpact([20, 40, 20, 40, 60]);
    } else if (winnerId) {
      playTankSound('defeat', { volume: 0.5 });
    } else {
      playTankSound('explosion', { volume: 0.5 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEnded]);

  const canPlay = isParticipant && myHP > 0 && !isEnded && countingDown === 0;

  const tryFire = useCallback(() => {
    if (!canPlay) return;
    const now = performance.now();
    const rapidfireActive = getActiveEffectType(effectsRef.current, myId, Date.now()) === 'rapidfire';
    const cooldown = rapidfireActive ? FIRE_COOLDOWN_MS * RAPIDFIRE_COOLDOWN_MULTIPLIER : FIRE_COOLDOWN_MS;
    if (now - S.current.lastFireAt < cooldown) return;
    S.current.lastFireAt = now;
    const my = S.current.my;
    // A loaded power shot is consumed the moment it's fired, whether or not
    // it actually lands — a deliberate risk/reward choice, not a bug: you
    // spend the charge on the shot, not on a confirmed hit.
    const powered = S.current.powerShotReady;
    if (powered) S.current.powerShotReady = false;
    const bullet = {
      id: S.current.nextBulletId++,
      x: my.x + Math.cos(my.turretAngle) * (TANK_R + 6),
      y: my.y + Math.sin(my.turretAngle) * (TANK_R + 6),
      vx: Math.cos(my.turretAngle) * BULLET_SPEED,
      vy: Math.sin(my.turretAngle) * BULLET_SPEED,
      mine: true,
      powered,
    };
    S.current.bullets.push(bullet);
    playTankSound('fire', { volume: 0.5 });
    onMoveRef.current({ move_type: 'fire', x: bullet.x, y: bullet.y, angle: my.turretAngle, powered });
  }, [canPlay, myId]);

  // ── Keyboard + mouse (desktop) ──────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e) => {
      const k = e.key.toLowerCase();
      if (k === 'w' || k === 'arrowup') S.current.keys.w = true;
      if (k === 'a' || k === 'arrowleft') S.current.keys.a = true;
      if (k === 's' || k === 'arrowdown') S.current.keys.s = true;
      if (k === 'd' || k === 'arrowright') S.current.keys.d = true;
      if (k === ' ') { e.preventDefault(); tryFire(); }
    };
    const onKeyUp = (e) => {
      const k = e.key.toLowerCase();
      if (k === 'w' || k === 'arrowup') S.current.keys.w = false;
      if (k === 'a' || k === 'arrowleft') S.current.keys.a = false;
      if (k === 's' || k === 'arrowdown') S.current.keys.s = false;
      if (k === 'd' || k === 'arrowright') S.current.keys.d = false;
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [tryFire]);

  // Inverts the exact same camera transform the render loop applies (see
  // computeCameraTransform) — must stay in sync with it, since aiming needs
  // to land on whatever position the player actually sees on screen.
  const canvasPointFromEvent = useCallback((clientX, clientY) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const localX = ((clientX - rect.left) / rect.width) * canvas.width;
    const localY = ((clientY - rect.top) / rect.height) * canvas.height;
    const s = S.current;
    const { effScale, offsetX, offsetY } = computeCameraTransform(canvas.width, canvas.height, zoomRef.current, s.my.x, s.my.y);
    return {
      x: (localX - offsetX) / effScale,
      y: (localY - offsetY) / effScale,
    };
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (isTouchDevice) return;
    S.current.aim = canvasPointFromEvent(e.clientX, e.clientY);
  }, [canvasPointFromEvent]);

  const handleClick = useCallback(() => {
    if (isTouchDevice) return;
    tryFire();
  }, [tryFire]);

  // ── Main physics/render loop ─────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return undefined;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
    };
    resize();
    window.addEventListener('resize', resize);

    const ctx = canvas.getContext('2d');
    let raf;
    let lastT = performance.now();

    const draw = (now) => {
      const dt = Math.min((now - lastT) / 1000, 0.05);
      lastT = now;
      const s = S.current;
      const nowDate = Date.now();

      if (canPlay) {
        // Movement
        let dx = 0, dy = 0;
        if (isTouchDevice) {
          dx = s.joyVec.x; dy = s.joyVec.y;
        } else {
          if (s.keys.w) dy -= 1;
          if (s.keys.s) dy += 1;
          if (s.keys.a) dx -= 1;
          if (s.keys.d) dx += 1;
        }
        const mag = Math.hypot(dx, dy);
        if (mag > 0.01) {
          dx /= mag; dy /= mag;
          const speedActive = getActiveEffectType(effectsRef.current, myId, nowDate) === 'speed';
          const speed = TANK_SPEED * (speedActive ? SPEED_BOOST_MULTIPLIER : 1);
          const nextX = Math.max(TANK_R, Math.min(W - TANK_R, s.my.x + dx * speed * dt));
          const nextY = Math.max(TANK_R, Math.min(H - TANK_R, s.my.y + dy * speed * dt));
          const resolved = resolveTankWallCollision(s.my.x, s.my.y, nextX, nextY, wallsHPRef.current);
          s.my.x = resolved.x;
          s.my.y = resolved.y;
          s.my.angle = Math.atan2(dy, dx);
          s.my.vx = dx * speed;
          s.my.vy = dy * speed;
        } else {
          s.my.vx = 0; s.my.vy = 0;
        }

        // Soft push away from any overlapping OTHER tank — purely a
        // MY-OWN-POSITION adjustment; every other player's own client does
        // the identical push on their side, so tanks separate without
        // needing any authority/sync for this (same "each client only ever
        // moves its own tank" model already used for wall collision).
        for (const id of otherIds) {
          const anchor = s.others[id];
          if (!anchor) continue;
          const otherNow = extrapolateTank(anchor, nowDate);
          const dxp = s.my.x - otherNow.x;
          const dyp = s.my.y - otherNow.y;
          const dist = Math.hypot(dxp, dyp);
          if (dist > 0 && dist < TANK_PUSH_MIN_DIST) {
            const overlap = TANK_PUSH_MIN_DIST - dist;
            s.my.x = Math.max(TANK_R, Math.min(W - TANK_R, s.my.x + (dxp / dist) * overlap * 0.5));
            s.my.y = Math.max(TANK_R, Math.min(H - TANK_R, s.my.y + (dyp / dist) * overlap * 0.5));
          }
        }

        // Turret aim
        s.my.turretAngle = Math.atan2(s.aim.y - s.my.y, s.aim.x - s.my.x);

        // Relay my own tank state — includes cosmetic effect flags so every
        // other client can render my shield glow / know I'm boosted,
        // piggybacking on this already-high-frequency relay rather than
        // adding a separate broadcast for it (see processTankBattleMove's
        // state_sync case in tank_battle.go).
        if (nowDate - s.lastStateSyncAt > STATE_SYNC_MS) {
          s.lastStateSyncAt = nowDate;
          const { vx, vy } = estimateSendVelocity(s.sendTrack, s.my.x, s.my.y, nowDate);
          const myEffect = getActiveEffectType(effectsRef.current, myId, nowDate);
          onMoveRef.current({
            move_type: 'state_sync',
            x: s.my.x, y: s.my.y, angle: s.my.angle, turret_angle: s.my.turretAngle,
            vx, vy,
            shield_active: myEffect === 'shield',
            speed_active: myEffect === 'speed',
            rapidfire_active: myEffect === 'rapidfire',
          });
        }

        // Power-up grab — my own tank's position is authoritative to ME, so
        // I only ever check it locally against whichever pickups the shared
        // deterministic schedule says are currently live, sending the grab
        // request exactly once per pickup id rather than spamming it every
        // frame while lingering in range.
        const pickupsNow = computeCurrentPickups(s.startedAt, nowDate);
        for (const pk of pickupsNow) {
          if (pickupsGrabbedRef.current[pk.id] === undefined && !s.lastGrabAttemptIds.has(pk.id)) {
            const distToPickup = Math.hypot(s.my.x - pk.x, s.my.y - pk.y);
            if (distToPickup < PICKUP_GRAB_RADIUS) {
              s.lastGrabAttemptIds.add(pk.id);
              onMoveRef.current({ move_type: 'grab_pickup', pickup_id: pk.id, pickup_type: pk.type });
            }
          }
        }

        // Continuous smoke + a periodic low-HP warning cue for a badly
        // damaged (but still alive) tank.
        if (myHP > 0 && myHP < LOW_HP_SMOKE_THRESHOLD) {
          if (nowDate - s.lastMySmokeAt > SMOKE_INTERVAL_MS) {
            s.lastMySmokeAt = nowDate;
            spawnSmoke(s.particles, s.my.x, s.my.y);
          }
          if (nowDate - s.lastLowHpWarningAt > LOW_HP_WARNING_INTERVAL_MS) {
            s.lastLowHpWarningAt = nowDate;
            playTankSound('low_hp', { volume: 0.35 });
          }
        }
      }

      // Smoke for every other badly-damaged tank (purely cosmetic, no sound
      // — the warning cue above is deliberately self-only).
      for (const id of otherIds) {
        const anchor = s.others[id];
        if (!anchor) continue;
        const hp = Number(scoresRef.current[id] ?? MAX_HP);
        if (hp <= 0 || hp >= LOW_HP_SMOKE_THRESHOLD) continue;
        const lastAt = s.lastOthersSmokeAt[id] || 0;
        if (nowDate - lastAt > SMOKE_INTERVAL_MS) {
          s.lastOthersSmokeAt[id] = nowDate;
          const pos = extrapolateTank(anchor, nowDate);
          spawnSmoke(s.particles, pos.x, pos.y);
        }
      }

      // Advance bullets — check wall collisions first (a wall stops a
      // bullet dead regardless of whose it is), then my-own-bullet-vs-any-
      // other-tank collision. A power-shot bullet (powered:true) deals
      // double damage; a shielded target has that damage voluntarily
      // reduced by the SHOOTER's own client — same trust tier already
      // accepted for every other damage value reported in this game (see
      // tank_battle.go).
      s.bullets = s.bullets.filter((b) => {
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        if (b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20) return false;
        const hitWallId = bulletHitsAnyWall(b.x, b.y, wallsHPRef.current);
        if (hitWallId) {
          if (b.mine) {
            onMoveRef.current({ move_type: 'wall_hit', wall_id: hitWallId, damage: 20 });
            spawnHitBurst(s.particles, b.x, b.y);
          }
          return false;
        }
        if (b.mine && canPlay) {
          for (const id of otherIds) {
            const anchor = s.others[id];
            if (!anchor) continue;
            if (Number(scoresRef.current[id] ?? MAX_HP) <= 0) continue; // already-eliminated tanks aren't valid targets
            const otherNow = extrapolateTank(anchor, Date.now());
            const d = Math.hypot(b.x - otherNow.x, b.y - otherNow.y);
            if (d < HIT_RADIUS + BULLET_R) {
              const shielded = getActiveEffectType(effectsRef.current, id, Date.now()) === 'shield';
              let damage = b.powered ? POWER_SHOT_DAMAGE : 20;
              if (shielded) damage = Math.max(1, Math.round(damage * SHIELD_DAMAGE_MULTIPLIER));
              onMoveRef.current({ move_type: 'hit', target_player_id: Number(id), damage });
              return false;
            }
          }
        }
        return true;
      });

      // Advance every particle — sparks/rings/rubble/smoke share one
      // array/lifecycle, only their motion + drawn appearance differ by kind.
      s.particles = s.particles.filter((p) => {
        p.life += dt;
        if (p.life >= p.maxLife) return false;
        if (p.kind === 'ring') return true; // rings don't move, just grow (handled in draw)
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.kind === 'spark') { p.vx *= 0.92; p.vy *= 0.92; } // quick drag, sparks slow fast
        if (p.kind === 'rubble') { p.vy += 220 * dt; } // gravity pulls debris down
        return true;
      });

      // ── Render ──
      // Uniform scale (never independent X/Y factors) + letterbox centering
      // + a camera that always follows your own tank, clamped so the
      // viewport never shows area outside the arena bounds — see
      // computeCameraTransform.
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      const { effScale, offsetX, offsetY } = computeCameraTransform(canvas.width, canvas.height, zoomRef.current, s.my.x, s.my.y);
      ctx.translate(offsetX, offsetY);
      ctx.scale(effScale, effScale);

      // Arena
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, '#2d3b1f');
      grad.addColorStop(1, '#1c2614');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 4;
      ctx.strokeRect(2, 2, W - 4, H - 4);

      // Obstacles — drawn before any tank so they read as terrain the tanks/
      // bullets interact with, not something floating on top. A wall
      // darkens and gets a cosmetic crack as it takes damage, then simply
      // stops being drawn (and stops colliding, per wallsHPRef) once broken.
      for (const wall of WALLS) {
        const wallHP = wallsHPRef.current[wall.id];
        const hpValue = wallHP === undefined ? WALL_MAX_HP : wallHP;
        if (hpValue <= 0) continue;
        const pct = Math.max(0, Math.min(1, hpValue / WALL_MAX_HP));
        ctx.fillStyle = `rgba(120, 108, 92, ${0.55 + pct * 0.4})`;
        ctx.fillRect(wall.x, wall.y, wall.w, wall.h);
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 2;
        ctx.strokeRect(wall.x, wall.y, wall.w, wall.h);
        if (pct < 0.66) {
          ctx.strokeStyle = `rgba(0,0,0,${0.55 * (1 - pct)})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(wall.x + wall.w * 0.3, wall.y);
          ctx.lineTo(wall.x + wall.w * 0.55, wall.y + wall.h);
          ctx.stroke();
        }
      }

      // Power-ups — every currently-live pickup (up to 3) that hasn't been
      // claimed yet per the broadcast. A gentle vertical bob makes each read
      // clearly as "grabbable" against the static terrain.
      for (const pk of computeCurrentPickups(s.startedAt, Date.now())) {
        if (pickupsGrabbedRef.current[pk.id] !== undefined) continue;
        const meta = PICKUP_META[pk.type];
        const bobY = pk.y + Math.sin(now / 220) * 3;
        ctx.save();
        ctx.beginPath();
        ctx.arc(pk.x, bobY, PICKUP_R, 0, Math.PI * 2);
        ctx.fillStyle = meta.color;
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 9px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(meta.label, pk.x, bobY);
        ctx.restore();
      }

      const drawTank = (t, color, hpPct, avatarUrl, flashUntil, effectType, isSelf, deathAnimUntil) => {
        const deathAnimating = deathAnimUntil > now;
        if (hpPct <= 0 && !deathAnimating) return; // fully gone

        let alpha = 1;
        let scale = 1;
        if (deathAnimating) {
          const progress = 1 - Math.max(0, (deathAnimUntil - now) / DEATH_ANIM_MS);
          alpha = Math.max(0, 1 - progress);
          scale = Math.max(0.2, 1 - progress * 0.6);
        }

        const flashing = now < flashUntil;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(t.x, t.y);
        ctx.rotate(t.angle);
        ctx.scale(scale, scale);
        ctx.fillStyle = flashing ? '#ffffff' : color;
        ctx.fillRect(-TANK_R, -TANK_R * 0.7, TANK_R * 2, TANK_R * 1.4);
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 2;
        ctx.strokeRect(-TANK_R, -TANK_R * 0.7, TANK_R * 2, TANK_R * 1.4);
        ctx.restore();
        ctx.globalAlpha = 1;

        // Fading/shrinking during the death animation is enough on its own
        // (paired with the explosion particle burst spawned separately) —
        // skip turret/avatar/health-bar/rings while it's playing to keep
        // this simple.
        if (deathAnimating) return;

        // Turret + barrel (independent rotation)
        ctx.save();
        ctx.translate(t.x, t.y);
        ctx.rotate(t.turretAngle);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(0, -3, TANK_R + 10, 6);
        ctx.restore();

        // Player avatar clipped into the turret hatch — falls back to a
        // plain colored dot (the original look) until the image finishes
        // loading, or forever if there is no avatar/it fails to load.
        const avatarR = TANK_R * 0.55;
        const img = loadAvatarImage(avatarUrl);
        if (img) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(t.x, t.y, avatarR, 0, Math.PI * 2);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(img, t.x - avatarR, t.y - avatarR, avatarR * 2, avatarR * 2);
          ctx.restore();
          ctx.beginPath();
          ctx.arc(t.x, t.y, avatarR, 0, Math.PI * 2);
          ctx.strokeStyle = color;
          ctx.lineWidth = 2.5;
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(t.x, t.y, avatarR, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
        }

        // A faint pulsing red ring at low HP — a quick "this tank is
        // burning" read even in the instant between smoke puffs.
        if (hpPct > 0 && hpPct < LOW_HP_SMOKE_THRESHOLD) {
          const pulse = 0.4 + 0.3 * Math.sin(now / 130);
          ctx.beginPath();
          ctx.arc(t.x, t.y, TANK_R + 4, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(255,90,40,${pulse})`;
          ctx.lineWidth = 3;
          ctx.stroke();
        }
        // A bright, fast pulse right on the point of impact.
        if (flashing) {
          ctx.beginPath();
          ctx.arc(t.x, t.y, TANK_R + 8, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255,255,255,0.85)';
          ctx.lineWidth = 3;
          ctx.stroke();
        }
        // A steady pulsing blue ring while a shield pickup is active.
        if (effectType === 'shield') {
          const shieldPulse = 0.5 + 0.35 * Math.sin(now / 180);
          ctx.beginPath();
          ctx.arc(t.x, t.y, TANK_R + 12, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(59,130,246,${shieldPulse})`;
          ctx.lineWidth = 3;
          ctx.stroke();
        }
        // Thin white "this is you" ring — colors are assigned per player
        // index now (not a fixed blue-vs-red), so this is how you always
        // find your own tank at a glance regardless of which color it is.
        if (isSelf) {
          ctx.beginPath();
          ctx.arc(t.x, t.y, TANK_R + 2, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255,255,255,0.9)';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // Floating avatar + real health bar above the tank — legible even
        // mid-combat, when the tank itself may be partly hidden behind an
        // explosion or another tank.
        const barY = t.y - TANK_R - 20;
        const barW = 44, barH = 8;
        const barX = t.x - barW / 2 + 8;
        const miniAvatarR = 9;
        const miniAvatarX = t.x - barW / 2 - miniAvatarR + 2;
        const miniImg = loadAvatarImage(avatarUrl);
        ctx.save();
        ctx.beginPath();
        ctx.arc(miniAvatarX, barY, miniAvatarR, 0, Math.PI * 2);
        if (miniImg) {
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(miniImg, miniAvatarX - miniAvatarR, barY - miniAvatarR, miniAvatarR * 2, miniAvatarR * 2);
        } else {
          ctx.fillStyle = color;
          ctx.fill();
        }
        ctx.restore();
        ctx.beginPath();
        ctx.arc(miniAvatarX, barY, miniAvatarR, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        const clampedPct = Math.max(0, Math.min(100, hpPct)) / 100;
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fillRect(barX, barY - barH / 2, barW, barH);
        const hpColor = clampedPct > 0.6 ? '#22c55e' : clampedPct > 0.3 ? '#eab308' : '#ef4444';
        ctx.fillStyle = hpColor;
        ctx.fillRect(barX, barY - barH / 2, barW * clampedPct, barH);
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY - barH / 2, barW, barH);
      };

      const myEffectType = getActiveEffectType(effectsRef.current, myId, Date.now());
      drawTank(s.my, myColor, myHP, myAvatarUrl, s.myFlashUntil, myEffectType, true, s.myDeathAnimUntil);

      for (const id of otherIds) {
        const anchor = s.others[id];
        if (!anchor) continue;
        const otherNow = extrapolateTank(anchor, Date.now());
        const otherHP = Number(scoresRef.current[id] ?? MAX_HP);
        const otherEffectType = getActiveEffectType(effectsRef.current, id, Date.now());
        const info = playerInfoById[id] || {};
        drawTank(otherNow, colorForId(id), otherHP, info.avatar, s.othersFlashUntil[id] || 0, otherEffectType, false, s.othersDeathAnimUntil[id] || 0);
      }

      // Bullets — a power shot renders bigger and red/purple so both
      // players can immediately tell a heavier hit is inbound, not just
      // find out from the damage number afterward.
      s.bullets.forEach((b) => {
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.powered ? BULLET_R * 1.8 : BULLET_R, 0, Math.PI * 2);
        ctx.fillStyle = b.powered ? '#c026d3' : '#ffe066';
        ctx.fill();
      });

      // Particles — sparks (bright, fast-fading), smoke (soft grey puffs),
      // expanding shockwave rings (tank destruction), and falling rubble
      // (wall destruction) — drawn on top of everything else.
      s.particles.forEach((p) => {
        const t = p.life / p.maxLife;
        if (p.kind === 'spark') {
          ctx.globalAlpha = Math.max(0, 1 - t);
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1 - t * 0.5), 0, Math.PI * 2);
          ctx.fill();
        } else if (p.kind === 'smoke') {
          ctx.globalAlpha = Math.max(0, 0.55 * (1 - t));
          ctx.fillStyle = '#555';
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (0.6 + t * 0.8), 0, Math.PI * 2);
          ctx.fill();
        } else if (p.kind === 'ring') {
          ctx.globalAlpha = Math.max(0, 0.6 * (1 - t));
          ctx.strokeStyle = '#ffcc66';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size + t * 60, 0, Math.PI * 2);
          ctx.stroke();
        } else if (p.kind === 'rubble') {
          ctx.globalAlpha = Math.max(0, 1 - t);
          ctx.fillStyle = '#8a7b6a';
          ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        }
      });
      ctx.globalAlpha = 1;

      ctx.restore();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [canPlay, myHP, isEnded, myAvatarUrl, myId, myColor, colorForId, otherIds, playerInfoById]);

  // ── Touch joystick handlers (mobile) ─────────────────────────────────
  const joyBaseRef = useRef({ x: 0, y: 0 });
  const handleJoyStart = (e) => {
    const t = e.touches[0];
    joyBaseRef.current = { x: t.clientX, y: t.clientY };
    S.current.joyActive = true;
  };
  const handleJoyMove = (e) => {
    if (!S.current.joyActive) return;
    const t = e.touches[0];
    const dx = t.clientX - joyBaseRef.current.x;
    const dy = t.clientY - joyBaseRef.current.y;
    const mag = Math.hypot(dx, dy) || 1;
    const clamped = Math.min(mag, 44);
    S.current.joyVec = mag > 6 ? { x: (dx / mag) * (clamped / 44), y: (dy / mag) * (clamped / 44) } : { x: 0, y: 0 };
  };
  const handleJoyEnd = () => {
    S.current.joyActive = false;
    S.current.joyVec = { x: 0, y: 0 };
  };
  const handleAimTouch = (e) => {
    const t = e.touches[0];
    S.current.aim = canvasPointFromEvent(t.clientX, t.clientY);
    tryFire();
  };

  const handleForfeit = () => {
    onEndGame?.();
    onClose?.();
  };

  const zoomIn = () => setZoomLevel((z) => Math.min(ZOOM_MAX, +(z + ZOOM_STEP).toFixed(2)));
  const zoomOut = () => setZoomLevel((z) => Math.max(ZOOM_MIN, +(z - ZOOM_STEP).toFixed(2)));

  if (!isParticipant) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
        <div className="bg-gray-900 rounded-2xl p-8 text-center max-w-sm mx-4">
          <div className="text-5xl mb-4">🎖️</div>
          <h2 className="text-white text-xl font-bold mb-2">Tank Battle</h2>
          <p className="text-gray-400 text-sm mb-4">{playerIds.length} tanks are battling it out — spectating!</p>
          <button onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium">Close</button>
        </div>
      </div>
    );
  }

  const sortedOtherIds = [...otherIds].sort((a, b) => getHP(b) - getHP(a));

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950">
      {!isEnded && (
        <ControlsTutorialOverlay
          gameType="tank_battle"
          steps={isTouchDevice
            ? [
                { icon: 'joystick', text: 'Left joystick drives your tank in any direction.' },
                { icon: 'tap', text: 'Tap FIRE (right side) to aim toward where you tap and shoot. Use the +/- buttons to zoom in or out.' },
              ]
            : [
                { icon: 'joystick', text: 'WASD or the arrow keys drive your tank.' },
                { icon: 'tap', text: 'Aim with your mouse, then click or press Space to fire. Use the +/- buttons (top right) to zoom in or out.' },
              ]}
        />
      )}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800 shrink-0">
        <span className="text-white font-bold text-sm">🎖️ Tank Battle</span>
        <div className="flex items-center gap-3">
          <GameRulesButton gameType="tank_battle" />
          <button onClick={() => setSoundEnabled((v) => !v)} className="text-gray-400 hover:text-white" title={soundEnabled ? 'Mute' : 'Unmute'}>
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          <button onClick={handleForfeit} className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold">
            End Battle
          </button>
          <button onClick={handleForfeit} className="text-gray-400 hover:text-white" title="End Battle">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 px-4 py-2 bg-gray-900/60 shrink-0">
        <div className="flex items-center gap-2 flex-1 max-w-sm">
          {myAvatarUrl ? (
            <img src={myAvatarUrl} alt="" className="w-7 h-7 rounded-full object-cover shrink-0" style={{ border: `2px solid ${myColor}` }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          ) : (
            <div className="w-7 h-7 rounded-full shrink-0" style={{ backgroundColor: myColor }} />
          )}
          <div className="flex-1">
            <div className="text-[11px] text-gray-400 mb-0.5">You ({myHP <= 0 ? 'destroyed' : `${Math.max(0, myHP)} HP`})</div>
            <div className="h-2.5 rounded-full bg-gray-800 overflow-hidden">
              <div className="h-full transition-all" style={{ width: `${Math.max(0, myHP)}%`, backgroundColor: myColor }} />
            </div>
          </div>
        </div>
        <div className="text-[11px] text-gray-500 shrink-0">{aliveCount} / {playerIds.length} tanks remaining</div>
      </div>

      <div ref={containerRef} className="relative flex-1 min-h-0">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          onMouseMove={handleMouseMove}
          onClick={handleClick}
          style={{ touchAction: 'none', cursor: isTouchDevice ? 'default' : 'crosshair' }}
        />

        {/* Compact scoreboard — every other tank, ranked by remaining HP,
            eliminated ones naturally sink to the bottom since 0 always sorts
            last. Replaces the old fixed 2-panel HUD, which doesn't fit up to
            7 opponents. */}
        {sortedOtherIds.length > 0 && (
          <div className="absolute top-3 left-3 bg-black/50 rounded-lg p-2 max-w-[170px] max-h-[65vh] overflow-y-auto space-y-1">
            {sortedOtherIds.map((id) => {
              const hp = getHP(id);
              const eliminated = hp <= 0;
              const info = playerInfoById[id] || {};
              const c = colorForId(id);
              return (
                <div key={id} className={`flex items-center gap-1.5 ${eliminated ? 'opacity-40' : ''}`}>
                  {info.avatar ? (
                    <img src={info.avatar} alt="" className="w-5 h-5 rounded-full object-cover shrink-0" style={{ border: `1.5px solid ${c}` }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                  ) : (
                    <div className="w-5 h-5 rounded-full shrink-0" style={{ backgroundColor: c }} />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-[9px] text-gray-300 truncate leading-tight">{info.username || 'Player'}</div>
                    <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
                      <div className="h-full transition-all" style={{ width: `${Math.max(0, hp)}%`, backgroundColor: eliminated ? '#666' : c }} />
                    </div>
                  </div>
                  {eliminated && <span className="text-[8px] text-red-400 font-bold shrink-0">OUT</span>}
                </div>
              );
            })}
          </div>
        )}

        {isTouchDevice && canPlay && (
          <>
            <div
              className="absolute bottom-6 left-6 w-24 h-24 rounded-full bg-white/10 border border-white/20"
              onTouchStart={handleJoyStart}
              onTouchMove={handleJoyMove}
              onTouchEnd={handleJoyEnd}
            />
            <div
              className="absolute bottom-6 right-6 w-24 h-24 rounded-full bg-red-500/20 border border-red-400/40 flex items-center justify-center text-white text-xs font-bold"
              onTouchStart={handleAimTouch}
            >
              FIRE
            </div>
          </>
        )}

        {/* Zoom controls — now for every device, not just touch. Desktop had
            no way to zoom at all before this. */}
        <div className="absolute top-3 right-3 flex flex-col gap-2 !min-h-0 !min-w-0">
          <button
            onClick={zoomIn}
            disabled={zoomLevel >= ZOOM_MAX}
            className="!min-h-0 !min-w-0 w-9 h-9 rounded-full bg-black/50 border border-white/20 flex items-center justify-center text-white disabled:opacity-30"
            title="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={zoomOut}
            disabled={zoomLevel <= ZOOM_MIN}
            className="!min-h-0 !min-w-0 w-9 h-9 rounded-full bg-black/50 border border-white/20 flex items-center justify-center text-white disabled:opacity-30"
            title="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
        </div>

        {isParticipant && myHP <= 0 && !isEnded && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-black/70 text-white text-xs font-semibold px-3 py-1.5 rounded-full whitespace-nowrap">
            💀 You were eliminated — spectating
          </div>
        )}

        {!isEnded && countingDown > 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 pointer-events-none">
            <span className="text-white text-6xl font-black">{countingDown}</span>
          </div>
        )}
        {isEnded && (
          <GameWinnerBanner
            winner={gameState?.winner_id ? players?.find((p) => String(p.user_id) === String(gameState.winner_id)) : null}
            gameType="tank_battle"
            gameStats={{
              lines: playerIds
                .slice()
                .sort((a, b) => getHP(b) - getHP(a))
                .map((id) => ({
                  label: playerInfoById[id]?.username || `Player ${id}`,
                  value: getHP(id) <= 0 ? 'Eliminated' : `${Math.max(0, getHP(id))} HP`,
                })),
            }}
            isForfeit={gameState?.status === 'forfeited'}
            onClose={onClose}
            onPostResult={onPostResult}
            secondaryAction={(gameState?.host_id ?? players?.[0]?.user_id) === currentUserId && onPlayAgain ? { label: 'Play Again 🔄', onClick: onPlayAgain } : undefined}
          />
        )}
      </div>

      {!isTouchDevice && !isEnded && (
        <div className="px-4 py-2 bg-gray-900/60 shrink-0 text-center text-[11px] text-gray-500">
          WASD/Arrows to move · Mouse to aim · Click or Space to fire · +/- (top right) to zoom
        </div>
      )}
    </div>
  );
}
