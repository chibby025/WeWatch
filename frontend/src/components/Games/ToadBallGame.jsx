import React, { useRef, useEffect, useState, useCallback } from 'react';
import GameRulesButton from './GameRulesButton';

// ── Constants ────────────────────────────────────────────────────────────────
const BALL_R = 15;
const BALL_GAP = BALL_R * 2;
const SHOOTER_R = 24;
const FLY_SPEED = 12;
// Chain crawl speed is expressed as "how many seconds should the leader take
// to cross the WHOLE maze" rather than a fixed px/frame value. A fixed
// px/frame speed would mean a short path (small mobile screen) gives LESS
// real reaction time than a long one (large desktop screen), even though
// both nominally "start from the bottom" — path.total scales with screen
// size (~3.8*W + 0.72*H), so a fixed px/frame crossing takes proportionally
// less real time on a smaller screen. Scaling speed to the ACTUAL path
// length keeps the time budget consistent across screen sizes.
const BASE_CROSS_SECONDS = 85;          // level 1 target crossing time
const CROSS_SECONDS_RAMP_PER_LEVEL = 6; // each level shaves this many seconds off
const MIN_CROSS_SECONDS = 18;           // floor so very high levels stay barely playable
const ASSUMED_FPS = 60;                 // requestAnimationFrame's typical rate — same
                                         // implicit assumption the old fixed px/frame
                                         // value already made, not a new one
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

// Spawns the whole chain near the FAR/entry end of the track (large s,
// close to pathTotal) rather than already close to the goal — the chain
// then has to crawl the entire winding path to reach the goal, giving the
// player the full track length to pop it. pathTotal is the real winding-
// track length (buildPath's LUT total, several thousand px for any real
// canvas), which the old fixed small-s spawn values had no relation to —
// they clustered the whole chain within roughly the first 15-30% of the
// track, right next to the goal from the very start.
function buildLevelChain(level, pathTotal) {
  const palette = paletteForLevel(level);
  const count = Math.min(MAX_LEVEL_BALLS, START_LEVEL_BALLS + (level - 1) * BALLS_PER_LEVEL_INC);
  const chain = [];
  const startS = Math.max(BALL_GAP * 3, pathTotal - BALL_GAP * 4);
  for (let i = 0; i < count; i++) {
    chain.push({ id: ballId++, color: pickColor(palette, chain), s: startS + i * BALL_GAP });
  }
  return chain;
}

function mkGame(W, H) {
  const level = 1;
  const path = buildPath(W, H);
  return {
    frame: 0, score: 0, over: false, started: false,
    level, lives: LIVES,
    path,
    chain: buildLevelChain(level, path.total),
    flyings: [],
    current: pickColor(paletteForLevel(level), []),
    next: pickColor(paletteForLevel(level), []),
    aim: { x: W * 0.5, y: H * 0.5 },
    shooter: { x: W * 0.5, y: H * 0.94 },
    effects: [], sounds: [],
    hitFlash: 0, levelFlash: 0,
  };
}

function chainSpeedForLevel(level, pathTotal) {
  const targetSeconds = Math.max(
    MIN_CROSS_SECONDS,
    BASE_CROSS_SECONDS - (level - 1) * CROSS_SECONDS_RAMP_PER_LEVEL
  );
  return pathTotal / (targetSeconds * ASSUMED_FPS);
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
  g.chain = buildLevelChain(g.level, g.path.total);
}

function nextLevel(g) {
  g.level++;
  g.levelFlash = 40;
  g.sounds.push('levelup');
  g.chain = buildLevelChain(g.level, g.path.total);
}

function updateGame(g, W, H) {
  if (!g.started || g.over) return;
  g.frame++;
  if (g.hitFlash > 0) g.hitFlash--;
  if (g.levelFlash > 0) g.levelFlash--;

  // Chain crawl toward the goal.
  if (g.chain.length > 0) {
    g.chain[0].s -= chainSpeedForLevel(g.level, g.path.total);
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

// Live spectator view for a plain (non-tournament) solo arcade session — a
// non-host member sees a real mirror of the host's own running game instead
// of a static "someone's playing" placeholder, driven by relayed full-state
// snapshots (see the host-side broadcast effect in the main component below).
// Genuinely just RENDERS whatever snapshot arrived (via drawGame, the exact
// same pure-render function the host's own canvas uses) — no local
// simulation on this end at all, so there's no risk of drift/desync.
// Deliberately its own component (not inline JSX in the main one) since it
// needs its own canvas + RAF draw loop, which Rules of Hooks means can't be
// conditionally mounted inside a function that also has early-return
// branches above it.
function ToadBallSpectatorMirror({ stateRef, hasData, playerLabel, onClose }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const frameRef = useRef(0);
  // Cached per {W,H} — the host's own canvas can resize mid-game (their
  // window/container changing), and the path is a pure function of W/H, so
  // this only rebuilds when those actually change rather than every frame.
  const pathCacheRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    function loop() {
      rafRef.current = requestAnimationFrame(loop);
      const snap = stateRef.current;
      if (!snap || !snap.W || !snap.H) return;
      frameRef.current++;
      const { W, H } = snap;
      if (canvas.width !== W) canvas.width = W;
      if (canvas.height !== H) canvas.height = H;
      let cache = pathCacheRef.current;
      if (!cache || cache.W !== W || cache.H !== H) {
        cache = { W, H, path: buildPath(W, H) };
        pathCacheRef.current = cache;
      }
      // Reconstructed into the exact shape drawGame expects — frame/shooter
      // are cheap, deterministic-from-W/H values the host never needs to
      // send at all (frame is purely cosmetic, the goal-pulse animation
      // phase; shooter position is always a fixed function of W/H, same
      // formula the host itself uses).
      const g = {
        started: snap.started, over: snap.over,
        score: snap.score, level: snap.level, lives: snap.lives,
        frame: frameRef.current,
        path: cache.path,
        chain: snap.chain || [],
        flyings: snap.flyings || [],
        effects: snap.effects || [],
        aim: snap.aim || { x: W * 0.5, y: H * 0.5 },
        shooter: { x: W * 0.5, y: H * 0.94 },
        current: snap.current, next: snap.next,
        hitFlash: snap.hitFlash || 0, levelFlash: snap.levelFlash || 0,
      };
      drawGame(canvas.getContext('2d'), g, W, H);
    }
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [stateRef]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black select-none">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-900 border-b border-gray-700 shrink-0">
        <h2 className="text-sm font-bold tracking-widest text-green-400">TOAD  BALL</h2>
        <button onClick={onClose} className="px-2 py-1 text-xs bg-white/20 hover:bg-white/30 rounded">✕</button>
      </div>
      <div className="flex-1 flex items-center justify-center overflow-hidden bg-black relative">
        {!hasData && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
            <span className="text-6xl">🐸</span>
            <p className="text-sm text-gray-400">Connecting to {playerLabel}'s live game…</p>
          </div>
        )}
        <canvas ref={canvasRef} style={{ maxWidth: '100%', maxHeight: '100%' }} />
      </div>
      <div className="shrink-0 text-center py-1 bg-gray-900 border-t border-gray-800">
        <p className="text-xs text-gray-600">Watching {playerLabel} play — sit back and cheer them on 🐸</p>
      </div>
    </div>
  );
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
  // Live spectator broadcast — same generic relay_packet plumbing
  // FowlPlayGame.jsx already established. onRelayPacket: host calls with a
  // base64 JSON payload to relay it to the room. registerRelayReceiver:
  // spectator registers a callback to receive relayed payloads.
  onRelayPacket = null,
  registerRelayReceiver = null,
}) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const gsRef = useRef(null);
  const dimsRef = useRef({ W: 400, H: 300 });
  const audioCtxRef = useRef(null);
  const endedHandledRef = useRef(false);
  const resizeObserverRef = useRef(null);
  // True once the REAL container size has been measured at least once — see
  // setContainerEl below. Before that, {W:400,H:300} is just a placeholder
  // default with no relation to the actual rendered size.
  const hasRealDimsRef = useRef(false);
  const [dims, setDims] = useState({ W: 400, H: 300 });
  const [myScore, setMyScore] = useState(null);
  // Spectator-side: latest relayed snapshot from the host's game. A ref, not
  // state — arrives up to ~7x/sec, and ToadBallSpectatorMirror reads it
  // straight from its own RAF loop, so routing it through setState here
  // would just cause pointless re-renders of this (non-rendering, for a
  // spectator) parent component.
  const spectatorStateRef = useRef(null);
  const [hasSpectatorData, setHasSpectatorData] = useState(false);

  const isInTournament = !!hotSeatTournament;
  const isMyTurn = isInTournament && hotSeatTournament.current_player_id === currentUserId;

  // Fresh run each time a new hot-seat turn starts (or on first solo mount)
  // — but only once the REAL container size is known. Before that, this
  // defers entirely to setContainerEl's own first real measurement below,
  // which does the actual initial build itself once it has real dims to
  // build against, rather than a {400,300} placeholder that virtually never
  // matches the real rendered size.
  useEffect(() => {
    if (isInTournament && !isMyTurn) return;
    if (!hasRealDimsRef.current) return;
    gsRef.current = mkGame(dimsRef.current.W, dimsRef.current.H);
    endedHandledRef.current = false;
    setMyScore(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotSeatTournament?.current_player_id]);

  // Responsive sizing — a CALLBACK ref (not a plain useRef + a `[]`-deps
  // effect) specifically because the container div only exists in ONE of
  // several conditionally-rendered branches (see the render logic below).
  // A `[]`-deps effect only ever runs once, on this component's very FIRST
  // commit — for a hot-seat tournament participant (this same mounted
  // component instance, on the room host's own device) whose first-ever
  // render happens to show one of the "waiting for your turn" placeholder
  // branches (no container in that JSX at all), that effect's setup would
  // find containerRef.current permanently null and never run again — the
  // observer would never get attached for the rest of this component's
  // life, even once a LATER render actually reaches the real gameplay
  // branch and mounts the container. A callback ref fires every time the
  // DOM node is attached OR detached, regardless of which render caused
  // that transition, so the observer reliably gets set up the moment the
  // container genuinely becomes available.
  const setContainerEl = useCallback((el) => {
    if (resizeObserverRef.current) {
      resizeObserverRef.current.disconnect();
      resizeObserverRef.current = null;
    }
    if (!el) return;
    const obs = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      const W = Math.round(width);
      const H = Math.max(220, Math.round(height - 10));
      dimsRef.current = { W, H };
      setDims({ W, H });
      const c = canvasRef.current;
      if (c) { c.width = W; c.height = H; }

      if (!hasRealDimsRef.current) {
        // First-ever real measurement — build the initial game fresh
        // against the ACTUAL container size instead of a placeholder
        // default, so the chain is correctly positioned relative to the
        // real path from the very start.
        hasRealDimsRef.current = true;
        gsRef.current = mkGame(W, H);
        endedHandledRef.current = false;
        setMyScore(null);
        return;
      }

      // A later resize (browser window resize, device rotation) mid-game —
      // rebuild the path for the new size, and rescale the EXISTING
      // chain's positions proportionally so balls already in flight stay
      // meaningfully in the same relative spot on the new, differently
      // -sized track, rather than suddenly landing at a different
      // fraction of it (which is exactly what silently happened before
      // this fix: g.path used to get rebuilt here without ever touching
      // g.chain, permanently desyncing the two).
      const g = gsRef.current;
      if (!g) return;
      const oldTotal = g.path.total;
      const newPath = buildPath(W, H);
      const scale = oldTotal > 0 ? newPath.total / oldTotal : 1;
      g.path = newPath;
      g.shooter = { x: W * 0.5, y: H * 0.94 };
      g.chain.forEach((b) => { b.s *= scale; });
    });
    obs.observe(el);
    resizeObserverRef.current = obs;
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

  // Live-broadcasts a snapshot of this device's running game (~150ms
  // interval, matching Fowl Play's own established relay cadence for the
  // same generic relay_packet channel) so every non-host spectator sees a
  // real mirror instead of a static placeholder — covering both solo
  // arcade and hot-seat tournament spectating (see the render branch
  // below; unlike Fowl Play's own narrower precedent, which only mirrors
  // the non-tournament case). Sent whenever this device is the host
  // actually running the game, regardless of solo vs. hot-seat turn.
  // Colors are sent as plain strings (not ball ids) — a spectator only ever
  // needs to render, never simulate, so there's nothing else worth sending.
  useEffect(() => {
    if (!isHost || !onRelayPacket) return;
    const id = setInterval(() => {
      const g = gsRef.current;
      if (!g || !g.started) return;
      const { W, H } = dimsRef.current;
      const snapshot = {
        W, H,
        started: g.started, over: g.over,
        score: g.score, level: g.level, lives: g.lives,
        chain: g.chain.map(b => ({ color: b.color, s: b.s })),
        flyings: g.flyings.map(fb => ({ x: fb.x, y: fb.y, color: fb.color })),
        effects: g.effects
          .filter(fx => fx.kind === 'px')
          .map(fx => ({ x: fx.x, y: fx.y, color: fx.color, r: fx.r, life: fx.life, kind: 'px' })),
        aim: g.aim, current: g.current, next: g.next,
        hitFlash: g.hitFlash, levelFlash: g.levelFlash,
      };
      onRelayPacket(btoa(JSON.stringify(snapshot)));
    }, 150);
    return () => clearInterval(id);
  }, [isHost, onRelayPacket]);

  // Spectator: register to receive relayed state snapshots.
  useEffect(() => {
    if (!registerRelayReceiver || isHost) return;
    registerRelayReceiver((payload) => {
      if (!payload) return;
      try {
        spectatorStateRef.current = JSON.parse(atob(payload));
        setHasSpectatorData(true);
      } catch {
        // A malformed/partial payload just means this tick is skipped — the
        // next relay ~150ms later self-corrects.
      }
    });
    return () => registerRelayReceiver(null);
  }, [registerRelayReceiver, isHost]);

  // Spectator: clear the last-seen snapshot on every turn rotation, so a
  // newly-current player's name (which updates immediately, since it's a
  // reactive prop) doesn't show alongside the PREVIOUS player's frozen
  // final game state for the brief gap before the new turn's own first
  // broadcast arrives — spectators instead see the normal "connecting…"
  // placeholder again for that gap, matching what a genuinely fresh
  // connection looks like.
  useEffect(() => {
    if (isHost) return;
    spectatorStateRef.current = null;
    setHasSpectatorData(false);
  }, [isHost, hotSeatTournament?.current_player_id]);

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

  // 1. Non-host: live spectator mirror, driven by relayed full-state
  // snapshots from whoever currently has the device (see the broadcast/
  // receive effects above) — a real mirror of the actual game, not a
  // static placeholder. Covers BOTH solo arcade and hot-seat tournament
  // spectating (unlike Fowl Play's own narrower precedent, which only
  // covers the non-tournament case — see the broadcast effect's own
  // comment for why that scoping doesn't apply here).
  if (!isHost) {
    const currentPlayerName = isInTournament
      ? (hotSeatTournament?.current_player_name ?? 'someone')
      : 'the host';
    return (
      <ToadBallSpectatorMirror
        stateRef={spectatorStateRef}
        hasData={hasSpectatorData}
        playerLabel={currentPlayerName}
        onClose={onClose}
      />
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

  // 4. Host device, my hot-seat turn just ended — waiting for the rotation
  // (or, in bracket mode, eliminated from further play).
  if (isInTournament && myScore !== null) {
    const isEliminated = hotSeatTournament?.participants?.some(
      (p) => p.user_id === currentUserId && p.eliminated
    );
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black gap-4 text-white">
        <span className="text-6xl">🎯</span>
        <p className="text-lg font-semibold">Your score: {myScore.toLocaleString()}</p>
        {isEliminated ? (
          <p className="text-sm text-gray-400">You were eliminated — thanks for playing!</p>
        ) : (
          <p className="text-sm text-gray-400">Pass the device to the next player…</p>
        )}
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

      <div ref={setContainerEl} className="flex-1 flex items-center justify-center overflow-hidden bg-black">
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
