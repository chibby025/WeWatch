import React, { useRef, useEffect, useState, useCallback } from 'react';

// ── Constants ─────────────────────────────────────────────────────────────────
const CDN = 'https://LetsWatchOut.b-cdn.net/games/penaltyshootout';
const W = 640, H = 360;

// Goal geometry (pixels on canvas)
const GP = { left: 80, right: 560, top: 52, bottom: 228 };
GP.width  = GP.right - GP.left;   // 480
GP.height = GP.bottom - GP.top;   // 176

// Zone grid columns / rows
const C0 = GP.left, C1 = GP.left + GP.width / 3, C2 = GP.left + 2 * GP.width / 3, C3 = GP.right;
const R0 = GP.top,  R1 = GP.top  + GP.height / 3, R2 = GP.top  + 2 * GP.height / 3, R3 = GP.bottom;

const ZONES = {
  'top-left':      { x1: C0, x2: C1, y1: R0, y2: R1 },
  'top-right':     { x1: C2, x2: C3, y1: R0, y2: R1 },
  'mid-left':      { x1: C0, x2: C1, y1: R1, y2: R2 },
  'mid-right':     { x1: C2, x2: C3, y1: R1, y2: R2 },
  'bottom-left':   { x1: C0, x2: C1, y1: R2, y2: R3 },
  'bottom-center': { x1: C1, x2: C2, y1: R2, y2: R3 },
  'bottom-right':  { x1: C2, x2: C3, y1: R2, y2: R3 },
};
const ZONE_KEYS = Object.keys(ZONES);

function zoneCentre(z) {
  const s = ZONES[z] || ZONES['bottom-center'];
  return [(s.x1 + s.x2) / 2, (s.y1 + s.y2) / 2];
}

// Sprite CDN URLs (spaces → %20)
const SPRITE_URL = {
  idle:            `${CDN}/keeper%20idle.webp`,
  'top-left':      `${CDN}/keeper%20top%20left.webp`,
  'top-right':     `${CDN}/keeper%20top%20right.webp`,
  'mid-left':      `${CDN}/keeper%20mid%20left.webp`,
  'mid-right':     `${CDN}/keeper%20mid%20right.webp`,
  'bottom-left':   `${CDN}/keeper%20bottom%20left.webp`,
  'bottom-center': `${CDN}/keeper%20bottom%20center.webp`,
  'bottom-right':  `${CDN}/keeper%20bottom%20right.webp`,
};

// Sprite anchor positions — fractions of the GOAL CLIP DIV (not the full canvas).
// The goal clip div is positioned exactly over the goal mouth (GP.left/top/width/height).
// overflow:hidden on that div keeps sprites inside the post/crossbar boundaries.
// Negative left/top is fine — it just offsets the sprite to extend from the edge.
// Tune these values to place each keeper's hands in the correct net zone.
const SPRITE_POS = {
  idle:            { left: 0.36,  top:  0.00, width: 0.28 },
  'top-left':      { left: -0.06, top: -0.20, width: 0.52 },
  'top-right':     { left:  0.54, top: -0.20, width: 0.52 },
  'mid-left':      { left: -0.05, top:  0.05, width: 0.60 },
  'mid-right':     { left:  0.45, top:  0.05, width: 0.60 },
  'bottom-left':   { left:  0.01, top:  0.42, width: 0.42 },
  'bottom-center': { left:  0.28, top:  0.46, width: 0.44 },
  'bottom-right':  { left:  0.57, top:  0.42, width: 0.42 },
};

// Which zones each keeper dive physically covers
const COVERAGE = {
  'top-left':      new Set(['top-left']),
  'top-right':     new Set(['top-right']),
  'mid-left':      new Set(['mid-left']),
  'mid-right':     new Set(['mid-right']),
  'bottom-left':   new Set(['bottom-left']),
  'bottom-center': new Set(['bottom-center', 'bottom-left', 'bottom-right']),
  'bottom-right':  new Set(['bottom-right']),
};

const KICKS = 5;
const SWIPE_MIN = 28;
const BALL_START = { x: W / 2, y: H - 30 };
const CD_MS = 3200; // swipe countdown ms

// ── Helpers ───────────────────────────────────────────────────────────────────

function swipeToZone(dx, dy) {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  const horiz = ax < W * 0.10 ? 'center' : dx > 0 ? 'right' : 'left';
  let row;
  if (dy < 0 && ay > ax * 0.45) row = 'top';
  else if (ay < ax * 0.38) row = 'mid';
  else row = 'bottom';

  if (row === 'top'    && horiz === 'left')   return 'top-left';
  if (row === 'top'    && horiz === 'right')  return 'top-right';
  if (row === 'top'    && horiz === 'center') return Math.random() < 0.5 ? 'top-left' : 'top-right';
  if (row === 'mid'    && horiz === 'left')   return 'mid-left';
  if (row === 'mid'    && horiz === 'right')  return 'mid-right';
  if (row === 'mid'    && horiz === 'center') return 'bottom-center';
  if (row === 'bottom' && horiz === 'left')   return 'bottom-left';
  if (row === 'bottom' && horiz === 'center') return 'bottom-center';
  return 'bottom-right';
}

function aiPickZone(history, diff) {
  if (diff === 'easy' || Math.random() < 0.35) {
    return ZONE_KEYS[Math.floor(Math.random() * ZONE_KEYS.length)];
  }
  const counts = {};
  ZONE_KEYS.forEach(z => (counts[z] = 0));
  history.forEach(z => { if (counts[z] !== undefined) counts[z]++; });
  const top = ZONE_KEYS.reduce((a, b) => counts[a] >= counts[b] ? a : b);
  return Math.random() < (diff === 'hard' ? 0.62 : 0.5) ? top
    : ZONE_KEYS[Math.floor(Math.random() * ZONE_KEYS.length)];
}

function resolveKick(kickerZone, keeperZone, diff) {
  const covered = keeperZone ? COVERAGE[keeperZone] : new Set();
  if (covered.has(kickerZone)) return 'saved';
  if (diff !== 'easy' && Math.random() < 0.06) return 'post';
  return 'goal';
}

// ── Drawing ───────────────────────────────────────────────────────────────────

const CROWD_COLORS = ['#c0392b','#2980b9','#27ae60','#f39c12','#8e44ad','#16a085','#d35400'];

function drawStadium(ctx) {
  // Sky / night gradient
  const sky = ctx.createLinearGradient(0, 0, 0, H * 0.75);
  sky.addColorStop(0, '#07101f');
  sky.addColorStop(1, '#112240');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H * 0.75);

  // Floodlights
  [[55, 16], [W - 55, 16]].forEach(([lx, ly]) => {
    // pole
    ctx.fillStyle = '#ccc';
    ctx.fillRect(lx - 2, ly, 4, 22);
    // globe
    ctx.beginPath();
    ctx.arc(lx, ly, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#fff8c0';
    ctx.fill();
    // cone
    const cone = ctx.createRadialGradient(lx, ly, 0, lx, ly, 150);
    cone.addColorStop(0, 'rgba(255,248,192,0.12)');
    cone.addColorStop(1, 'rgba(255,248,192,0)');
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(lx, ly);
    ctx.arc(lx, ly, 150, Math.PI * 0.15, Math.PI * 0.85);
    ctx.fill();
  });

  // Crowd rows (behind the goal)
  for (let row = 0; row < 7; row++) {
    const baseY = 20 + row * 7;
    ctx.fillStyle = `rgba(8,18,36,${0.25 + row * 0.04})`;
    ctx.fillRect(0, baseY, W, 6);
    const count = 58 - row * 2;
    for (let i = 0; i < count; i++) {
      const hx = 6 + i * (W - 12) / (count - 1);
      const hy = baseY + 2.5 + Math.sin(i * 1.7 + row * 2.3) * 1.2;
      ctx.beginPath();
      ctx.arc(hx, hy, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = CROWD_COLORS[(i * 5 + row * 11) % CROWD_COLORS.length];
      ctx.globalAlpha = 0.65;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  // Pitch surface below goal
  const pitch = ctx.createLinearGradient(0, GP.bottom, 0, H);
  pitch.addColorStop(0, '#1a5c26');
  pitch.addColorStop(0.5, '#165020');
  pitch.addColorStop(1, '#0e3616');
  ctx.fillStyle = pitch;
  ctx.fillRect(0, GP.bottom, W, H - GP.bottom);

  // Penalty spot
  ctx.beginPath();
  ctx.arc(W / 2, H - 14, 3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fill();

  // Pitch arc (faint)
  ctx.beginPath();
  ctx.arc(W / 2, H + 15, 90, Math.PI, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawGoalNet(ctx) {
  const { left, right, top, bottom } = GP;
  const gw = right - left, gh = bottom - top;

  // Very subtle net fill — stadium still shows through
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  ctx.fillRect(left, top, gw, gh);

  // Net grid lines (horizontal + vertical)
  ctx.strokeStyle = 'rgba(220,230,255,0.30)';
  ctx.lineWidth = 0.7;

  const cols = 18, rows = 9;
  for (let i = 0; i <= cols; i++) {
    const x = left + (i / cols) * gw;
    ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
  }
  for (let i = 0; i <= rows; i++) {
    const y = top + (i / rows) * gh;
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
  }

  // Posts + crossbar — thick, white, with slight glow
  ctx.shadowBlur = 10;
  ctx.shadowColor = 'rgba(200,220,255,0.7)';
  ctx.strokeStyle = '#f0f4ff';
  ctx.lineWidth = 6;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(left,  bottom);
  ctx.lineTo(left,  top);
  ctx.lineTo(right, top);
  ctx.lineTo(right, bottom);
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function drawZoneHighlight(ctx, zone) {
  if (!zone || !ZONES[zone]) return;
  const z = ZONES[zone];
  ctx.fillStyle = 'rgba(255,215,0,0.15)';
  ctx.strokeStyle = 'rgba(255,215,0,0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.rect(z.x1, z.y1, z.x2 - z.x1, z.y2 - z.y1);
  ctx.fill();
  ctx.stroke();
}

function drawBall(ctx, x, y, scale) {
  const r = 11 * scale;
  // Ground shadow
  ctx.beginPath();
  ctx.ellipse(x, GP.bottom - 1, r * 1.3 * scale, r * 0.3 * scale, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fill();
  // Ball body
  const g = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.08, x, y, r);
  g.addColorStop(0, '#ffffff');
  g.addColorStop(0.55, '#dde');
  g.addColorStop(1, '#888');
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 0.8;
  ctx.stroke();
}

function drawKicker(ctx, kickProg) {
  const bx = BALL_START.x, by = H - 22;
  ctx.save();
  ctx.fillStyle = '#1e1e3a';
  // Body
  ctx.beginPath();
  ctx.ellipse(bx, by - 20, 8, 13, kickProg * 0.25, 0, Math.PI * 2);
  ctx.fill();
  // Head
  ctx.beginPath();
  ctx.arc(bx, by - 37, 8, 0, Math.PI * 2);
  ctx.fill();
  // Legs
  ctx.strokeStyle = '#1e1e3a';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  if (kickProg > 0) {
    // Standing leg
    ctx.beginPath();
    ctx.moveTo(bx - 4, by - 10);
    ctx.lineTo(bx - 9, by + 8);
    ctx.stroke();
    // Kicking leg
    ctx.beginPath();
    ctx.moveTo(bx + 4, by - 10);
    ctx.quadraticCurveTo(bx + 22 * kickProg, by - 5, bx + 8 + 18 * kickProg, by - 22 * kickProg);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(bx - 4, by - 10); ctx.lineTo(bx - 8, by + 8); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(bx + 4, by - 10); ctx.lineTo(bx + 8, by + 8); ctx.stroke();
  }
  ctx.restore();
}

function drawCountdownRing(ctx, progress) {
  const cx = W / 2, cy = H * 0.68;
  const r = 28;
  // Track
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 4;
  ctx.stroke();
  // Fill
  ctx.beginPath();
  ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
  ctx.strokeStyle = progress > 0.4 ? '#4ade80' : '#f87171';
  ctx.lineWidth = 4;
  ctx.stroke();
}

function drawSwipeGuide(ctx, touch, role) {
  if (!touch) return;
  const dx = touch.curX - touch.startX, dy = touch.curY - touch.startY;
  if (Math.hypot(dx, dy) < 6) return;
  ctx.save();
  ctx.globalAlpha = 0.45;
  ctx.strokeStyle = role === 'kicker' ? '#4ade80' : '#60a5fa';
  ctx.lineWidth = 3;
  ctx.setLineDash([7, 5]);
  ctx.beginPath();
  ctx.moveTo(touch.startX, touch.startY);
  ctx.lineTo(touch.curX, touch.curY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PenaltyGame({ onClose, onEndGame, currentUserId, hotSeatTournament, onTournamentScore }) {
  const canvasRef = useRef(null);
  const wrapRef   = useRef(null);

  // All game state in refs (read by RAF without stale closures)
  const phaseRef         = useRef('mode-select');
  const modeRef          = useRef('1p');
  const diffRef          = useRef('medium');
  const kickerRef        = useRef(1);
  const kickNumRef       = useRef(0);
  const scoreRef         = useRef([0, 0]);
  const resultsRef       = useRef([]);
  const kickerZoneRef    = useRef(null);
  const keeperZoneRef    = useRef(null);
  const kickerLockedRef  = useRef(false);
  const keeperLockedRef  = useRef(false);
  const kickResultRef    = useRef(null);
  const historyRef       = useRef([]);
  const animStartRef     = useRef(0);
  const cdStartRef       = useRef(0);
  const swipeOpenRef     = useRef(false);
  const fireScheduledRef = useRef(false);
  const rafRef           = useRef(null);

  // Touch tracking
  const kickerTouchRef = useRef(null);
  const keeperTouchRef = useRef(null);
  const mouseDragRef   = useRef(null);

  // React state — drives JSX overlays only
  const [ui, setUi] = useState({ phase: 'mode-select', mode: '1p', diff: 'medium', kicker: 1, kickNum: 0, score: [0, 0], results: [], result: null });
  const [keeperPose, setKeeperPose] = useState('idle');

  const push = useCallback(() => {
    setUi({
      phase: phaseRef.current,
      mode:  modeRef.current,
      diff:  diffRef.current,
      kicker: kickerRef.current,
      kickNum: kickNumRef.current,
      score: [...scoreRef.current],
      results: [...resultsRef.current],
      result: kickResultRef.current,
    });
  }, []);

  // ── RAF render loop ────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let alive = true;

    function frame(now) {
      if (!alive) return;
      ctx.clearRect(0, 0, W, H);

      const phase = phaseRef.current;

      drawStadium(ctx);
      drawGoalNet(ctx);

      // Zone highlight when kicker has locked in
      if (phase === 'swiping' && kickerLockedRef.current && kickerZoneRef.current) {
        drawZoneHighlight(ctx, kickerZoneRef.current);
      }

      // Ball
      if (phase === 'animating') {
        const t = Math.min(1, (now - animStartRef.current) / 1400);
        const [tx, ty] = zoneCentre(kickerZoneRef.current);
        const cpx = (BALL_START.x + tx) / 2;
        const cpy = Math.min(BALL_START.y, ty) - 70 - Math.abs(ty - BALL_START.y) * 0.25;
        const bx  = (1-t)*(1-t)*BALL_START.x + 2*(1-t)*t*cpx + t*t*tx;
        const by  = (1-t)*(1-t)*BALL_START.y + 2*(1-t)*t*cpy + t*t*ty;
        const sc  = 1 - t * 0.48;
        drawBall(ctx, bx, by, sc);
        if (t >= 1 && phaseRef.current === 'animating') {
          phaseRef.current = 'result';
          push();
        }
      } else if (['ready', 'swiping'].includes(phase)) {
        drawBall(ctx, BALL_START.x, BALL_START.y, 1);
      }

      // Swipe guides
      if (phase === 'swiping') {
        if (!kickerLockedRef.current) drawSwipeGuide(ctx, kickerTouchRef.current, 'kicker');
        if (modeRef.current === '2p' && !keeperLockedRef.current) drawSwipeGuide(ctx, keeperTouchRef.current, 'keeper');
      }

      // Countdown ring
      if (phase === 'swiping') {
        const prog = Math.max(0, 1 - (now - cdStartRef.current) / CD_MS);
        drawCountdownRing(ctx, prog);
        if (prog <= 0 && swipeOpenRef.current && !fireScheduledRef.current) {
          swipeOpenRef.current = false;
          fireScheduledRef.current = true;
          setTimeout(fireKick, 0);
        }
      }

      rafRef.current = requestAnimationFrame(frame);
    }

    rafRef.current = requestAnimationFrame(frame);
    return () => {
      alive = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Game logic ─────────────────────────────────────────────────────────────

  const fireKick = useCallback(() => {
    // Ensure kicker zone
    if (!kickerZoneRef.current) {
      kickerZoneRef.current = ZONE_KEYS[Math.floor(Math.random() * ZONE_KEYS.length)];
    }
    // Keeper zone (AI if not set)
    if (!keeperZoneRef.current) {
      keeperZoneRef.current = aiPickZone(historyRef.current, diffRef.current);
    }

    historyRef.current = [...historyRef.current.slice(-5), kickerZoneRef.current];

    // Dive keeper sprite
    const kpZone = keeperZoneRef.current;
    setKeeperPose(kpZone);

    // Result
    const result = resolveKick(kickerZoneRef.current, kpZone, diffRef.current);
    kickResultRef.current = result;

    if (result === 'goal') {
      const si = modeRef.current === '2p' && kickerRef.current === 2 ? 1 : 0;
      const ns = [...scoreRef.current];
      // In 1P: kicker always scores for player. In 2P: P1 scores index 0, P2 index 1.
      ns[modeRef.current === '2p' ? kickerRef.current - 1 : 0]++;
      scoreRef.current = ns;
    }

    resultsRef.current = [...resultsRef.current, result];
    kickerLockedRef.current = false;
    keeperLockedRef.current = false;
    swipeOpenRef.current    = false;
    fireScheduledRef.current = false;
    phaseRef.current = 'animating';
    animStartRef.current = performance.now();
    push();
  }, [push]);

  function startRound() {
    kickerZoneRef.current   = null;
    keeperZoneRef.current   = null;
    kickerLockedRef.current = false;
    keeperLockedRef.current = false;
    kickerTouchRef.current  = null;
    keeperTouchRef.current  = null;
    mouseDragRef.current    = null;
    fireScheduledRef.current = false;
    setKeeperPose('idle');
    phaseRef.current  = 'swiping';
    cdStartRef.current = performance.now();
    swipeOpenRef.current = true;
    // Pre-pick AI keeper zone (hidden until reveal)
    if (modeRef.current === '1p') {
      keeperZoneRef.current  = aiPickZone(historyRef.current, diffRef.current);
      keeperLockedRef.current = true;
    }
    push();
  }

  function checkBothLocked() {
    const is2P = modeRef.current === '2p';
    if (kickerLockedRef.current && (is2P ? keeperLockedRef.current : true)) {
      swipeOpenRef.current = false;
      if (!fireScheduledRef.current) {
        fireScheduledRef.current = true;
        setTimeout(fireKick, 180);
      }
    }
  }

  function afterResult() {
    const nextKickNum = kickNumRef.current + 1;
    kickNumRef.current = nextKickNum;
    kickResultRef.current = null;
    setKeeperPose('idle');

    const totalKicks = KICKS * (modeRef.current === '2p' ? 2 : 1);
    if (nextKickNum >= totalKicks) {
      phaseRef.current = 'final';
      push();
      if (onTournamentScore) onTournamentScore(scoreRef.current[0]);
      return;
    }

    if (modeRef.current === '2p') {
      kickerRef.current = kickerRef.current === 1 ? 2 : 1;
      phaseRef.current = 'player-change';
    } else {
      phaseRef.current = 'ready';
    }
    push();
  }

  function startGame(mode, diff) {
    modeRef.current    = mode;
    diffRef.current    = diff;
    kickerRef.current  = 1;
    kickNumRef.current = 0;
    scoreRef.current   = [0, 0];
    resultsRef.current = [];
    kickResultRef.current = null;
    historyRef.current = [];
    setKeeperPose('idle');
    phaseRef.current = 'ready';
    push();
  }

  // ── Input handlers ─────────────────────────────────────────────────────────

  function getCanvasXY(clientX, clientY) {
    const rect = wrapRef.current.getBoundingClientRect();
    return [
      (clientX - rect.left) * (W / rect.width),
      (clientY - rect.top)  * (H / rect.height),
    ];
  }

  function tryLockKicker(dx, dy) {
    if (kickerLockedRef.current) return;
    if (Math.hypot(dx, dy) < SWIPE_MIN * 0.55) return;
    kickerZoneRef.current  = swipeToZone(dx, dy);
    kickerLockedRef.current = true;
    checkBothLocked();
    push();
  }

  function tryLockKeeper(dx, dy) {
    if (keeperLockedRef.current) return;
    if (Math.hypot(dx, dy) < SWIPE_MIN * 0.55) return;
    keeperZoneRef.current  = swipeToZone(dx, dy);
    keeperLockedRef.current = true;
    checkBothLocked();
    push();
  }

  const handleTouchStart = useCallback((e) => {
    if (phaseRef.current !== 'swiping') return;
    e.preventDefault();
    Array.from(e.changedTouches).forEach(t => {
      const [x, y] = getCanvasXY(t.clientX, t.clientY);
      // Bottom third → kicker; upper two-thirds + 2P → keeper
      if (y > H * 0.62 && !kickerTouchRef.current) {
        kickerTouchRef.current = { id: t.identifier, startX: x, startY: y, curX: x, curY: y };
      } else if (y <= H * 0.62 && modeRef.current === '2p' && !keeperTouchRef.current) {
        keeperTouchRef.current = { id: t.identifier, startX: x, startY: y, curX: x, curY: y };
      } else if (!kickerTouchRef.current) {
        // 1P: allow swipe anywhere
        kickerTouchRef.current = { id: t.identifier, startX: x, startY: y, curX: x, curY: y };
      }
    });
  }, []);

  const handleTouchMove = useCallback((e) => {
    if (phaseRef.current !== 'swiping') return;
    e.preventDefault();
    Array.from(e.changedTouches).forEach(t => {
      const [x, y] = getCanvasXY(t.clientX, t.clientY);
      if (kickerTouchRef.current?.id === t.identifier) {
        const tc = { ...kickerTouchRef.current, curX: x, curY: y };
        kickerTouchRef.current = tc;
        tryLockKicker(tc.curX - tc.startX, tc.curY - tc.startY);
      }
      if (keeperTouchRef.current?.id === t.identifier) {
        const tc = { ...keeperTouchRef.current, curX: x, curY: y };
        keeperTouchRef.current = tc;
        tryLockKeeper(tc.curX - tc.startX, tc.curY - tc.startY);
      }
    });
  }, []);

  const handleTouchEnd = useCallback((e) => {
    Array.from(e.changedTouches).forEach(t => {
      if (kickerTouchRef.current?.id === t.identifier) {
        const tc = kickerTouchRef.current;
        tryLockKicker(tc.curX - tc.startX, tc.curY - tc.startY);
        kickerTouchRef.current = null;
      }
      if (keeperTouchRef.current?.id === t.identifier) {
        const tc = keeperTouchRef.current;
        tryLockKeeper(tc.curX - tc.startX, tc.curY - tc.startY);
        keeperTouchRef.current = null;
      }
    });
  }, []);

  // Mouse (desktop)
  const handleMouseDown = useCallback((e) => {
    if (phaseRef.current !== 'swiping') return;
    const [x, y] = getCanvasXY(e.clientX, e.clientY);
    mouseDragRef.current = { startX: x, startY: y, curX: x, curY: y };
    kickerTouchRef.current = mouseDragRef.current;
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!mouseDragRef.current || phaseRef.current !== 'swiping') return;
    const [x, y] = getCanvasXY(e.clientX, e.clientY);
    mouseDragRef.current = { ...mouseDragRef.current, curX: x, curY: y };
    kickerTouchRef.current = mouseDragRef.current;
    tryLockKicker(mouseDragRef.current.curX - mouseDragRef.current.startX, mouseDragRef.current.curY - mouseDragRef.current.startY);
  }, []);

  const handleMouseUp = useCallback(() => {
    if (!mouseDragRef.current || phaseRef.current !== 'swiping') return;
    const d = mouseDragRef.current;
    tryLockKicker(d.curX - d.startX, d.curY - d.startY);
    mouseDragRef.current   = null;
    kickerTouchRef.current = null;
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────
  const { phase, mode, kicker, kickNum, score, results, result } = ui;
  const pos = SPRITE_POS[keeperPose] || SPRITE_POS.idle;

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gray-950 select-none">
      {/* Header */}
      <div className="flex items-center justify-between w-full max-w-[640px] px-3 py-1.5">
        <span className="text-white font-bold text-sm tracking-wide">⚽ Penalty Shootout</span>
        <div className="flex gap-3 text-sm font-mono">
          <span className="text-green-300">{mode === '1p' ? `You ${score[0]}` : `P1 ${score[0]}`}</span>
          <span className="text-gray-500">–</span>
          <span className="text-red-300">{mode === '1p' ? `${score[1]} CPU` : `${score[1]} P2`}</span>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-white text-lg w-7 h-7 flex items-center justify-center">✕</button>
      </div>

      {/* Scene */}
      <div
        ref={wrapRef}
        className="relative overflow-hidden rounded-xl shadow-2xl"
        style={{ width: '100%', maxWidth: W, aspectRatio: `${W}/${H}`, touchAction: 'none', cursor: phase === 'swiping' ? 'crosshair' : 'default' }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        {/* Layer 1+2: Stadium + Net (canvas) */}
        <canvas ref={canvasRef} width={W} height={H} className="w-full h-full block" />

        {/* Layer 3: Keeper sprite — clipped to the goal mouth so it can't render above the crossbar */}
        {['ready', 'swiping', 'animating', 'result'].includes(phase) && (
          <div
            className="absolute overflow-hidden pointer-events-none"
            style={{
              left:   `${(GP.left   / W) * 100}%`,   // 12.5%
              top:    `${(GP.top    / H) * 100}%`,   // 14.4%
              width:  `${(GP.width  / W) * 100}%`,   // 75%
              height: `${(GP.height / H) * 100}%`,   // 48.9%
            }}
          >
            <img
              key={keeperPose}
              src={SPRITE_URL[keeperPose]}
              alt=""
              draggable={false}
              className="absolute"
              style={{
                left:   `${pos.left  * 100}%`,
                top:    `${pos.top   * 100}%`,
                width:  `${pos.width * 100}%`,
                transition: 'left 0.14s ease-out, top 0.14s ease-out',
                mixBlendMode: 'screen',
              }}
            />
          </div>
        )}

        {/* ── JSX overlays ── */}

        {/* Mode select */}
        {phase === 'mode-select' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/72 gap-5 px-4">
            <h2 className="text-white text-2xl font-black tracking-tight">⚽ Penalty Shootout</h2>
            <div className="grid grid-cols-3 gap-2 w-full max-w-xs">
              <button onClick={() => startGame('1p','easy')}
                className="py-2.5 bg-green-700 hover:bg-green-600 text-white rounded-xl text-xs font-bold">
                🟢 CPU Easy
              </button>
              <button onClick={() => startGame('1p','medium')}
                className="py-2.5 bg-yellow-600 hover:bg-yellow-500 text-white rounded-xl text-xs font-bold">
                🟡 Medium
              </button>
              <button onClick={() => startGame('1p','hard')}
                className="py-2.5 bg-red-700 hover:bg-red-600 text-white rounded-xl text-xs font-bold">
                🔴 Hard
              </button>
            </div>
            <button onClick={() => startGame('2p','medium')}
              className="w-full max-w-xs py-3 bg-purple-700 hover:bg-purple-600 text-white rounded-xl font-bold tracking-wide">
              👥 2 Players — Same Device
            </button>
          </div>
        )}

        {/* Ready */}
        {phase === 'ready' && (
          <div className="absolute inset-0 flex flex-col items-end justify-center pb-4 pr-5 pointer-events-none">
            <div className="bg-black/55 rounded-xl p-3 text-right mb-3">
              {mode === '2p' && (
                <p className="text-yellow-300 font-bold text-sm">Player {kicker} kicks</p>
              )}
              <p className="text-gray-400 text-xs">
                Kick {mode === '2p' ? Math.floor(kickNum / 2) + 1 : kickNum + 1} of {KICKS}
              </p>
              <p className="text-gray-500 text-xs mt-0.5">Swipe to aim</p>
            </div>
            <button
              className="pointer-events-auto px-7 py-2.5 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl shadow-lg text-base"
              onClick={startRound}
            >
              TAKE KICK ▶
            </button>
          </div>
        )}

        {/* Swiping labels */}
        {phase === 'swiping' && (
          <div className="absolute inset-0 pointer-events-none">
            {mode === '2p' && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                {!keeperLockedRef.current
                  ? <span className="bg-blue-600/70 text-white text-xs px-2.5 py-0.5 rounded-full">P{kicker === 1 ? 2 : 1}: swipe to dive ↕</span>
                  : <span className="bg-blue-900/60 text-blue-300 text-xs px-2.5 py-0.5 rounded-full">✓ Keeper ready</span>
                }
              </div>
            )}
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2">
              {!kickerLockedRef.current
                ? <span className="bg-green-700/70 text-white text-xs px-2.5 py-0.5 rounded-full">P{kicker}: swipe to shoot ↑</span>
                : <span className="bg-green-900/60 text-green-300 text-xs px-2.5 py-0.5 rounded-full">✓ Shot locked</span>
              }
            </div>
          </div>
        )}

        {/* Result */}
        {phase === 'result' && result && (
          <>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className={`text-5xl font-black drop-shadow-lg ${
                result === 'goal' ? 'text-green-400' : result === 'saved' ? 'text-red-400' : 'text-yellow-300'
              }`}>
                {result === 'goal' ? '⚽ GOAL!' : result === 'saved' ? '🧤 SAVED!' : '💥 POST!'}
              </span>
            </div>
            <button
              className="absolute bottom-4 right-4 px-5 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl text-sm backdrop-blur"
              onClick={afterResult}
            >
              Next →
            </button>
          </>
        )}

        {/* Player change */}
        {phase === 'player-change' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/78 gap-4">
            <p className="text-white text-xl font-bold">Player {kicker} — your turn to kick!</p>
            <p className="text-gray-400 text-sm">Pass the device</p>
            <button
              className="px-8 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl"
              onClick={() => { phaseRef.current = 'ready'; push(); }}
            >
              Ready ▶
            </button>
          </div>
        )}

        {/* Final */}
        {phase === 'final' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/82 gap-4 px-4">
            <h2 className="text-white text-2xl font-black">
              {mode === '1p'
                ? score[0] > score[1] ? '🏆 You Win!' : score[0] < score[1] ? '😔 CPU Wins' : '🤝 Draw!'
                : score[0] > score[1] ? '🏆 Player 1 Wins!' : score[0] < score[1] ? '🏆 Player 2 Wins!' : '🤝 Draw!'}
            </h2>
            <div className="text-4xl font-black text-white tabular-nums">
              {score[0]} – {score[1]}
            </div>
            <div className="flex gap-1.5 flex-wrap justify-center">
              {results.map((r, i) => (
                <span key={i} className={`text-xl ${r === 'goal' ? 'text-green-400' : r === 'saved' ? 'text-red-400' : 'text-yellow-400'}`}>
                  {r === 'goal' ? '⚽' : r === 'saved' ? '🧤' : '💥'}
                </span>
              ))}
            </div>
            <div className="flex gap-3 mt-1">
              <button
                onClick={() => startGame(mode, diffRef.current)}
                className="px-5 py-2 bg-white/20 hover:bg-white/30 text-white rounded-xl text-sm"
              >
                Play Again
              </button>
              <button
                onClick={() => { phaseRef.current = 'mode-select'; kickNumRef.current = 0; scoreRef.current = [0,0]; resultsRef.current = []; kickResultRef.current = null; setKeeperPose('idle'); push(); }}
                className="px-5 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-sm"
              >
                Menu
              </button>
              <button onClick={onClose} className="px-5 py-2 bg-purple-700 hover:bg-purple-600 text-white rounded-xl text-sm font-semibold">
                Close
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Kick result dots */}
      <div className="flex gap-2 mt-2">
        {Array.from({ length: mode === '2p' ? KICKS * 2 : KICKS }, (_, i) => (
          <div
            key={i}
            className={`rounded-full transition-colors ${
              i < results.length
                ? results[i] === 'goal'  ? 'w-3 h-3 bg-green-400'
                : results[i] === 'saved' ? 'w-3 h-3 bg-red-400'
                :                          'w-3 h-3 bg-yellow-400'
                : 'w-3 h-3 bg-gray-700'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
