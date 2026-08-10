import React, { useRef, useEffect, useState, useCallback } from 'react';
import GameRulesButton from './GameRulesButton';

// ── Constants ────────────────────────────────────────────────────────────────
const BALL_R = 15;
const BALL_GAP = BALL_R * 2;
const SHOOTER_R = 24;
const FLY_SPEED = 12;
const BASE_CHAIN_SPEED = 0.34;
const SPEED_RAMP_PER_LEVEL = 0.05;
const EASE = 0.3;
const RECEDE_BONUS = BALL_GAP * 1.7;
const START_LEVEL_BALLS = 15;
const BALLS_PER_LEVEL_INC = 3;
const MAX_LEVEL_BALLS = 42;
const LIVES = 3;
const LUT_STEP = 3; // px between precomputed path samples

const COLORS_BASE = ['#ff4d6d', '#4dd2ff', '#ffd93d', '#6bff6b'];
const COLORS_EXTRA = ['#c77dff', '#ff9f45', '#37e0d1'];

function paletteForLevel(level) {
  // Every 2 levels unlocks one more color, up to the full 7-color set.
  const extra = Math.min(COLORS_EXTRA.length, Math.floor((level - 1) / 2));
  return [...COLORS_BASE, ...COLORS_EXTRA.slice(0, extra)];
}

// ── Path (winding track from the goal outward to the entry point) ──────────────
// Waypoint order is deliberately GOAL-first: pts[0] is the goal (s=0), and s
// increases with each waypoint walked toward the entry point (last waypoint,
// where fresh chains start). This makes every ball's `s` field directly mean
// "distance remaining to the goal" with no extra bookkeeping.
function buildControlPoints(W, H) {
  const rows = 5;
  const top = H * 0.16, bottom = H * 0.88;
  const left = W * 0.12, right = W * 0.88;
  const rowH = rows > 1 ? (bottom - top) / (rows - 1) : 0;
  const pts = [{ x: W * 0.5, y: Math.max(H * 0.06, top - rowH * 0.4) }]; // goal
  for (let r = 0; r < rows; r++) {
    const y = top + r * rowH;
    const goingRight = r % 2 === 0;
    pts.push({ x: goingRight ? left : right, y });
    pts.push({ x: goingRight ? right : left, y });
  }
  return pts;
}

function buildPath(W, H) {
  const control = buildControlPoints(W, H);
  const lut = [];
  let total = 0;
  lut.push({ x: control[0].x, y: control[0].y, s: 0 });
  for (let i = 1; i < control.length; i++) {
    const a = control[i - 1], b = control[i];
    const segLen = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(segLen / LUT_STEP));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      total += segLen / steps;
      lut.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, s: total });
    }
  }
  return { lut, total };
}

function posAtDistance(path, s) {
  const clamped = Math.max(0, Math.min(path.total, s));
  const idx = Math.min(path.lut.length - 2, Math.floor(clamped / LUT_STEP));
  const a = path.lut[idx], b = path.lut[idx + 1] || a;
  const span = (b.s - a.s) || 1;
  const t = Math.max(0, Math.min(1, (clamped - a.s) / span));
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

// ── Pure game-logic helpers ──────────────────────────────────────────────────
let ballId = 0;

function pickColor(palette, chain) {
  // Avoid handing the player a spawn that would create an instant 3-in-a-row
  // they had no part in making — mirrors this codebase's established
  // "don't spawn an already-solved state" precaution used elsewhere.
  for (let attempt = 0; attempt < 8; attempt++) {
    const c = palette[Math.floor(Math.random() * palette.length)];
    const n = chain.length;
    if (n >= 2 && chain[n - 1].color === c && chain[n - 2].color === c) continue;
    return c;
  }
  return palette[Math.floor(Math.random() * palette.length)];
}

function buildLevelChain(level) {
  const palette = paletteForLevel(level);
  const count = Math.min(MAX_LEVEL_BALLS, START_LEVEL_BALLS + (level - 1) * BALLS_PER_LEVEL_INC);
  const chain = [];
  for (let i = 0; i < count; i++) {
    chain.push({ id: ballId++, color: pickColor(palette, chain), s: BALL_GAP * 3 + i * BALL_GAP });
  }
  return chain;
}

function mkGame(W, H) {
  const level = 1;
  return {
    frame: 0, score: 0, over: false, started: false,
    level, lives: LIVES,
    path: buildPath(W, H),
    chain: buildLevelChain(level),
    flyings: [],
    current: pickColor(paletteForLevel(level), []),
    next: pickColor(paletteForLevel(level), []),
    aim: { x: W * 0.5, y: H * 0.5 },
    shooter: { x: W * 0.5, y: H * 0.94 },
    effects: [], sounds: [],
    hitFlash: 0, levelFlash: 0,
  };
}

function chainSpeedForLevel(level) {
  return BASE_CHAIN_SPEED + (level - 1) * SPEED_RAMP_PER_LEVEL;
}

function popBurst(g, x, y, color) {
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.effects.push({ kind: 'px', x, y, vx: Math.cos(a) * (1.5 + Math.random() * 2), vy: Math.sin(a) * (1.5 + Math.random() * 2), life: 18 + Math.floor(Math.random() * 10), color, r: 2 + Math.random() * 2 });
  }
}

// Scans outward from `idx` for a same-colored run, pops it if >=3, applies
// the "recede" nudge to the trailing segment, and chases chain reactions
// where the two newly-adjacent balls form another run. Returns points scored.
function resolveMatches(g, idx) {
  let scored = 0;
  let cascade = 0;
  let checkIdx = idx;
  while (checkIdx >= 0 && checkIdx < g.chain.length) {
    const color = g.chain[checkIdx].color;
    let left = checkIdx, right = checkIdx;
    while (left > 0 && g.chain[left - 1].color === color) left--;
    while (right < g.chain.length - 1 && g.chain[right + 1].color === color) right++;
    const runLen = right - left + 1;
    if (runLen < 3) break;

    for (let i = left; i <= right; i++) {
      const p = posAtDistance(g.path, g.chain[i].s);
      popBurst(g, p.x, p.y, g.chain[i].color);
    }
    const mult = runLen >= 5 ? 2 : runLen === 4 ? 1.5 : 1;
    scored += Math.round(runLen * 10 * mult) + (cascade > 0 ? 50 * cascade : 0);
    g.sounds.push(cascade > 0 ? 'chain' : 'pop');

    g.chain.splice(left, runLen);
    // Recede: the trailing segment (now missing its forward neighbor) drifts
    // back away from the goal for a moment before easing shut again.
    for (let i = left; i < g.chain.length; i++) g.chain[i].s += RECEDE_BONUS;

    if (left > 0 && left < g.chain.length && g.chain[left - 1].color === g.chain[left].color) {
      checkIdx = left; // re-check the newly-touching pair for a cascade
      cascade++;
    } else {
      break;
    }
  }
  return scored;
}

function fireCurrentBall(g) {
  const dx = g.aim.x - g.shooter.x, dy = g.aim.y - g.shooter.y;
  const d = Math.hypot(dx, dy) || 1;
  g.flyings.push({ x: g.shooter.x, y: g.shooter.y, vx: (dx / d) * FLY_SPEED, vy: (dy / d) * FLY_SPEED, color: g.current });
  g.sounds.push('shoot');
  g.current = g.next;
  g.next = pickColor(paletteForLevel(g.level), g.chain);
}

function loseLife(g) {
  g.lives--;
  g.hitFlash = 16;
  g.sounds.push('hit');
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate([60, 30, 60]);
  if (g.lives <= 0) { g.over = true; g.sounds.push('gameover'); return; }
  g.chain = buildLevelChain(g.level);
}

function nextLevel(g) {
  g.level++;
  g.levelFlash = 40;
  g.sounds.push('levelup');
  g.chain = buildLevelChain(g.level);
}

function updateGame(g, W, H) {
  if (!g.started || g.over) return;
  g.frame++;
  if (g.hitFlash > 0) g.hitFlash--;
  if (g.levelFlash > 0) g.levelFlash--;

  // Chain crawl toward the goal.
  if (g.chain.length > 0) {
    g.chain[0].s -= chainSpeedForLevel(g.level);
    for (let i = 1; i < g.chain.length; i++) {
      const target = g.chain[i - 1].s + BALL_GAP;
      g.chain[i].s += (target - g.chain[i].s) * EASE;
    }
    if (g.chain[0].s <= 0) loseLife(g);
  }
  if (g.over) return;

  // Flying balls: move, then check collision against the chain.
  g.flyings = g.flyings.filter(fb => {
    fb.x += fb.vx; fb.y += fb.vy;
    if (fb.x < -30 || fb.x > W + 30 || fb.y < -30 || fb.y > H + 30) return false;

    let hitIdx = -1, hitDist = Infinity;
    for (let i = 0; i < g.chain.length; i++) {
      const p = posAtDistance(g.path, g.chain[i].s);
      const d = Math.hypot(p.x - fb.x, p.y - fb.y);
      if (d < hitDist) { hitDist = d; hitIdx = i; }
    }
    if (hitIdx === -1 || hitDist > BALL_R * 2.1) return true; // no hit yet, keep flying

    // Insert on whichever side neighbor is closer to the impact point.
    let insertIdx = hitIdx + 1;
    const neighbors = [];
    if (hitIdx > 0) neighbors.push(hitIdx - 1);
    if (hitIdx < g.chain.length - 1) neighbors.push(hitIdx + 1);
    let bestNeighbor = null, bestNd = Infinity;
    neighbors.forEach(ni => {
      const p = posAtDistance(g.path, g.chain[ni].s);
      const d = Math.hypot(p.x - fb.x, p.y - fb.y);
      if (d < bestNd) { bestNd = d; bestNeighbor = ni; }
    });
    if (bestNeighbor !== null) insertIdx = Math.min(hitIdx, bestNeighbor) + 1;

    let newS;
    if (insertIdx <= 0) newS = Math.max(2, g.chain[0].s - BALL_GAP);
    else if (insertIdx >= g.chain.length) newS = g.chain[g.chain.length - 1].s + BALL_GAP;
    else newS = (g.chain[insertIdx - 1].s + g.chain[insertIdx].s) / 2;

    g.chain.splice(insertIdx, 0, { id: ballId++, color: fb.color, s: newS });
    g.score += resolveMatches(g, insertIdx);

    if (g.chain.length === 0) nextLevel(g);
    return false; // flying ball consumed
  });
}

// ── Draw helpers ─────────────────────────────────────────────────────────────
function drawBall(ctx, x, y, color) {
  const grad = ctx.createRadialGradient(x - BALL_R * 0.35, y - BALL_R * 0.35, 1, x, y, BALL_R);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.25, color);
  grad.addColorStop(1, color);
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.arc(x, y, BALL_R, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(x, y, BALL_R, 0, Math.PI * 2); ctx.stroke();
}

function drawToad(ctx, x, y, aimAngle, current, next) {
  ctx.save();
  // Legs
  ctx.fillStyle = '#3a9c4a';
  [[-1], [1]].forEach(([s]) => {
    ctx.beginPath();
    ctx.ellipse(x + s * SHOOTER_R * 0.85, y + SHOOTER_R * 0.55, 9, 6, s * 0.5, 0, Math.PI * 2);
    ctx.fill();
  });
  // Body (rotates to face aim)
  ctx.translate(x, y);
  ctx.rotate(aimAngle);
  const bodyGrad = ctx.createRadialGradient(-SHOOTER_R * 0.3, -SHOOTER_R * 0.3, 2, 0, 0, SHOOTER_R);
  bodyGrad.addColorStop(0, '#8de89a');
  bodyGrad.addColorStop(1, '#3a9c4a');
  ctx.fillStyle = bodyGrad;
  ctx.beginPath(); ctx.arc(0, 0, SHOOTER_R, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#1f5c2a'; ctx.lineWidth = 2; ctx.stroke();
  // Eyes
  [[-8, -12], [8, -12]].forEach(([ex, ey]) => {
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex, ey, 5.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(ex + 1.5, ey - 1, 2.6, 0, Math.PI * 2); ctx.fill();
  });
  // Loaded ball (current), held forward
  drawBall(ctx, SHOOTER_R + BALL_R - 4, 0, current);
  ctx.restore();

  // Next-ball preview, fixed to the toad's side (not rotated)
  const nx = x - SHOOTER_R - 12, ny = y + SHOOTER_R * 0.2;
  ctx.save();
  ctx.globalAlpha = 0.9;
  ctx.font = '9px sans-serif'; ctx.fillStyle = '#cbd5e1'; ctx.textAlign = 'center';
  ctx.fillText('NEXT', nx, ny - BALL_R - 4);
  ctx.scale(0.75, 0.75);
  drawBall(ctx, nx / 0.75, ny / 0.75, next);
  ctx.restore();
}

function drawGame(ctx, g, W, H) {
  ctx.fillStyle = '#0a1f14'; ctx.fillRect(0, 0, W, H);

  // Lily-pad speckles in the background for a pond feel.
  for (let i = 0; i < 22; i++) {
    const sx = (i * 97) % W, sy = (i * 151) % H;
    ctx.fillStyle = 'rgba(80,180,110,0.06)';
    ctx.beginPath(); ctx.arc(sx, sy, 14 + (i % 3) * 6, 0, Math.PI * 2); ctx.fill();
  }

  if (!g.started) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, W, H);
    ctx.shadowColor = '#6bff6b'; ctx.shadowBlur = 20;
    ctx.fillStyle = '#6bff6b'; ctx.font = `bold ${W > 300 ? 26 : 18}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('TOAD  BALL', W / 2, H / 2 - 26);
    ctx.shadowBlur = 0; ctx.fillStyle = '#c9ffd0'; ctx.font = `${W > 300 ? 12 : 9}px monospace`;
    ctx.fillText('Aim with your finger/mouse · tap to shoot', W / 2, H / 2 + 2);
    ctx.fillStyle = '#ffffff'; ctx.font = `${W > 300 ? 13 : 10}px monospace`;
    ctx.fillText('Tap to start', W / 2, H / 2 + 24); ctx.textBaseline = 'alphabetic';
    return;
  }

  // Track ribbon.
  ctx.strokeStyle = 'rgba(120,200,150,0.28)';
  ctx.lineWidth = BALL_R * 2 + 6;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath();
  g.path.lut.forEach((p, i) => { if (i === 0) ctx.moveTo(p.x, p.y); else if (i % 4 === 0) ctx.lineTo(p.x, p.y); });
  ctx.lineTo(g.path.lut[g.path.lut.length - 1].x, g.path.lut[g.path.lut.length - 1].y);
  ctx.stroke();

  // Goal (bog portal) — pulses faster as level rises.
  const goal = posAtDistance(g.path, 0);
  const pulse = 0.7 + Math.sin(g.frame * (0.06 + g.level * 0.01)) * 0.3;
  const goalGrad = ctx.createRadialGradient(goal.x, goal.y, 2, goal.x, goal.y, 24 * pulse);
  goalGrad.addColorStop(0, '#1a0f08');
  goalGrad.addColorStop(0.6, '#3d2410');
  goalGrad.addColorStop(1, 'rgba(61,36,16,0)');
  ctx.fillStyle = goalGrad;
  ctx.beginPath(); ctx.arc(goal.x, goal.y, 24 * pulse, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(255,140,60,0.5)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(goal.x, goal.y, 16, 0, Math.PI * 2); ctx.stroke();

  // Chain.
  g.chain.forEach(b => { const p = posAtDistance(g.path, b.s); drawBall(ctx, p.x, p.y, b.color); });

  // Flying balls.
  g.flyings.forEach(fb => drawBall(ctx, fb.x, fb.y, fb.color));

  // Particles.
  g.effects.forEach(fx => { if (fx.kind !== 'px') return; ctx.globalAlpha = Math.max(0, fx.life / 24); ctx.fillStyle = fx.color; ctx.beginPath(); ctx.arc(fx.x, fx.y, fx.r, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; });

  // Toad shooter.
  const aimAngle = Math.atan2(g.aim.y - g.shooter.y, g.aim.x - g.shooter.x);
  drawToad(ctx, g.shooter.x, g.shooter.y, aimAngle, g.current, g.next);

  // Hit flash.
  if (g.hitFlash > 0) { ctx.fillStyle = `rgba(255,60,40,${(g.hitFlash / 16) * 0.35})`; ctx.fillRect(0, 0, W, H); }
  // Level-up banner.
  if (g.levelFlash > 0) {
    ctx.globalAlpha = Math.min(1, g.levelFlash / 20);
    ctx.shadowColor = '#ffd93d'; ctx.shadowBlur = 18;
    ctx.fillStyle = '#ffd93d'; ctx.font = `bold ${W > 300 ? 20 : 15}px monospace`; ctx.textAlign = 'center';
    ctx.fillText(`LEVEL ${g.level}!`, W / 2, H * 0.3);
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  }

  // HUD.
  const fs = W > 300 ? 12 : 10;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff'; ctx.font = `${fs}px monospace`; ctx.textAlign = 'left'; ctx.fillText(`Score ${g.score}`, 6, 16);
  ctx.textAlign = 'right'; ctx.fillText(`Lv ${g.level}`, W - 6, 16);
  ctx.textAlign = 'center';
  for (let i = 0; i < LIVES; i++) { ctx.globalAlpha = i < g.lives ? 1 : 0.2; ctx.fillStyle = '#ff4d6d'; ctx.font = `${fs + 2}px sans-serif`; ctx.fillText('♥', W / 2 - (LIVES - 1) * 8 + i * 16, 16); }
  ctx.globalAlpha = 1; ctx.textAlign = 'left';

  if (g.over) {
    ctx.fillStyle = 'rgba(0,0,0,0.62)'; ctx.fillRect(0, 0, W, H);
    ctx.shadowColor = '#ff4d6d'; ctx.shadowBlur = 20; ctx.fillStyle = '#ff4d6d'; ctx.font = `bold ${W > 300 ? 24 : 17}px monospace`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('GAME OVER', W / 2, H / 2 - 18);
    ctx.shadowBlur = 0; ctx.fillStyle = '#fff'; ctx.font = `${W > 300 ? 12 : 10}px monospace`;
    ctx.fillText(`Score: ${g.score}  ·  Level ${g.level}`, W / 2, H / 2 + 6);
    ctx.fillText('Tap to restart', W / 2, H / 2 + 24); ctx.textBaseline = 'alphabetic';
  }
}

// ── Web Audio synthesised sounds ─────────────────────────────────────────────
function playGameSound(type, ctxRef) {
  try {
    if (!ctxRef.current) ctxRef.current = new (window.AudioContext || window.webkitAudioContext)();
    const ctx = ctxRef.current;
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;

    if (type === 'shoot') {
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(760, now + 0.05);
      g.gain.setValueAtTime(0.12, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
      osc.start(now); osc.stop(now + 0.07);
    } else if (type === 'pop') {
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.09);
      g.gain.setValueAtTime(0.18, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
      osc.start(now); osc.stop(now + 0.11);
    } else if (type === 'chain') {
      [0, 0.06].forEach((delay, i) => {
        const osc = ctx.createOscillator(); const g = ctx.createGain();
        osc.connect(g); g.connect(ctx.destination);
        osc.type = 'sine';
        const base = 520 + i * 180;
        osc.frequency.setValueAtTime(base, now + delay);
        osc.frequency.exponentialRampToValueAtTime(base * 1.7, now + delay + 0.09);
        g.gain.setValueAtTime(0.2, now + delay);
        g.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.1);
        osc.start(now + delay); osc.stop(now + delay + 0.11);
      });
    } else if (type === 'hit') {
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(50, now + 0.25);
      g.gain.setValueAtTime(0.4, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc.start(now); osc.stop(now + 0.26);
    } else if (type === 'levelup') {
      [0, 0.09, 0.18].forEach((delay, i) => {
        const osc = ctx.createOscillator(); const g = ctx.createGain();
        osc.connect(g); g.connect(ctx.destination);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440 + i * 160, now + delay);
        g.gain.setValueAtTime(0.16, now + delay);
        g.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.14);
        osc.start(now + delay); osc.stop(now + delay + 0.15);
      });
    } else if (type === 'gameover') {
      const osc = ctx.createOscillator(); const g = ctx.createGain();
      osc.connect(g); g.connect(ctx.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(60, now + 0.5);
      g.gain.setValueAtTime(0.22, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc.start(now); osc.stop(now + 0.51);
    }
  } catch {
    // AudioContext not available (e.g. SSR or locked-down browser)
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
// Arcade: solo play, or a hot-seat tournament (players take turns on the room
// host's own device — see FowlPlayGame.jsx for the established precedent this
// mirrors). All hooks stay unconditional regardless of isHost/isInTournament
// (Rules of Hooks) — the placeholder branches below just return before the
// canvas/RAF loop ever mounts for a viewer who shouldn't be playing.
export default function ToadBallGame({
  onClose,
  onEndGame,
  isHost = true,
  hotSeatTournament = null,
  currentUserId = null,
  onTournamentScore = null,
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const rafRef = useRef(null);
  const gsRef = useRef(null);
  const dimsRef = useRef({ W: 400, H: 300 });
  const audioCtxRef = useRef(null);
  const endedHandledRef = useRef(false);
  const [dims, setDims] = useState({ W: 400, H: 300 });
  const [myScore, setMyScore] = useState(null);

  const isInTournament = !!hotSeatTournament;
  const isMyTurn = isInTournament && hotSeatTournament.current_player_id === currentUserId;

  useEffect(() => { gsRef.current = mkGame(400, 300); }, []);

  // Fresh run each time a new hot-seat turn starts (or on first solo mount).
  useEffect(() => {
    if (isInTournament && !isMyTurn) return;
    gsRef.current = mkGame(dimsRef.current.W, dimsRef.current.H);
    endedHandledRef.current = false;
    setMyScore(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotSeatTournament?.current_player_id]);

  // Responsive sizing — also rebuilds the path LUT, since it's defined in
  // canvas-pixel space.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      const W = Math.round(width);
      const H = Math.max(220, Math.round(height - 10));
      dimsRef.current = { W, H };
      setDims({ W, H });
      const c = canvasRef.current;
      if (c) { c.width = W; c.height = H; }
      const g = gsRef.current;
      if (g) {
        g.path = buildPath(W, H);
        g.shooter = { x: W * 0.5, y: H * 0.94 };
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // RAF loop.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    function loop() {
      rafRef.current = requestAnimationFrame(loop);
      const g = gsRef.current; if (!g) return;
      const { W, H } = dimsRef.current;
      if (canvas.width !== W) canvas.width = W;
      if (canvas.height !== H) canvas.height = H;
      updateGame(g, W, H);
      if (g.sounds.length) {
        const seen = new Set();
        g.sounds.splice(0).forEach(s => { if (!seen.has(s)) { seen.add(s); playGameSound(s, audioCtxRef); } });
      }
      drawGame(canvas.getContext('2d'), g, W, H);

      if (g.over && !endedHandledRef.current) {
        endedHandledRef.current = true;
        setMyScore(g.score);
        if (isInTournament && onTournamentScore) onTournamentScore(g.score ?? 0);
      }
    }
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isInTournament, onTournamentScore]);

  const updateAim = useCallback((clientX, clientY) => {
    const c = canvasRef.current; if (!c) return;
    const rect = c.getBoundingClientRect();
    const { W, H } = dimsRef.current;
    const g = gsRef.current; if (!g) return;
    g.aim = { x: (clientX - rect.left) * (W / rect.width), y: (clientY - rect.top) * (H / rect.height) };
  }, []);

  const onPointerMove = useCallback(e => { updateAim(e.clientX, e.clientY); }, [updateAim]);

  const onPointerDown = useCallback(e => {
    updateAim(e.clientX, e.clientY);
    const g = gsRef.current; if (!g) return;
    if (!g.started) { g.started = true; return; }
    if (g.over) {
      if (isInTournament) return; // turn is over — wait for the rotation, no self-restart
      gsRef.current = mkGame(dimsRef.current.W, dimsRef.current.H);
      gsRef.current.started = true;
      endedHandledRef.current = false;
      setMyScore(null);
      return;
    }
    fireCurrentBall(g);
  }, [updateAim, isInTournament]);

  // 1. Non-host, hot-seat tournament active: spectator card naming whoever
  //    currently has the device.
  if (!isHost && isInTournament) {
    const currentPlayerName = hotSeatTournament?.current_player_name ?? 'someone';
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black gap-4 text-white">
        <span className="text-6xl">🐸</span>
        <p className="text-lg font-semibold">{currentPlayerName}'s turn at Toad Ball!</p>
        <p className="text-sm text-gray-400">Sit back and cheer them on.</p>
        <button onClick={onClose} className="mt-2 px-5 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors">Close</button>
      </div>
    );
  }

  // 2. Non-host, no tournament: plain spectator (Space Attack precedent).
  if (!isHost) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black gap-4 text-white">
        <span className="text-6xl">🐸</span>
        <p className="text-lg font-semibold">Someone's playing Toad Ball!</p>
        <p className="text-sm text-gray-400">Sit back and cheer them on.</p>
        <button onClick={onClose} className="mt-2 px-5 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors">Close</button>
      </div>
    );
  }

  // 3. Host device, tournament active, but it's someone else's turn.
  if (isInTournament && !isMyTurn && myScore === null) {
    const currentPlayerName = hotSeatTournament?.current_player_name ?? '…';
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black gap-4 text-white">
        <span className="text-6xl">⏳</span>
        <p className="text-lg font-semibold">Pass the device to {currentPlayerName}</p>
        <p className="text-sm text-gray-400">Waiting for their turn to start…</p>
        {onEndGame && <button onClick={() => { onEndGame?.(); onClose?.(); }} className="mt-2 px-5 py-2 bg-red-700 hover:bg-red-800 rounded-lg text-sm transition-colors">End Tournament</button>}
      </div>
    );
  }

  // 4. Host device, my hot-seat turn just ended — waiting for the rotation.
  if (isInTournament && myScore !== null) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black gap-4 text-white">
        <span className="text-6xl">🎯</span>
        <p className="text-lg font-semibold">Your score: {myScore.toLocaleString()}</p>
        <p className="text-sm text-gray-400">Pass the device to the next player…</p>
      </div>
    );
  }

  // 5. Actual gameplay — solo arcade, or the active player's hot-seat turn.
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black select-none">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-900 border-b border-gray-700 shrink-0">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold tracking-widest text-green-400">TOAD  BALL</h2>
          <GameRulesButton gameType="toad_ball" className="text-gray-500" />
        </div>
        <div className="flex gap-2">
          {onEndGame && <button onClick={() => { onEndGame?.(); onClose?.(); }} className="px-2 py-1 text-xs bg-red-700 hover:bg-red-800 rounded font-medium">End</button>}
          <button onClick={onClose} className="px-2 py-1 text-xs bg-white/20 hover:bg-white/30 rounded">✕</button>
        </div>
      </div>

      {isInTournament && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-10 px-4 py-2 bg-purple-700/90 text-white text-sm font-semibold rounded-full shadow">
          🏆 Your turn — pop as many chains as you can!
        </div>
      )}

      <div ref={containerRef} className="flex-1 flex items-center justify-center overflow-hidden bg-black">
        <canvas
          ref={canvasRef}
          width={dims.W}
          height={dims.H}
          style={{ maxWidth: '100%', maxHeight: '100%', touchAction: 'none' }}
          onPointerMove={onPointerMove}
          onPointerDown={onPointerDown}
        />
      </div>

      <div className="shrink-0 text-center py-1 bg-gray-900 border-t border-gray-800">
        <p className="text-xs text-gray-600">Aim with mouse/finger · tap to fire · match 3+ same colors to pop them</p>
      </div>
    </div>
  );
}
