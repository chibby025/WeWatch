import React, { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { X, Volume2, VolumeX } from 'lucide-react';
import GameWinnerBanner from './GameWinnerBanner';
import GameRulesButton from './GameRulesButton';
import ControlsTutorialOverlay from './ControlsTutorialOverlay';

// Bomberman — real-time, N-player (2-4) grid duel. Extends the same
// "no authoritative physics server" trust model already proven in
// TankBattleGame.jsx to more than 2 players: every client owns and
// self-reports its own character's continuous pixel position via
// state_sync, and — the new idea for this game — whoever PLACES a bomb is
// the sole authority over the outcome of THAT bomb's explosion (which soft
// walls it destroys, which players it catches), reported once via an
// "explode" move the moment their own local fuse timer expires. This
// generalizes past 2 players for free: a bomb only ever has one owner
// regardless of how many other players are in the match.

const SOUND_BASE = 'https://letswatchout.b-cdn.net/games/sounds/bomberman';
// A handful of generic sfx already exist for tank_battle and fit here just
// as well (an explosion is an explosion) — reused directly from their own
// folder rather than re-synthesizing/re-uploading identical audio.
const SHARED_SOUND_BASE = 'https://letswatchout.b-cdn.net/games/sounds/tank_battle';
const SOUND_FILES = {
  explosion: `${SHARED_SOUND_BASE}/explosion.wav`,
  wall_break: `${SHARED_SOUND_BASE}/wall_break.wav`,
  pickup: `${SHARED_SOUND_BASE}/pickup.wav`,
  victory: `${SHARED_SOUND_BASE}/victory.wav`,
  defeat: `${SHARED_SOUND_BASE}/defeat.wav`,
  place_bomb: `${SOUND_BASE}/place_bomb.wav`,
  kick: `${SOUND_BASE}/kick.wav`,
  box_move: `${SOUND_BASE}/box_move.wav`,
};
let bombermanSoundEnabled = true;
function playBombermanSound(name, { volume = 0.5 } = {}) {
  if (!bombermanSoundEnabled) return;
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

// Same avatar-image loader as TankBattleGame.jsx — deliberately its own
// small local copy rather than a shared import, matching this codebase's
// existing convention for small per-game helpers (see CLAUDE.md's
// resolveMediaUrl/parseLRC precedent).
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

// Grid constants — MUST match bomberman.go's bombermanRows/Cols exactly.
const ROWS = 11;
const COLS = 13;
const TILE = 48;
const W = COLS * TILE;
const H = ROWS * TILE;
const PLAYER_R = 15;
const PLAYER_SPEED = 150; // px/sec
const FUSE_MS = 2200;
const BLAST_RADIUS = 2;
const STATE_SYNC_MS = 60;
// Must match bomberman.go's bombermanMaxBombsPerPlayer exactly — see the
// "Stacking" doc comment there.
const BOMBERMAN_MAX_BOMBS_PER_PLAYER = 3;
const REMOTE_EXTRAPOLATION_CAP_S = 0.3;

// Power-ups, carrying, kick — all client-computed-and-reported the same
// trust tier as everything else in this game (see bomberman.go's own v3
// doc comment). Must match bombermanMaxBlastBonus/BombBonus/SpeedBonus in
// bomberman.go for the caps to line up, though nothing actually breaks if
// they drift — the server enforces its own caps regardless.
const POWERUP_SPAWN_CHANCE = 0.35; // chance a JUST-broken wall reveals one
const POWERUP_TYPES = ['blast', 'bomb', 'speed', 'kick'];
const POWERUP_META = {
  blast: { color: '#f97316', label: '💥' },
  bomb: { color: '#3b82f6', label: '💣' },
  speed: { color: '#eab308', label: '⚡' },
  kick: { color: '#a855f7', label: '👢' },
};
const SPEED_BONUS_PER_STACK = 0.15; // +15% movement speed per speed pickup
const CARRY_SPEED_MULTIPLIER = 0.75; // moving a whole wall around is slower
const DEATH_ANIM_MS = 700;
const FACING_DIRS = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };

const PLAYER_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#eab308'];
// Must match bombermanSpawnPoints() in bomberman.go exactly.
const SPAWN_POINTS = [
  [1, 1],
  [1, COLS - 2],
  [ROWS - 2, 1],
  [ROWS - 2, COLS - 2],
];

function isIndestructible(r, c) {
  if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return true;
  if (r === 0 || r === ROWS - 1 || c === 0 || c === COLS - 1) return true;
  return r % 2 === 0 && c % 2 === 0;
}

function estimateSendVelocity(track, x, y, now) {
  const dtSec = Math.max((now - (track.t || now)) / 1000, 0.001);
  const vx = (x - (track.x ?? x)) / dtSec;
  const vy = (y - (track.y ?? y)) / dtSec;
  track.x = x; track.y = y; track.t = now;
  const cap = PLAYER_SPEED * 3;
  return { vx: Math.max(-cap, Math.min(cap, vx)), vy: Math.max(-cap, Math.min(cap, vy)) };
}

function extrapolatePos(anchor, now) {
  const elapsedS = Math.min(Math.max((now - anchor.t) / 1000, 0), REMOTE_EXTRAPOLATION_CAP_S);
  return {
    x: Math.max(PLAYER_R, Math.min(W - PLAYER_R, anchor.x + anchor.vx * elapsedS)),
    y: Math.max(PLAYER_R, Math.min(H - PLAYER_R, anchor.y + anchor.vy * elapsedS)),
  };
}

function gridToPixelCenter(r, c) {
  return { x: c * TILE + TILE / 2, y: r * TILE + TILE / 2 };
}
function pixelToGrid(x, y) {
  return { r: Math.floor(y / TILE), c: Math.floor(x / TILE) };
}

// Multi-tier wall helpers — mirror bomberman.go's own soft_walls ([r,c,tier])
// / wall_hits ("r,c" -> hit count) shapes exactly. A wall's tier is fixed at
// generation time; its hit count only ever grows as blasts land on it.
const WALL_TIER_LABEL = { 1: 'wooden', 2: 'concrete', 3: 'iron' };
function wallTierAt(softWalls, r, c) {
  const w = softWalls.find(([wr, wc]) => wr === r && wc === c);
  return w ? w[2] : null; // null = there was never a wall here at all
}
function wallHitsAt(wallHits, r, c) {
  return wallHits[`${r},${c}`] || 0;
}
// A cell with no wall at all is trivially "clear." A cell WITH a wall is
// only clear (passable, doesn't block a blast) once its hit count has
// caught up to its own tier.
function isWallCleared(softWalls, wallHits, r, c) {
  const tier = wallTierAt(softWalls, r, c);
  if (tier == null) return true;
  return wallHitsAt(wallHits, r, c) >= tier;
}

// Walks a kick from (startR, startC) one cell at a time in direction
// (dr, dc), stopping the instant something would block it (an indestructible
// cell, a still-standing wall, or another live bomb) — returns the last
// legitimately reachable cell. Mirrors the same "acting player's own client
// computes the outcome, server just applies it" trust tier already used
// throughout this game for bomb blasts. excludeBombId is the bomb actually
// being kicked, so it never blocks its own path.
function computeKickPath(startR, startC, dr, dc, softWalls, wallHits, activeBombs, excludeBombId) {
  let r = startR, c = startC;
  while (true) {
    const nr = r + dr, nc = c + dc;
    if (isIndestructible(nr, nc)) break;
    if (!isWallCleared(softWalls, wallHits, nr, nc)) break;
    const blockedByBomb = Object.entries(activeBombs).some(
      ([id, b]) => id !== excludeBombId && Number(b.r) === nr && Number(b.c) === nc
    );
    if (blockedByBomb) break;
    r = nr; c = nc;
  }
  return { r, c };
}

// A cheap, purely-visual approximation of a bomb's blast footprint — a
// cross shape stopping only at indestructible walls. Used only to decide
// where to draw the explosion flash animation on EVERY connected client
// (not just the bomb's owner, who's the only one with access to the exact
// wall-stopping computation resolveBomb does at resolution time). Not
// wall-tier-aware on purpose: computing the precise stopping point would
// need the wall state from the instant BEFORE this blast's own
// wall_hits_delta was already applied, which isn't available by the time a
// bomb disappears from active_bombs — a cosmetic flash extending a cell or
// two past where a soft wall actually stopped it is an acceptable trade
// for not needing to snapshot pre-blast wall state on every client.
function computeVisualBlastCells(br, bc) {
  const cells = [[br, bc]];
  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    for (let step = 1; step <= BLAST_RADIUS; step++) {
      const rr = br + dr * step, cc = bc + dc * step;
      if (isIndestructible(rr, cc)) break;
      cells.push([rr, cc]);
    }
  }
  return cells;
}
const EXPLOSION_FLASH_MS = 420;

// Draws one still-standing wall tile — a genuinely distinct look per tier
// (not just a recolor), with visible damage (cracks) that grows as hits
// accumulate toward that tier's own requirement.
function drawTieredWall(ctx, x, y, tier, hits) {
  const damageT = tier > 0 ? hits / tier : 0; // 0 = undamaged, approaching 1 = about to break
  if (tier === 1) {
    // Wooden — horizontal plank look.
    ctx.fillStyle = '#8a6a3a';
    ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1.5;
    for (let py = y + TILE / 3; py < y + TILE; py += TILE / 3) {
      ctx.beginPath();
      ctx.moveTo(x + 2, py);
      ctx.lineTo(x + TILE - 2, py);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 4, y + 4, TILE - 8, TILE - 8);
  } else if (tier === 2) {
    // Concrete — gray blockwork.
    ctx.fillStyle = '#8a8a8a';
    ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 3, y + 3, TILE / 2 - 4, TILE / 2 - 4);
    ctx.strokeRect(x + TILE / 2 + 1, y + 3, TILE / 2 - 4, TILE / 2 - 4);
    ctx.strokeRect(x + 3, y + TILE / 2 + 1, TILE / 2 - 4, TILE / 2 - 4);
    ctx.strokeRect(x + TILE / 2 + 1, y + TILE / 2 + 1, TILE / 2 - 4, TILE / 2 - 4);
  } else {
    // Iron — dark metal plate with corner rivets.
    ctx.fillStyle = '#4a5560';
    ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 3, y + 3, TILE - 6, TILE - 6);
    ctx.fillStyle = '#7a8894';
    for (const [rx, ry] of [[8, 8], [TILE - 8, 8], [8, TILE - 8], [TILE - 8, TILE - 8]]) {
      ctx.beginPath();
      ctx.arc(x + rx, y + ry, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Damage cracks — more, and more visible, as hits approach the tier.
  if (damageT > 0) {
    ctx.strokeStyle = `rgba(0,0,0,${Math.min(0.9, 0.35 + damageT * 0.5)})`;
    ctx.lineWidth = 2;
    const crackCount = Math.min(3, Math.ceil(damageT * 3));
    for (let i = 0; i < crackCount; i++) {
      const cx0 = x + TILE * (0.2 + 0.6 * ((i * 0.37) % 1));
      const cy0 = y + TILE * (0.15 + 0.2 * i);
      ctx.beginPath();
      ctx.moveTo(cx0, cy0);
      ctx.lineTo(cx0 + TILE * 0.18 * (i % 2 === 0 ? 1 : -1), cy0 + TILE * 0.5);
      ctx.stroke();
    }
  }
}

export default function BombermanGame({ gameState, players, currentUserId, onMove, onClose, onEndGame, onPostResult, introResolved = true, onPlayAgain }) {
  const gs = gameState?.game_state || {};
  const phase = gs.phase || 'playing';
  const isEnded = phase === 'ended' || gameState?.status === 'completed' || gameState?.status === 'forfeited';
  const myId = String(currentUserId);

  const orderedPlayers = players || [];
  const orderedPlayersRef = useRef(orderedPlayers);
  orderedPlayersRef.current = orderedPlayers;
  const myIndex = orderedPlayers.findIndex((p) => String(p.user_id) === myId);
  const isPlayer = myIndex >= 0;
  const softWalls = gs.soft_walls || []; // [[r, c, tier], ...] — tier 1/2/3 = wooden/concrete/iron
  const wallHits = gs.wall_hits || {}; // "r,c" -> running hit count so far
  const playersAlive = useMemo(() => gs.players_alive || {}, [gs.players_alive]);
  const activeBombs = useMemo(() => gs.active_bombs || {}, [gs.active_bombs]);
  // carriedWalls: player id -> [tier, hits] for whoever's currently carrying
  // a wall. pickups: "r,c" -> power-up type, sitting on the grid until
  // someone grabs it. playerUpgrades: player id -> {blast_bonus, bomb_bonus,
  // speed_bonus, has_kick} — all three mirror bomberman.go's own field names
  // exactly (see that file's v3 doc comment).
  const carriedWalls = gs.carried_walls || {};
  const pickups = gs.pickups || {};
  const playerUpgrades = gs.player_upgrades || {};
  const isCarrying = !!carriedWalls[myId];
  const myUpgrades = playerUpgrades[myId] || {};
  const hasKick = !!myUpgrades.has_kick;

  // Mirrored into refs (kept fresh every render, no extra effect needed —
  // a ref write during render is safe here since nothing reads it back
  // during THIS same render) so the main render loop and its callbacks
  // below can read the always-current value every frame without needing
  // any of these in their OWN dependency arrays. This is the fix for a
  // real "freezing when people move" bug: these 4 values change on EVERY
  // broadcast that touches bombs/walls/eliminations — i.e. any time ANY
  // player places or detonates a bomb, not just yours — and the render
  // loop effect below used to list JSON.stringify(...) of them as
  // dependencies, meaning the ENTIRE canvas/RAF/resize-listener chain was
  // torn down and rebuilt from scratch on every such broadcast. In active
  // multiplayer play that's frequent enough to cause a visible hitch every
  // time, which is exactly what was reported.
  const softWallsRef = useRef(softWalls);
  softWallsRef.current = softWalls;
  const wallHitsRef = useRef(wallHits);
  wallHitsRef.current = wallHits;
  const playersAliveRef = useRef(playersAlive);
  playersAliveRef.current = playersAlive;
  const activeBombsRef = useRef(activeBombs);
  activeBombsRef.current = activeBombs;
  const carriedWallsRef = useRef(carriedWalls);
  carriedWallsRef.current = carriedWalls;
  const pickupsRef = useRef(pickups);
  pickupsRef.current = pickups;
  const playerUpgradesRef = useRef(playerUpgrades);
  playerUpgradesRef.current = playerUpgrades;

  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  // CONFIRMED root cause of "jagged/slow/freezing" reported for TankBattle —
  // the identical bug exists here too, for the same reason: onMove
  // (GameOverlay's handleMove) is a plain, unmemoized function recreated on
  // every render, and this game's own state_sync relay fires continuously
  // (~16Hz per player, up to 4 players) while playing. With `onMove` listed
  // directly in tryPlaceBomb/resolveBomb/the render-loop effect's own
  // dependency arrays, every single one of those broadcasts was tearing
  // down and rebuilding callbacks (and, for the render loop, the whole
  // canvas/RAF chain) — see this file's own already-fixed activeBombs/
  // playersAlive/softWalls/wallHits refs above for the first half of this
  // exact bug class; onMove was the one offender left over.
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try { return localStorage.getItem('bomberman_sound_enabled') !== 'false'; } catch { return true; }
  });
  useEffect(() => {
    bombermanSoundEnabled = soundEnabled;
    try { localStorage.setItem('bomberman_sound_enabled', String(soundEnabled)); } catch { /* ignore */ }
  }, [soundEnabled]);

  const [countingDown, setCountingDown] = useState(3);
  useEffect(() => {
    // Don't start the 3-2-1 countdown while the GameStartInfoModal intro
    // popup is still covering the screen (~2s) — previously this ran the
    // instant the component mounted, racing against that popup so players
    // only ever actually saw the last ~1s of it once the popup dismissed.
    if (isEnded || !introResolved) return undefined;
    setCountingDown(3);
    const t1 = setTimeout(() => setCountingDown(2), 700);
    const t2 = setTimeout(() => setCountingDown(1), 1400);
    const t3 = setTimeout(() => setCountingDown(0), 2100);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [isEnded, introResolved]);

  const mySpawn = myIndex >= 0 && myIndex < SPAWN_POINTS.length ? SPAWN_POINTS[myIndex] : [1, 1];
  const myStart = gridToPixelCenter(mySpawn[0], mySpawn[1]);

  const S = useRef({
    my: { x: myStart.x, y: myStart.y, vx: 0, vy: 0 },
    // remotePlayers: { [userId]: { anchor: {x,y,vx,vy,t}, color } }
    remoteAnchors: {},
    sendTrack: { x: myStart.x, y: myStart.y, t: 0 },
    keys: { w: false, a: false, s: false, d: false },
    lastStateSyncAt: 0,
    joyVec: { x: 0, y: 0 },
    // Local fuse-tracking: bombId -> firstSeenAt (ms) — a per-client visual
    // approximation; only the bomb's own OWNER's local timer actually
    // triggers the authoritative "explode" move.
    bombSeenAt: {},
    // bombId -> {r,c} cached the first time each bomb is seen, so the flash
    // spawned when it disappears still knows where it was (active_bombs
    // itself no longer has it by then).
    bombCellAt: {},
    resolvedBombIds: new Set(),
    // Local visual-only explosion flashes: [{cells:[[r,c],...], startedAt}]
    explosionFlashes: [],
    lastActiveBombKeys: '',
    // Last non-zero movement direction — which of the 4 grid-adjacent cells
    // 'f' (interact) targets for carrying/kicking, since this game otherwise
    // has no discrete "facing" concept (movement is continuous WASD/joystick
    // input, not grid-locked).
    facing: 'down',
    // Death fade-out window per player id (performance.now()-based) — see
    // DEATH_ANIM_MS. Not just for me; every eliminated player gets this.
    deathAnimUntil: {},
    // Grid cells I've already sent a grab_pickup for and am still standing
    // on — throttles the request while lingering, same idea as tank_battle's
    // lastGrabAttemptId. Cleared per-cell the instant that cell no longer
    // has a pickup (see the render loop), so a cell can be re-grabbed if a
    // genuinely new pickup later spawns there.
    grabAttempted: new Set(),
  });

  // Seed/refresh remote player anchors from the broadcast state.
  useEffect(() => {
    for (const p of orderedPlayers) {
      const pid = String(p.user_id);
      if (pid === myId) continue;
      const snap = gs[`player_${pid}`];
      if (snap && typeof snap === 'object') {
        const idx = orderedPlayers.findIndex((pp) => String(pp.user_id) === pid);
        const spawn = idx >= 0 && idx < SPAWN_POINTS.length ? SPAWN_POINTS[idx] : [1, 1];
        const startPx = gridToPixelCenter(spawn[0], spawn[1]);
        if (!S.current.remoteAnchors[pid]) {
          S.current.remoteAnchors[pid] = { x: startPx.x, y: startPx.y, vx: 0, vy: 0, t: Date.now() };
        }
        const a = S.current.remoteAnchors[pid];
        a.x = typeof snap.x === 'number' ? snap.x : a.x;
        a.y = typeof snap.y === 'number' ? snap.y : a.y;
        a.vx = typeof snap.vx === 'number' ? snap.vx : 0;
        a.vy = typeof snap.vy === 'number' ? snap.vy : 0;
        a.t = Date.now();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(orderedPlayers.map((p) => gs[`player_${p.user_id}`]))]);

  // Track newly-seen bombs (for fuse timing) and detect resolved ones (for
  // an explosion flash) by diffing active_bombs against last render.
  useEffect(() => {
    const keys = Object.keys(activeBombs);
    for (const k of keys) {
      if (!(k in S.current.bombSeenAt)) {
        S.current.bombSeenAt[k] = Date.now();
        const b = activeBombs[k];
        if (b) S.current.bombCellAt[k] = { r: Number(b.r), c: Number(b.c) };
      }
    }
    const prevKeys = S.current.lastActiveBombKeys ? S.current.lastActiveBombKeys.split(',') : [];
    for (const prevKey of prevKeys) {
      if (prevKey && !keys.includes(prevKey)) {
        // This bomb just resolved — spawn a real explosion flash at its
        // last known cell (previously this branch was a no-op — the
        // comment said "play a flash" but nothing actually happened).
        const cell = S.current.bombCellAt[prevKey];
        if (cell) {
          S.current.explosionFlashes.push({
            cells: computeVisualBlastCells(cell.r, cell.c),
            startedAt: Date.now(),
          });
        }
        delete S.current.bombSeenAt[prevKey];
        delete S.current.bombCellAt[prevKey];
        S.current.resolvedBombIds.delete(prevKey);
      }
    }
    S.current.lastActiveBombKeys = keys.join(',');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(activeBombs)]);

  const canPlay = isPlayer && !isEnded && countingDown === 0 && playersAlive[myId] !== false;
  const hasMyBomb = Object.values(activeBombs).some((b) => Number(b.owner_id) === Number(currentUserId));

  // Stable identity (empty deps) — reads the always-current wall state via
  // the refs above instead of closing over softWalls/wallHits directly, so
  // this never needs to change reference just because a wall changed.
  const isWallAt = useCallback((r, c) => {
    if (isIndestructible(r, c)) return true;
    return !isWallCleared(softWallsRef.current, wallHitsRef.current, r, c);
  }, []);

  const tryPlaceBomb = useCallback(() => {
    if (!canPlay) return;
    const myBombCount = Object.values(activeBombsRef.current).filter((b) => Number(b.owner_id) === Number(currentUserId)).length;
    const myMaxBombs = BOMBERMAN_MAX_BOMBS_PER_PLAYER + (playerUpgradesRef.current[String(currentUserId)]?.bomb_bonus || 0);
    if (myBombCount >= myMaxBombs) return;
    const { r, c } = pixelToGrid(S.current.my.x, S.current.my.y);
    if (isWallAt(r, c)) return;
    onMoveRef.current({ move_type: 'place_bomb', r, c });
    playBombermanSound('place_bomb', { volume: 0.4 });
  }, [canPlay, currentUserId, isWallAt]);

  // Resolves one of MY OWN bombs right now — computes the exact same
  // blast-path/hit-detection this game's fixed-fuse timer already does
  // (bomberman.go's own doc comment: whoever PLACES a bomb is the sole
  // authority over its explosion), just triggered on demand instead of
  // waiting for the fuse. Shared by the natural-fuse-expiry interval below,
  // the manual detonate control, AND a bomb this player owns getting
  // chained (forced=true) by someone else's blast — same computation
  // either way, only the trigger differs.
  const resolveBomb = useCallback((bombId, bomb) => {
    if (S.current.resolvedBombIds.has(bombId)) return;
    S.current.resolvedBombIds.add(bombId);
    const now = Date.now();
    // Read the freshest possible state via refs rather than closing over
    // whatever softWalls/wallHits/activeBombs/playersAlive looked like when
    // this callback was last (re)created — also what lets this function's
    // own identity stay stable, which in turn keeps the 150ms fuse-checker
    // interval and the manual-detonate handler from needlessly re-binding.
    const softWallsNow = softWallsRef.current;
    const wallHitsNow = wallHitsRef.current;
    const activeBombsNow = activeBombsRef.current;
    const playersAliveNow = playersAliveRef.current;
    // This bomb is always MY OWN (only a bomb's own owner ever resolves it —
    // bomberman.go's own doc comment), so MY blast-radius upgrades are what
    // apply here, never the target's.
    const myBlastRadius = BLAST_RADIUS + (playerUpgradesRef.current[myId]?.blast_bonus || 0);

    const br = Number(bomb.r), bc = Number(bomb.c);
    const wallHitsDelta = [];
    const chainedBombIds = [];
    const spawnedPickups = [];
    const hitCells = new Set([`${br},${bc}`]);
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      for (let step = 1; step <= myBlastRadius; step++) {
        const rr = br + dr * step, cc = bc + dc * step;
        if (isIndestructible(rr, cc)) break;
        hitCells.add(`${rr},${cc}`);

        // A bomb sitting in the blast path never blocks it (real
        // Bomberman) — the blast continues past that cell exactly like an
        // empty floor tile, it just also chains that bomb along the way.
        for (const [otherId, otherBomb] of Object.entries(activeBombsNow)) {
          if (otherId === bombId) continue;
          if (Number(otherBomb.r) === rr && Number(otherBomb.c) === cc) {
            chainedBombIds.push(Number(otherId));
          }
        }

        const tier = wallTierAt(softWallsNow, rr, cc);
        if (tier != null && wallHitsAt(wallHitsNow, rr, cc) < tier) {
          // A real, still-standing wall — this blast damages it (and stops
          // here regardless of whether this particular hit finishes it
          // off, same as an undamaged wall always has).
          wallHitsDelta.push([rr, cc]);
          // A wall THIS specific hit finishes off has a chance to reveal a
          // power-up — the classic "break a crate, find an upgrade" loop.
          // Rolled here (by the same player who's already the authority for
          // this blast's outcome) rather than server-side, matching this
          // game's established trust model.
          const newHitCount = wallHitsAt(wallHitsNow, rr, cc) + 1;
          if (newHitCount >= tier && Math.random() < POWERUP_SPAWN_CHANCE) {
            const type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
            spawnedPickups.push([rr, cc, type]);
          }
          break;
        }
      }
    }
    const hitPlayerIds = [];
    for (const p of orderedPlayersRef.current) {
      const pid = String(p.user_id);
      if (playersAliveNow[pid] === false) continue;
      const pos = pid === myId ? S.current.my : extrapolatePos(S.current.remoteAnchors[pid] || { x: -999, y: -999, vx: 0, vy: 0, t: now }, now);
      const { r: pr, c: pc } = pixelToGrid(pos.x, pos.y);
      if (hitCells.has(`${pr},${pc}`)) hitPlayerIds.push(Number(pid));
    }

    onMoveRef.current({
      move_type: 'explode', bomb_id: Number(bombId),
      wall_hits_delta: wallHitsDelta, hit_player_ids: hitPlayerIds, chained_bomb_ids: chainedBombIds,
      spawned_pickups: spawnedPickups,
    });
  }, [myId]);

  // Resolve my own bombs once their local fuse timer expires — OR the
  // instant they're flagged `forced` (chained by someone else's blast; see
  // bomberman.go's own chained_bomb_ids handling). Same trigger check
  // either way, just a different reason to stop waiting.
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      for (const [bombId, bomb] of Object.entries(activeBombs)) {
        if (Number(bomb.owner_id) !== Number(currentUserId)) continue;
        if (S.current.resolvedBombIds.has(bombId)) continue;
        const seenAt = S.current.bombSeenAt[bombId] || now;
        const fuseExpired = now - seenAt >= FUSE_MS;
        if (!fuseExpired && !bomb.forced) continue;
        resolveBomb(bombId, bomb);
      }
    }, 150);
    return () => clearInterval(interval);
  }, [activeBombs, currentUserId, resolveBomb]);

  // Detonate on demand — "users need to be able to detonate their bombs at
  // will." Now that stacking allows more than one live bomb at once (see
  // BOMBERMAN_MAX_BOMBS_PER_PLAYER), this triggers ALL of my own currently
  // -armed bombs together — the classic "remote detonator" convention
  // (blow up everything you've placed at once), and a natural way to set
  // up your own multi-bomb chain reactions on purpose.
  const tryDetonateMine = useCallback(() => {
    if (!canPlay) return;
    const mine = Object.entries(activeBombsRef.current).filter(
      ([bombId, b]) => Number(b.owner_id) === Number(currentUserId) && !S.current.resolvedBombIds.has(bombId),
    );
    for (const [bombId, bomb] of mine) resolveBomb(bombId, bomb);
  }, [canPlay, currentUserId, resolveBomb]);

  // Single context-sensitive "interact" action, targeting whichever cell is
  // adjacent to me in my current facing direction:
  //   - if I'm already carrying a wall -> try to drop it there
  //   - else if I have Kick and a live bomb sits there -> kick it
  //   - else if a destructible wall sits there -> pick it up
  // One key/button handles all three, matching how many games use a single
  // context-sensitive interact button rather than separate bindings per
  // action.
  const tryInteract = useCallback(() => {
    if (!canPlay) return;
    const { r, c } = pixelToGrid(S.current.my.x, S.current.my.y);
    const [dr, dc] = FACING_DIRS[S.current.facing];
    const tr = r + dr, tc = c + dc;

    if (carriedWallsRef.current[myId]) {
      onMoveRef.current({ move_type: 'drop_wall', r: tr, c: tc });
      playBombermanSound('box_move', { volume: 0.4 });
      return;
    }

    if (playerUpgradesRef.current[myId]?.has_kick) {
      const bombEntry = Object.entries(activeBombsRef.current).find(
        ([, b]) => Number(b.r) === tr && Number(b.c) === tc
      );
      if (bombEntry) {
        const [bombId] = bombEntry;
        const dest = computeKickPath(tr, tc, dr, dc, softWallsRef.current, wallHitsRef.current, activeBombsRef.current, bombId);
        if (dest.r !== tr || dest.c !== tc) {
          onMoveRef.current({ move_type: 'kick_bomb', bomb_id: Number(bombId), new_r: dest.r, new_c: dest.c });
          playBombermanSound('kick', { volume: 0.5 });
        }
        return; // a bomb sat there either way -- never fall through to wall pickup for the same cell
      }
    }

    if (isWallAt(tr, tc) && !isIndestructible(tr, tc)) {
      onMoveRef.current({ move_type: 'pickup_wall', r: tr, c: tc });
      playBombermanSound('box_move', { volume: 0.4 });
    }
  }, [canPlay, myId, isWallAt]);

  // Sound/haptic feedback when a bomb resolves (any bomb disappearing from
  // active_bombs, not just my own) — a shared, visible/audible "boom."
  const prevBombKeysRef = useRef('');
  useEffect(() => {
    const keys = Object.keys(activeBombs).sort().join(',');
    if (prevBombKeysRef.current && keys !== prevBombKeysRef.current) {
      const prevSet = new Set(prevBombKeysRef.current.split(',').filter(Boolean));
      const curSet = new Set(keys.split(',').filter(Boolean));
      const anyResolved = [...prevSet].some((k) => !curSet.has(k));
      if (anyResolved) { playBombermanSound('explosion', { volume: 0.4 }); hapticImpact([20, 40, 20]); }
    }
    prevBombKeysRef.current = keys;
  }, [activeBombs]);

  // Elimination feedback — generalized to every player, not just myself:
  // a real explosion flash (reusing the exact same radial-burst rendering a
  // bomb blast already uses, just at the eliminated player's own cell) plus
  // a fading/shrinking death animation (see the "Players" render block)
  // instead of the previous instant disappearance.
  const prevAliveMapRef = useRef({});
  useEffect(() => {
    const prevMap = prevAliveMapRef.current;
    for (const p of orderedPlayersRef.current) {
      const pid = String(p.user_id);
      const wasAlive = prevMap[pid] !== false; // default true if never seen before
      const isAliveNow = playersAlive[pid] !== false;
      if (wasAlive && !isAliveNow) {
        const isMe = pid === myId;
        const pos = isMe
          ? { x: S.current.my.x, y: S.current.my.y }
          : extrapolatePos(S.current.remoteAnchors[pid] || { x: -999, y: -999, vx: 0, vy: 0, t: Date.now() }, Date.now());
        const { r, c } = pixelToGrid(pos.x, pos.y);
        S.current.explosionFlashes.push({ cells: [[r, c]], startedAt: Date.now() });
        S.current.deathAnimUntil[pid] = performance.now() + DEATH_ANIM_MS;
        playBombermanSound('explosion', { volume: isMe ? 0.6 : 0.45 });
        if (isMe) hapticImpact([30, 60, 30]);
      }
    }
    const nextPrev = {};
    for (const p of orderedPlayersRef.current) nextPrev[String(p.user_id)] = playersAlive[String(p.user_id)] !== false;
    prevAliveMapRef.current = nextPrev;
  }, [playersAlive, myId]);

  // Match-end sting — victory for the actual winner, defeat for everyone
  // else, or the neutral explosion cue for a genuine draw/forced end with no
  // single winner.
  useEffect(() => {
    if (!isEnded) return;
    const winnerId = gameState?.winner_id != null ? String(gameState.winner_id) : null;
    if (winnerId === myId) {
      playBombermanSound('victory', { volume: 0.55 });
      hapticImpact([20, 40, 20, 40, 60]);
    } else if (winnerId) {
      playBombermanSound('defeat', { volume: 0.5 });
    } else {
      playBombermanSound('explosion', { volume: 0.5 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEnded]);

  // ── Keyboard (desktop) ───────────────────────────────────────────────
  useEffect(() => {
    const onKeyDown = (e) => {
      const k = e.key.toLowerCase();
      if (k === 'w' || k === 'arrowup') S.current.keys.w = true;
      if (k === 'a' || k === 'arrowleft') S.current.keys.a = true;
      if (k === 's' || k === 'arrowdown') S.current.keys.s = true;
      if (k === 'd' || k === 'arrowright') S.current.keys.d = true;
      if (k === ' ') { e.preventDefault(); tryPlaceBomb(); }
      if (k === 'e') { e.preventDefault(); tryDetonateMine(); }
      if (k === 'f') { e.preventDefault(); tryInteract(); }
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
  }, [tryPlaceBomb, tryDetonateMine, tryInteract]);

  // ── Main physics/render loop ─────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return undefined;

    // devicePixelRatio-aware backing-store sizing — previously the canvas's
    // internal pixel buffer was sized to raw CSS pixels with no DPR
    // multiplier, which renders visibly soft on any retina/high-DPI phone
    // regardless of source art quality. The CSS box itself (w-full h-full,
    // via Tailwind classes on the <canvas> element) is untouched — only the
    // backing-store RESOLUTION changes, and since the render loop below
    // derives its scale from canvas.width/canvas.height directly (already
    // DPR-multiplied here), no separate ctx.scale(dpr,...) call is needed on
    // top of it.
    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
    };
    resize();
    window.addEventListener('resize', resize);

    const ctx = canvas.getContext('2d');
    let raf;
    let lastT = performance.now();

    const canMoveTo = (x, y) => {
      const corners = [
        [x - PLAYER_R, y - PLAYER_R], [x + PLAYER_R, y - PLAYER_R],
        [x - PLAYER_R, y + PLAYER_R], [x + PLAYER_R, y + PLAYER_R],
      ];
      return corners.every(([cx, cy]) => {
        const { r, c } = pixelToGrid(cx, cy);
        return !isWallAt(r, c);
      });
    };

    const draw = () => {
      const now = performance.now();
      const dt = Math.min((now - lastT) / 1000, 0.05);
      lastT = now;
      const s = S.current;

      if (canPlay) {
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
          // Facing = whichever axis dominates this frame's input, resolved
          // to one of the 4 grid-adjacent directions — used by tryInteract
          // to pick which cell to target, since movement itself is
          // continuous, not grid-locked.
          s.facing = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
          const myUpgrades = playerUpgradesRef.current[myId] || {};
          const speedMult = (1 + (myUpgrades.speed_bonus || 0) * SPEED_BONUS_PER_STACK) * (carriedWallsRef.current[myId] ? CARRY_SPEED_MULTIPLIER : 1);
          const effectiveSpeed = PLAYER_SPEED * speedMult;
          const nx = s.my.x + dx * effectiveSpeed * dt;
          const ny = s.my.y + dy * effectiveSpeed * dt;
          if (canMoveTo(nx, s.my.y)) s.my.x = Math.max(PLAYER_R, Math.min(W - PLAYER_R, nx));
          if (canMoveTo(s.my.x, ny)) s.my.y = Math.max(PLAYER_R, Math.min(H - PLAYER_R, ny));
          s.my.vx = dx * effectiveSpeed;
          s.my.vy = dy * effectiveSpeed;
        } else {
          s.my.vx = 0; s.my.vy = 0;
        }

        const nowMs = Date.now();
        if (nowMs - s.lastStateSyncAt > STATE_SYNC_MS) {
          s.lastStateSyncAt = nowMs;
          const { vx, vy } = estimateSendVelocity(s.sendTrack, s.my.x, s.my.y, nowMs);
          onMoveRef.current({ move_type: 'state_sync', x: s.my.x, y: s.my.y, vx, vy });
        }

        // Power-up grab — checked against whichever cell I'm currently
        // standing on. Throttled to one attempt per cell while lingering
        // (grabAttempted), and self-cleaning the instant that cell no
        // longer has a pickup so a genuinely NEW one spawning there later
        // can still be grabbed.
        const { r: myR, c: myC } = pixelToGrid(s.my.x, s.my.y);
        const pickupKey = `${myR},${myC}`;
        if (!pickupsRef.current[pickupKey]) {
          s.grabAttempted.delete(pickupKey);
        } else if (!s.grabAttempted.has(pickupKey)) {
          s.grabAttempted.add(pickupKey);
          onMoveRef.current({ move_type: 'grab_pickup', r: myR, c: myC });
        }
      }

      // ── Render ──
      // Uniform scale (never independent X/Y factors) + letterbox centering —
      // same fix as TankBattleGame.jsx's identical bug: a non-uniform
      // ctx.scale(canvas.width/W, canvas.height/H) stretches/squishes
      // whenever the container's real aspect ratio differs from the fixed
      // logical W:H, which combined with the missing-DPR blur above is what
      // made this game look wrong on most phones.
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      const bmScale = Math.min(canvas.width / W, canvas.height / H);
      ctx.translate(canvas.width / 2 - (W / 2) * bmScale, canvas.height / 2 - (H / 2) * bmScale);
      ctx.scale(bmScale, bmScale);

      ctx.fillStyle = '#4a3820';
      ctx.fillRect(0, 0, W, H);
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          const x = c * TILE, y = r * TILE;
          if (isIndestructible(r, c)) {
            ctx.fillStyle = '#2b2b2b';
            ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
            continue;
          }
          const tier = wallTierAt(softWallsRef.current, r, c);
          if (tier == null || isWallCleared(softWallsRef.current, wallHitsRef.current, r, c)) {
            ctx.fillStyle = '#5c4a2a';
            ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
            continue;
          }
          drawTieredWall(ctx, x, y, tier, wallHitsAt(wallHitsRef.current, r, c));
        }
      }

      // Bombs (with a pulsing fuse indicator)
      Object.entries(activeBombsRef.current).forEach(([bombId, bomb]) => {
        const { x, y } = gridToPixelCenter(Number(bomb.r), Number(bomb.c));
        const seenAt = s.bombSeenAt[bombId] || Date.now();
        const elapsed = Date.now() - seenAt;
        const pulse = 0.7 + 0.3 * Math.sin(elapsed / 120);
        ctx.beginPath();
        ctx.arc(x, y, 14 * pulse, 0, Math.PI * 2);
        ctx.fillStyle = '#1a1a1a';
        ctx.fill();
        ctx.strokeStyle = elapsed > FUSE_MS * 0.7 ? '#ff4444' : '#ffaa00';
        ctx.lineWidth = 3;
        ctx.stroke();
      });

      // Explosion flashes — an expanding, fading fireball per affected
      // cell, spawned the instant a bomb disappears from active_bombs (see
      // the bomb-diffing effect above). Runs identically on every connected
      // client, not just the bomb's owner. Cheap 2D radial-gradient bursts,
      // matching this canvas's own visual style rather than pulling in a
      // particle library for a ~400ms effect.
      if (s.explosionFlashes.length) {
        const nowFx = Date.now();
        s.explosionFlashes = s.explosionFlashes.filter((fx) => nowFx - fx.startedAt < EXPLOSION_FLASH_MS);
        for (const fx of s.explosionFlashes) {
          const t = (nowFx - fx.startedAt) / EXPLOSION_FLASH_MS; // 0 → 1
          const radius = TILE * (0.18 + 0.46 * t);
          const alpha = 1 - t;
          for (const [fr, fc] of fx.cells) {
            const { x: fx2, y: fy2 } = gridToPixelCenter(fr, fc);
            const grad = ctx.createRadialGradient(fx2, fy2, 0, fx2, fy2, radius);
            grad.addColorStop(0, `rgba(255, 255, 220, ${0.95 * alpha})`);
            grad.addColorStop(0.45, `rgba(255, 170, 40, ${0.85 * alpha})`);
            grad.addColorStop(1, `rgba(255, 60, 20, 0)`);
            ctx.beginPath();
            ctx.arc(fx2, fy2, radius, 0, Math.PI * 2);
            ctx.fillStyle = grad;
            ctx.fill();
          }
        }
      }

      // Power-ups sitting on the grid, not yet grabbed by anyone.
      for (const [key, type] of Object.entries(pickupsRef.current)) {
        const [pr, pc] = key.split(',').map(Number);
        const meta = POWERUP_META[type];
        if (!meta) continue;
        const { x: px, y: py } = gridToPixelCenter(pr, pc);
        const bob = Math.sin(now / 220) * 2;
        ctx.save();
        ctx.beginPath();
        ctx.arc(px, py + bob, TILE * 0.28, 0, Math.PI * 2);
        ctx.globalAlpha = 0.85;
        ctx.fillStyle = meta.color;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.font = `${Math.round(TILE * 0.4)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(meta.label, px, py + bob);
        ctx.restore();
      }

      // Players — a fading, shrinking hull for ~DEATH_ANIM_MS instead of
      // instantly disappearing the moment players_alive flips false (see the
      // generalized elimination-feedback effect above, which sets
      // deathAnimUntil and spawns the explosion flash this reads).
      orderedPlayersRef.current.forEach((p, idx) => {
        const pid = String(p.user_id);
        const isAliveNow = playersAliveRef.current[pid] !== false;
        const deathUntil = s.deathAnimUntil[pid] || 0;
        const dying = performance.now() < deathUntil;
        if (!isAliveNow && !dying) return; // fully gone

        let alpha = 1, scale = 1;
        if (dying) {
          const progress = 1 - Math.max(0, (deathUntil - performance.now()) / DEATH_ANIM_MS);
          alpha = Math.max(0, 1 - progress);
          scale = Math.max(0.2, 1 - progress * 0.6);
        }

        const color = PLAYER_COLORS[idx % PLAYER_COLORS.length];
        const pos = pid === myId ? s.my : extrapolatePos(s.remoteAnchors[pid] || { x: -999, y: -999, vx: 0, vy: 0, t: Date.now() }, Date.now());
        const img = loadAvatarImage(p.avatar);

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(pos.x, pos.y);
        ctx.scale(scale, scale);
        if (img) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(0, 0, PLAYER_R, 0, Math.PI * 2);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(img, -PLAYER_R, -PLAYER_R, PLAYER_R * 2, PLAYER_R * 2);
          ctx.restore();
          ctx.beginPath();
          ctx.arc(0, 0, PLAYER_R, 0, Math.PI * 2);
          ctx.strokeStyle = color;
          ctx.lineWidth = 2.5;
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, PLAYER_R, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.4)';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        if (pid === myId && !dying) {
          ctx.beginPath();
          ctx.arc(0, 0, PLAYER_R + 4, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255,255,255,0.6)';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        ctx.restore();
        ctx.globalAlpha = 1;

        // Carrying indicator — a small wall-tile icon above the head, so
        // it's clear at a glance who's currently holding one (and therefore
        // moving slower).
        if (!dying && carriedWallsRef.current[pid]) {
          ctx.fillStyle = 'rgba(138, 106, 58, 0.95)';
          ctx.fillRect(pos.x - 7, pos.y - PLAYER_R - 16, 14, 12);
          ctx.strokeStyle = 'rgba(0,0,0,0.4)';
          ctx.lineWidth = 1;
          ctx.strokeRect(pos.x - 7, pos.y - PLAYER_R - 16, 14, 12);
        }
      });

      ctx.restore();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
    // canPlay/isWallAt/myId are the only things this loop genuinely needs to
    // rebuild for — activeBombs/playersAlive/softWalls/wallHits (see the
    // refs above) and onMove (see onMoveRef above) are deliberately NOT
    // here: both change on every broadcast (a bomb placed/exploded by ANY
    // player, or simply this game's own continuous ~16Hz state_sync relay)
    // and used to tear down and rebuild this whole canvas/RAF/resize-
    // listener chain on every single one — the confirmed cause of a visible
    // freeze/hitch during normal multiplayer play. The draw loop now reads
    // the latest values every frame via refs instead, so it stays live-
    // updated without ever needing to restart for this reason.
  }, [canPlay, isWallAt, myId]);

  // ── Touch joystick ────────────────────────────────────────────────────
  const joyBaseRef = useRef({ x: 0, y: 0 });
  const handleJoyStart = (e) => {
    const t = e.touches[0];
    joyBaseRef.current = { x: t.clientX, y: t.clientY };
  };
  const handleJoyMove = (e) => {
    const t = e.touches[0];
    const dx = t.clientX - joyBaseRef.current.x;
    const dy = t.clientY - joyBaseRef.current.y;
    const mag = Math.hypot(dx, dy) || 1;
    const clamped = Math.min(mag, 44);
    S.current.joyVec = mag > 6 ? { x: (dx / mag) * (clamped / 44), y: (dy / mag) * (clamped / 44) } : { x: 0, y: 0 };
  };
  const handleJoyEnd = () => { S.current.joyVec = { x: 0, y: 0 }; };

  const handleForfeit = () => {
    onEndGame?.();
    onClose?.();
  };

  if (!isPlayer) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
        <div className="bg-gray-900 rounded-2xl p-8 text-center max-w-sm mx-4">
          <div className="text-5xl mb-4">💣</div>
          <h2 className="text-white text-xl font-bold mb-2">Bomberman</h2>
          <p className="text-gray-400 text-sm mb-4">Spectating this match!</p>
          <button onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium">Close</button>
        </div>
      </div>
    );
  }

  const aliveCount = orderedPlayers.filter((p) => playersAlive[String(p.user_id)] !== false).length;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950">
      {!isEnded && (
        <ControlsTutorialOverlay
          gameType="bomberman"
          steps={isTouchDevice
            ? [
                { icon: 'joystick', text: 'Left joystick moves your character around the maze.' },
                { icon: 'tap', text: 'Tap 💣 to drop a bomb; tap DETONATE to blow up your own bombs early.' },
                { icon: 'tap', text: 'Tap 📦 facing a box to pick it up and carry it — hide behind it, drop it elsewhere, or tap it again to set it down. Grab a power-up dropped from a broken box to boost your blast, bomb count, speed, or kick bombs to shove them away.' },
              ]
            : [
                { icon: 'joystick', text: 'WASD or the arrow keys move your character.' },
                { icon: 'tap', text: 'Space drops a bomb — E detonates your own bombs on demand.' },
                { icon: 'tap', text: 'F interacts with whatever you\'re facing: pick up or drop a box to carry it and hide behind it, or kick a bomb to send it sliding. Power-ups drop from broken boxes.' },
              ]}
        />
      )}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800 shrink-0">
        <span className="text-white font-bold text-sm">💣 Bomberman</span>
        <div className="flex items-center gap-3">
          <GameRulesButton gameType="bomberman" />
          <button onClick={() => setSoundEnabled((v) => !v)} className="text-gray-400 hover:text-white" title={soundEnabled ? 'Mute' : 'Unmute'}>
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          <button onClick={handleForfeit} className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold">
            End Match
          </button>
          <button onClick={handleForfeit} className="text-gray-400 hover:text-white" title="End Match">
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex items-center justify-center gap-2 px-4 py-1.5 bg-gray-900/60 shrink-0">
        {orderedPlayers.map((p, idx) => {
          const pid = String(p.user_id);
          const alive = playersAlive[pid] !== false;
          return (
            <span key={pid} className={`flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full ${alive ? 'bg-gray-800 text-white' : 'bg-gray-900 text-gray-600 line-through'}`}>
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: PLAYER_COLORS[idx % PLAYER_COLORS.length] }} />
              {p.username || `Player ${idx + 1}`}
            </span>
          );
        })}
        <span className="text-[11px] text-gray-500 ml-2">{aliveCount} alive</span>
      </div>

      <div ref={containerRef} className="relative flex-1 min-h-0">
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" style={{ touchAction: 'none' }} />
        {isTouchDevice && canPlay && (
          <>
            <div
              className="absolute bottom-6 left-6 w-24 h-24 rounded-full bg-white/10 border border-white/20"
              onTouchStart={handleJoyStart}
              onTouchMove={handleJoyMove}
              onTouchEnd={handleJoyEnd}
            />
            <div
              className="absolute bottom-6 right-6 w-20 h-20 rounded-full bg-orange-500/20 border border-orange-400/40 flex items-center justify-center text-white text-2xl"
              onTouchStart={(e) => { e.preventDefault(); tryPlaceBomb(); }}
            >
              💣
            </div>
            {hasMyBomb && (
              <div
                className="absolute bottom-32 right-6 w-16 h-16 rounded-full bg-red-500/30 border border-red-400/50 flex items-center justify-center text-white text-[10px] font-bold text-center leading-tight"
                onTouchStart={(e) => { e.preventDefault(); tryDetonateMine(); }}
              >
                DETONATE
              </div>
            )}
            <div
              className="absolute bottom-32 left-6 w-16 h-16 rounded-full bg-yellow-500/25 border border-yellow-400/50 flex items-center justify-center text-white text-2xl"
              onTouchStart={(e) => { e.preventDefault(); tryInteract(); }}
              title="Pick up / drop a box, or kick a bomb"
            >
              {isCarrying ? '⬇️' : '📦'}
            </div>
          </>
        )}
        {!isEnded && countingDown > 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 pointer-events-none">
            <span className="text-white text-6xl font-black">{countingDown}</span>
          </div>
        )}
        {!isEnded && canPlay && playersAlive[myId] === false && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 pointer-events-none">
            <span className="text-white text-2xl font-bold">💥 Eliminated</span>
          </div>
        )}
        {isEnded && (
          <GameWinnerBanner
            winner={gameState?.winner_id ? orderedPlayers.find((p) => String(p.user_id) === String(gameState.winner_id)) : null}
            gameType="bomberman"
            gameStats={{
              lines: orderedPlayers.map((p) => ({
                label: p.username, value: playersAlive[String(p.user_id)] !== false ? 'Survived' : 'Eliminated',
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
          WASD/Arrows to move · Space to place a bomb{hasMyBomb ? ' · E to detonate it now' : ''} · F to {isCarrying ? 'drop your box' : hasKick ? 'grab a box or kick a bomb' : 'grab a box'}
        </div>
      )}
    </div>
  );
}
