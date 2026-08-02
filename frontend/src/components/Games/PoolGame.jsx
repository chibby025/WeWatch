import { useRef, useEffect, useState, useCallback } from 'react';
import { X as CloseIcon, Volume2, VolumeX } from 'lucide-react';

// 8-ball pool with canvas physics.
// Physics is client-authoritative: the shooting player runs the simulation
// and reports { pocketed, cue_scratched, cue_x, cue_y, first_contact,
// ball_positions } to the server. The server validates turn legality and
// advances state, then rebroadcasts ball_positions as the single source of
// truth every other client redraws from — see pool.go's header comment:
// previously only pocketed IDs + the cue ball position were ever synced, so
// every other ball silently kept whatever position it happened to be at on
// each individual client, drifting further from the real table every shot.

// ─── Sound (synthesized SFX hosted on BunnyCDN, same convention as the
// existing games/sounds/* assets — see utils/audio.js) ─────────────────────
const SOUND_BASE = 'https://letswatchout.b-cdn.net/games/sounds/pool';
const SOUND_FILES = {
  cue_strike:   `${SOUND_BASE}/cue_strike.wav`,
  ball_clack:   `${SOUND_BASE}/ball_clack.wav`,
  cushion_thud: `${SOUND_BASE}/cushion_thud.wav`,
  pocket_drop:  `${SOUND_BASE}/pocket_drop.wav`,
  rack_break:   `${SOUND_BASE}/rack_break.wav`,
};
// Module-level (not component state) since plain physics helpers below
// (stepPhysics/resolveCollision) aren't hooks and need to read it directly —
// same imperative style already used by utils/audio.js elsewhere in this app.
let poolSoundEnabled = true;
function playPoolSound(name, { volume = 0.5, rate = 1 } = {}) {
  if (!poolSoundEnabled) return;
  const url = SOUND_FILES[name];
  if (!url) return;
  const audio = new Audio(url);
  audio.volume = Math.max(0, Math.min(1, volume));
  audio.playbackRate = rate;
  audio.play().catch(() => {}); // autoplay-policy rejections are expected before the first user gesture
}

// ─── Ball colours (standard 8-ball colours) ────────────────────────────────
const BALL_COLORS = {
  0:  '#f5f5f5', // cue
  1:  '#f9c22e', // yellow
  2:  '#2563eb', // blue
  3:  '#dc2626', // red
  4:  '#7c3aed', // purple
  5:  '#f97316', // orange
  6:  '#16a34a', // green
  7:  '#be123c', // dark red
  8:  '#111111', // black
  9:  '#f9c22e', // yellow stripe
  10: '#2563eb',
  11: '#dc2626',
  12: '#7c3aed',
  13: '#f97316',
  14: '#16a34a',
  15: '#be123c',
};
const STRIPE_IDS = new Set([9,10,11,12,13,14,15]);

// Table dimensions (logical units, canvas-scaled)
const TW = 800; // table width
const TH = 400; // table height
const CUSHION = 30; // wall cushion thickness
const POCKET_R = 18;
const BALL_R = 10;
const FRICTION = 0.985; // per-frame velocity multiplier
const LERP_RATE = 0.16; // how fast a non-simulating client eases toward a synced position
const DROP_ANIM_MS = 260; // pocket "sink" shrink+fade duration

// Pocket positions (centres)
const POCKETS = [
  { x: CUSHION, y: CUSHION },
  { x: TW / 2, y: CUSHION - 4 },
  { x: TW - CUSHION, y: CUSHION },
  { x: CUSHION, y: TH - CUSHION },
  { x: TW / 2, y: TH - CUSHION + 4 },
  { x: TW - CUSHION, y: TH - CUSHION },
];

// Break rack positions (fractional of table)
function buildRack() {
  const cx = TW * 0.75;
  const cy = TH * 0.5;
  const r = BALL_R * 2.05;
  const balls = [
    { id: 1, x: cx,              y: cy },
    { id: 2, x: cx + r,          y: cy - r * 0.5 },
    { id: 9, x: cx + r,          y: cy + r * 0.5 },
    { id: 3, x: cx + r * 2,      y: cy - r },
    { id: 8, x: cx + r * 2,      y: cy },
    { id: 10,x: cx + r * 2,      y: cy + r },
    { id: 4, x: cx + r * 3,      y: cy - r * 1.5 },
    { id: 11,x: cx + r * 3,      y: cy - r * 0.5 },
    { id: 12,x: cx + r * 3,      y: cy + r * 0.5 },
    { id: 5, x: cx + r * 3,      y: cy + r * 1.5 },
    { id: 6, x: cx + r * 4,      y: cy - r * 2 },
    { id: 13,x: cx + r * 4,      y: cy - r },
    { id: 7, x: cx + r * 4,      y: cy },
    { id: 14,x: cx + r * 4,      y: cy + r },
    { id: 15,x: cx + r * 4,      y: cy + r * 2 },
  ];
  // Cue ball
  balls.push({ id: 0, x: TW * 0.25, y: TH * 0.5 });
  return balls.map(b => ({
    ...b, vx: 0, vy: 0, active: true,
    tx: b.x, ty: b.y,   // sync target — starts equal to spawn position (no-op lerp)
    sunk: false, dropStartTime: null,
  }));
}

// ─── Colour helpers (procedural shading — no external ball textures needed) ─
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  const n = parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function lightenColor(hex, amt) {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(${Math.round(r + (255 - r) * amt)},${Math.round(g + (255 - g) * amt)},${Math.round(b + (255 - b) * amt)})`;
}
function darkenColor(hex, amt) {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(${Math.round(r * (1 - amt))},${Math.round(g * (1 - amt))},${Math.round(b * (1 - amt))})`;
}

// ─── Physics helpers ────────────────────────────────────────────────────────
function dist2(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return dx*dx + dy*dy; }

function resolveCollision(a, b, soundState, now) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const d = Math.sqrt(dx*dx + dy*dy);
  if (d === 0) return;
  const nx = dx/d, ny = dy/d;
  const dvx = a.vx - b.vx, dvy = a.vy - b.vy;
  const dot = dvx*nx + dvy*ny;
  if (dot <= 0) return; // moving apart
  // Elastic (equal mass)
  a.vx -= dot*nx; a.vy -= dot*ny;
  b.vx += dot*nx; b.vy += dot*ny;
  // Separate
  const overlap = BALL_R * 2 - d;
  a.x -= nx*overlap*0.5; a.y -= ny*overlap*0.5;
  b.x += nx*overlap*0.5; b.y += ny*overlap*0.5;

  // Real-time collision sound, throttled so overlapping balls resolving
  // across several sub-steps don't machine-gun the same clack.
  if (soundState && now - soundState.lastClack > 45 && dot > 0.25) {
    soundState.lastClack = now;
    playPoolSound('ball_clack', {
      volume: Math.min(0.7, 0.15 + dot * 0.08),
      rate: 0.92 + Math.random() * 0.16,
    });
  }
}

function stepPhysics(balls, pocketedSet, soundState) {
  const now = performance.now();
  for (const b of balls) {
    if (!b.active) continue;
    b.x += b.vx; b.y += b.vy;
    b.vx *= FRICTION; b.vy *= FRICTION;
    if (Math.abs(b.vx) < 0.01) b.vx = 0;
    if (Math.abs(b.vy) < 0.01) b.vy = 0;
    // Cushion bounce
    let cushionSpeed = 0;
    if (b.x - BALL_R < CUSHION) { b.x = CUSHION + BALL_R; cushionSpeed = Math.abs(b.vx); b.vx = Math.abs(b.vx) * 0.85; }
    if (b.x + BALL_R > TW - CUSHION) { b.x = TW - CUSHION - BALL_R; cushionSpeed = Math.abs(b.vx); b.vx = -Math.abs(b.vx) * 0.85; }
    if (b.y - BALL_R < CUSHION) { b.y = CUSHION + BALL_R; cushionSpeed = Math.abs(b.vy); b.vy = Math.abs(b.vy) * 0.85; }
    if (b.y + BALL_R > TH - CUSHION) { b.y = TH - CUSHION - BALL_R; cushionSpeed = Math.abs(b.vy); b.vy = -Math.abs(b.vy) * 0.85; }
    if (cushionSpeed > 0.4 && soundState && now - soundState.lastThud > 60) {
      soundState.lastThud = now;
      playPoolSound('cushion_thud', { volume: Math.min(0.55, 0.1 + cushionSpeed * 0.06) });
    }
  }
  // Ball-ball collisions
  for (let i = 0; i < balls.length; i++) {
    if (!balls[i].active) continue;
    for (let j = i + 1; j < balls.length; j++) {
      if (!balls[j].active) continue;
      if (dist2(balls[i], balls[j]) < (BALL_R * 2) ** 2) {
        resolveCollision(balls[i], balls[j], soundState, now);
      }
    }
  }
  // Pocket check
  for (const b of balls) {
    if (!b.active) continue;
    for (const p of POCKETS) {
      const dx = b.x - p.x, dy = b.y - p.y;
      if (dx*dx + dy*dy < POCKET_R * POCKET_R) {
        b.active = false;
        b.vx = 0; b.vy = 0;
        b.sunk = true;
        b.dropStartTime = now;
        pocketedSet.add(b.id);
        playPoolSound('pocket_drop', { volume: 0.55 });
        break;
      }
    }
  }
}

function isSettled(balls) {
  return balls.every(b => !b.active || (Math.abs(b.vx) < 0.01 && Math.abs(b.vy) < 0.01));
}

// ─── Drawing ─────────────────────────────────────────────────────────────────
function drawTable(ctx, W, H, scale) {
  const s = scale;
  // Felt: radial gradient instead of a flat fill for subtle depth
  const feltGrad = ctx.createRadialGradient(W/2, H/2, 0, W/2, H/2, Math.max(W, H) * 0.75);
  feltGrad.addColorStop(0, '#0a7a5a');
  feltGrad.addColorStop(1, '#053d2c');
  ctx.fillStyle = feltGrad;
  ctx.fillRect(0, 0, W, H);

  // Rails with a bevel highlight along the inner edge
  ctx.fillStyle = '#5c3a1e';
  ctx.fillRect(0, 0, W, CUSHION * s);
  ctx.fillRect(0, H - CUSHION * s, W, CUSHION * s);
  ctx.fillRect(0, 0, CUSHION * s, H);
  ctx.fillRect(W - CUSHION * s, 0, CUSHION * s, H);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, CUSHION * s); ctx.lineTo(W, CUSHION * s);
  ctx.moveTo(0, H - CUSHION * s); ctx.lineTo(W, H - CUSHION * s);
  ctx.moveTo(CUSHION * s, 0); ctx.lineTo(CUSHION * s, H);
  ctx.moveTo(W - CUSHION * s, 0); ctx.lineTo(W - CUSHION * s, H);
  ctx.stroke();

  // Pockets: radial gradient + rim
  for (const p of POCKETS) {
    const px = p.x * s, py = p.y * s, pr = POCKET_R * s;
    const pocketGrad = ctx.createRadialGradient(px, py, pr * 0.15, px, py, pr);
    pocketGrad.addColorStop(0, '#000000');
    pocketGrad.addColorStop(1, '#1c1c1c');
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fillStyle = pocketGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

function drawBall(ctx, ball, scale, now) {
  const isDropping = !ball.active && ball.sunk && ball.dropStartTime != null;
  if (!ball.active && !isDropping) return;

  let alpha = 1, scaleMul = 1;
  if (isDropping) {
    const t = Math.min(1, (now - ball.dropStartTime) / DROP_ANIM_MS);
    if (t >= 1) return; // fully sunk, nothing left to draw
    alpha = 1 - t;
    scaleMul = 1 - t * 0.55;
  }

  const s = scale;
  const x = ball.x * s, y = ball.y * s, r = BALL_R * s * scaleMul;
  ctx.save();
  ctx.globalAlpha = alpha;

  // Drop shadow (grounds the ball, cheap depth cue)
  ctx.beginPath();
  ctx.ellipse(x + r * 0.15, y + r * 0.35, r * 0.9, r * 0.4, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fill();

  // Glossy sphere body — radial gradient standing in for real specular lighting
  const baseColor = BALL_COLORS[ball.id] || '#888';
  const grad = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  grad.addColorStop(0, lightenColor(baseColor, 0.55));
  grad.addColorStop(0.55, baseColor);
  grad.addColorStop(1, darkenColor(baseColor, 0.35));
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // Stripe band
  if (STRIPE_IDS.has(ball.id)) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - r, y - r * 0.35, r * 2, r * 0.7);
    ctx.restore();
  }

  // Number disc (white circle behind the digit, matching real ball design)
  if (ball.id !== 0) {
    ctx.beginPath();
    ctx.arc(x, y, r * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fill();
    ctx.font = `bold ${r * 0.62}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#111';
    ctx.fillText(String(ball.id), x, y + 0.5);
  }

  // Specular highlight
  ctx.beginPath();
  ctx.ellipse(x - r * 0.32, y - r * 0.38, r * 0.28, r * 0.16, -0.5, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fill();

  // Outline
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 0.6;
  ctx.stroke();

  ctx.restore();
}

function drawCue(ctx, cueBall, mx, my, scale, power) {
  if (!cueBall?.active) return;
  const s = scale;
  const cx = cueBall.x * s, cy = cueBall.y * s;
  const dx = cx - mx, dy = cy - my;
  const d = Math.sqrt(dx*dx + dy*dy) || 1;
  const nx = dx/d, ny = dy/d;

  // Power gauge ring around the cue ball — direct visual feedback for the slider
  const gaugeR = (BALL_R + 8) * s;
  ctx.beginPath();
  ctx.arc(cx, cy, gaugeR, -Math.PI / 2, -Math.PI / 2 + (power / 100) * Math.PI * 2);
  const hue = 130 - (power / 100) * 130; // green (low) -> red (high)
  ctx.strokeStyle = `hsl(${hue}, 80%, 55%)`;
  ctx.lineWidth = 2.5 * s;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Aim line (ghost path)
  ctx.setLineDash([4, 6]);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + nx * 120 * s, cy + ny * 120 * s);
  ctx.stroke();
  ctx.setLineDash([]);

  // Cue stick — a tapered, gradient-filled quad instead of a flat stroked line
  const tipDist = (BALL_R + 2) * s;
  const pullback = (BALL_R + 4 + power * 0.15) * s;
  const buttDist = pullback + 100 * s;
  const tipX = cx + nx * tipDist, tipY = cy + ny * tipDist;
  const buttX = cx + nx * buttDist, buttY = cy + ny * buttDist;
  const perpX = -ny, perpY = nx;
  const tipW = 1.2 * s, buttW = 3.2 * s;
  ctx.beginPath();
  ctx.moveTo(tipX + perpX * tipW, tipY + perpY * tipW);
  ctx.lineTo(buttX + perpX * buttW, buttY + perpY * buttW);
  ctx.lineTo(buttX - perpX * buttW, buttY - perpY * buttW);
  ctx.lineTo(tipX - perpX * tipW, tipY - perpY * tipW);
  ctx.closePath();
  const grad = ctx.createLinearGradient(tipX, tipY, buttX, buttY);
  grad.addColorStop(0, '#e8c088');
  grad.addColorStop(0.15, '#c9975b');
  grad.addColorStop(1, '#7a4f28');
  ctx.fillStyle = grad;
  ctx.fill();
  // Chalk-tip highlight
  ctx.beginPath();
  ctx.arc(tipX, tipY, tipW * 1.4, 0, Math.PI * 2);
  ctx.fillStyle = '#5b8fc7';
  ctx.fill();
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function PoolGame({ gameState, players, currentUserId, onMove, onClose, onEndGame }) {
  const canvasRef = useRef(null);
  const ballsRef = useRef(buildRack());
  const pocketedThisShotRef = useRef(new Set());
  const firstContactRef = useRef(null);
  const simRunning = useRef(false);
  const animRef = useRef(null);
  const mouseRef = useRef({ x: TW / 2, y: TH / 2 });
  const powerRef = useRef(50);
  const soundStateRef = useRef({ lastClack: 0, lastThud: 0 });
  const shakeRef = useRef({ intensity: 0 });
  const particlesRef = useRef([]);
  const cueTrailRef = useRef([]);
  const justShotLocallyRef = useRef(false);
  const prevPocketedRef = useRef(new Set());
  const prevBallPosKeyRef = useRef('');
  const prevBreakingRef = useRef(true);
  const hasAppliedInitialSyncRef = useRef(false);
  const mountedRef = useRef(true);

  const [power, setPower] = useState(50);
  const [isAiming, setIsAiming] = useState(true);
  const [ballInHand, setBallInHand] = useState(false);
  const [scale, setScale] = useState(1);
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try { return localStorage.getItem('pool_sound_enabled') !== 'false'; } catch { return true; }
  });

  const data = gameState?.game_state || {};
  const pocketedFromServer = data.pocketed || [];
  const p0Type = data.p0_type || '';
  const p1Type = data.p1_type || '';
  const lastFoul = data.last_foul || '';
  const ballInHandFromServer = !!data.ball_in_hand;
  const status = gameState?.status;
  const isOver = status === 'finished' || status === 'completed' || status === 'forfeited';
  const winnerId = gameState?.winner_id;

  const myIdx = players?.findIndex(p => p.user_id === currentUserId);
  const myTurnIdx = gameState?.current_turn ?? 0;
  const isMyTurn = myIdx === myTurnIdx;

  const myType = myIdx === 0 ? p0Type : p1Type;
  const oppType = myIdx === 0 ? p1Type : p0Type;
  const myName = players?.[myIdx]?.username || 'You';
  const oppName = players?.[1 - myIdx]?.username || 'Opponent';

  useEffect(() => { powerRef.current = power; }, [power]);
  useEffect(() => {
    poolSoundEnabled = soundEnabled;
    try { localStorage.setItem('pool_sound_enabled', String(soundEnabled)); } catch { /* ignore */ }
  }, [soundEnabled]);
  useEffect(() => () => { mountedRef.current = false; }, []);

  // Sync server state into the local ball array. ball_positions is the
  // authoritative source for every still-active ball's coordinates — see the
  // module doc comment at the top of this file for why this replaced the old
  // "only pocketed IDs + cue position" sync, which silently desynced every
  // other ball between clients.
  useEffect(() => {
    const posMap = data.ball_positions || {};
    const serverPocketedSet = new Set(pocketedFromServer.map(Number));
    const isFirstSync = !hasAppliedInitialSyncRef.current;
    hasAppliedInitialSyncRef.current = true;
    const wasLocalShot = justShotLocallyRef.current;
    justShotLocallyRef.current = false;

    const newlyPocketedIds = [...serverPocketedSet].filter(id => !prevPocketedRef.current.has(id));
    const posKey = JSON.stringify(posMap);
    const positionsChanged = posKey !== prevBallPosKeyRef.current;
    const wasBreakShot = prevBreakingRef.current === true && data.breaking === false;
    prevBreakingRef.current = !!data.breaking;

    for (const b of ballsRef.current) {
      const key = String(b.id);
      if (posMap[key]) {
        b.tx = posMap[key].x * TW;
        b.ty = posMap[key].y * TH;
        if (!b.active) { b.x = b.tx; b.y = b.ty; } // was hidden/pocketed before — snap in rather than lerp from a stale spot
        b.active = true;
        b.sunk = false;
        b.dropStartTime = null;
      } else if (serverPocketedSet.has(b.id)) {
        if (b.active) {
          b.active = false;
          b.sunk = true;
          b.dropStartTime = isFirstSync ? null : performance.now();
        } else if (isFirstSync) {
          b.sunk = true;
          b.dropStartTime = null;
        }
      } else if (b.id === 0 && ballInHandFromServer) {
        b.active = false; // scratched, not yet re-placed by whoever's turn it now is
      }
    }

    // Remote-shot sound bundle: the shooter already played real-time sounds
    // during their own local simulation, so only play this for everyone else,
    // and never on the very first sync (that's just the starting rack, not a
    // shot that "just happened").
    if (!isFirstSync && !wasLocalShot) {
      if (positionsChanged && Object.keys(posMap).length > 0) {
        playPoolSound(wasBreakShot ? 'rack_break' : 'cue_strike', { volume: wasBreakShot ? 0.7 : 0.5 });
        setTimeout(() => {
          if (mountedRef.current) playPoolSound('ball_clack', { volume: 0.4, rate: 0.9 + Math.random() * 0.2 });
        }, 130);
      }
      newlyPocketedIds.forEach((id, i) => {
        setTimeout(() => { if (mountedRef.current) playPoolSound('pocket_drop', { volume: 0.55 }); }, 220 + i * 90);
      });
    }

    prevPocketedRef.current = serverPocketedSet;
    prevBallPosKeyRef.current = posKey;
    setBallInHand(ballInHandFromServer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(data.ball_positions), JSON.stringify(pocketedFromServer), ballInHandFromServer, data.breaking]);

  // Canvas scale (fill parent)
  useEffect(() => {
    const observer = new ResizeObserver(entries => {
      const el = entries[0]?.contentRect;
      if (el) {
        const s = Math.min(el.width / TW, el.height / TH);
        setScale(s);
      }
    });
    const canvas = canvasRef.current;
    if (canvas?.parentElement) observer.observe(canvas.parentElement);
    return () => observer.disconnect();
  }, []);

  // Render loop — draws every frame, eases non-simulating balls toward their
  // synced target position (the "smooth" part: a quick ease instead of an
  // instant teleport), and layers in the power-shot flourishes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const s = scale || 1;
    canvas.width  = TW * s;
    canvas.height = TH * s;

    let rafId;
    const render = () => {
      const now = performance.now();

      if (!simRunning.current) {
        for (const b of ballsRef.current) {
          if (b.active && b.tx != null) {
            b.x += (b.tx - b.x) * LERP_RATE;
            b.y += (b.ty - b.y) * LERP_RATE;
            if (Math.abs(b.tx - b.x) < 0.05) b.x = b.tx;
            if (Math.abs(b.ty - b.y) < 0.05) b.y = b.ty;
          }
        }
      }

      ctx.save();
      const shake = shakeRef.current.intensity;
      if (shake > 0.3) {
        ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
      }

      drawTable(ctx, canvas.width, canvas.height, s);

      // Cue-ball motion-blur trail (only populated during a big/power shot)
      if (cueTrailRef.current.length > 1) {
        cueTrailRef.current.forEach((p, i) => {
          const alpha = (i / cueTrailRef.current.length) * 0.22;
          ctx.beginPath();
          ctx.arc(p.x * s, p.y * s, BALL_R * s, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(245,245,245,${alpha})`;
          ctx.fill();
        });
      }

      for (const b of ballsRef.current) drawBall(ctx, b, s, now);

      // Chalk-dust particles
      for (const p of particlesRef.current) {
        ctx.beginPath();
        ctx.arc(p.x * s, p.y * s, 1.5 * s, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(225,225,225,${Math.max(0, p.life) * 0.6})`;
        ctx.fill();
      }

      if (isAiming && isMyTurn && !simRunning.current) {
        const cueBall = ballsRef.current.find(b => b.id === 0);
        drawCue(ctx, cueBall, mouseRef.current.x * s, mouseRef.current.y * s, s, powerRef.current);
      }
      ctx.restore();

      rafId = requestAnimationFrame(render);
    };
    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [scale, isAiming, isMyTurn]);

  // Track mouse
  const handleMouseMove = useCallback(e => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const s = scale || 1;
    mouseRef.current = {
      x: (e.clientX - rect.left) / s,
      y: (e.clientY - rect.top)  / s,
    };
  }, [scale]);

  const handleTouchMove = useCallback(e => {
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const s = scale || 1;
    const t = e.touches[0];
    mouseRef.current = {
      x: (t.clientX - rect.left) / s,
      y: (t.clientY - rect.top)  / s,
    };
  }, [scale]);

  // Run simulation then report to server
  const runSimulation = useCallback((cueBall, vx, vy, meta) => {
    setIsAiming(false);
    simRunning.current = true;
    pocketedThisShotRef.current = new Set();
    firstContactRef.current = null;
    cueBall.vx = vx;
    cueBall.vy = vy;

    const isBreakShot = !!meta?.isBreakShot;
    const isBigShot = isBreakShot || meta?.power >= 75;
    cueTrailRef.current = [];
    if (isBigShot) {
      shakeRef.current.intensity = isBreakShot ? 10 : 5 + Math.max(0, meta.power - 75) * 0.2;
      const count = isBreakShot ? 18 : 8;
      const particles = [];
      for (let i = 0; i < count; i++) {
        const ang = Math.random() * Math.PI * 2;
        const spd = 0.4 + Math.random() * 1.2;
        particles.push({ x: cueBall.x, y: cueBall.y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, life: 1 });
      }
      particlesRef.current = particles;
      playPoolSound(isBreakShot ? 'rack_break' : 'cue_strike', { volume: isBreakShot ? 0.75 : 0.6 });
    } else {
      shakeRef.current.intensity = 0;
      particlesRef.current = [];
      playPoolSound('cue_strike', { volume: 0.4 + (meta?.power ?? 50) / 100 * 0.2 });
    }

    // Track first non-cue ball contact for server report
    const stepAndTrack = () => {
      if (firstContactRef.current === null) {
        const closestDist = BALL_R * 2 + 1;
        for (const b of ballsRef.current) {
          if (!b.active || b.id === 0) continue;
          if (dist2(cueBall, b) < closestDist ** 2) {
            firstContactRef.current = b.id;
          }
        }
      }
      stepPhysics(ballsRef.current, pocketedThisShotRef.current, soundStateRef.current);
    };

    let frames = 0;
    const maxFrames = 600;
    const simulate = () => {
      for (let i = 0; i < 3; i++) stepAndTrack();
      frames += 3;

      if (shakeRef.current.intensity > 0.1) shakeRef.current.intensity *= 0.85;
      else shakeRef.current.intensity = 0;
      if (particlesRef.current.length) {
        particlesRef.current = particlesRef.current
          .map(p => ({ ...p, x: p.x + p.vx, y: p.y + p.vy, vx: p.vx * 0.94, vy: p.vy * 0.94, life: p.life - 0.035 }))
          .filter(p => p.life > 0);
      }
      if (isBigShot && cueBall.active) {
        cueTrailRef.current.push({ x: cueBall.x, y: cueBall.y });
        if (cueTrailRef.current.length > 6) cueTrailRef.current.shift();
      }

      if (!isSettled(ballsRef.current) && frames < maxFrames) {
        animRef.current = requestAnimationFrame(simulate);
      } else {
        simRunning.current = false;
        setIsAiming(true);
        cueTrailRef.current = [];
        // Find cue state after shot
        const cue = ballsRef.current.find(b => b.id === 0);
        const cueScratch = pocketedThisShotRef.current.has(0) || !cue?.active;

        // Every ball still active is the authoritative resting position every
        // other client will apply — the core fix for the cross-client desync.
        const reportedPositions = {};
        for (const b of ballsRef.current) {
          if (b.active) {
            reportedPositions[String(b.id)] = { x: b.x / TW, y: b.y / TH };
          }
        }

        justShotLocallyRef.current = true;
        onMove({
          move_type:      'shot',
          pocketed:       [...pocketedThisShotRef.current],
          cue_scratched:  cueScratch,
          cue_x:          cue ? cue.x / TW : 0.25,
          cue_y:          cue ? cue.y / TH : 0.5,
          first_contact:  firstContactRef.current ?? 0,
          ball_positions: reportedPositions,
        });
      }
    };
    animRef.current = requestAnimationFrame(simulate);
  }, [onMove]);

  const shoot = useCallback(() => {
    if (!isMyTurn || simRunning.current) return;
    const cueBall = ballsRef.current.find(b => b.id === 0);
    if (!cueBall?.active) return;
    const mx = mouseRef.current.x, my = mouseRef.current.y;
    const dx = cueBall.x - mx, dy = cueBall.y - my;
    const d = Math.sqrt(dx*dx + dy*dy) || 1;
    const speed = 3 + power * 0.17;
    runSimulation(cueBall, (dx/d) * speed, (dy/d) * speed, { power, isBreakShot: !!data.breaking });
  }, [isMyTurn, power, runSimulation, data.breaking]);

  const placeCueBall = useCallback(e => {
    if (!ballInHand || !isMyTurn) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const s = scale || 1;
    const x = (e.clientX - rect.left) / s;
    const y = (e.clientY - rect.top) / s;
    const cue = ballsRef.current.find(b => b.id === 0);
    if (!cue) return;
    cue.active = true;
    cue.sunk = false;
    cue.dropStartTime = null;
    cue.x = Math.max(CUSHION + BALL_R, Math.min(TW - CUSHION - BALL_R, x));
    cue.y = Math.max(CUSHION + BALL_R, Math.min(TH - CUSHION - BALL_R, y));
    cue.tx = cue.x; cue.ty = cue.y; // prevent the render-loop lerp from dragging it back toward a stale target
    cue.vx = 0; cue.vy = 0;
    setBallInHand(false);
  }, [ballInHand, isMyTurn, scale]);

  if (isOver) {
    const iWon = winnerId === currentUserId;
    const isDraw = winnerId == null;
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-950 gap-6 text-white">
        <span className="text-7xl">{isDraw ? '🤝' : iWon ? '🏆' : '😔'}</span>
        <h2 className="text-3xl font-black">{isDraw ? "Draw!" : iWon ? 'You Win!' : 'You Lose!'}</h2>
        <button onClick={() => { onEndGame?.(); onClose?.(); }}
          className="px-8 py-3 bg-purple-600 hover:bg-purple-700 rounded-xl font-semibold">
          Close
        </button>
      </div>
    );
  }

  const typeLabel = t => t === 'solids' ? '● Solids' : t === 'stripes' ? '◑ Stripes' : 'Open table';

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950 text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-3 text-sm">
          <span className="font-semibold">{myName}</span>
          <span className="text-gray-500">{typeLabel(myType)}</span>
          {isMyTurn && <span className="px-2 py-0.5 bg-green-600 rounded text-xs font-bold">YOUR TURN</span>}
        </div>
        <span className="font-bold">🎱 8-Ball Pool</span>
        <div className="flex items-center gap-3 text-sm">
          {!isMyTurn && <span className="px-2 py-0.5 bg-orange-600 rounded text-xs font-bold">{oppName}'s TURN</span>}
          <span className="text-gray-500">{typeLabel(oppType)}</span>
          <span className="font-semibold">{oppName}</span>
          <button
            onClick={() => setSoundEnabled(v => !v)}
            className="ml-1 p-1 hover:text-gray-300 text-gray-500"
            title={soundEnabled ? 'Mute sounds' : 'Unmute sounds'}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          <button onClick={() => { onEndGame?.(); onClose?.(); }} className="p-1 hover:text-gray-300 text-gray-500">
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Foul banner */}
      {lastFoul && (
        <div className="bg-red-700 text-center text-sm py-1 font-semibold flex-shrink-0">
          ⚠️ Foul: {lastFoul.replace(/_/g, ' ')} — opponent gets ball in hand
        </div>
      )}

      {/* Ball in hand instruction */}
      {ballInHand && isMyTurn && (
        <div className="bg-yellow-700 text-center text-sm py-1 font-semibold flex-shrink-0">
          🖱️ Click the table to place the cue ball
        </div>
      )}

      {/* Waiting indicator */}
      {!isMyTurn && (
        <div className="bg-gray-800 text-center text-sm py-1 text-gray-400 flex-shrink-0">
          Waiting for {players?.[myTurnIdx]?.username || 'opponent'}…
        </div>
      )}

      {/* Canvas */}
      <div className="flex-1 flex items-center justify-center p-2 min-h-0"
        onClick={ballInHand && isMyTurn ? placeCueBall : undefined}>
        <canvas
          ref={canvasRef}
          className="rounded-lg shadow-2xl cursor-crosshair max-w-full max-h-full"
          onMouseMove={handleMouseMove}
          onTouchMove={handleTouchMove}
          onClick={!ballInHand ? shoot : undefined}
          style={{ display: 'block' }}
        />
      </div>

      {/* Power slider */}
      {isMyTurn && !ballInHand && (
        <div className="flex items-center gap-3 px-6 py-3 bg-gray-900 border-t border-gray-800 flex-shrink-0">
          <span className="text-sm text-gray-400 w-16">Power</span>
          <input
            type="range" min="5" max="100" value={power}
            onChange={e => setPower(Number(e.target.value))}
            className="flex-1 accent-purple-500"
          />
          <span className="text-sm text-gray-300 w-8 text-right">{power}%</span>
          <button
            onClick={shoot}
            disabled={simRunning.current}
            className="px-5 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-lg text-sm font-semibold ml-2"
          >
            Shoot
          </button>
        </div>
      )}
    </div>
  );
}
