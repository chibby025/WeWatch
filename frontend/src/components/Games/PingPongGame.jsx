import React, { useRef, useEffect, useCallback } from 'react';

// Canvas logical dimensions — must match backend rtW/rtH constants.
const W = 400, H = 600;
const P1_CY = 48;   // P1 paddle center Y (top player)
const P2_CY = 552;  // P2 paddle center Y (bottom player)
const PAD_W = 80, PAD_H = 12;
const BALL_R = 9;
const SPEED_UP = 1.03;  // velocity multiplier each paddle hit
const MAX_SPEED = 560;
const MAX_VX_RATIO = 0.75;
const SYNC_EVERY = 6;     // send state_sync every N frames (~10 Hz at 60 fps)
const PADDLE_SEND_MS = 50; // throttle paddle_move to 20 Hz

export default function PingPongGame({ gameState, players, currentUserId, onMove, onClose, onEndGame }) {
  const gs = gameState?.game_state || {};
  const p1Id = String(gs.p1_id || '');
  const p2Id = String(gs.p2_id || '');
  const myId = String(currentUserId);
  const isP1 = myId === p1Id;
  const isP2 = myId === p2Id;
  const scores = gs.scores || {};
  const rally = gs.rally || 0;
  const winScore = gs.win_score || 7;
  const isEnded = gs.phase === 'ended';
  const noWallsActive = !!gs.no_walls;

  const p1Name = players?.find(p => String(p.user_id) === p1Id)?.username || 'Player 1';
  const p2Name = players?.find(p => String(p.user_id) === p2Id)?.username || 'Player 2';

  const canvasRef = useRef(null);
  const rafRef = useRef(null);

  // All mutable game state in a single object ref — never triggers re-renders.
  const S = useRef({
    ball: { x: W / 2, y: H / 2, vx: 50, vy: 260 },
    myPaddle: W / 2,
    remotePaddle: W / 2,
    awaitingGoal: false,
    lastTouch: null, // 'p1' | 'p2' | null — tracks who last hit the ball for no-walls scoring
    // P2 extrapolation anchor (updated from gameState prop changes)
    syncAnchor: { x: W / 2, y: H / 2, vx: 50, vy: 260, t: Date.now() },
    frameCount: 0,
    lastTime: 0,
    lastPaddleSend: 0,
    // Read-only copies of ids — kept here so RAF callbacks don't close over stale prop values
    p1Id, p2Id, myId, isP1, isP2,
  });

  // Sync the latest gameState from props into our ref for RAF callbacks to read.
  const gsRef = useRef(gs);
  useEffect(() => {
    gsRef.current = gameState?.game_state || {};
    const gsCurrent = gsRef.current;
    const s = S.current;

    if (isP1) {
      // P1: update remote (P2) paddle from WS relay
      if (gsCurrent.p2x != null) s.remotePaddle = gsCurrent.p2x;
      // P1: on goal confirmation, reset ball using server-authoritative velocity
      if (s.awaitingGoal && gsCurrent.phase === 'playing') {
        s.ball.x = gsCurrent.ball_x ?? W / 2;
        s.ball.y = gsCurrent.ball_y ?? H / 2;
        s.ball.vx = gsCurrent.ball_vx ?? 50;
        s.ball.vy = gsCurrent.ball_vy ?? 260;
        s.awaitingGoal = false;
        s.lastTouch = null; // Reset so a fresh serve has no attribution yet
      }
    } else {
      // P2 / spectator: update extrapolation anchor from relayed state
      if (gsCurrent.p1x != null) s.remotePaddle = gsCurrent.p1x;
      s.syncAnchor = {
        x: gsCurrent.ball_x ?? W / 2,
        y: gsCurrent.ball_y ?? H / 2,
        vx: gsCurrent.ball_vx ?? 50,
        vy: gsCurrent.ball_vy ?? 260,
        t: Date.now(),
      };
    }
  }, [gameState, isP1]);

  // Draw one frame onto the canvas.
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const s = S.current;
    const gsCurrent = gsRef.current;

    // Table background
    ctx.fillStyle = '#14532d';
    ctx.fillRect(0, 0, W, H);

    // Centre line (dashed)
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 10]);
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
    ctx.setLineDash([]);

    // Table border
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 3;
    ctx.strokeRect(6, 6, W - 12, H - 12);

    // Ball position
    let bx, by;
    if (s.isP1) {
      bx = s.ball.x;
      by = s.ball.y;
    } else {
      // Extrapolate forward from last sync anchor (capped at 200 ms to avoid runaway)
      const elapsed = Math.min((Date.now() - s.syncAnchor.t) / 1000, 0.2);
      bx = s.syncAnchor.x + s.syncAnchor.vx * elapsed;
      by = s.syncAnchor.y + s.syncAnchor.vy * elapsed;
    }

    // Ball
    const grad = ctx.createRadialGradient(bx - 2, by - 2, 1, bx, by, BALL_R);
    grad.addColorStop(0, '#fef08a');
    grad.addColorStop(1, '#ca8a04');
    ctx.beginPath(); ctx.arc(bx, by, BALL_R, 0, Math.PI * 2);
    ctx.fillStyle = grad; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();

    // P1 paddle (blue, top)
    const p1x = s.isP1 ? s.myPaddle : (gsCurrent.p1x ?? s.remotePaddle);
    ctx.beginPath();
    ctx.roundRect(p1x - PAD_W / 2, P1_CY - PAD_H / 2, PAD_W, PAD_H, 6);
    ctx.fillStyle = '#3b82f6'; ctx.fill();
    ctx.strokeStyle = '#93c5fd'; ctx.lineWidth = 2; ctx.stroke();

    // P2 paddle (red, bottom)
    const p2x = s.isP2 ? s.myPaddle : (gsCurrent.p2x ?? s.remotePaddle);
    ctx.beginPath();
    ctx.roundRect(p2x - PAD_W / 2, P2_CY - PAD_H / 2, PAD_W, PAD_H, 6);
    ctx.fillStyle = '#ef4444'; ctx.fill();
    ctx.strokeStyle = '#fca5a5'; ctx.lineWidth = 2; ctx.stroke();

    // Player name labels on their paddle
    ctx.font = '11px system-ui';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(s.isP1 ? 'You' : s.p1Id, p1x, P1_CY - PAD_H / 2 - 5);
    ctx.fillText(s.isP2 ? 'You' : s.p2Id, p2x, P2_CY + PAD_H / 2 + 14);

    // "Goal!" flash overlay
    if (s.awaitingGoal) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, 0, W, H);
      ctx.font = 'bold 32px system-ui';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fde047';
      ctx.fillText('⚡ GOAL!', W / 2, H / 2 - 12);
    }
  }, []); // no deps — reads from refs at call time

  // P1's physics + sync loop
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
        const b = s.ball;
        const noWalls = !!gsCurrent.no_walls;
        b.x += b.vx * dt;
        b.y += b.vy * dt;

        // Side walls: bounce normally, OR exit and score if no-walls is active.
        // A side exit only scores if someone has already touched the ball (lastTouch
        // is set) — on a fresh serve the ball can clip a wall without attributing blame.
        if (noWalls && s.lastTouch !== null) {
          if (b.x < BALL_R || b.x > W - BALL_R) {
            s.awaitingGoal = true;
            b.x = W / 2; b.y = H / 2; b.vx = 0; b.vy = 0;
            // Last toucher loses the point → their opponent scores
            const scorerId = s.lastTouch === 'p1' ? s.p2Id : s.p1Id;
            onMove({ move_type: 'goal', scorer_id: scorerId });
          }
        } else {
          if (b.x < BALL_R) { b.x = BALL_R; b.vx = Math.abs(b.vx); }
          if (b.x > W - BALL_R) { b.x = W - BALL_R; b.vx = -Math.abs(b.vx); }
        }

        // P1 paddle collision (ball moving UP — vy < 0)
        if (!s.awaitingGoal && b.vy < 0 && b.y - BALL_R <= P1_CY + PAD_H / 2 && b.y + BALL_R >= P1_CY - PAD_H / 2) {
          const hit = (b.x - s.myPaddle) / (PAD_W / 2);
          if (Math.abs(hit) <= 1.15) {
            s.lastTouch = 'p1';
            b.y = P1_CY + PAD_H / 2 + BALL_R + 1;
            const speed = Math.min(Math.abs(b.vy) * SPEED_UP, MAX_SPEED);
            b.vx = hit * speed * MAX_VX_RATIO;
            b.vy = speed;
          }
        }

        // P2 paddle collision (ball moving DOWN — vy > 0)
        if (!s.awaitingGoal && b.vy > 0 && b.y + BALL_R >= P2_CY - PAD_H / 2 && b.y - BALL_R <= P2_CY + PAD_H / 2) {
          const hit = (b.x - s.remotePaddle) / (PAD_W / 2);
          if (Math.abs(hit) <= 1.15) {
            s.lastTouch = 'p2';
            b.y = P2_CY - PAD_H / 2 - BALL_R - 1;
            const speed = Math.min(Math.abs(b.vy) * SPEED_UP, MAX_SPEED);
            b.vx = hit * speed * MAX_VX_RATIO;
            b.vy = -speed;
          }
        }

        // Goal detection (top/bottom edges)
        if (!s.awaitingGoal) {
          if (b.y < -BALL_R) {
            s.awaitingGoal = true;
            b.x = W / 2; b.y = H / 2; b.vx = 0; b.vy = 0;
            onMove({ move_type: 'goal', scorer_id: s.p2Id });
          } else if (b.y > H + BALL_R) {
            s.awaitingGoal = true;
            b.x = W / 2; b.y = H / 2; b.vx = 0; b.vy = 0;
            onMove({ move_type: 'goal', scorer_id: s.p1Id });
          }
        }

        // Throttled state sync to P2
        if (s.frameCount % SYNC_EVERY === 0 && !s.awaitingGoal) {
          onMove({ move_type: 'state_sync', ball_x: b.x, ball_y: b.y, ball_vx: b.vx, ball_vy: b.vy, p1x: s.myPaddle });
        }
      }

      draw();
      rafId = requestAnimationFrame(loop);
    }

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [isP1, draw, onMove]); // stable — onMove/draw don't change

  // P2 / spectator draw loop (no physics)
  useEffect(() => {
    if (isP1) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let rafId;
    function loop() { draw(); rafId = requestAnimationFrame(loop); }
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [isP1, draw]);

  // Pointer / touch control — updates my own paddle and sends to opponent
  const handlePointerMove = useCallback((e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const scaleX = W / rect.width;
    const clientX = e.touches ? e.touches[0]?.clientX : e.clientX;
    if (clientX == null) return;
    const x = Math.max(PAD_W / 2, Math.min(W - PAD_W / 2, (clientX - rect.left) * scaleX));
    S.current.myPaddle = x;

    if (isP2) {
      const now = Date.now();
      if (now - S.current.lastPaddleSend > PADDLE_SEND_MS) {
        S.current.lastPaddleSend = now;
        onMove({ move_type: 'paddle_move', p2x: x });
      }
    }
  }, [isP2, onMove]);

  const p1Score = scores[p1Id] || 0;
  const p2Score = scores[p2Id] || 0;

  // Winner: when ended, whoever has more points wins (handles both natural finish and mid-game rt_end).
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
          <span className="text-lg">🏓</span>
          <div>
            <h2 className="text-sm font-bold text-blue-300 leading-tight">Ping Pong{noWallsActive ? ' · No Walls' : ''}</h2>
            <p className="text-xs text-gray-400">First to {winScore} · Rally {rally}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Score */}
          <div className="flex items-center gap-2 text-lg font-black">
            <span className="text-blue-400">{p1Score}</span>
            <span className="text-gray-500 text-sm">vs</span>
            <span className="text-red-400">{p2Score}</span>
          </div>
          {(isP1 || isP2) && !isEnded && (
            <button onClick={handleEndGame} className="px-2 py-1 text-xs bg-red-700 hover:bg-red-600 rounded font-medium">End Game</button>
          )}
          <button onClick={isP1 || isP2 ? (isEnded ? onClose : handleEndGame) : onClose} className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 rounded">✕</button>
        </div>
      </div>

      {/* Player labels */}
      <div className="flex justify-between px-4 pt-1 pb-0.5 shrink-0 text-xs">
        <span className={`font-semibold ${isP1 ? 'text-blue-300' : 'text-blue-400/70'}`}>{p1Name} {isP1 ? '(You ↑)' : '↑'}</span>
        <span className={`font-semibold ${isP2 ? 'text-red-300' : 'text-red-400/70'}`}>{isP2 ? '(You ↓) ' : '↓ '}{p2Name}</span>
      </div>

      {/* Canvas — fills remaining space with aspect ratio preserved */}
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

      {/* Game over overlay */}
      {isEnded && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-gray-800 border border-gray-600 rounded-2xl p-8 text-center shadow-2xl max-w-xs mx-4">
            <p className="text-5xl mb-3">{winnerName ? '🏆' : '🤝'}</p>
            {winnerName
              ? <><p className="text-2xl font-black text-white">{winnerName}</p><p className="text-green-400 font-bold text-lg">wins!</p></>
              : <><p className="text-xl font-bold text-yellow-300">It's a Draw!</p><p className="text-gray-400 text-sm mt-1">Tied scores — no winner</p></>}
            <p className="text-gray-300 text-lg font-bold mt-3">{p1Score} – {p2Score}</p>
            <p className="text-gray-500 text-xs mt-1">{rally} {rally === 1 ? 'rally' : 'rallies'} played</p>
            <button onClick={onClose} className="mt-5 px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold text-sm">
              Close
            </button>
          </div>
        </div>
      )}

      {/* "Waiting — you're a spectator" hint */}
      {!isP1 && !isP2 && !isEnded && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/60 text-gray-300 text-xs px-3 py-1.5 rounded-full pointer-events-none">
          👀 Spectating
        </div>
      )}
    </div>
  );
}
