// src/components/Games/PenaltyGame.jsx
// Penalty shootout: 5 kicks per player, hot-seat tournament support.
// Fully client-side — no backend game session needed.
// AI goalkeeper uses a readable "tell" (lean) that gives the human a fair chance.

import { useEffect, useRef, useState, useCallback } from 'react';
import { X as CloseIcon, Trophy } from 'lucide-react';

// ─── Constants ───────────────────────────────────────────────────────────────
const KICKS_PER_ROUND = 5;
const GOAL_ZONES = ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'centre'];
const ZONE_LABELS = {
  'top-left':     '↖ Top Left',
  'top-right':    '↗ Top Right',
  'bottom-left':  '↙ Bottom Left',
  'bottom-right': '↘ Bottom Right',
  'centre':       '⬆ Centre',
};

// Keeper lean shown to player BEFORE they shoot (readable tell)
const KEEPER_LEAN = ['left', 'right', 'centre'];

// Resolution: zone → keeper lean → result
// Keeper covers left third, right third, or stays centre.
// Zones that overlap with the keeper's coverage have a ~60% save rate; others go in.
function resolveShot(zone, keeperLean) {
  const roll = Math.random();
  // centre dive → blocks centre
  if (keeperLean === 'centre' && zone === 'centre') return roll < 0.7 ? 'saved' : 'goal';
  // left dive covers top-left and bottom-left
  if (keeperLean === 'left'   && (zone === 'top-left'  || zone === 'bottom-left'))  return roll < 0.55 ? 'saved' : 'goal';
  // right dive covers top-right and bottom-right
  if (keeperLean === 'right'  && (zone === 'top-right' || zone === 'bottom-right')) return roll < 0.55 ? 'saved' : 'goal';
  // Keeper dove the wrong way — small miss chance for realism
  return roll < 0.08 ? 'miss' : 'goal';
}

// Keeper AI: picks lean with a biased pattern that can be read (tells every 2-3 kicks)
function aiPickLean(kickNumber) {
  // Deterministic pattern with noise — sufficiently readable for the user
  const patterns = ['left', 'right', 'centre', 'right', 'left'];
  const base = patterns[kickNumber % patterns.length];
  // 30% chance it deviates
  if (Math.random() < 0.3) return KEEPER_LEAN[Math.floor(Math.random() * KEEPER_LEAN.length)];
  return base;
}

// ─── Canvas helpers ───────────────────────────────────────────────────────────
const W = 480, H = 320;
const GOAL_X = 100, GOAL_Y = 40, GOAL_W = 280, GOAL_H = 140;
const BALL_START_X = W / 2, BALL_START_Y = H - 60;

function drawPitch(ctx) {
  // Sky/grass
  ctx.fillStyle = '#1a7a37';
  ctx.fillRect(0, 0, W, H);
  // Grass stripes
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#1a7a37' : '#1d8540';
    ctx.fillRect(i * (W / 8), 0, W / 8, H);
  }
  // Penalty spot
  ctx.beginPath();
  ctx.arc(W / 2, H - 60, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  // Penalty arc
  ctx.beginPath();
  ctx.arc(W / 2, H - 10, 60, Math.PI, 2 * Math.PI);
  ctx.strokeStyle = '#ffffff44';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function drawGoal(ctx) {
  // Net shading
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(GOAL_X, GOAL_Y, GOAL_W, GOAL_H);
  // Net lines
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  for (let x = GOAL_X; x <= GOAL_X + GOAL_W; x += 20) {
    ctx.beginPath(); ctx.moveTo(x, GOAL_Y); ctx.lineTo(x, GOAL_Y + GOAL_H); ctx.stroke();
  }
  for (let y = GOAL_Y; y <= GOAL_Y + GOAL_H; y += 20) {
    ctx.beginPath(); ctx.moveTo(GOAL_X, y); ctx.lineTo(GOAL_X + GOAL_W, y); ctx.stroke();
  }
  // Posts
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 4;
  ctx.strokeRect(GOAL_X, GOAL_Y, GOAL_W, GOAL_H);
  // Crossbar shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(GOAL_X, GOAL_Y + GOAL_H, GOAL_W, 6);
}

function zoneCentre(zone) {
  // Returns [x, y] of ball landing in this zone relative to the goal
  const mx = GOAL_X + GOAL_W / 2, my = GOAL_Y + GOAL_H / 2;
  const ox = GOAL_W * 0.28, oy = GOAL_H * 0.28;
  switch (zone) {
    case 'top-left':     return [mx - ox, my - oy];
    case 'top-right':    return [mx + ox, my - oy];
    case 'bottom-left':  return [mx - ox, my + oy];
    case 'bottom-right': return [mx + ox, my + oy];
    default:             return [mx, my];
  }
}

function keeperX(lean) {
  if (lean === 'left')   return GOAL_X + GOAL_W * 0.2;
  if (lean === 'right')  return GOAL_X + GOAL_W * 0.8;
  return GOAL_X + GOAL_W * 0.5;
}

function drawKeeper(ctx, lean, diving, progress) {
  let kx = GOAL_X + GOAL_W / 2;
  if (diving) {
    const target = keeperX(lean);
    kx = GOAL_X + GOAL_W / 2 + (target - (GOAL_X + GOAL_W / 2)) * Math.min(1, progress * 2);
  }
  const ky = GOAL_Y + GOAL_H * 0.6;
  // Body
  ctx.fillStyle = '#e63946';
  ctx.fillRect(kx - 14, ky - 36, 28, 40);
  // Head
  ctx.beginPath();
  ctx.arc(kx, ky - 44, 14, 0, Math.PI * 2);
  ctx.fillStyle = '#f1c27d';
  ctx.fill();
  // Arms if diving
  if (diving) {
    ctx.save();
    ctx.strokeStyle = '#f1c27d';
    ctx.lineWidth = 6;
    const dir = lean === 'right' ? 1 : -1;
    if (lean !== 'centre') {
      ctx.beginPath();
      ctx.moveTo(kx, ky - 20);
      ctx.lineTo(kx + dir * 30, ky - 50);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.moveTo(kx, ky - 20);
      ctx.lineTo(kx - 25, ky - 45);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(kx, ky - 20);
      ctx.lineTo(kx + 25, ky - 45);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawBall(ctx, bx, by, scale) {
  const r = 10 * scale;
  ctx.beginPath();
  ctx.arc(bx, by, r, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  ctx.stroke();
  // Pentagons pattern
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(bx, by, r * 0.3, 0, Math.PI * 2);
  ctx.fill();
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function PenaltyGame({
  onClose,
  onEndGame,
  isHost,
  hotSeatTournament = null,
  currentUserId = null,
  onTournamentScore = null,
}) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const [phase, setPhase] = useState('intro');   // intro|choosing|lean|shooting|result|done
  const [kickNumber, setKickNumber] = useState(0);
  const [score, setScore] = useState(0);
  const [results, setResults] = useState([]);    // array of 'goal'|'saved'|'miss'
  const [currentLean, setCurrentLean] = useState('centre');
  const [chosenZone, setChosenZone] = useState(null);
  const [shotResult, setShotResult] = useState(null);   // 'goal'|'saved'|'miss'
  const [animState, setAnimState] = useState({ bx: BALL_START_X, by: BALL_START_Y, progress: 0 });
  const [leantTell, setLeanTell] = useState(null); // shown to player before shoot

  const isMyTurn = !hotSeatTournament || hotSeatTournament.current_player_id === currentUserId;
  const isInTournament = !!hotSeatTournament;

  // Canvas render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let rafId;
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      drawPitch(ctx);
      drawGoal(ctx);

      const shooting = phase === 'shooting';
      const done = phase === 'result' || phase === 'done';
      const lean = currentLean;
      const prog = animState.progress;

      drawKeeper(ctx, lean, shooting || done, prog);
      drawBall(ctx, animState.bx, animState.by, shooting ? (1 + prog * 0.4) : 1);

      // Zone target overlay when choosing
      if (phase === 'choosing' || phase === 'lean') {
        // Light zone indicators
        const zones = [
          { id: 'top-left',    x: GOAL_X + 10,         y: GOAL_Y + 10,         w: GOAL_W/2 - 5, h: GOAL_H/2 - 5 },
          { id: 'top-right',   x: GOAL_X + GOAL_W/2+5, y: GOAL_Y + 10,         w: GOAL_W/2 - 15,h: GOAL_H/2 - 5 },
          { id: 'bottom-left', x: GOAL_X + 10,         y: GOAL_Y + GOAL_H/2+5, w: GOAL_W/2 - 5, h: GOAL_H/2 - 15 },
          { id: 'bottom-right',x: GOAL_X + GOAL_W/2+5, y: GOAL_Y + GOAL_H/2+5, w: GOAL_W/2 - 15,h: GOAL_H/2 - 15 },
          { id: 'centre',      x: GOAL_X + GOAL_W/4,   y: GOAL_Y + GOAL_H/4,   w: GOAL_W/2,     h: GOAL_H/2 },
        ];
        for (const z of zones) {
          ctx.fillStyle = z.id === chosenZone ? 'rgba(255,255,0,0.3)' : 'rgba(255,255,255,0.08)';
          ctx.fillRect(z.x, z.y, z.w, z.h);
        }
      }

      rafId = requestAnimationFrame(draw);
    };
    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [phase, animState, currentLean, chosenZone]);

  // Animate the shot
  const animateShot = useCallback((zone, lean) => {
    const [targetX, targetY] = zoneCentre(zone);
    let prog = 0;
    const step = () => {
      prog = Math.min(1, prog + 0.025);
      const bx = BALL_START_X + (targetX - BALL_START_X) * prog;
      const by = BALL_START_Y + (targetY - BALL_START_Y) * prog;
      setAnimState({ bx, by, progress: prog });
      if (prog < 1) {
        animRef.current = requestAnimationFrame(step);
      }
    };
    animRef.current = requestAnimationFrame(step);
  }, []);

  const handleShoot = useCallback(() => {
    if (!chosenZone || phase !== 'lean') return;
    const result = resolveShot(chosenZone, currentLean);
    setPhase('shooting');
    setShotResult(result);
    animateShot(chosenZone, currentLean);

    setTimeout(() => {
      const newResults = [...results, result];
      const newScore = score + (result === 'goal' ? 1 : 0);
      setResults(newResults);
      setScore(newScore);

      if (newResults.length >= KICKS_PER_ROUND) {
        setPhase('done');
        if (isInTournament && onTournamentScore) {
          onTournamentScore(newScore);
        }
      } else {
        setKickNumber(k => k + 1);
        setChosenZone(null);
        setShotResult(null);
        setAnimState({ bx: BALL_START_X, by: BALL_START_Y, progress: 0 });
        setPhase('choosing');
      }
    }, 1200);
  }, [chosenZone, phase, currentLean, results, score, animateShot, isInTournament, onTournamentScore]);

  const handleZoneSelect = useCallback((zone) => {
    if (phase !== 'choosing') return;
    setChosenZone(zone);
    const lean = aiPickLean(kickNumber);
    setCurrentLean(lean);
    setLeanTell(lean);
    setPhase('lean');
  }, [phase, kickNumber]);

  const handleStart = () => {
    setPhase('choosing');
    setKickNumber(0);
    setScore(0);
    setResults([]);
    setChosenZone(null);
    setShotResult(null);
    setAnimState({ bx: BALL_START_X, by: BALL_START_Y, progress: 0 });
  };

  const handleClose = () => {
    onEndGame?.();
    onClose?.();
  };

  // Non-host / waiting in tournament
  if (!isHost || (isInTournament && !isMyTurn)) {
    const currentName = hotSeatTournament?.current_player_name ?? 'Someone';
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black gap-4 text-white">
        <span className="text-6xl">⚽</span>
        <p className="text-lg font-semibold">
          {isInTournament ? `${currentName} is taking their penalties!` : 'Penalty Shootout in progress!'}
        </p>
        <p className="text-sm text-gray-400">
          {isInTournament ? 'Stand by for your turn…' : 'Cheer them on!'}
        </p>
        <button onClick={onClose}
          className="mt-2 px-5 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm transition-colors">
          Leave
        </button>
      </div>
    );
  }

  // ─── Scoreboard dots ─────────────────────────────────────────────────────────
  const ScoreRow = () => (
    <div className="flex gap-2 items-center justify-center">
      {Array.from({ length: KICKS_PER_ROUND }).map((_, i) => {
        const r = results[i];
        const isCurrent = i === results.length && phase !== 'done';
        return (
          <div key={i} className={`w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold
            ${r === 'goal'  ? 'bg-green-500 border-green-400 text-white' :
              r === 'saved' || r === 'miss' ? 'bg-red-600 border-red-500 text-white' :
              isCurrent ? 'border-yellow-400 border-dashed' :
              'border-gray-600'}`}>
            {r === 'goal' ? '⚽' : r === 'saved' ? '🧤' : r === 'miss' ? '❌' : isCurrent ? '→' : ''}
          </div>
        );
      })}
      <span className="ml-3 text-lg font-black text-yellow-400">{score}/{KICKS_PER_ROUND}</span>
    </div>
  );

  // ─── Phases ───────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950 text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800 flex-shrink-0">
        <span className="font-bold text-lg">⚽ Penalty Shootout</span>
        {isInTournament && (
          <span className="text-sm text-gray-400">
            {hotSeatTournament.current_player_name}'s turn
          </span>
        )}
        <button onClick={handleClose} className="p-1 text-gray-500 hover:text-white">
          <CloseIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Canvas */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4 p-4 min-h-0">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          className="rounded-xl shadow-2xl max-w-full"
          style={{ maxHeight: '55vh', objectFit: 'contain' }}
        />

        {/* Score row */}
        {phase !== 'intro' && <ScoreRow />}

        {/* Phase-specific UI */}
        {phase === 'intro' && (
          <div className="text-center">
            <p className="text-gray-400 text-sm mb-4">
              {KICKS_PER_ROUND} penalties — pick your corner, read the keeper's lean!
            </p>
            <button onClick={handleStart}
              className="px-8 py-3 bg-green-600 hover:bg-green-700 rounded-xl font-bold text-lg transition-colors">
              Start Shooting
            </button>
          </div>
        )}

        {phase === 'choosing' && (
          <div className="text-center">
            <p className="text-sm text-gray-400 mb-3">
              Penalty {kickNumber + 1} of {KICKS_PER_ROUND} — pick your spot:
            </p>
            <div className="grid grid-cols-2 gap-2 max-w-xs mx-auto">
              {GOAL_ZONES.filter(z => z !== 'centre').map(z => (
                <button key={z} onClick={() => handleZoneSelect(z)}
                  className="py-3 bg-blue-700 hover:bg-blue-600 active:bg-blue-500 rounded-lg font-semibold text-sm transition-colors">
                  {ZONE_LABELS[z]}
                </button>
              ))}
            </div>
            <button onClick={() => handleZoneSelect('centre')}
              className="mt-2 px-8 py-3 bg-blue-700 hover:bg-blue-600 rounded-lg font-semibold text-sm w-full max-w-xs transition-colors">
              {ZONE_LABELS['centre']}
            </button>
          </div>
        )}

        {phase === 'lean' && (
          <div className="text-center">
            <p className="text-sm text-gray-300 mb-1">
              The keeper is leaning <span className="font-black text-yellow-300 uppercase">{leantTell}</span>!
            </p>
            <p className="text-xs text-gray-500 mb-4">You're shooting {ZONE_LABELS[chosenZone]}. Hold your nerve…</p>
            <button onClick={handleShoot}
              className="px-10 py-4 bg-yellow-500 hover:bg-yellow-400 text-black font-black text-lg rounded-xl transition-colors">
              🦵 SHOOT!
            </button>
          </div>
        )}

        {phase === 'shooting' && (
          <div className="text-center">
            <p className="text-2xl font-black animate-pulse">
              {shotResult === 'goal' ? '⚽ GOOOAL!' : shotResult === 'saved' ? '🧤 Saved!' : shotResult === 'miss' ? '❌ Missed!' : '…'}
            </p>
          </div>
        )}

        {phase === 'result' && (
          <div className="text-center">
            <p className="text-2xl font-black mb-2">
              {shotResult === 'goal' ? '⚽ GOAL!' : shotResult === 'saved' ? '🧤 Saved!' : '❌ Missed!'}
            </p>
          </div>
        )}

        {phase === 'done' && (
          <div className="text-center">
            <span className="text-5xl">{score >= 4 ? '🏆' : score >= 2 ? '⚽' : '😔'}</span>
            <h2 className="text-2xl font-black mt-2">
              {score}/{KICKS_PER_ROUND} — {score >= 4 ? 'Brilliant!' : score >= 2 ? 'Not bad!' : 'Better luck next time!'}
            </h2>
            {isInTournament ? (
              <p className="text-sm text-gray-400 mt-2">Passing the ball to the next player…</p>
            ) : (
              <div className="flex gap-3 mt-4 justify-center">
                <button onClick={handleStart}
                  className="px-6 py-2 bg-green-600 hover:bg-green-700 rounded-lg font-semibold transition-colors">
                  Play Again
                </button>
                <button onClick={handleClose}
                  className="px-6 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold transition-colors">
                  Close
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
