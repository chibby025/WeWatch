import React, { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { X, Volume2, VolumeX } from 'lucide-react';
import GameWinnerBanner from './GameWinnerBanner';
import GameRulesButton from './GameRulesButton';

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

const SOUND_BASE = 'https://letswatchout.b-cdn.net/games/sounds/tank_battle'; // reuse tank_battle's explosion sfx — same style fits
const SOUND_FILES = { explosion: `${SOUND_BASE}/explosion.wav` };
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
const ROWS = 9;
const COLS = 11;
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

export default function BombermanGame({ gameState, players, currentUserId, onMove, onClose, onEndGame, onPostResult }) {
  const gs = gameState?.game_state || {};
  const phase = gs.phase || 'playing';
  const isEnded = phase === 'ended' || gameState?.status === 'completed' || gameState?.status === 'forfeited';
  const myId = String(currentUserId);

  const orderedPlayers = players || [];
  const myIndex = orderedPlayers.findIndex((p) => String(p.user_id) === myId);
  const isPlayer = myIndex >= 0;
  const softWalls = gs.soft_walls || []; // [[r, c, tier], ...] — tier 1/2/3 = wooden/concrete/iron
  const wallHits = gs.wall_hits || {}; // "r,c" -> running hit count so far
  const playersAlive = useMemo(() => gs.players_alive || {}, [gs.players_alive]);
  const activeBombs = useMemo(() => gs.active_bombs || {}, [gs.active_bombs]);

  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try { return localStorage.getItem('bomberman_sound_enabled') !== 'false'; } catch { return true; }
  });
  useEffect(() => {
    bombermanSoundEnabled = soundEnabled;
    try { localStorage.setItem('bomberman_sound_enabled', String(soundEnabled)); } catch { /* ignore */ }
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
    resolvedBombIds: new Set(),
    // Local visual-only explosion flashes: [{r,c,startedAt}]
    explosionFlashes: [],
    lastActiveBombKeys: '',
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
      }
    }
    const prevKeys = S.current.lastActiveBombKeys ? S.current.lastActiveBombKeys.split(',') : [];
    for (const prevKey of prevKeys) {
      if (prevKey && !keys.includes(prevKey)) {
        // This bomb just resolved — play a flash at its last known cell.
        const seenAt = S.current.bombSeenAt[prevKey];
        void seenAt;
        delete S.current.bombSeenAt[prevKey];
        S.current.resolvedBombIds.delete(prevKey);
      }
    }
    S.current.lastActiveBombKeys = keys.join(',');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(activeBombs)]);

  const canPlay = isPlayer && !isEnded && countingDown === 0 && playersAlive[myId] !== false;
  const hasMyBomb = Object.values(activeBombs).some((b) => Number(b.owner_id) === Number(currentUserId));

  const isWallAt = useCallback((r, c) => {
    if (isIndestructible(r, c)) return true;
    return !isWallCleared(softWalls, wallHits, r, c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(softWalls), JSON.stringify(wallHits)]);

  const tryPlaceBomb = useCallback(() => {
    if (!canPlay) return;
    const myBombCount = Object.values(activeBombs).filter((b) => Number(b.owner_id) === Number(currentUserId)).length;
    if (myBombCount >= BOMBERMAN_MAX_BOMBS_PER_PLAYER) return;
    const { r, c } = pixelToGrid(S.current.my.x, S.current.my.y);
    if (isWallAt(r, c)) return;
    onMove({ move_type: 'place_bomb', r, c });
  }, [canPlay, activeBombs, currentUserId, isWallAt, onMove]);

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

    const br = Number(bomb.r), bc = Number(bomb.c);
    const wallHitsDelta = [];
    const chainedBombIds = [];
    const hitCells = new Set([`${br},${bc}`]);
    for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      for (let step = 1; step <= BLAST_RADIUS; step++) {
        const rr = br + dr * step, cc = bc + dc * step;
        if (isIndestructible(rr, cc)) break;
        hitCells.add(`${rr},${cc}`);

        // A bomb sitting in the blast path never blocks it (real
        // Bomberman) — the blast continues past that cell exactly like an
        // empty floor tile, it just also chains that bomb along the way.
        for (const [otherId, otherBomb] of Object.entries(activeBombs)) {
          if (otherId === bombId) continue;
          if (Number(otherBomb.r) === rr && Number(otherBomb.c) === cc) {
            chainedBombIds.push(Number(otherId));
          }
        }

        const tier = wallTierAt(softWalls, rr, cc);
        if (tier != null && wallHitsAt(wallHits, rr, cc) < tier) {
          // A real, still-standing wall — this blast damages it (and stops
          // here regardless of whether this particular hit finishes it
          // off, same as an undamaged wall always has).
          wallHitsDelta.push([rr, cc]);
          break;
        }
      }
    }
    const hitPlayerIds = [];
    for (const p of orderedPlayers) {
      const pid = String(p.user_id);
      if (playersAlive[pid] === false) continue;
      const pos = pid === myId ? S.current.my : extrapolatePos(S.current.remoteAnchors[pid] || { x: -999, y: -999, vx: 0, vy: 0, t: now }, now);
      const { r: pr, c: pc } = pixelToGrid(pos.x, pos.y);
      if (hitCells.has(`${pr},${pc}`)) hitPlayerIds.push(Number(pid));
    }

    onMove({
      move_type: 'explode', bomb_id: Number(bombId),
      wall_hits_delta: wallHitsDelta, hit_player_ids: hitPlayerIds, chained_bomb_ids: chainedBombIds,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(softWalls), JSON.stringify(wallHits), JSON.stringify(playersAlive), JSON.stringify(activeBombs), myId, onMove]);

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
    const mine = Object.entries(activeBombs).filter(
      ([bombId, b]) => Number(b.owner_id) === Number(currentUserId) && !S.current.resolvedBombIds.has(bombId),
    );
    for (const [bombId, bomb] of mine) resolveBomb(bombId, bomb);
  }, [canPlay, activeBombs, currentUserId, resolveBomb]);

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

  // Elimination feedback for myself specifically.
  const prevAliveRef = useRef(playersAlive[myId]);
  useEffect(() => {
    if (prevAliveRef.current !== false && playersAlive[myId] === false) {
      hapticImpact([30, 60, 30]);
    }
    prevAliveRef.current = playersAlive[myId];
  }, [playersAlive, myId]);

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
  }, [tryPlaceBomb, tryDetonateMine]);

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
          const nx = s.my.x + dx * PLAYER_SPEED * dt;
          const ny = s.my.y + dy * PLAYER_SPEED * dt;
          if (canMoveTo(nx, s.my.y)) s.my.x = Math.max(PLAYER_R, Math.min(W - PLAYER_R, nx));
          if (canMoveTo(s.my.x, ny)) s.my.y = Math.max(PLAYER_R, Math.min(H - PLAYER_R, ny));
          s.my.vx = dx * PLAYER_SPEED;
          s.my.vy = dy * PLAYER_SPEED;
        } else {
          s.my.vx = 0; s.my.vy = 0;
        }

        const nowMs = Date.now();
        if (nowMs - s.lastStateSyncAt > STATE_SYNC_MS) {
          s.lastStateSyncAt = nowMs;
          const { vx, vy } = estimateSendVelocity(s.sendTrack, s.my.x, s.my.y, nowMs);
          onMove({ move_type: 'state_sync', x: s.my.x, y: s.my.y, vx, vy });
        }
      }

      // ── Render ──
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.scale(canvas.width / W, canvas.height / H);

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
          const tier = wallTierAt(softWalls, r, c);
          if (tier == null || isWallCleared(softWalls, wallHits, r, c)) {
            ctx.fillStyle = '#5c4a2a';
            ctx.fillRect(x + 1, y + 1, TILE - 2, TILE - 2);
            continue;
          }
          drawTieredWall(ctx, x, y, tier, wallHitsAt(wallHits, r, c));
        }
      }

      // Bombs (with a pulsing fuse indicator)
      Object.entries(activeBombs).forEach(([bombId, bomb]) => {
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

      // Players
      orderedPlayers.forEach((p, idx) => {
        const pid = String(p.user_id);
        if (playersAlive[pid] === false) return;
        const color = PLAYER_COLORS[idx % PLAYER_COLORS.length];
        const pos = pid === myId ? s.my : extrapolatePos(s.remoteAnchors[pid] || { x: -999, y: -999, vx: 0, vy: 0, t: Date.now() }, Date.now());
        const img = loadAvatarImage(p.avatar);
        if (img) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, PLAYER_R, 0, Math.PI * 2);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(img, pos.x - PLAYER_R, pos.y - PLAYER_R, PLAYER_R * 2, PLAYER_R * 2);
          ctx.restore();
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, PLAYER_R, 0, Math.PI * 2);
          ctx.strokeStyle = color;
          ctx.lineWidth = 2.5;
          ctx.stroke();
        } else {
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, PLAYER_R, 0, Math.PI * 2);
          ctx.fillStyle = color;
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.4)';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        if (pid === myId) {
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, PLAYER_R + 4, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(255,255,255,0.6)';
          ctx.lineWidth = 2;
          ctx.stroke();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canPlay, isWallAt, JSON.stringify(activeBombs), JSON.stringify(playersAlive), myId, onMove]);

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
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800 shrink-0">
        <span className="text-white font-bold text-sm">💣 Bomberman</span>
        <div className="flex items-center gap-3">
          <GameRulesButton gameType="bomberman" />
          <button onClick={() => setSoundEnabled((v) => !v)} className="text-gray-400 hover:text-white" title={soundEnabled ? 'Mute' : 'Unmute'}>
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
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
          />
        )}
      </div>

      {!isTouchDevice && !isEnded && (
        <div className="px-4 py-2 bg-gray-900/60 shrink-0 text-center text-[11px] text-gray-500">
          WASD/Arrows to move · Space to place a bomb{hasMyBomb ? ' · E to detonate it now' : ''}
        </div>
      )}
    </div>
  );
}
