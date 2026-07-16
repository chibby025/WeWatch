import React, { useRef, useEffect, useCallback } from 'react';

// Canvas logical dimensions — same as Ping Pong (400 × 600).
const W = 400, H = 600;
const MALLET_R = 22;  // mallet circle radius
const PUCK_R = 13;
const SPEED_UP = 1.025;
const MAX_SPEED = 500;
const SYNC_EVERY = 6;       // state_sync every N frames (~10 Hz at 60 fps)
const MALLET_SEND_MS = 40;  // throttle mallet_move to 25 Hz

// P1's half: Y in [MALLET_R, H/2 - MALLET_R]
// P2's half: Y in [H/2 + MALLET_R, H - MALLET_R]
const P1_Y_MIN = MALLET_R, P1_Y_MAX = H / 2 - MALLET_R;
const P2_Y_MIN = H / 2 + MALLET_R, P2_Y_MAX = H - MALLET_R;

export default function AirHockeyGame({ gameState, players, currentUserId, onMove, onClose, onEndGame }) {
  const gs = gameState?.game_state || {};
  const p1Id = String(gs.p1_id || '');
  const p2Id = String(gs.p2_id || '');
  const myId = String(currentUserId);
  const isP1 = myId === p1Id;
  const isP2 = myId === p2Id;
  const scores = gs.scores || {};
  const rally = gs.rally || 0;
  const winScore = gs.win_score || 5;
  const isEnded = gs.phase === 'ended';

  const p1Name = players?.find(p => String(p.user_id) === p1Id)?.username || 'Player 1';
  const p2Name = players?.find(p => String(p.user_id) === p2Id)?.username || 'Player 2';

  const canvasRef = useRef(null);

  // All mutable state in one ref — no re-renders from physics.
  const S = useRef({
    puck: { x: W / 2, y: H / 2, vx: 80, vy: 220 },
    // My own mallet (2D, clamped to my half)
    myMallet: { x: W / 2, y: isP2 ? P2_Y_MIN + 80 : P1_Y_MAX - 80 },
    // Remote mallet (from WS relay)
    remoteMallet: { x: W / 2, y: isP2 ? P1_Y_MAX - 80 : P2_Y_MIN + 80 },
    awaitingGoal: false,
    syncAnchor: { x: W / 2, y: H / 2, vx: 80, vy: 220, t: Date.now() },
    frameCount: 0,
    lastTime: 0,
    lastMalletSend: 0,
    p1Id, p2Id, myId, isP1, isP2,
  });

  const gsRef = useRef(gs);
  useEffect(() => {
    gsRef.current = gameState?.game_state || {};
    const gsCurrent = gsRef.current;
    const s = S.current;

    if (isP1) {
      if (gsCurrent.p2x != null) s.remoteMallet.x = gsCurrent.p2x;
      if (gsCurrent.p2y != null) s.remoteMallet.y = gsCurrent.p2y;
      if (s.awaitingGoal && gsCurrent.phase === 'playing') {
        s.puck.x = gsCurrent.ball_x ?? W / 2;
        s.puck.y = gsCurrent.ball_y ?? H / 2;
        s.puck.vx = gsCurrent.ball_vx ?? 80;
        s.puck.vy = gsCurrent.ball_vy ?? 220;
        s.awaitingGoal = false;
      }
    } else {
      if (gsCurrent.p1x != null) s.remoteMallet.x = gsCurrent.p1x;
      if (gsCurrent.p1y != null) s.remoteMallet.y = gsCurrent.p1y;
      s.syncAnchor = {
        x: gsCurrent.ball_x ?? W / 2,
        y: gsCurrent.ball_y ?? H / 2,
        vx: gsCurrent.ball_vx ?? 80,
        vy: gsCurrent.ball_vy ?? 220,
        t: Date.now(),
      };
    }
  }, [gameState, isP1]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const s = S.current;
    const gsCurrent = gsRef.current;

    // Ice surface
    ctx.fillStyle = '#0f2744';
    ctx.fillRect(0, 0, W, H);

    // Rink border
    ctx.strokeStyle = 'rgba(147,197,253,0.5)';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, W - 8, H - 8);

    // Goal zones (lighter strip at top and bottom)
    const GOAL_W = 100, GOAL_H = 16;
    ctx.fillStyle = 'rgba(239,68,68,0.25)'; // P1's goal (top, P2 scores here)
    ctx.fillRect((W - GOAL_W) / 2, 4, GOAL_W, GOAL_H);
    ctx.fillStyle = 'rgba(59,130,246,0.25)'; // P2's goal (bottom, P1 scores here)
    ctx.fillRect((W - GOAL_W) / 2, H - 4 - GOAL_H, GOAL_W, GOAL_H);

    // Goal line text
    ctx.font = '10px system-ui'; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(239,68,68,0.7)';
    ctx.fillText('GOAL', W / 2, 14 + GOAL_H);
    ctx.fillStyle = 'rgba(59,130,246,0.7)';
    ctx.fillText('GOAL', W / 2, H - 4 - GOAL_H - 4);

    // Centre line and circle
    ctx.strokeStyle = 'rgba(147,197,253,0.25)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.beginPath(); ctx.moveTo(8, H / 2); ctx.lineTo(W - 8, H / 2); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(W / 2, H / 2, 40, 0, Math.PI * 2);
    ctx.stroke();

    // Puck position
    let px, py;
    if (s.isP1) {
      px = s.puck.x; py = s.puck.y;
    } else {
      const elapsed = Math.min((Date.now() - s.syncAnchor.t) / 1000, 0.2);
      px = s.syncAnchor.x + s.syncAnchor.vx * elapsed;
      py = s.syncAnchor.y + s.syncAnchor.vy * elapsed;
    }

    // Draw puck
    ctx.beginPath(); ctx.arc(px, py, PUCK_R, 0, Math.PI * 2);
    ctx.fillStyle = '#1a1a2e'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 2.5; ctx.stroke();
    // Puck sheen
    ctx.beginPath(); ctx.arc(px - 3, py - 3, PUCK_R * 0.35, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fill();

    // P1 mallet (red, top half)
    const m1x = s.isP1 ? s.myMallet.x : (gsCurrent.p1x ?? s.remoteMallet.x);
    const m1y = s.isP1 ? s.myMallet.y : (gsCurrent.p1y ?? s.remoteMallet.y);
    ctx.beginPath(); ctx.arc(m1x, m1y, MALLET_R, 0, Math.PI * 2);
    ctx.fillStyle = '#dc2626'; ctx.fill();
    ctx.strokeStyle = '#fca5a5'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(m1x, m1y, MALLET_R * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fill();

    // P2 mallet (blue, bottom half)
    const m2x = s.isP2 ? s.myMallet.x : (gsCurrent.p2x ?? s.remoteMallet.x);
    const m2y = s.isP2 ? s.myMallet.y : (gsCurrent.p2y ?? s.remoteMallet.y);
    ctx.beginPath(); ctx.arc(m2x, m2y, MALLET_R, 0, Math.PI * 2);
    ctx.fillStyle = '#2563eb'; ctx.fill();
    ctx.strokeStyle = '#93c5fd'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(m2x, m2y, MALLET_R * 0.4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fill();

    // Goal flash
    if (s.awaitingGoal) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, W, H);
      ctx.font = 'bold 32px system-ui'; ctx.textAlign = 'center';
      ctx.fillStyle = '#fde047';
      ctx.fillText('⚡ GOAL!', W / 2, H / 2 - 12);
    }
  }, []);

  // P1 physics loop
  useEffect(() => {
    if (!isP1) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const s = S.current;
    let rafId;

    function loop(time) {
      const dt = Math.min((time - (s.lastTime || time)) / 1000, 0.05);
      s.lastTime = time;
      s.frameCount++;
      const gsCurrent = gsRef.current;

      if (gsCurrent.phase === 'playing' && !s.awaitingGoal) {
        const p = s.puck;
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        // Wall bounces (left/right only; top/bottom are goal areas)
        if (p.x < PUCK_R) { p.x = PUCK_R; p.vx = Math.abs(p.vx); }
        if (p.x > W - PUCK_R) { p.x = W - PUCK_R; p.vx = -Math.abs(p.vx); }

        // Mallet-puck collision check (circle vs circle)
        function checkMallet(mx, my) {
          const dx = p.x - mx, dy = p.y - my;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < PUCK_R + MALLET_R && dist > 0) {
            // Push puck out of overlap first
            const nx = dx / dist, ny = dy / dist;
            p.x = mx + nx * (PUCK_R + MALLET_R + 1);
            p.y = my + ny * (PUCK_R + MALLET_R + 1);
            // Reflect velocity off collision normal
            const dot = p.vx * nx + p.vy * ny;
            if (dot < 0) { // only if approaching
              p.vx -= 2 * dot * nx;
              p.vy -= 2 * dot * ny;
              // Speed up slightly each hit
              const speed = Math.min(Math.sqrt(p.vx * p.vx + p.vy * p.vy) * SPEED_UP, MAX_SPEED);
              const mag = Math.sqrt(p.vx * p.vx + p.vy * p.vy) || 1;
              p.vx = (p.vx / mag) * speed;
              p.vy = (p.vy / mag) * speed;
            }
          }
        }

        checkMallet(s.myMallet.x, s.myMallet.y);         // P1's own mallet
        checkMallet(s.remoteMallet.x, s.remoteMallet.y);  // P2's mallet

        // Goal detection
        const GOAL_W = 100;
        const goalLeft = (W - GOAL_W) / 2;
        const goalRight = goalLeft + GOAL_W;
        if (p.y < PUCK_R && p.x > goalLeft && p.x < goalRight) {
          // Puck entered top goal → P2 scores
          s.awaitingGoal = true;
          p.x = W / 2; p.y = H / 2; p.vx = 80; p.vy = 220;
          onMove({ move_type: 'goal', scorer_id: s.p2Id });
        } else if (p.y > H - PUCK_R && p.x > goalLeft && p.x < goalRight) {
          // Puck entered bottom goal → P1 scores
          s.awaitingGoal = true;
          p.x = W / 2; p.y = H / 2; p.vx = 80; p.vy = 220;
          onMove({ move_type: 'goal', scorer_id: s.p1Id });
        } else {
          // Bounce puck off top/bottom walls outside goal area
          if (p.y < PUCK_R) { p.y = PUCK_R; p.vy = Math.abs(p.vy); }
          if (p.y > H - PUCK_R) { p.y = H - PUCK_R; p.vy = -Math.abs(p.vy); }
        }

        // State sync to P2
        if (s.frameCount % SYNC_EVERY === 0 && !s.awaitingGoal) {
          onMove({
            move_type: 'state_sync',
            ball_x: p.x, ball_y: p.y, ball_vx: p.vx, ball_vy: p.vy,
            p1x: s.myMallet.x, p1y: s.myMallet.y,
          });
        }
      }

      draw();
      rafId = requestAnimationFrame(loop);
    }

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [isP1, draw, onMove]);

  // P2 / spectator draw loop
  useEffect(() => {
    if (isP1) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let rafId;
    function loop() { draw(); rafId = requestAnimationFrame(loop); }
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [isP1, draw]);

  // Pointer / touch — drag mallet anywhere in own half
  const handlePointerMove = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = W / rect.width;
    const scaleY = H / rect.height;
    const src = e.touches ? e.touches[0] : e;
    if (!src) return;
    const rawX = (src.clientX - rect.left) * scaleX;
    const rawY = (src.clientY - rect.top) * scaleY;
    const x = Math.max(MALLET_R, Math.min(W - MALLET_R, rawX));
    const s = S.current;

    let y;
    if (isP1) {
      y = Math.max(P1_Y_MIN, Math.min(P1_Y_MAX, rawY));
    } else {
      y = Math.max(P2_Y_MIN, Math.min(P2_Y_MAX, rawY));
    }

    s.myMallet.x = x;
    s.myMallet.y = y;

    if (isP2) {
      const now = Date.now();
      if (now - s.lastMalletSend > MALLET_SEND_MS) {
        s.lastMalletSend = now;
        onMove({ move_type: 'mallet_move', p2x: x, p2y: y });
      }
    }
  }, [isP1, isP2, onMove]);

  const p1Score = scores[p1Id] || 0;
  const p2Score = scores[p2Id] || 0;

  // Winner: when ended, whoever has more points wins (handles natural finish and mid-game rt_end).
  let winnerName = null;
  if (isEnded) {
    if (p1Score > p2Score) winnerName = p1Name;
    else if (p2Score > p1Score) winnerName = p2Name;
  }

  const handleEndGame = () => onMove({ move_type: 'rt_end' });

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950 text-white select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-700 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-lg">🏒</span>
          <div>
            <h2 className="text-sm font-bold text-cyan-300 leading-tight">Air Hockey</h2>
            <p className="text-xs text-gray-400">First to {winScore} · Rally {rally}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-lg font-black">
            <span className="text-red-400">{p1Score}</span>
            <span className="text-gray-500 text-sm">vs</span>
            <span className="text-blue-400">{p2Score}</span>
          </div>
          {(isP1 || isP2) && !isEnded && (
            <button onClick={handleEndGame} className="px-2 py-1 text-xs bg-red-700 hover:bg-red-600 rounded font-medium">End Game</button>
          )}
          <button onClick={isP1 || isP2 ? (isEnded ? onClose : handleEndGame) : onClose} className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded">✕</button>
        </div>
      </div>

      {/* Player labels */}
      <div className="flex justify-between px-4 pt-1 pb-0.5 shrink-0 text-xs">
        <span className={`font-semibold ${isP1 ? 'text-red-300' : 'text-red-400/70'}`}>{p1Name} {isP1 ? '(You ↑)' : '↑'}</span>
        <span className={`font-semibold ${isP2 ? 'text-blue-300' : 'text-blue-400/70'}`}>{isP2 ? '(You ↓) ' : '↓ '}{p2Name}</span>
      </div>

      {/* Canvas */}
      <div className="flex-1 flex items-center justify-center overflow-hidden px-2 py-1">
        <canvas
          ref={canvasRef}
          width={W}
          height={H}
          onMouseMove={handlePointerMove}
          onTouchMove={handlePointerMove}
          style={{ width: '100%', maxWidth: `${W}px`, height: 'auto', cursor: 'none', touchAction: 'none', display: 'block' }}
        />
      </div>

      {/* Game over */}
      {isEnded && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-gray-800 border border-gray-600 rounded-2xl p-8 text-center shadow-2xl max-w-xs mx-4">
            <p className="text-5xl mb-3">{winnerName ? '🏒' : '🤝'}</p>
            {winnerName
              ? <><p className="text-2xl font-black text-white">{winnerName}</p><p className="text-green-400 font-bold text-lg">wins!</p></>
              : <><p className="text-xl font-bold text-yellow-300">It's a Draw!</p><p className="text-gray-400 text-sm mt-1">Tied scores — no winner</p></>}
            <p className="text-gray-300 text-lg font-bold mt-3">{p1Score} – {p2Score}</p>
            <button onClick={onClose} className="mt-5 px-6 py-2 bg-cyan-600 hover:bg-cyan-500 rounded-xl font-bold text-sm">Close</button>
          </div>
        </div>
      )}

      {!isP1 && !isP2 && !isEnded && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 text-gray-300 text-xs px-3 py-1.5 rounded-full pointer-events-none">
          👀 Spectating
        </div>
      )}
    </div>
  );
}
