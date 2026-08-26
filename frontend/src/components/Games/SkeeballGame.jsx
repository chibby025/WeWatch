// src/components/Games/SkeeballGame.jsx
//
// Arcade: single-player or hot-seat tournament, same shape as
// SliceFrenzyGame — a fully client-side score-chase (no server-side move
// logic needed, matching Toad Ball/Space Attack's own precedent), final
// cumulative score reported via onTournamentScore.
//
// Real skeeball: roll a ball up a lane into one of several concentric
// scoring rings/holes at the far end, 9 balls per game, cumulative score
// wins. Modeled here as a closed-form aim+power game — same family as
// Darts/Archery Battle/Curling (aim + a charge-and-release power bar,
// imperfect timing wobbles the shot) — except the "aim" dimension is purely
// LATERAL (left/right across the lane, matching how a real skeeball player
// only ever adjusts sideways position, never up/down) and the "how far up
// the lane the ball travels" dimension comes from how close the release
// power was to the one ideal weight needed to reach the rings, not a
// separate 2D target the player aims at directly.
import { useState, useRef, useCallback, useEffect } from 'react';
import { X } from 'lucide-react';
import GameRulesButton from './GameRulesButton';

const TOTAL_BALLS = 9;
const IDEAL_POWER = 0.72;
const POWER_Y_SCALE = 2.4; // how harshly a power miss translates into falling short of / overshooting the rings

// Real-ish skeeball ring layout — 5 concentric bands, center highest,
// normalized so the outermost scoring ring's edge sits at radius 1.0.
// Landing beyond 1.0 is a clean miss (ball rolled into the gutter/back wall).
function ringScoreAt(x, y) {
  const r = Math.hypot(x, y);
  if (r > 1.0) return 0;
  if (r <= 0.15) return 50;
  if (r <= 0.35) return 40;
  if (r <= 0.55) return 30;
  if (r <= 0.8) return 20;
  return 10;
}

function computeLanding(aimX, power) {
  const powerDelta = power - IDEAL_POWER;
  const landY = powerDelta * POWER_Y_SCALE;
  // Small lateral wobble from imperfect release timing — worse at low
  // power/poor timing, same "tightens toward near-zero as power approaches
  // the ideal" skill mechanic Darts/Archery/Curling already establish.
  const wobbleMag = 0.10 * (1 - power) + 0.02;
  const angle = Math.random() * Math.PI * 2;
  const mag = Math.random() * wobbleMag;
  const landX = aimX + Math.cos(angle) * mag;
  return { landX, landY: landY + Math.sin(angle) * mag * 0.4 };
}

const RING_COLORS = ['#1d5fd6', '#d6362a', '#e8b923', '#1f8a3d', '#f5f0e6']; // outer(10) -> center(50)

function drawLaneAndRings(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#3a2a18');
  grad.addColorStop(1, '#6b4a28');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Lane planks
  const laneX0 = w * 0.15, laneX1 = w * 0.85;
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 1;
  for (let y = h; y > h * 0.22; y -= 26) {
    ctx.beginPath();
    ctx.moveTo(laneX0, y);
    ctx.lineTo(laneX1, y);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(laneX0, h);
  ctx.lineTo(laneX0 + (w * 0.5 - laneX0) * 0.0, h * 0.22);
  ctx.stroke();

  // Rings centered near the top of the lane
  const cx = w * 0.5, cy = h * 0.24;
  const R = Math.min(w, h) * 0.34;
  for (let i = 4; i >= 0; i--) {
    const frac = [1.0, 0.8, 0.55, 0.35, 0.15][i];
    ctx.beginPath();
    ctx.arc(cx, cy, R * frac, 0, Math.PI * 2);
    ctx.fillStyle = RING_COLORS[i];
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  const labels = ['10', '20', '30', '40', '50'];
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fracs = [0.9, 0.675, 0.45, 0.25, 0];
  labels.forEach((label, i) => {
    ctx.fillStyle = i < 2 ? '#fff' : '#222';
    ctx.fillText(label, cx, cy - R * fracs[i] - (i === 4 ? 0 : 10));
  });

  return { cx, cy, R };
}

export default function SkeeballGame({ onClose, onEndGame, isHost, hotSeatTournament, currentUserId, onTournamentScore }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const ballRef = useRef(null); // { fromX, fromY, toX, toY, startTime, duration }
  const rafRef = useRef(null);
  const endedHandledRef = useRef(false);

  const [ballsThrown, setBallsThrown] = useState(0);
  const [totalScore, setTotalScore] = useState(0);
  const [history, setHistory] = useState([]); // per-ball scores this run
  const [aimX, setAimX] = useState(0);
  const [charging, setCharging] = useState(false);
  const [displayPower, setDisplayPower] = useState(0);
  const [lastResultLabel, setLastResultLabel] = useState(null);
  const chargeStartRef = useRef(0);

  const isInTournament = !!hotSeatTournament;
  const isMyTurn = hotSeatTournament?.current_player_id === currentUserId;
  const myEntry = hotSeatTournament?.participants?.find((p) => p.user_id === currentUserId);
  const alreadyScored = isInTournament && myEntry && myEntry.score != null;
  const eliminated = isInTournament && !!myEntry?.eliminated;
  const shouldPlay = isHost && (!isInTournament || isMyTurn) && !alreadyScored;
  const isOver = ballsThrown >= TOTAL_BALLS;

  // Reset for a fresh turn whenever the active hot-seat player changes.
  useEffect(() => {
    endedHandledRef.current = false;
    setBallsThrown(0);
    setTotalScore(0);
    setHistory([]);
    setLastResultLabel(null);
    ballRef.current = null;
  }, [hotSeatTournament?.current_player_id]);

  // ── Render loop: static lane/rings + the currently-animating ball ────
  useEffect(() => {
    if (!shouldPlay) return undefined;
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
    const render = () => {
      const { cx, cy, R } = drawLaneAndRings(ctx, canvas.width, canvas.height);
      const b = ballRef.current;
      if (b) {
        const t = Math.min(1, (performance.now() - b.startTime) / b.duration);
        const eased = 1 - Math.pow(1 - t, 2);
        const bx = b.fromX + (b.toX - b.fromX) * eased;
        const by = b.fromY + (b.toY - b.fromY) * eased;
        ctx.beginPath();
        ctx.arc(bx, by, 10, 0, Math.PI * 2);
        ctx.fillStyle = '#f2e6c8';
        ctx.fill();
        ctx.strokeStyle = '#8a6a3a';
        ctx.lineWidth = 2;
        ctx.stroke();
        if (t >= 1) ballRef.current = null;
      } else {
        // Resting ball at the player's own launch position, tracking aimX.
        const laneX0 = canvas.width * 0.15, laneX1 = canvas.width * 0.85;
        const bx = laneX0 + (laneX1 - laneX0) * ((aimX + 1) / 2);
        ctx.beginPath();
        ctx.arc(bx, canvas.height * 0.92, 10, 0, Math.PI * 2);
        ctx.fillStyle = '#f2e6c8';
        ctx.fill();
        ctx.strokeStyle = '#8a6a3a';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
      void cx; void cy; void R;
      rafRef.current = requestAnimationFrame(render);
    };
    rafRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', resize);
    };
  }, [shouldPlay, aimX]);

  const handleAimDrag = useCallback((clientX) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const laneX0 = rect.left + rect.width * 0.15, laneX1 = rect.left + rect.width * 0.85;
    let nx = ((clientX - laneX0) / (laneX1 - laneX0)) * 2 - 1;
    nx = Math.max(-1.15, Math.min(1.15, nx));
    setAimX(nx);
  }, []);

  const CHARGE_PERIOD_MS = 900;
  const readTrianglePower = useCallback((elapsedMs) => {
    const phase = (elapsedMs % CHARGE_PERIOD_MS) / CHARGE_PERIOD_MS;
    return phase < 0.5 ? phase * 2 : (1 - phase) * 2;
  }, []);

  const startCharge = useCallback(() => {
    if (!shouldPlay || isOver || ballRef.current) return;
    setCharging(true);
    chargeStartRef.current = performance.now();
  }, [shouldPlay, isOver]);

  // Drive the visible charge bar while holding — separate rAF loop from the
  // canvas render loop above, matching CurlingGame.jsx's own established
  // pattern for this exact charge-and-release UI.
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

  const releaseCharge = useCallback(() => {
    setCharging((wasCharging) => {
      if (!wasCharging) return false;
      const elapsed = performance.now() - chargeStartRef.current;
      const power = readTrianglePower(elapsed);
      const { landX, landY } = computeLanding(aimX, power);
      const score = ringScoreAt(landX, landY);

      const canvas = canvasRef.current;
      if (canvas) {
        const laneX0 = canvas.width * 0.15, laneX1 = canvas.width * 0.85;
        const fromX = laneX0 + (laneX1 - laneX0) * ((aimX + 1) / 2);
        const fromY = canvas.height * 0.92;
        const cx = canvas.width * 0.5, cy = canvas.height * 0.24;
        const R = Math.min(canvas.width, canvas.height) * 0.34;
        ballRef.current = {
          fromX, fromY,
          toX: cx + landX * R, toY: cy + landY * R,
          startTime: performance.now(), duration: 500,
        };
      }

      setTotalScore((s) => s + score);
      setHistory((h) => [...h, score]);
      setBallsThrown((n) => n + 1);
      setLastResultLabel(score === 0 ? 'MISS' : `+${score}`);
      return false;
    });
  }, [aimX, readTrianglePower]);

  const handleProceedTournament = () => {
    if (endedHandledRef.current) return;
    endedHandledRef.current = true;
    onTournamentScore?.(totalScore);
  };

  const playAgainSolo = () => {
    setBallsThrown(0);
    setTotalScore(0);
    setHistory([]);
    setLastResultLabel(null);
    ballRef.current = null;
  };

  const handleForfeit = () => {
    if (isInTournament) onEndGame?.();
    else onClose?.();
  };

  // ── Render precedence, mirroring SliceFrenzyGame/ToadBallGame's own
  // established shape ──────────────────────────────────────────────────
  if (!isHost && isInTournament) {
    const activeName = hotSeatTournament?.current_player_name || 'Someone';
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
        <div className="bg-gray-900 rounded-2xl p-8 text-center max-w-sm mx-4">
          <div className="text-5xl mb-4">🎳</div>
          <h2 className="text-white text-xl font-bold mb-2">Skeeball</h2>
          <p className="text-gray-400 text-sm mb-4">{activeName} is rolling — sit back and watch the scoreboard!</p>
          <button onClick={onClose} className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-medium">Close</button>
        </div>
      </div>
    );
  }
  if (!isHost && !isInTournament) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
        <div className="bg-gray-900 rounded-2xl p-8 text-center max-w-sm mx-4">
          <div className="text-5xl mb-4">🎳</div>
          <h2 className="text-white text-xl font-bold mb-2">Skeeball</h2>
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
          <p className="text-gray-400 text-sm mb-4">It's {hotSeatTournament?.current_player_name || 'the next player'}'s turn to roll.</p>
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
        <span className="text-white font-bold text-sm">🎳 Skeeball</span>
        <div className="flex items-center gap-3">
          <span className="text-yellow-400 font-bold text-sm">{totalScore} pts</span>
          <span className="text-gray-400 text-xs">Ball {Math.min(ballsThrown + 1, TOTAL_BALLS)}/{TOTAL_BALLS}</span>
          <GameRulesButton gameType="skeeball" />
          <button onClick={handleForfeit} className="text-gray-400 hover:text-white" title={isInTournament ? 'End for everyone' : 'Close'}>
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {history.length > 0 && (
        <div className="flex items-center justify-center gap-1 px-3 py-1.5 flex-wrap bg-gray-900/60 border-b border-gray-800 shrink-0">
          {history.map((s, i) => (
            <span key={i} className={`text-[11px] px-1.5 py-0.5 rounded font-semibold ${s === 0 ? 'bg-gray-800 text-gray-500' : 'bg-yellow-600/30 text-yellow-300'}`}>
              {s}
            </span>
          ))}
        </div>
      )}

      <div ref={containerRef} className="relative flex-1 min-h-0">
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
        {!isOver && (
          <div
            className="absolute inset-0"
            style={{ touchAction: 'none', cursor: 'ew-resize' }}
            onPointerMove={(e) => { if (!charging) handleAimDrag(e.clientX); }}
            onPointerDown={(e) => handleAimDrag(e.clientX)}
          />
        )}
        {lastResultLabel && !isOver && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-black/60 rounded-full text-white text-sm font-bold pointer-events-none">
            {lastResultLabel}
          </div>
        )}
        {isOver && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/70">
            <div className="bg-gray-900 rounded-2xl p-6 text-center max-w-xs">
              <div className="text-5xl mb-2">🎳</div>
              <h3 className="text-white text-lg font-bold mb-1">Game Over</h3>
              <p className="text-gray-400 text-sm mb-4">Final Score: <span className="text-yellow-400 font-bold">{totalScore}</span></p>
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

      {!isOver && (
        <div className="px-5 pb-4 pt-2 shrink-0">
          <p className="text-center text-xs text-gray-400 mb-1.5">
            Drag left/right to line up your roll, then hold to charge weight and release
          </p>
          <div className="relative h-5 bg-gray-800 rounded-full overflow-hidden border border-gray-700">
            <div
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-yellow-500 to-orange-600"
              style={{ width: `${(charging ? displayPower : 0) * 100}%` }}
            />
            <div className="absolute inset-y-0 left-[72%] w-[2px] bg-white/70" title="ideal weight" />
          </div>
          <button
            onPointerDown={startCharge}
            onPointerUp={releaseCharge}
            onPointerLeave={() => { if (charging) releaseCharge(); }}
            className="mt-3 w-full py-2.5 rounded-lg bg-orange-600 hover:bg-orange-500 active:bg-orange-700 text-white font-bold text-sm select-none"
          >
            {charging ? 'Release to Roll!' : 'Hold to Charge Weight'}
          </button>
        </div>
      )}
    </div>
  );
}
