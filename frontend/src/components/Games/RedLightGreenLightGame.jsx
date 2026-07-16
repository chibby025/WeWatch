import React, { useState, useEffect, useRef } from 'react';

const CW = 400;
const CH = 520;
const PLAYER_R = 16;
const FINISH_Y = 90;
const START_Y = CH - 70;
const PLAYER_COLORS = ['#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#a855f7', '#06b6d4', '#ec4899', '#84cc16'];

function posToY(pos, finishLine) {
  return START_Y - (pos / finishLine) * (START_Y - FINISH_Y);
}

function drawRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

export default function RedLightGreenLightGame({ gameState, players, currentUserId, onMove, onClose, onEndGame }) {
  const gs = gameState?.game_state || {};
  const phase = gs.phase || 'waiting';
  const schedule = gs.schedule || [];
  const startTime = gs.start_time || 0;
  const alive = gs.alive || {};
  const positions = gs.positions || {};
  const finishLine = gs.finish_line || 100;

  const isHostUser = (players || [])[0]?.user_id === currentUserId;
  const myKey = String(currentUserId);
  const isEliminated = alive[myKey] === false;
  const myPos = positions[myKey] || 0;

  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const gsRef = useRef({});
  const colorRef = useRef('red');
  const visualPosRef = useRef({});
  const bobRef = useRef(0);

  const [currentColor, setCurrentColor] = useState('red');
  const [moving, setMoving] = useState(false);
  const colorIntervalRef = useRef(null);

  // Keep gsRef current on every render
  gsRef.current = { players, alive, positions, phase, schedule, startTime, finishLine };

  // Colour schedule — client-computed every 100 ms
  useEffect(() => {
    if (phase !== 'running' || !startTime) {
      colorRef.current = 'red';
      setCurrentColor('red');
      clearInterval(colorIntervalRef.current);
      return;
    }
    function tick() {
      const elapsed = Date.now() - startTime;
      let cumulative = 0;
      let c = 'red';
      for (const entry of schedule) {
        if (elapsed < cumulative + entry.duration_ms) { c = entry.color; break; }
        cumulative += entry.duration_ms;
      }
      colorRef.current = c;
      setCurrentColor(c);
    }
    tick();
    colorIntervalRef.current = setInterval(tick, 100);
    return () => clearInterval(colorIntervalRef.current);
  }, [phase, startTime, schedule]);

  // Canvas RAF loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let frame = 0;
    function draw() {
      frame++;
      bobRef.current = frame;
      const ctx = canvas.getContext('2d');
      const { players: ps, alive: al, positions: pos, phase: ph, finishLine: fl } = gsRef.current;
      const color = colorRef.current;
      const W = CW, H = CH;

      // Background — shifts colour with the light
      const bg = ph === 'waiting' ? '#111827'
        : color === 'green' ? '#022c22'
        : '#1c0505';
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Track surface
      ctx.fillStyle = 'rgba(255,255,255,0.025)';
      const numP = Math.max((ps || []).length, 1);
      const laneW = Math.min(80, (W - 60) / numP);
      const totalW = numP * laneW;
      const lx = (W - totalW) / 2;
      ctx.fillRect(lx, FINISH_Y + 14, totalW, START_Y - FINISH_Y);

      // Lane dividers
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 8]);
      for (let i = 1; i < numP; i++) {
        const x = lx + i * laneW;
        ctx.beginPath();
        ctx.moveTo(x, FINISH_Y + 14);
        ctx.lineTo(x, START_Y + 10);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // Finish line
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(lx, FINISH_Y + 14);
      ctx.lineTo(lx + totalW, FINISH_Y + 14);
      ctx.stroke();
      ctx.fillStyle = '#fbbf24';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🏁  FINISH  🏁', W / 2, FINISH_Y + 6);
      ctx.textBaseline = 'alphabetic';

      // Start line
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(lx, START_Y + 10);
      ctx.lineTo(lx + totalW, START_Y + 10);
      ctx.stroke();
      ctx.setLineDash([]);

      // Traffic light
      const tlX = W / 2;
      const tlY = 44;
      // pole
      ctx.fillStyle = '#4b5563';
      ctx.fillRect(tlX - 2, tlY, 4, 16);
      // housing
      ctx.fillStyle = '#1f2937';
      drawRoundRect(ctx, tlX - 18, tlY - 36, 36, 60, 7);
      ctx.fill();
      ctx.strokeStyle = '#374151';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // red bulb
      const redOn = color === 'red' && ph === 'running';
      ctx.fillStyle = redOn ? '#ef4444' : '#450a0a';
      if (redOn) { ctx.shadowColor = '#ef4444'; ctx.shadowBlur = 14; }
      ctx.beginPath();
      ctx.arc(tlX, tlY - 20, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      // green bulb
      const greenOn = color === 'green' && ph === 'running';
      ctx.fillStyle = greenOn ? '#22c55e' : '#14532d';
      if (greenOn) { ctx.shadowColor = '#22c55e'; ctx.shadowBlur = 14; }
      ctx.beginPath();
      ctx.arc(tlX, tlY + 7, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      // Players
      (ps || []).forEach((p, i) => {
        const key = String(p.user_id);
        const targetPos = Number(pos[key] || 0);
        const isAliveP = al[key] !== false;
        const isMine = p.user_id === currentUserId;

        // Lerp visual position
        if (visualPosRef.current[key] === undefined) visualPosRef.current[key] = targetPos;
        const vp = visualPosRef.current[key];
        visualPosRef.current[key] = vp + (targetPos - vp) * 0.15;

        const cx = lx + i * laneW + laneW / 2;
        // Subtle vertical bob when alive + green phase
        const bob = isAliveP && color === 'green' && ph === 'running'
          ? Math.sin(frame * 0.18 + i * 1.2) * 2
          : 0;
        const cy = posToY(visualPosRef.current[key], fl) + bob;
        const pc = PLAYER_COLORS[i % PLAYER_COLORS.length];

        ctx.globalAlpha = isAliveP ? 1 : 0.3;

        // Drop shadow
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.beginPath();
        ctx.ellipse(cx, cy + PLAYER_R + 5, PLAYER_R * 0.65, 5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Body
        ctx.fillStyle = pc;
        ctx.beginPath();
        ctx.arc(cx, cy, PLAYER_R, 0, Math.PI * 2);
        ctx.fill();

        // White ring for current user
        if (isMine) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(cx, cy, PLAYER_R + 4, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Eliminated ring
        if (!isAliveP) {
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(cx, cy, PLAYER_R + 2, 0, Math.PI * 2);
          ctx.stroke();
        }

        // Initial or skull
        ctx.globalAlpha = 1;
        ctx.font = `bold ${Math.round(PLAYER_R * 0.85)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = isAliveP ? '#fff' : 'rgba(255,255,255,0.4)';
        ctx.fillText(isAliveP ? (p.username || '?')[0].toUpperCase() : '💀', cx, cy);
        ctx.textBaseline = 'alphabetic';

        // Name label
        ctx.globalAlpha = isAliveP ? 0.7 : 0.25;
        ctx.fillStyle = '#fff';
        ctx.font = '9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(p.username || `P${i + 1}`, cx, cy + PLAYER_R + 14);
        ctx.globalAlpha = 1;
      });

      // Phase overlays
      if (ph === 'waiting') {
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        ctx.fillRect(0, 0, W, H);
      }
      if (ph === 'ended') {
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#a855f7';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Game Over', W / 2, H / 2);
        ctx.textBaseline = 'alphabetic';
      }

      rafRef.current = requestAnimationFrame(draw);
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, []); // stable — reads latest state via gsRef / colorRef

  function handleMove() {
    if (phase !== 'running' || isEliminated) return;
    setMoving(true);
    setTimeout(() => setMoving(false), 120);
    onMove({ move_type: 'move' });
  }

  useEffect(() => {
    function onKey(e) {
      if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); handleMove(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, isEliminated]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950 text-white select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-700 shrink-0">
        <div>
          <h2 className="text-sm font-bold">🔴 Red Light, Green Light</h2>
          <p className="text-xs text-gray-400">Move on Green · Freeze on Red</p>
        </div>
        <div className="flex gap-2">
          {onEndGame && (
            <button onClick={() => { onEndGame?.(); onClose?.(); }} className="px-3 py-1 text-xs bg-red-700 hover:bg-red-800 rounded-lg font-medium">End</button>
          )}
          <button onClick={onClose} className="px-3 py-1 text-xs bg-white/20 hover:bg-white/30 rounded-lg">✕</button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 flex items-center justify-center overflow-hidden p-3">
        <canvas
          ref={canvasRef}
          width={CW}
          height={CH}
          className="rounded-xl shadow-2xl"
          style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
        />
      </div>

      {/* Controls */}
      <div className="shrink-0 flex flex-col items-center gap-2 py-4 border-t border-gray-800">
        {phase === 'waiting' ? (
          isHostUser ? (
            <button
              onClick={() => onMove({ move_type: 'start' })}
              className="px-10 py-3 bg-green-600 hover:bg-green-500 rounded-xl font-bold text-white text-base active:scale-95 transition-transform"
            >
              Start Game
            </button>
          ) : (
            <p className="text-white/50 text-sm">Waiting for host to start…</p>
          )
        ) : phase === 'ended' ? (
          <p className="text-purple-300 font-bold">Game Over</p>
        ) : isEliminated ? (
          <div className="text-center">
            <p className="text-2xl">💀</p>
            <p className="text-red-400 font-bold text-sm">Eliminated — you moved on red!</p>
          </div>
        ) : myPos >= finishLine ? (
          <div className="text-center">
            <p className="text-2xl">🏆</p>
            <p className="text-green-400 font-bold text-sm">You crossed the finish line!</p>
          </div>
        ) : (
          <button
            onPointerDown={handleMove}
            disabled={isEliminated || phase !== 'running'}
            className={`w-24 h-24 rounded-full font-black text-xl transition-all border-4
              ${currentColor === 'green'
                ? 'bg-green-600 hover:bg-green-500 border-green-400 shadow-lg shadow-green-900/50 active:scale-95'
                : 'bg-gray-800/60 border-gray-700 cursor-not-allowed opacity-25'}
              ${moving ? 'scale-90' : ''}`}
          >
            {currentColor === 'green' ? 'GO!' : '⛔'}
            <div className="text-xs font-normal mt-1 opacity-70">Space / ↑</div>
          </button>
        )}
      </div>
    </div>
  );
}
