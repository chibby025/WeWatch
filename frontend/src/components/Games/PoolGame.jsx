import { useRef, useEffect, useState, useCallback } from 'react';
import { X as CloseIcon } from 'lucide-react';

// 8-ball pool with canvas physics.
// Physics is client-authoritative: the shooting player runs the simulation
// and reports { pocketed, cue_scratched, cue_x, cue_y, first_contact } to the server.
// The server validates turn legality and advances state.

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
  return balls.map(b => ({ ...b, vx: 0, vy: 0, active: true }));
}

// ─── Physics helpers ────────────────────────────────────────────────────────
function dist2(a, b) { const dx = a.x - b.x, dy = a.y - b.y; return dx*dx + dy*dy; }

function resolveCollision(a, b) {
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
}

function stepPhysics(balls, pocketedSet) {
  for (const b of balls) {
    if (!b.active) continue;
    b.x += b.vx; b.y += b.vy;
    b.vx *= FRICTION; b.vy *= FRICTION;
    if (Math.abs(b.vx) < 0.01) b.vx = 0;
    if (Math.abs(b.vy) < 0.01) b.vy = 0;
    // Cushion bounce
    if (b.x - BALL_R < CUSHION) { b.x = CUSHION + BALL_R; b.vx = Math.abs(b.vx) * 0.85; }
    if (b.x + BALL_R > TW - CUSHION) { b.x = TW - CUSHION - BALL_R; b.vx = -Math.abs(b.vx) * 0.85; }
    if (b.y - BALL_R < CUSHION) { b.y = CUSHION + BALL_R; b.vy = Math.abs(b.vy) * 0.85; }
    if (b.y + BALL_R > TH - CUSHION) { b.y = TH - CUSHION - BALL_R; b.vy = -Math.abs(b.vy) * 0.85; }
  }
  // Ball-ball collisions
  for (let i = 0; i < balls.length; i++) {
    if (!balls[i].active) continue;
    for (let j = i + 1; j < balls.length; j++) {
      if (!balls[j].active) continue;
      if (dist2(balls[i], balls[j]) < (BALL_R * 2) ** 2) {
        resolveCollision(balls[i], balls[j]);
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
        pocketedSet.add(b.id);
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
  ctx.fillStyle = '#065f46';
  ctx.fillRect(0, 0, W, H);
  // Cushions
  ctx.fillStyle = '#047857';
  ctx.fillRect(0, 0, W, CUSHION * s);
  ctx.fillRect(0, H - CUSHION * s, W, CUSHION * s);
  ctx.fillRect(0, 0, CUSHION * s, H);
  ctx.fillRect(W - CUSHION * s, 0, CUSHION * s, H);
  // Pockets
  for (const p of POCKETS) {
    ctx.beginPath();
    ctx.arc(p.x * s, p.y * s, POCKET_R * s, 0, Math.PI * 2);
    ctx.fillStyle = '#000';
    ctx.fill();
  }
}

function drawBall(ctx, ball, scale) {
  if (!ball.active) return;
  const s = scale;
  const x = ball.x * s, y = ball.y * s, r = BALL_R * s;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = BALL_COLORS[ball.id] || '#888';
  ctx.fill();
  // Stripe overlay
  if (STRIPE_IDS.has(ball.id)) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = '#fff';
    ctx.fillRect(x - r, y - r * 0.35, r * 2, r * 0.7);
    ctx.restore();
  }
  // Ball number
  ctx.fillStyle = ball.id === 0 ? 'transparent' : '#fff';
  if (ball.id !== 0) {
    ctx.font = `bold ${r * 0.85}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(ball.id), x, y);
  }
  // Outline
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 0.5;
  ctx.stroke();
}

function drawCue(ctx, cueBall, mx, my, scale, power) {
  if (!cueBall?.active) return;
  const s = scale;
  const cx = cueBall.x * s, cy = cueBall.y * s;
  const dx = cx - mx, dy = cy - my;
  const d = Math.sqrt(dx*dx + dy*dy) || 1;
  const nx = dx/d, ny = dy/d;
  // Aim line (ghost path)
  ctx.setLineDash([4, 6]);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + nx * 120 * s, cy + ny * 120 * s);
  ctx.stroke();
  ctx.setLineDash([]);
  // Cue stick
  const pullback = (BALL_R + 4 + power * 0.15) * s;
  ctx.strokeStyle = '#d4a96a';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(cx + nx * (BALL_R + 2) * s, cy + ny * (BALL_R + 2) * s);
  ctx.lineTo(cx + nx * pullback + nx * 100 * s, cy + ny * pullback + ny * 100 * s);
  ctx.stroke();
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
  const [power, setPower] = useState(50);
  const [isAiming, setIsAiming] = useState(true);
  const [ballInHand, setBallInHand] = useState(false);
  const [cueHandPos, setCueHandPos] = useState({ x: TW * 0.25, y: TH * 0.5 });
  const [scale, setScale] = useState(1);

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

  // Sync server-pocketed state into local ball array
  useEffect(() => {
    const serverSet = new Set(pocketedFromServer.map(Number));
    for (const b of ballsRef.current) {
      if (serverSet.has(b.id) && b.active) {
        b.active = false;
      }
    }
    // Restore cue ball on foul (ball in hand)
    if (ballInHandFromServer) {
      const cue = ballsRef.current.find(b => b.id === 0);
      if (cue && !cue.active) {
        cue.active = true;
        cue.vx = 0; cue.vy = 0;
        cue.x = cueHandPos.x; cue.y = cueHandPos.y;
      }
      setBallInHand(true);
    } else {
      setBallInHand(false);
    }
  }, [JSON.stringify(pocketedFromServer), ballInHandFromServer]);

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

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const s = scale || 1;
    canvas.width  = TW * s;
    canvas.height = TH * s;

    let rafId;
    const render = () => {
      drawTable(ctx, canvas.width, canvas.height, s);
      for (const b of ballsRef.current) drawBall(ctx, b, s);
      if (isAiming && isMyTurn && !simRunning.current) {
        const cueBall = ballsRef.current.find(b => b.id === 0);
        drawCue(ctx, cueBall, mouseRef.current.x * s, mouseRef.current.y * s, s, power);
      }
      rafId = requestAnimationFrame(render);
    };
    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [scale, isAiming, isMyTurn, power]);

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
  const runSimulation = useCallback((cueBall, vx, vy) => {
    setIsAiming(false);
    simRunning.current = true;
    pocketedThisShotRef.current = new Set();
    firstContactRef.current = null;
    cueBall.vx = vx;
    cueBall.vy = vy;

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
      stepPhysics(ballsRef.current, pocketedThisShotRef.current);
    };

    let frames = 0;
    const maxFrames = 600;
    const simulate = () => {
      for (let i = 0; i < 3; i++) stepAndTrack();
      frames += 3;
      if (!isSettled(ballsRef.current) && frames < maxFrames) {
        animRef.current = requestAnimationFrame(simulate);
      } else {
        simRunning.current = false;
        setIsAiming(true);
        // Find cue state after shot
        const cue = ballsRef.current.find(b => b.id === 0);
        const cueScratch = pocketedThisShotRef.current.has(0) || !cue?.active;
        onMove({
          move_type:     'shot',
          pocketed:      [...pocketedThisShotRef.current],
          cue_scratched: cueScratch,
          cue_x:         cue ? cue.x / TW : 0.25,
          cue_y:         cue ? cue.y / TH : 0.5,
          first_contact: firstContactRef.current ?? 0,
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
    runSimulation(cueBall, (dx/d) * speed, (dy/d) * speed);
  }, [isMyTurn, power, runSimulation]);

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
    cue.x = Math.max(CUSHION + BALL_R, Math.min(TW - CUSHION - BALL_R, x));
    cue.y = Math.max(CUSHION + BALL_R, Math.min(TH - CUSHION - BALL_R, y));
    cue.vx = 0; cue.vy = 0;
    setCueHandPos({ x: cue.x, y: cue.y });
    setBallInHand(false);
    // Inform parent so it re-checks state
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
          <button onClick={() => { onEndGame?.(); onClose?.(); }} className="ml-2 p-1 hover:text-gray-300 text-gray-500">
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
