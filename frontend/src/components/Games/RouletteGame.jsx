import React, { useEffect, useRef, useState, useCallback } from 'react';

// ─── European roulette constants ────────────────────────────────────────────

// Standard European roulette wheel order (0 at top, then clockwise).
const WHEEL_ORDER = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10,
  5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
];

const RED_NUMBERS = new Set([
  1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36,
]);

function numberColor(n) {
  if (n === 0) return '#16a34a'; // green
  return RED_NUMBERS.has(n) ? '#dc2626' : '#111827'; // red / black
}

// ─── Chip display helper ─────────────────────────────────────────────────────

function fmtChips(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}

// ─── Canvas wheel drawing ────────────────────────────────────────────────────

const SEGMENT_COUNT = 37;
const TWO_PI = Math.PI * 2;

function drawWheel(ctx, cx, cy, radius, rotation) {
  const segAngle = TWO_PI / SEGMENT_COUNT;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);

  for (let i = 0; i < SEGMENT_COUNT; i++) {
    const n = WHEEL_ORDER[i];
    const startAngle = i * segAngle - Math.PI / 2;
    const endAngle = startAngle + segAngle;

    // Segment fill
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, radius, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = numberColor(n);
    ctx.fill();
    ctx.strokeStyle = '#6b7280';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // Number label
    ctx.save();
    ctx.rotate(startAngle + segAngle / 2);
    ctx.translate(radius * 0.72, 0);
    ctx.rotate(Math.PI / 2);
    ctx.fillStyle = '#ffffff';
    ctx.font = `bold ${Math.max(8, Math.round(radius * 0.09))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(n), 0, 0);
    ctx.restore();
  }

  // Inner circle (hub)
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.22, 0, TWO_PI);
  ctx.fillStyle = '#1e1b4b';
  ctx.fill();
  ctx.strokeStyle = '#a78bfa';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Outer rim
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, TWO_PI);
  ctx.strokeStyle = '#d1d5db';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.restore();
}

function drawBall(ctx, cx, cy, radius, rotation, ballAngle) {
  const ballRadius = radius * 1.04;
  const bx = cx + Math.cos(ballAngle - Math.PI / 2 + rotation) * ballRadius * 0.88;
  const by = cy + Math.sin(ballAngle - Math.PI / 2 + rotation) * ballRadius * 0.88;
  ctx.beginPath();
  ctx.arc(bx, by, radius * 0.055, 0, TWO_PI);
  ctx.fillStyle = '#f5f5f5';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 4;
  ctx.fill();
  ctx.shadowBlur = 0;
}

function drawPointer(ctx, cx, cy, radius) {
  ctx.save();
  ctx.translate(cx, cy - radius * 1.04);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-8, -18);
  ctx.lineTo(8, -18);
  ctx.closePath();
  ctx.fillStyle = '#fbbf24';
  ctx.fill();
  ctx.restore();
}

// ─── Main component ──────────────────────────────────────────────────────────

const BET_AMOUNTS = [50, 100, 250, 500];
const BET_TYPES = [
  { id: 'red',   label: 'Red',   color: '#dc2626' },
  { id: 'black', label: 'Black', color: '#374151' },
  { id: 'odd',   label: 'Odd',   color: '#7c3aed' },
  { id: 'even',  label: 'Even',  color: '#0369a1' },
];

const SPIN_DURATION = 4000; // ms

export default function RouletteGame({ gameState, players, currentUserId, onMove, onClose, onEndGame }) {
  const gs = gameState?.game_state || {};
  const phase = gs.phase || 'betting';
  const round = gs.round || 1;
  const result = gs.result ?? -1;
  const resultColor = gs.result_color || '';
  const history = gs.history || [];
  const payouts = gs.payouts || {};

  // Normalise chips — server sends either {string→int} or {string→float64}
  const rawChips = gs.chips || {};
  const chips = {};
  for (const [k, v] of Object.entries(rawChips)) chips[k] = Number(v);

  const rawBets = gs.bets || {};

  const isHostUser = (players || [])[0]?.user_id === currentUserId;
  const myKey = String(currentUserId);
  const myChips = chips[myKey] ?? 1000;
  const myBets = rawBets[myKey] || [];

  // ── Canvas refs ────────────────────────────────────────────────────────────
  const canvasRef = useRef(null);
  const rotRef = useRef(0);            // current wheel rotation (radians)
  const ballAngleRef = useRef(0);      // ball angle relative to 0 on wheel
  const rafRef = useRef(null);
  const spinningRef = useRef(false);
  const spinStartRef = useRef(0);
  const spinFromRef = useRef(0);
  const spinToRef = useRef(0);
  const targetBallRef = useRef(0);

  // ── Local UI state ─────────────────────────────────────────────────────────
  const [selectedAmount, setSelectedAmount] = useState(100);
  const [selectedType, setSelectedType] = useState(null); // 'red'|'black'|'odd'|'even'|'number'
  const [selectedNumber, setSelectedNumber] = useState(null);
  const [pendingBet, setPendingBet] = useState(false);
  const [lastResult, setLastResult] = useState(null); // shown after spin
  const [showGrid, setShowGrid] = useState(false);

  // Track when phase flips to reveal so we start the spin animation.
  const prevPhaseRef = useRef(phase);
  const prevResultRef = useRef(result);

  // Canvas size — responsive.
  const [canvasSize, setCanvasSize] = useState({ w: 300, h: 300 });
  const containerRef = useRef(null);

  useEffect(() => {
    function measure() {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const side = Math.min(rect.width - 16, rect.height - 16, 320);
      setCanvasSize({ w: side, h: side });
    }
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const radius = canvasSize.w * 0.44;
  const cx = canvasSize.w / 2;
  const cy = canvasSize.h / 2;

  // ── Spin animation trigger ─────────────────────────────────────────────────
  useEffect(() => {
    if (phase === 'reveal' && prevPhaseRef.current === 'betting' && result >= 0) {
      // Kick off spin animation landing on result.
      const resultIdx = WHEEL_ORDER.indexOf(result);
      const segAngle = TWO_PI / SEGMENT_COUNT;
      // Target rotation: land result at top of wheel (pointer position).
      // Pointer is at top (-π/2). The segment for result starts at resultIdx*segAngle - π/2.
      // We want that midpoint at exactly -π/2 after rotation → rotation to add = -(resultIdx+0.5)*segAngle.
      const targetRot = -(resultIdx + 0.5) * segAngle;
      // Add 5 full spins for visual drama.
      const extraSpins = 5 * TWO_PI;
      spinningRef.current = true;
      spinStartRef.current = performance.now();
      spinFromRef.current = rotRef.current % TWO_PI;
      spinToRef.current = spinFromRef.current + extraSpins + ((targetRot - spinFromRef.current % TWO_PI + TWO_PI) % TWO_PI);
      targetBallRef.current = (resultIdx + 0.5) * segAngle;
      setLastResult(result);
    }
    prevPhaseRef.current = phase;
    prevResultRef.current = result;
  }, [phase, result]);

  // ── RAF draw loop ──────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function loop(now) {
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      if (spinningRef.current) {
        const elapsed = now - spinStartRef.current;
        const t = Math.min(elapsed / SPIN_DURATION, 1);
        // easeOut cubic
        const ease = 1 - Math.pow(1 - t, 3);
        rotRef.current = spinFromRef.current + (spinToRef.current - spinFromRef.current) * ease;
        ballAngleRef.current = targetBallRef.current * ease;
        if (t >= 1) spinningRef.current = false;
      }

      drawWheel(ctx, cx, cy, radius, rotRef.current);
      if (spinningRef.current || phase === 'reveal') {
        drawBall(ctx, cx, cy, radius, rotRef.current, ballAngleRef.current);
      }
      drawPointer(ctx, cx, cy, radius);

      rafRef.current = requestAnimationFrame(loop);
    }

    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [cx, cy, radius, phase]);

  // ── Bet helpers ─────────────────────────────────────────────────────────────
  const placeBet = useCallback(() => {
    if (!selectedType) return;
    if (selectedType === 'number' && selectedNumber === null) return;
    setPendingBet(true);
    onMove({
      move_type: 'place_bet',
      bet_type: selectedType,
      amount: selectedAmount,
      number: selectedType === 'number' ? selectedNumber : -1,
    });
    setTimeout(() => setPendingBet(false), 600);
    setSelectedType(null);
    setSelectedNumber(null);
    setShowGrid(false);
  }, [selectedType, selectedNumber, selectedAmount, onMove]);

  const clearBets = useCallback(() => {
    onMove({ move_type: 'clear_bets' });
  }, [onMove]);

  const spin = useCallback(() => {
    onMove({ move_type: 'spin' });
  }, [onMove]);

  const nextRound = useCallback(() => {
    onMove({ move_type: 'next_round' });
  }, [onMove]);

  const endGame = useCallback(() => {
    onMove({ move_type: 'roulette_end' });
    // Don't call onEndGame/onClose here — the backend broadcasts game_ended which
    // updates gameState.game_state.phase to 'ended', rendering the Game Over screen.
  }, [onMove]);

  // ── Summary stats for Game Over screen ─────────────────────────────────────
  const sortedPlayers = [...(players || [])].sort((a, b) => {
    const ca = chips[String(a.user_id)] ?? 1000;
    const cb = chips[String(b.user_id)] ?? 1000;
    return cb - ca;
  });
  const winnerID = gameState?.winner_id;
  const winner = winnerID ? (players || []).find(p => p.user_id === winnerID) : null;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950 text-white select-none overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-700 shrink-0">
        <div>
          <h2 className="text-sm font-bold tracking-widest uppercase">🎰 Roulette</h2>
          <p className="text-xs text-gray-400">Round {round} · {phase === 'betting' ? 'Place your bets' : phase === 'spinning' ? 'Spinning…' : phase === 'reveal' ? `Result: ${result}` : 'Game Over'}</p>
        </div>
        <div className="flex gap-2 items-center">
          {isHostUser && phase !== 'ended' && (
            <button
              onClick={endGame}
              className="px-3 py-1 text-xs bg-red-700 hover:bg-red-800 rounded-lg font-medium"
            >
              End Game
            </button>
          )}
          <button
            onClick={phase === 'ended' ? onClose : (isHostUser ? endGame : onClose)}
            title={phase !== 'ended' && isHostUser ? 'End game for everyone' : 'Close'}
            className="px-3 py-1 text-xs bg-white/20 hover:bg-white/30 rounded-lg"
          >✕</button>
        </div>
      </div>

      {/* Game Over screen */}
      {phase === 'ended' ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6 overflow-y-auto">
          <div className="text-center">
            {winner ? (
              <>
                <p className="text-5xl mb-2">🏆</p>
                <p className="text-2xl font-black text-yellow-400">{winner.username} wins!</p>
                <p className="text-gray-400 text-sm mt-1">Most chips: {fmtChips(chips[String(winnerID)] ?? 0)}</p>
              </>
            ) : (
              <>
                <p className="text-5xl mb-2">🤝</p>
                <p className="text-2xl font-black text-white">It's a Draw!</p>
                <p className="text-gray-400 text-sm mt-1">Tied chip counts</p>
              </>
            )}
          </div>

          {/* Final standings */}
          <div className="w-full max-w-xs bg-gray-900 rounded-2xl p-4 space-y-2">
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-widest mb-3">Final Standings</p>
            {sortedPlayers.map((p, i) => {
              const c = chips[String(p.user_id)] ?? 1000;
              const isWinner = p.user_id === winnerID;
              return (
                <div key={p.user_id} className={`flex items-center justify-between rounded-xl px-3 py-2 ${isWinner ? 'bg-yellow-500/20 border border-yellow-500/40' : 'bg-gray-800'}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 text-sm font-bold w-4">{i + 1}</span>
                    {isWinner && <span className="text-sm">🏆</span>}
                    <span className={`text-sm font-semibold ${isWinner ? 'text-yellow-300' : 'text-white'}`}>{p.username}</span>
                  </div>
                  <span className={`text-sm font-bold ${c >= 1000 ? 'text-green-400' : 'text-red-400'}`}>{fmtChips(c)} chips</span>
                </div>
              );
            })}
          </div>

          {/* Spin history */}
          {history.length > 0 && (
            <div className="w-full max-w-xs">
              <p className="text-xs text-gray-500 font-semibold uppercase mb-2">Spin History</p>
              <div className="flex flex-wrap gap-1">
                {history.map((n, i) => (
                  <span
                    key={i}
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
                    style={{ background: numberColor(Number(n)) }}
                  >
                    {n}
                  </span>
                ))}
              </div>
            </div>
          )}

          <button onClick={onClose} className="px-6 py-2 bg-purple-700 hover:bg-purple-600 rounded-xl font-bold text-sm">
            Close
          </button>
        </div>
      ) : (
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">

          {/* Left: wheel */}
          <div
            ref={containerRef}
            className="flex-1 flex flex-col items-center justify-center p-2 min-h-0"
          >
            <canvas
              ref={canvasRef}
              width={canvasSize.w}
              height={canvasSize.h}
              style={{ maxWidth: '100%', maxHeight: '100%' }}
            />

            {/* Result flash */}
            {phase === 'reveal' && lastResult !== null && (
              <div className="mt-2 flex flex-col items-center gap-1 animate-pulse">
                <span
                  className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-black text-white shadow-lg"
                  style={{ background: numberColor(lastResult) }}
                >
                  {lastResult}
                </span>
                <span className="text-sm font-semibold capitalize" style={{ color: resultColor === 'green' ? '#4ade80' : resultColor === 'red' ? '#f87171' : '#d1d5db' }}>
                  {resultColor || ''}{lastResult !== 0 ? ` · ${lastResult % 2 === 0 ? 'Even' : 'Odd'}` : ''}
                </span>
              </div>
            )}

            {/* Recent history row */}
            {history.length > 0 && (
              <div className="flex gap-1 mt-2 flex-wrap justify-center">
                {[...history].slice(-8).reverse().map((n, i) => (
                  <span
                    key={i}
                    className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                    style={{ background: numberColor(Number(n)), opacity: 1 - i * 0.1 }}
                  >
                    {n}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Right: betting panel */}
          <div className="w-full lg:w-72 flex flex-col border-t lg:border-t-0 lg:border-l border-gray-800 bg-gray-900 shrink-0 overflow-y-auto">

            {/* Player chips */}
            <div className="px-4 pt-3 pb-2 border-b border-gray-800">
              <p className="text-xs text-gray-500 uppercase font-semibold mb-2">Players</p>
              <div className="space-y-1">
                {(players || []).map(p => {
                  const c = chips[String(p.user_id)] ?? 1000;
                  const payout = Number(payouts[String(p.user_id)] ?? 0);
                  const isMe = p.user_id === currentUserId;
                  return (
                    <div key={p.user_id} className={`flex items-center justify-between text-sm rounded-lg px-2 py-1 ${isMe ? 'bg-purple-900/30' : 'bg-gray-800/50'}`}>
                      <span className={`font-medium ${isMe ? 'text-purple-300' : 'text-gray-300'}`}>{p.username}{isMe ? ' (you)' : ''}</span>
                      <span className="flex items-center gap-1">
                        <span className="font-bold text-yellow-400">{fmtChips(c)}</span>
                        {phase === 'reveal' && payout !== 0 && (
                          <span className={`text-xs font-bold ${payout > 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {payout > 0 ? `+${fmtChips(payout)}` : fmtChips(payout)}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* My bets summary */}
            {myBets.length > 0 && phase === 'betting' && (
              <div className="px-4 py-2 border-b border-gray-800">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-xs text-gray-500 uppercase font-semibold">My Bets</p>
                  <button onClick={clearBets} className="text-xs text-red-400 hover:text-red-300">Clear</button>
                </div>
                {myBets.map((b, i) => (
                  <div key={i} className="flex justify-between text-xs text-gray-300 bg-gray-800 rounded px-2 py-1 mb-0.5">
                    <span className="capitalize">{b.type === 'number' ? `#${b.number}` : b.type}</span>
                    <span className="text-yellow-400 font-bold">{fmtChips(Number(b.amount))}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Betting controls */}
            {phase === 'betting' && (
              <div className="px-4 py-3 flex-1 space-y-3">
                {/* Amount */}
                <div>
                  <p className="text-xs text-gray-400 mb-1.5">Bet Amount</p>
                  <div className="grid grid-cols-4 gap-1">
                    {BET_AMOUNTS.map(a => (
                      <button
                        key={a}
                        onClick={() => setSelectedAmount(a)}
                        disabled={myChips < a}
                        className={`py-1.5 rounded-lg text-xs font-bold transition-all
                          ${selectedAmount === a ? 'bg-yellow-500 text-black' : 'bg-gray-800 text-yellow-400 hover:bg-gray-700'}
                          disabled:opacity-30 disabled:cursor-not-allowed`}
                      >
                        {fmtChips(a)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Color/parity bets */}
                <div>
                  <p className="text-xs text-gray-400 mb-1.5">Bet Type (1:1)</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {BET_TYPES.map(bt => (
                      <button
                        key={bt.id}
                        onClick={() => {
                          setSelectedType(bt.id);
                          setSelectedNumber(null);
                          setShowGrid(false);
                        }}
                        className={`py-2 rounded-lg text-sm font-bold transition-all border-2
                          ${selectedType === bt.id ? 'border-white scale-105' : 'border-transparent hover:border-white/30'}`}
                        style={{ background: bt.color }}
                      >
                        {bt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Number bet */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs text-gray-400">Number (35:1)</p>
                    <button
                      onClick={() => { setShowGrid(g => !g); setSelectedType('number'); }}
                      className={`text-xs px-2 py-0.5 rounded-md font-semibold transition-all
                        ${selectedType === 'number' ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                    >
                      {selectedNumber !== null ? `#${selectedNumber}` : 'Pick a number'}
                    </button>
                  </div>

                  {showGrid && (
                    <div className="grid gap-0.5" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
                      {[0, ...Array.from({ length: 36 }, (_, i) => i + 1)].map(n => (
                        <button
                          key={n}
                          onClick={() => { setSelectedNumber(n); setSelectedType('number'); setShowGrid(false); }}
                          className={`text-xs font-bold rounded py-1 transition-all
                            ${selectedNumber === n ? 'ring-2 ring-white scale-110' : ''}`}
                          style={{
                            background: numberColor(n),
                            color: '#fff',
                          }}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Place bet */}
                <button
                  onClick={placeBet}
                  disabled={!selectedType || pendingBet || myChips < selectedAmount || (selectedType === 'number' && selectedNumber === null)}
                  className="w-full py-2.5 rounded-xl font-bold text-sm bg-yellow-500 text-black hover:bg-yellow-400 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {pendingBet ? 'Placing…' : `Bet ${fmtChips(selectedAmount)}`}
                </button>

                {/* Chips display */}
                <p className="text-center text-xs text-gray-500">
                  Your chips: <span className="font-bold text-yellow-400">{fmtChips(myChips)}</span>
                </p>

                {/* Host spin */}
                {isHostUser && (
                  <button
                    onClick={spin}
                    className="w-full py-3 rounded-xl font-black text-base bg-purple-700 hover:bg-purple-600 active:scale-95 transition-all shadow-lg shadow-purple-900/50"
                  >
                    🎰 Spin!
                  </button>
                )}
                {!isHostUser && (
                  <p className="text-center text-xs text-gray-600 italic">Waiting for host to spin…</p>
                )}
              </div>
            )}

            {/* Reveal phase */}
            {phase === 'reveal' && (
              <div className="px-4 py-4 flex-1 flex flex-col items-center justify-center gap-4">
                <div className="text-center">
                  <p className="text-4xl font-black" style={{ color: resultColor === 'green' ? '#4ade80' : resultColor === 'red' ? '#f87171' : '#e5e7eb' }}>
                    {result}
                  </p>
                  <p className="text-sm capitalize text-gray-400 mt-1">{resultColor}</p>
                </div>

                {isHostUser ? (
                  <button
                    onClick={nextRound}
                    className="w-full py-3 rounded-xl font-black text-base bg-green-700 hover:bg-green-600 active:scale-95 transition-all"
                  >
                    Next Round →
                  </button>
                ) : (
                  <p className="text-gray-500 text-sm text-center italic">Waiting for host to start next round…</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
