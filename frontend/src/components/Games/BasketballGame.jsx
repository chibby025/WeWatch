// src/components/Games/BasketballGame.jsx
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { X } from 'lucide-react';
import GameWinnerBanner from './GameWinnerBanner';
import GameRulesButton from './GameRulesButton';

// Distance labels shown to the player choosing a free shot — purely a UI
// convenience over the raw 0-1 distance value the backend actually scores
// against (basketball.go's basketballIdealPower/basketballTolerance).
const DISTANCE_PRESETS = [
  { label: 'Layup', value: 0.05 },
  { label: 'Free Throw', value: 0.35 },
  { label: 'Mid-Range', value: 0.6 },
  { label: 'Three-Pointer', value: 0.9 },
];

function distanceLabel(distance) {
  let best = DISTANCE_PRESETS[0];
  let bestDiff = Infinity;
  for (const p of DISTANCE_PRESETS) {
    const diff = Math.abs(p.value - distance);
    if (diff < bestDiff) { bestDiff = diff; best = p; }
  }
  return best.label;
}

const HORSE_WORD = 'HORSE';

function HorseLetters({ letters }) {
  return (
    <div className="flex gap-0.5">
      {HORSE_WORD.split('').map((ch, i) => (
        <span
          key={i}
          className={`w-4 h-4 flex items-center justify-center text-[10px] font-bold rounded ${
            i < letters.length ? 'bg-red-600 text-white' : 'bg-gray-800 text-gray-600'
          }`}
        >
          {i < letters.length ? ch : ''}
        </span>
      ))}
    </div>
  );
}

// Court geometry, shared by the canvas renderer and the position math for
// the player figure / ball flight — a fixed hoop on the right, player
// standing position interpolated leftward as `distance` grows toward 1.
const HOOP_X_FRAC = 0.86;
const HOOP_Y_FRAC = 0.32;
const PLAYER_NEAR_X_FRAC = 0.72; // distance=0 (layup, right under the hoop)
const PLAYER_FAR_X_FRAC = 0.08; // distance=1 (full three-point range)
const GROUND_Y_FRAC = 0.82;

function playerXFrac(distance) {
  return PLAYER_NEAR_X_FRAC + (PLAYER_FAR_X_FRAC - PLAYER_NEAR_X_FRAC) * distance;
}

function drawCourt(ctx, w, h) {
  ctx.fillStyle = '#c9a06a';
  ctx.fillRect(0, 0, w, h * GROUND_Y_FRAC);
  ctx.fillStyle = '#8a5a2b';
  ctx.fillRect(0, h * GROUND_Y_FRAC, w, h - h * GROUND_Y_FRAC);
  // floor plank lines
  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 28) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h * GROUND_Y_FRAC);
    ctx.stroke();
  }

  // backboard + pole
  const hoopX = w * HOOP_X_FRAC;
  const hoopY = h * HOOP_Y_FRAC;
  ctx.fillStyle = '#e8e4d8';
  ctx.fillRect(hoopX + 18, hoopY - 45, 8, 90);
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 2;
  ctx.strokeRect(hoopX + 18, hoopY - 45, 8, 90);
  ctx.fillStyle = '#555';
  ctx.fillRect(hoopX + 24, hoopY - 20, 10, h * GROUND_Y_FRAC - hoopY + 20);

  // rim
  ctx.strokeStyle = '#e8791f';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.ellipse(hoopX, hoopY, 20, 6, 0, 0, Math.PI * 2);
  ctx.stroke();
  // net (simple crosshatch)
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1;
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(hoopX + i * 6, hoopY + 2);
    ctx.lineTo(hoopX + i * 3, hoopY + 26);
    ctx.stroke();
  }
}

function drawPlayerFigure(ctx, x, groundY, color) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, groundY - 46, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x, groundY - 39);
  ctx.lineTo(x, groundY - 14);
  ctx.stroke();
  // legs
  ctx.beginPath();
  ctx.moveTo(x, groundY - 14);
  ctx.lineTo(x - 6, groundY);
  ctx.moveTo(x, groundY - 14);
  ctx.lineTo(x + 6, groundY);
  ctx.stroke();
  // arms raised (shooting pose)
  ctx.beginPath();
  ctx.moveTo(x, groundY - 34);
  ctx.lineTo(x + 10, groundY - 50);
  ctx.stroke();
}

export default function BasketballGame({ gameState, players = [], currentUserId, onMove, onClose, onEndGame, onPostResult }) {
  const canvasRef = useRef(null);
  const flyingBallRef = useRef(null);
  const lastResultKeyRef = useRef(null);

  const gs = gameState?.game_state || {};
  const lettersMap = gs.letters || {};
  // gs.eliminated is a fresh object reference on any render where it's
  // absent (`|| {}` allocating a new literal each time) — memoized here so
  // the useMemo below it doesn't recompute on every render regardless of
  // whether the underlying data actually changed.
  const eliminatedMap = useMemo(() => gs.eliminated || {}, [gs.eliminated]);
  const hasPendingShot = !!gs.has_pending_shot;
  const setDistance = gs.set_distance ?? 0;
  const lastResult = gs.last_result;

  const currentTurn = gameState?.current_turn ?? 0;
  const currentPlayer = players[currentTurn];
  const isMyTurn = currentPlayer?.user_id === currentUserId;
  const isPlayer = players.some((p) => p.user_id === currentUserId);
  const winner = gameState?.winner_id ? players.find((p) => p.user_id === gameState.winner_id) : null;
  const isOver = ['finished', 'forfeited', 'completed'].includes(gameState?.status);

  const activePlayers = useMemo(
    () => players.filter((p) => !eliminatedMap[String(p.user_id)]),
    [players, eliminatedMap],
  );

  const [freeDistance, setFreeDistance] = useState(0.35);
  const [charging, setCharging] = useState(false);
  const [displayPower, setDisplayPower] = useState(0);
  const chargeStartRef = useRef(0);

  const effectiveDistance = hasPendingShot ? setDistance : freeDistance;

  // ── Canvas render loop ───────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    let raf;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * (window.devicePixelRatio || 1);
      canvas.height = rect.height * (window.devicePixelRatio || 1);
      ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const render = () => {
      raf = requestAnimationFrame(render);
      const rect = canvas.getBoundingClientRect();
      const w = rect.width, h = rect.height;
      drawCourt(ctx, w, h);

      const hoopX = w * HOOP_X_FRAC, hoopY = h * HOOP_Y_FRAC;
      const playerX = w * playerXFrac(effectiveDistance);
      const groundY = h * GROUND_Y_FRAC;
      drawPlayerFigure(ctx, playerX, groundY, isMyTurn ? '#22c55e' : '#f97316');

      const fb = flyingBallRef.current;
      if (fb) {
        const t = Math.min(1, (performance.now() - fb.startTime) / fb.duration);
        const eased = 1 - Math.pow(1 - t, 2);
        const bx = fb.fromX + (fb.toX - fb.fromX) * eased;
        const arcHeight = fb.made ? 0 : fb.missOffsetY;
        const by = fb.fromY + (fb.toY - fb.fromY) * eased - Math.sin(eased * Math.PI) * (h * 0.32) + arcHeight * eased;
        ctx.fillStyle = '#e8791f';
        ctx.beginPath();
        ctx.arc(bx, by, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#7a3d0f';
        ctx.lineWidth = 1;
        ctx.stroke();
        if (t >= 1) {
          flyingBallRef.current = null;
        }
      } else {
        // Resting ball in the player's hands.
        ctx.fillStyle = '#e8791f';
        ctx.beginPath();
        ctx.arc(playerX + 10, groundY - 50, 7, 0, Math.PI * 2);
        ctx.fill();
      }
      void hoopX; void hoopY;
    };
    render();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [effectiveDistance, isMyTurn]);

  // ── Animate the most recent confirmed shot result ────────────────────
  useEffect(() => {
    if (!lastResult) return;
    const key = `${lastResult.shooter_id}-${lastResult.distance}-${lastResult.power}`;
    if (lastResultKeyRef.current === key) return;
    lastResultKeyRef.current = key;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width, h = rect.height;
    const fromX = w * playerXFrac(lastResult.distance) + 10;
    const fromY = h * GROUND_Y_FRAC - 50;
    const toX = lastResult.made ? w * HOOP_X_FRAC : w * HOOP_X_FRAC + (Math.random() > 0.5 ? 22 : -22);
    const toY = h * HOOP_Y_FRAC;
    flyingBallRef.current = {
      fromX, fromY, toX, toY,
      made: lastResult.made,
      missOffsetY: lastResult.made ? 0 : (Math.random() > 0.5 ? -30 : 40),
      startTime: performance.now(),
      duration: 650,
    };
  }, [lastResult]);

  const CHARGE_PERIOD_MS = 850;
  const readTrianglePower = useCallback((elapsedMs) => {
    const phase = (elapsedMs % CHARGE_PERIOD_MS) / CHARGE_PERIOD_MS;
    return phase < 0.5 ? phase * 2 : (1 - phase) * 2;
  }, []);

  const startCharge = useCallback(() => {
    if (!isMyTurn || isOver) return;
    setCharging(true);
    chargeStartRef.current = performance.now();
  }, [isMyTurn, isOver]);

  const releaseCharge = useCallback(() => {
    setCharging((wasCharging) => {
      if (!wasCharging) return false;
      const elapsed = performance.now() - chargeStartRef.current;
      const power = readTrianglePower(elapsed);
      const moveData = { move_type: 'shoot', power };
      if (!hasPendingShot) moveData.distance = freeDistance;
      onMove(moveData);
      return false;
    });
  }, [hasPendingShot, freeDistance, onMove, readTrianglePower]);

  useEffect(() => {
    if (!charging) { setDisplayPower(0); return undefined; }
    let raf;
    const tick = () => {
      setDisplayPower(readTrianglePower(performance.now() - chargeStartRef.current));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [charging, readTrianglePower]);

  const handleForfeit = () => {
    if (winner || isOver) { onClose(); return; }
    (onEndGame || onClose)();
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <div className="relative bg-gray-900 rounded-2xl shadow-2xl w-full max-w-3xl mx-4 overflow-hidden flex flex-col" style={{ maxHeight: '92vh' }}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 shrink-0">
            <div>
              <h2 className="text-white text-xl font-bold">Basketball H.O.R.S.E 🏀</h2>
              <p className="text-gray-400 text-sm">{activePlayers.length} still in it</p>
            </div>
            <div className="flex items-center gap-2">
              <GameRulesButton gameType="basketball" />
              <button onClick={handleForfeit} className="text-gray-400 hover:text-white" title={winner || isOver ? 'Close' : 'Forfeit'}>
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-center gap-3 px-5 py-2.5 flex-wrap shrink-0 border-b border-gray-800">
            {players.map((p) => {
              const eliminated = !!eliminatedMap[String(p.user_id)];
              return (
                <div
                  key={p.user_id}
                  className={`flex flex-col items-center gap-1 px-3 py-1.5 rounded-lg ${
                    currentPlayer?.user_id === p.user_id ? 'bg-purple-900/40 ring-2 ring-purple-500' : 'bg-gray-800/50'
                  } ${eliminated ? 'opacity-40' : ''}`}
                >
                  <span className="text-white text-sm font-medium">{p.username}{eliminated ? ' (out)' : ''}</span>
                  <HorseLetters letters={lettersMap[String(p.user_id)] || ''} />
                </div>
              );
            })}
          </div>

          {!isOver && (
            <div className="text-center py-1.5 shrink-0">
              <p className={`text-sm font-medium ${isMyTurn ? 'text-green-400' : 'text-gray-400'}`}>
                {isMyTurn
                  ? hasPendingShot
                    ? `Your turn — MATCH the ${distanceLabel(setDistance)} shot!`
                    : 'Your turn — choose a shot and take it!'
                  : hasPendingShot
                    ? `${currentPlayer?.username || 'Opponent'} is matching the ${distanceLabel(setDistance)} shot…`
                    : `${currentPlayer?.username || 'Opponent'}'s turn`}
              </p>
            </div>
          )}

          <div className="relative flex-1 min-h-[280px]">
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
          </div>

          {isMyTurn && !isOver && (
            <div className="px-5 pb-4 pt-2 shrink-0">
              {!hasPendingShot && (
                <div className="flex justify-center gap-2 mb-3">
                  {DISTANCE_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      onClick={() => setFreeDistance(p.value)}
                      disabled={charging}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                        Math.abs(freeDistance - p.value) < 0.01
                          ? 'bg-orange-600 border-orange-400 text-white'
                          : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              )}
              <p className="text-center text-xs text-gray-400 mb-1.5">
                {hasPendingShot ? `Matching: ${distanceLabel(setDistance)}` : `Aiming: ${distanceLabel(freeDistance)}`} — hold to charge power, release to shoot
              </p>
              <div className="relative h-5 bg-gray-800 rounded-full overflow-hidden border border-gray-700">
                <div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-yellow-500 to-orange-600"
                  style={{ width: `${(charging ? displayPower : 0) * 100}%` }}
                />
              </div>
              <button
                onPointerDown={startCharge}
                onPointerUp={releaseCharge}
                onPointerLeave={() => { if (charging) releaseCharge(); }}
                className="mt-3 w-full py-2.5 rounded-lg bg-orange-600 hover:bg-orange-500 active:bg-orange-700 text-white font-bold text-sm select-none"
              >
                {charging ? 'Release to Shoot!' : 'Hold to Charge'}
              </button>
            </div>
          )}

          {!isMyTurn && !isOver && isPlayer && (
            <div className="px-5 pb-4 text-center text-gray-500 text-xs shrink-0">Waiting for your turn…</div>
          )}

          {!isOver && (
            <div className="flex justify-end px-5 pb-4 shrink-0">
              <button onClick={handleForfeit} className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium">
                Forfeit
              </button>
            </div>
          )}
        </div>
      </div>

      {isOver && (
        <GameWinnerBanner
          winner={winner}
          players={players}
          gameType="basketball"
          gameStats={{ lines: players.map((p) => ({ label: p.username, value: lettersMap[String(p.user_id)] || '—' })) }}
          isForfeit={gameState?.status === 'forfeited'}
          onClose={onClose}
          onPostResult={onPostResult}
        />
      )}
    </>
  );
}
