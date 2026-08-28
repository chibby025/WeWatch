// src/components/Games/SliceFrenzyGame.jsx
//
// Arcade: single-player or hot-seat tournament — same "pass the device to
// whoever's turn it is" pattern as ToadBallGame/GolfGame, but without the
// relay-packet live-spectator mirror those two build (their genre needs it
// less here — a swipe-slicer's session is short and bounded, and a simple
// static placeholder for non-playing members is a reasonable, much simpler
// trade, matching SpaceAttackGame's own precedent for non-playing viewers).
//
// A from-scratch swipe-to-slice arcade game (the genre popularized by a
// well-known commercial mobile title whose exact name is trademarked —
// renamed here per this project's own established convention: Wordsmith
// not Scrabble, Fowl Play not Duck Hunt, Toad Ball not Zuma, Rebus Round
// not Dingbats). Pure client-side canvas physics/animation + score, same
// trust model as every other arcade game in this package — no server-side
// move validation needed, final score reported via onTournamentScore.
import { useState, useEffect, useRef, useCallback } from 'react';
import { X } from 'lucide-react';
import GameRulesButton from './GameRulesButton';

const GRAVITY = 1400; // px/s^2
const STARTING_LIVES = 3;
const TRAIL_MAX_AGE_MS = 160;
const TRAIL_MAX_POINTS = 24;

// Every entry gets its own draw(ctx, r) for the WHOLE (pre-slice) shape,
// called pre-translated/pre-rotated to the object's own origin — genuine
// silhouette variety, not just a recolored circle. color/accent are still
// used by spawnSliceParticles and the shared sliced-half fallback (drawn as
// two separating half-circles of that color regardless of the whole shape's
// own silhouette — a deliberate, proportionate simplification: the WHOLE
// shape is what players actually see falling/flying and aim at, and is what
// "variety of things one can slice" is really asking for; a fully custom
// per-shape split-halves animation for every one of these would be a much
// larger, lower-value effort for a few extra frames of a brief (~0.6s)
// slice animation).
function drawRoundFruit(ctx, r, color, accent) {
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = accent;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath();
  ctx.ellipse(-r * 0.3, -r * 0.35, r * 0.28, r * 0.16, -0.5, 0, Math.PI * 2);
  ctx.fill();
}

const SLICE_TARGETS = [
  {
    label: 'apple', color: '#e0403a', accent: '#8a2420',
    draw: (ctx, r) => drawRoundFruit(ctx, r, '#e0403a', '#8a2420'),
  },
  {
    label: 'orange', color: '#f2941f', accent: '#a85f0f',
    draw: (ctx, r) => drawRoundFruit(ctx, r, '#f2941f', '#a85f0f'),
  },
  {
    label: 'plum', color: '#8a3f9e', accent: '#552266',
    draw: (ctx, r) => drawRoundFruit(ctx, r, '#8a3f9e', '#552266'),
  },
  {
    // A genuine watermelon WEDGE, not a solid circle — green rind, red
    // flesh, black seeds — the classic slicer-game silhouette.
    label: 'watermelon', color: '#e0403a', accent: '#2f7a2f',
    draw: (ctx, r) => {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, r, -0.55, 0.55);
      ctx.closePath();
      ctx.fillStyle = '#e0403a';
      ctx.fill();
      ctx.strokeStyle = '#fbeed2';
      ctx.lineWidth = r * 0.14;
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.94, -0.5, 0.5);
      ctx.stroke();
      ctx.strokeStyle = '#2f7a2f';
      ctx.lineWidth = r * 0.16;
      ctx.beginPath();
      ctx.arc(0, 0, r, -0.5, 0.5);
      ctx.stroke();
      ctx.fillStyle = '#1a1a1a';
      for (const [sx, sy] of [[0.35, -0.15], [0.5, 0.05], [0.35, 0.25], [0.15, -0.3], [0.15, 0.3]]) {
        ctx.beginPath();
        ctx.ellipse(sx * r, sy * r, r * 0.05, r * 0.08, sy, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  },
  {
    // Crescent banana — a genuinely non-round silhouette.
    label: 'banana', color: '#f5d020', accent: '#b89a10',
    draw: (ctx, r) => {
      ctx.beginPath();
      ctx.arc(0, r * 0.15, r * 1.15, Math.PI * 1.15, Math.PI * 1.85);
      ctx.arc(0, -r * 0.05, r * 0.68, Math.PI * 1.9, Math.PI * 1.1, true);
      ctx.closePath();
      ctx.fillStyle = '#f5d020';
      ctx.fill();
      ctx.strokeStyle = '#b89a10';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.fillStyle = '#6b4a12';
      ctx.beginPath();
      ctx.ellipse(-r * 0.65, -r * 0.55, r * 0.08, r * 0.14, 0.5, 0, Math.PI * 2);
      ctx.fill();
    },
  },
  {
    // Pineapple — oval body, spiky green crown, criss-cross diamond texture.
    label: 'pineapple', color: '#e8a53a', accent: '#a8721a',
    draw: (ctx, r) => {
      ctx.beginPath();
      ctx.ellipse(0, r * 0.1, r * 0.78, r * 0.98, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#e8a53a';
      ctx.fill();
      ctx.strokeStyle = '#a8721a';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(90,60,10,0.5)';
      ctx.lineWidth = 1.5;
      for (let i = -2; i <= 2; i++) {
        ctx.beginPath();
        ctx.moveTo(-r * 0.7, r * (0.1 + i * 0.28));
        ctx.lineTo(r * 0.7, r * (0.1 + i * 0.28 - 0.4));
        ctx.stroke();
      }
      ctx.fillStyle = '#3f7a2f';
      for (const dx of [-0.35, 0, 0.35]) {
        ctx.beginPath();
        ctx.moveTo(dx * r, -r * 0.85);
        ctx.lineTo(dx * r - r * 0.14, -r * 1.5);
        ctx.lineTo(dx * r + r * 0.14, -r * 1.5);
        ctx.closePath();
        ctx.fill();
      }
    },
  },
  {
    // Strawberry — a teardrop/heart taper with seed dots and a green cap.
    label: 'strawberry', color: '#e8304a', accent: '#9c1b30',
    draw: (ctx, r) => {
      ctx.beginPath();
      ctx.moveTo(0, r * 1.05);
      ctx.quadraticCurveTo(r * 1.05, r * 0.35, r * 0.55, -r * 0.35);
      ctx.quadraticCurveTo(r * 0.25, -r * 0.7, 0, -r * 0.35);
      ctx.quadraticCurveTo(-r * 0.25, -r * 0.7, -r * 0.55, -r * 0.35);
      ctx.quadraticCurveTo(-r * 1.05, r * 0.35, 0, r * 1.05);
      ctx.closePath();
      ctx.fillStyle = '#e8304a';
      ctx.fill();
      ctx.strokeStyle = '#9c1b30';
      ctx.lineWidth = 2.5;
      ctx.stroke();
      ctx.fillStyle = '#3f7a2f';
      ctx.beginPath();
      ctx.moveTo(-r * 0.3, -r * 0.35);
      ctx.lineTo(0, -r * 0.85);
      ctx.lineTo(r * 0.3, -r * 0.35);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#f5d98a';
      for (const [sx, sy] of [[-0.25, 0.1], [0.25, 0.1], [0, 0.45], [-0.35, 0.5], [0.35, 0.5]]) {
        ctx.beginPath();
        ctx.ellipse(sx * r, sy * r, r * 0.05, r * 0.07, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  },
  {
    // Coconut — rough brown sphere with 3 dark "eyes" and light fiber lines.
    label: 'coconut', color: '#7a5230', accent: '#4a3018',
    draw: (ctx, r) => {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = '#7a5230';
      ctx.fill();
      ctx.strokeStyle = '#4a3018';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(200,170,130,0.35)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
        ctx.stroke();
      }
      ctx.fillStyle = '#2a1a0c';
      for (const [sx, sy] of [[0, -0.25], [-0.22, 0.15], [0.22, 0.15]]) {
        ctx.beginPath();
        ctx.arc(sx * r, sy * r, r * 0.09, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  },
  {
    // Grape cluster — several small circles, not one big fruit at all.
    label: 'grapes', color: '#6a3f9e', accent: '#3f2266',
    draw: (ctx, r) => {
      const spots = [[0, -0.4, 0.32], [-0.4, -0.05, 0.34], [0.4, -0.05, 0.34], [0, 0.32, 0.36], [-0.35, 0.5, 0.3], [0.35, 0.5, 0.3]];
      for (const [sx, sy, sr] of spots) {
        ctx.beginPath();
        ctx.arc(sx * r, sy * r, sr * r, 0, Math.PI * 2);
        ctx.fillStyle = '#6a3f9e';
        ctx.fill();
        ctx.strokeStyle = '#3f2266';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.beginPath();
        ctx.arc(sx * r - sr * r * 0.3, sy * r - sr * r * 0.3, sr * r * 0.25, 0, Math.PI * 2);
        ctx.fill();
      }
    },
  },
  {
    // Doughnut — a ring with pastel sprinkles. A deliberately non-fruit
    // sliceable object, per the request to broaden variety beyond fruit.
    label: 'doughnut', color: '#d68a4a', accent: '#a85f2a',
    draw: (ctx, r) => {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2, true);
      ctx.fillStyle = '#e8b090';
      ctx.fill('evenodd');
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.94, 0, Math.PI * 2);
      ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2, true);
      ctx.fillStyle = '#d68a4a';
      ctx.fill('evenodd');
      ctx.strokeStyle = '#a85f2a';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, r * 0.42, 0, Math.PI * 2);
      ctx.stroke();
      const sprinkleColors = ['#e8304a', '#3fa8e8', '#6fbf3a', '#f5d020', '#e0403a'];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + 0.3;
        const rad = r * 0.7;
        ctx.save();
        ctx.translate(Math.cos(a) * rad, Math.sin(a) * rad);
        ctx.rotate(a + Math.random() * 1.2);
        ctx.fillStyle = sprinkleColors[i % sprinkleColors.length];
        ctx.fillRect(-r * 0.09, -r * 0.02, r * 0.18, r * 0.04);
        ctx.restore();
      }
    },
  },
];

function mkGame(width, height) {
  return {
    width,
    height,
    objects: [], // {id, isBomb, kind, x, y, vx, vy, radius, rotation, rotSpeed, sliced, sliceAngle, spawnedAt, halves?}
    particles: [], // {x, y, vx, vy, life, maxLife, color, size}
    trail: [], // {x, y, t}
    score: 0,
    combo: 0,
    lives: STARTING_LIVES,
    gameOver: false,
    bombHit: false,
    elapsed: 0,
    spawnTimer: 0,
    nextId: 1,
  };
}

function spawnObject(g) {
  const isBomb = Math.random() < 0.14;
  const fromLeft = Math.random() < 0.5;
  const x = fromLeft ? g.width * (0.1 + Math.random() * 0.25) : g.width * (0.65 + Math.random() * 0.25);
  const y = g.height + 30;
  // Aim roughly toward the opposite/upper half of the screen so arcs cross
  // the play area meaningfully rather than going straight up in place.
  const targetX = fromLeft ? g.width * (0.55 + Math.random() * 0.35) : g.width * (0.1 + Math.random() * 0.35);
  const apexY = g.height * (0.12 + Math.random() * 0.28);
  const t = 0.55 + Math.random() * 0.25; // time-to-apex, seconds — controls arc shape
  const vy = -Math.sqrt(2 * GRAVITY * Math.max(40, y - apexY));
  const vx = (targetX - x) / (t * 2);
  const kindIdx = Math.floor(Math.random() * SLICE_TARGETS.length);
  g.objects.push({
    id: g.nextId++,
    isBomb,
    kind: isBomb ? -1 : kindIdx,
    x, y, vx, vy,
    radius: isBomb ? 26 : 30 + Math.random() * 8,
    rotation: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 3,
    sliced: false,
    spawnedAt: g.elapsed,
  });
}

function spawnSliceParticles(g, obj, angle) {
  const kind = obj.isBomb ? { color: '#333' } : SLICE_TARGETS[obj.kind];
  for (let i = 0; i < 10; i++) {
    const a = angle + (Math.random() - 0.5) * Math.PI;
    const speed = 60 + Math.random() * 160;
    g.particles.push({
      x: obj.x, y: obj.y,
      vx: Math.cos(a) * speed, vy: Math.sin(a) * speed - 80,
      life: 0, maxLife: 0.5 + Math.random() * 0.3,
      color: kind.color, size: 3 + Math.random() * 4,
    });
  }
}

function updateGame(g, dt) {
  if (g.gameOver) return;
  g.elapsed += dt;

  // Spawn cadence ramps up with survival time (difficulty curve).
  const spawnInterval = Math.max(0.35, 1.1 - g.elapsed * 0.015);
  g.spawnTimer -= dt;
  if (g.spawnTimer <= 0) {
    spawnObject(g);
    if (g.elapsed > 12 && Math.random() < 0.3) spawnObject(g); // occasional double-spawn once warmed up
    g.spawnTimer = spawnInterval;
  }

  for (const obj of g.objects) {
    if (obj.sliced) continue;
    obj.vy += GRAVITY * dt;
    obj.x += obj.vx * dt;
    obj.y += obj.vy * dt;
    obj.rotation += obj.rotSpeed * dt;
  }

  // Missed fruit (fell below the screen, never sliced) costs a life. A
  // missed bomb costs nothing — real slicers only punish YOU for touching
  // the bomb, never for leaving it alone.
  const survivors = [];
  for (const obj of g.objects) {
    if (obj.sliced) {
      obj.sliceAge = (obj.sliceAge || 0) + dt;
      if (obj.sliceAge < 0.6) survivors.push(obj);
      continue;
    }
    if (obj.y - obj.radius > g.height + 40) {
      if (!obj.isBomb) {
        g.lives -= 1;
        if (g.lives <= 0) {
          g.gameOver = true;
        }
      }
      continue;
    }
    survivors.push(obj);
  }
  g.objects = survivors;

  const liveParticles = [];
  for (const p of g.particles) {
    p.life += dt;
    if (p.life >= p.maxLife) continue;
    p.vy += GRAVITY * 0.5 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    liveParticles.push(p);
  }
  g.particles = liveParticles;

  const now = performance.now();
  g.trail = g.trail.filter((p) => now - p.t < TRAIL_MAX_AGE_MS);
}

function pointSegmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq > 0 ? ((px - x1) * dx + (py - y1) * dy) / lenSq : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx, cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

// Checks the swipe segment [prev -> cur] against every live object, slicing
// anything it crosses. Returns { slicedFruit, hitBomb } for the caller to
// react to (score/combo bump, or game-over).
function checkSliceSegment(g, x1, y1, x2, y2) {
  let slicedFruit = 0;
  let hitBomb = false;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  for (const obj of g.objects) {
    if (obj.sliced) continue;
    const dist = pointSegmentDistance(obj.x, obj.y, x1, y1, x2, y2);
    if (dist <= obj.radius + 6) {
      obj.sliced = true;
      obj.sliceAngle = angle;
      spawnSliceParticles(g, obj, angle);
      if (obj.isBomb) {
        hitBomb = true;
      } else {
        slicedFruit++;
      }
    }
  }
  return { slicedFruit, hitBomb };
}

function drawGame(ctx, g, w, h) {
  ctx.clearRect(0, 0, w, h);
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#1a1230');
  grad.addColorStop(1, '#0a0714');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Trail (fading blade streak)
  if (g.trail.length > 1) {
    const now = performance.now();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 1; i < g.trail.length; i++) {
      const a = g.trail[i - 1], b = g.trail[i];
      const age = now - b.t;
      const alpha = Math.max(0, 1 - age / TRAIL_MAX_AGE_MS);
      ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.9})`;
      ctx.lineWidth = 6 * alpha + 1;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  for (const obj of g.objects) {
    ctx.save();
    ctx.translate(obj.x, obj.y);
    if (obj.sliced) {
      const age = obj.sliceAge || 0;
      const spread = age * 90;
      const drop = age * age * 220;
      ctx.rotate(obj.sliceAngle + Math.PI / 2);
      const kind = obj.isBomb ? { color: '#2b2b2b', accent: '#111' } : SLICE_TARGETS[obj.kind];
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(side * spread * 0.5, drop);
        ctx.beginPath();
        ctx.arc(0, 0, obj.radius, side < 0 ? Math.PI / 2 : -Math.PI / 2, side < 0 ? -Math.PI / 2 : Math.PI / 2);
        ctx.closePath();
        ctx.fillStyle = kind.color;
        ctx.fill();
        ctx.fillStyle = '#fbeed2';
        ctx.beginPath();
        ctx.moveTo(0, -obj.radius);
        ctx.lineTo(0, obj.radius);
        ctx.lineWidth = 3;
        ctx.strokeStyle = kind.accent;
        ctx.stroke();
        ctx.restore();
      }
    } else if (obj.isBomb) {
      ctx.rotate(obj.rotation);
      ctx.beginPath();
      ctx.arc(0, 0, obj.radius, 0, Math.PI * 2);
      ctx.fillStyle = '#1c1c1c';
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.strokeStyle = '#c78a3a';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, -obj.radius);
      ctx.quadraticCurveTo(obj.radius * 0.6, -obj.radius * 1.5, obj.radius * 0.2, -obj.radius * 1.9);
      ctx.stroke();
      ctx.fillStyle = '#e8791f';
      ctx.beginPath();
      ctx.arc(obj.radius * 0.2, -obj.radius * 1.9, 4, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.rotate(obj.rotation);
      SLICE_TARGETS[obj.kind].draw(ctx, obj.radius);
    }
    ctx.restore();
  }

  for (const p of g.particles) {
    const alpha = Math.max(0, 1 - p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

export default function SliceFrenzyGame({ onClose, onEndGame, isHost, hotSeatTournament, currentUserId, onTournamentScore }) {
  const canvasRef = useRef(null);
  const gameRef = useRef(null);
  const rafRef = useRef(null);
  const containerRef = useRef(null);
  const endedHandledRef = useRef(false);

  const [tick, setTick] = useState(0); // forces a re-render to reflect score/lives/gameOver from the mutable game object
  const [finalScore, setFinalScore] = useState(null);

  const isInTournament = !!hotSeatTournament;
  const isMyTurn = hotSeatTournament?.current_player_id === currentUserId;
  const myEntry = hotSeatTournament?.participants?.find((p) => p.user_id === currentUserId);
  const alreadyScored = isInTournament && myEntry && myEntry.score != null;
  const eliminated = isInTournament && !!myEntry?.eliminated;

  const shouldPlay = isHost && (!isInTournament || isMyTurn) && !alreadyScored;

  // Reset for a fresh turn whenever the active hot-seat player changes.
  useEffect(() => {
    endedHandledRef.current = false;
    setFinalScore(null);
  }, [hotSeatTournament?.current_player_id]);

  useEffect(() => {
    if (!shouldPlay) return undefined;
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return undefined;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      if (gameRef.current) {
        gameRef.current.width = rect.width;
        gameRef.current.height = rect.height;
      }
    };
    gameRef.current = mkGame(container.clientWidth || 400, container.clientHeight || 500);
    resize();
    window.addEventListener('resize', resize);

    const ctx = canvas.getContext('2d');
    let last = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const g = gameRef.current;
      if (g) {
        updateGame(g, dt);
        drawGame(ctx, g, canvas.width, canvas.height);
        setTick((t) => (t + 1) % 1000000);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [shouldPlay]);

  const handlePointerDown = useCallback((e) => {
    const g = gameRef.current;
    if (!g || g.gameOver) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    g.trail = [{ x, y, t: performance.now() }];
    g._lastPoint = { x, y };
    g._swipeCombo = 0;
  }, []);

  const handlePointerMove = useCallback((e) => {
    const g = gameRef.current;
    if (!g || g.gameOver || !g._lastPoint) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    const now = performance.now();
    g.trail.push({ x, y, t: now });
    if (g.trail.length > TRAIL_MAX_POINTS) g.trail.shift();

    const { slicedFruit, hitBomb } = checkSliceSegment(g, g._lastPoint.x, g._lastPoint.y, x, y);
    if (slicedFruit > 0) {
      for (let i = 0; i < slicedFruit; i++) {
        g._swipeCombo++;
        g.score += 10 * g._swipeCombo;
      }
    }
    if (hitBomb) {
      g.gameOver = true;
      g.bombHit = true;
    }
    g._lastPoint = { x, y };
  }, []);

  const handlePointerUp = useCallback(() => {
    const g = gameRef.current;
    if (!g) return;
    g._lastPoint = null;
    g._swipeCombo = 0;
  }, []);

  const g = gameRef.current;
  useEffect(() => {
    if (g && g.gameOver && finalScore === null) {
      setFinalScore(g.score);
    }
  }, [tick, g, finalScore]);

  const handleProceedTournament = () => {
    if (endedHandledRef.current) return;
    endedHandledRef.current = true;
    onTournamentScore?.(finalScore ?? 0);
  };

  const playAgainSolo = () => {
    const container = containerRef.current;
    gameRef.current = mkGame(container?.clientWidth || 400, container?.clientHeight || 500);
    setFinalScore(null);
  };

  const handleForfeit = () => {
    if (isInTournament) {
      onEndGame?.();
    } else {
      onClose?.();
    }
  };

  // ── Render precedence, mirroring ToadBallGame's own established shape ──
  if (!isHost && isInTournament) {
    const activeName = hotSeatTournament?.current_player_name || 'Someone';
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
        <div className="bg-gray-900 rounded-2xl p-8 text-center max-w-sm mx-4">
          <div className="text-5xl mb-4">🔪</div>
          <h2 className="text-white text-xl font-bold mb-2">Slice Frenzy</h2>
          <p className="text-gray-400 text-sm mb-4">{activeName} is slicing — sit back and watch the scoreboard!</p>
          <button onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium">Close</button>
        </div>
      </div>
    );
  }
  if (!isHost && !isInTournament) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
        <div className="bg-gray-900 rounded-2xl p-8 text-center max-w-sm mx-4">
          <div className="text-5xl mb-4">🔪</div>
          <h2 className="text-white text-xl font-bold mb-2">Slice Frenzy</h2>
          <p className="text-gray-400 text-sm mb-4">The host is playing solo — sit back and cheer them on!</p>
          <button onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium">Close</button>
        </div>
      </div>
    );
  }
  if (isHost && isInTournament && eliminated) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
        <div className="bg-gray-900 rounded-2xl p-8 text-center max-w-sm mx-4">
          <div className="text-5xl mb-4">🏁</div>
          <h2 className="text-white text-xl font-bold mb-2">You were eliminated</h2>
          <p className="text-gray-400 text-sm mb-4">Thanks for playing!</p>
          <button onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium">Close</button>
        </div>
      </div>
    );
  }
  if (isHost && isInTournament && !isMyTurn) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
        <div className="bg-gray-900 rounded-2xl p-8 text-center max-w-sm mx-4">
          <div className="text-5xl mb-4">📱</div>
          <h2 className="text-white text-xl font-bold mb-2">Pass the device</h2>
          <p className="text-gray-400 text-sm mb-4">It's {hotSeatTournament?.current_player_name || 'the next player'}'s turn to slice.</p>
        </div>
      </div>
    );
  }
  if (isHost && isInTournament && alreadyScored) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
        <div className="bg-gray-900 rounded-2xl p-8 text-center max-w-sm mx-4">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-white text-xl font-bold mb-2">You've already played this round</h2>
          <p className="text-gray-400 text-sm mb-4">Waiting for the other players…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800 shrink-0">
        <span className="text-white font-bold text-sm">🔪 Slice Frenzy</span>
        <div className="flex items-center gap-3">
          {g && !g.gameOver && (
            <>
              <span className="text-yellow-400 font-bold text-sm">{g.score}</span>
              <span className="text-red-400 text-sm">{'❤️'.repeat(Math.max(0, g.lives))}</span>
            </>
          )}
          <GameRulesButton gameType="slice_frenzy" />
          <button onClick={handleForfeit} className="text-gray-400 hover:text-white" title={isInTournament ? 'End for everyone' : 'Close'}>
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div ref={containerRef} className="relative flex-1 min-h-0">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full"
          style={{ touchAction: 'none', cursor: 'crosshair' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
        />
        {g?.gameOver && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70">
            <div className="bg-gray-900 rounded-2xl p-6 text-center max-w-xs">
              <div className="text-5xl mb-2">{g.bombHit ? '💥' : '🔪'}</div>
              <h3 className="text-white text-lg font-bold mb-1">{g.bombHit ? 'Boom!' : 'Game Over'}</h3>
              <p className="text-gray-400 text-sm mb-4">Score: <span className="text-yellow-400 font-bold">{finalScore ?? g.score}</span></p>
              {isInTournament ? (
                <button onClick={handleProceedTournament} className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-semibold">
                  Proceed →
                </button>
              ) : (
                <div className="flex flex-col gap-2">
                  <button onClick={playAgainSolo} className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-semibold">
                    Play Again
                  </button>
                  <button onClick={onClose} className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium">
                    Close
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
