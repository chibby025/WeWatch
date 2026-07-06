import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Trophy, Eraser, Palette, Play, ChevronRight } from 'lucide-react';

// Draw & Guess — one player (the drawer) is given a secret word and draws it; everyone
// else races to guess it via text. Canvas strokes travel over relay_packet (cheap,
// real-time), NOT make_move. The drawer's secret word arrives via the private
// draw_word message (drawerWord prop, set in VideoWatch). Turn/score logic is on the
// backend (draw_guess.go).

const COLORS = ['#000000', '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', '#FFFFFF'];
const BRUSH_SIZES = [3, 6, 12];
const ROUND_SECONDS = 60;

// Fixed logical canvas size — strokes are stored in these coordinates and scaled to
// whatever pixel size the canvas renders at, so host & guessers see the same drawing
// regardless of their screen.
const CANVAS_W = 800;
const CANVAS_H = 500;

export default function DrawGuessGame({
  gameState, players, currentUserId, drawerWord,
  onMove, onClose, onEndGame, onRelayPacket, registerRelayReceiver,
}) {
  const gs = gameState?.game_state || {};
  const phase = gs.phase || 'waiting';
  const round = Number(gs.round) || 0;
  const scores = gs.scores || {};
  const currentDrawer = gs.current_drawer != null ? Number(gs.current_drawer) : null;
  const wordLength = Number(gs.word_length) || 0;
  const correctGuessers = gs.correct_guessers || {};
  const roundStartMs = Number(gs.round_start_ms) || 0;

  const isHostUser = (gameState?.host_id ?? players?.[0]?.user_id) === currentUserId;
  const isDrawer = currentDrawer === currentUserId;
  const finished = phase === 'ended' || gameState?.status === 'finished';
  const iGuessedRight = !!correctGuessers[String(currentUserId)];

  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef(null);
  const [color, setColor] = useState('#000000');
  const [brush, setBrush] = useState(6);
  const [isEraser, setIsEraser] = useState(false);
  const [guessText, setGuessText] = useState('');
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);

  // ── Canvas drawing helpers ──────────────────────────────────────────────────
  const drawSegment = useCallback((from, to, strokeColor, size) => {
    const canvas = canvasRef.current;
    if (!canvas || !from || !to) return;
    const ctx = canvas.getContext('2d');
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }, []);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }, []);

  // Initialize / clear the canvas whenever a new drawing round starts.
  useEffect(() => {
    clearCanvas();
  }, [round, phase, clearCanvas]);

  // Receive remote strokes via the relay bridge (registerRelayReceiver). The payload
  // is a base64-encoded JSON stroke packet.
  useEffect(() => {
    if (!registerRelayReceiver) return;
    registerRelayReceiver((payload) => {
      if (!payload) return;
      let packet;
      try {
        packet = JSON.parse(atob(payload));
      } catch {
        return;
      }
      if (packet.type === 'stroke' && Array.isArray(packet.points)) {
        const pts = packet.points;
        for (let i = 1; i < pts.length; i++) {
          drawSegment(
            pts[i - 1], pts[i],
            packet.isEraser ? '#FFFFFF' : packet.color,
            packet.size,
          );
        }
      } else if (packet.type === 'clear') {
        clearCanvas();
      }
    });
    return () => registerRelayReceiver(null);
  }, [registerRelayReceiver, drawSegment, clearCanvas]);

  // Round timer.
  useEffect(() => {
    if (phase !== 'drawing' || !roundStartMs) return;
    const interval = setInterval(() => {
      const elapsed = (Date.now() - roundStartMs) / 1000;
      const remaining = Math.max(0, ROUND_SECONDS - elapsed);
      setTimeLeft(Math.ceil(remaining));
      // Host auto-ends the round when the timer runs out.
      if (remaining <= 0 && isHostUser && phase === 'drawing') {
        onMove({ move_type: 'end_round' });
      }
    }, 500);
    return () => clearInterval(interval);
  }, [phase, roundStartMs, isHostUser, onMove]);

  // ── Pointer → logical canvas coordinates ────────────────────────────────────
  const getPoint = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: ((clientX - rect.left) / rect.width) * CANVAS_W,
      y: ((clientY - rect.top) / rect.height) * CANVAS_H,
    };
  };

  const startDraw = (e) => {
    if (!isDrawer || phase !== 'drawing') return;
    e.preventDefault();
    drawingRef.current = true;
    lastPointRef.current = getPoint(e);
  };

  const moveDraw = (e) => {
    if (!drawingRef.current || !isDrawer) return;
    e.preventDefault();
    const point = getPoint(e);
    const from = lastPointRef.current;
    drawSegment(from, point, isEraser ? '#FFFFFF' : color, brush);
    // Relay this segment to the other clients.
    if (onRelayPacket) {
      const packet = { type: 'stroke', points: [from, point], color, size: brush, isEraser };
      onRelayPacket(btoa(JSON.stringify(packet)));
    }
    lastPointRef.current = point;
  };

  const endDraw = () => {
    drawingRef.current = false;
    lastPointRef.current = null;
  };

  const handleClearCanvas = () => {
    if (!isDrawer) return;
    clearCanvas();
    if (onRelayPacket) onRelayPacket(btoa(JSON.stringify({ type: 'clear' })));
  };

  // ── Guessing ────────────────────────────────────────────────────────────────
  const submitGuess = (e) => {
    e?.preventDefault();
    const text = guessText.trim();
    if (!text || isDrawer || phase !== 'drawing' || iGuessedRight) return;
    onMove({ move_type: 'guess', text });
    setGuessText('');
  };

  // ── Word display ────────────────────────────────────────────────────────────
  const wordDisplay = () => {
    if (isDrawer && drawerWord) return drawerWord.toUpperCase().split('').join(' ');
    // Guessers see blanks + letter count.
    return Array.from({ length: wordLength }).map(() => '_').join(' ');
  };

  const drawerPlayer = (players || []).find(p => p.user_id === currentDrawer);
  const winner = gameState?.winner_id != null
    ? (players || []).find(p => p.user_id === gameState.winner_id)
    : null;

  const sortedPlayers = [...(players || [])].sort(
    (a, b) => (Number(scores[String(b.user_id)]) || 0) - (Number(scores[String(a.user_id)]) || 0)
  );

  const endOrLeave = () => {
    if (isHostUser && onEndGame) onEndGame();
    else onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] bg-gray-950/98 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between pl-20 pr-5 py-3 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Palette className="w-6 h-6 text-pink-400" />
          <span className="text-white font-bold text-xl">Draw &amp; Guess</span>
          {phase === 'drawing' && (
            <span className="text-2xl font-mono tracking-widest text-white ml-2">{wordDisplay()}</span>
          )}
          {phase === 'drawing' && !isDrawer && (
            <span className="text-gray-500 text-xs">({wordLength} letters)</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {phase === 'drawing' && (
            <span className={`text-sm font-bold tabular-nums ${timeLeft <= 10 ? 'text-red-400' : 'text-gray-300'}`}>{timeLeft}s</span>
          )}
          <button
            onClick={endOrLeave}
            className="text-gray-400 hover:text-white hover:bg-gray-800 p-1.5 rounded-lg transition-colors"
            title={isHostUser ? 'End game for everyone' : 'Leave game'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Main area */}
        <div className="flex-1 flex flex-col items-center justify-center p-4 overflow-y-auto">
          {finished ? (
            <div className="text-center max-w-md">
              <div className="text-6xl mb-4">{winner ? '🏆' : '🤝'}</div>
              <h2 className="text-3xl font-bold text-white mb-1">
                {winner ? `${winner.username} Wins!` : "It's a Tie!"}
              </h2>
              <p className="text-gray-400 text-sm mb-6">Highest total score</p>
              <button
                onClick={onClose}
                className="px-8 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold rounded-xl text-base transition-all"
              >
                Close
              </button>
            </div>
          ) : phase === 'waiting' ? (
            <div className="text-center">
              <div className="text-6xl mb-4">🎨</div>
              <h2 className="text-2xl font-bold text-white mb-2">
                {round === 0 ? 'Ready to Draw!' : `Round ${round + 1}`}
              </h2>
              <p className="text-gray-400 text-sm mb-6">
                {isHostUser ? 'Start the round when everyone is ready.' : 'Waiting for the host to start the round…'}
              </p>
              {isHostUser && (
                <button
                  onClick={() => onMove({ move_type: 'start_round' })}
                  className="flex items-center gap-2 mx-auto px-8 py-3 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700 text-white font-bold rounded-xl text-base transition-all"
                >
                  <Play className="w-5 h-5" /> Start Round
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Canvas */}
              <div className="relative w-full max-w-3xl">
                <canvas
                  ref={canvasRef}
                  width={CANVAS_W}
                  height={CANVAS_H}
                  onMouseDown={startDraw}
                  onMouseMove={moveDraw}
                  onMouseUp={endDraw}
                  onMouseLeave={endDraw}
                  onTouchStart={startDraw}
                  onTouchMove={moveDraw}
                  onTouchEnd={endDraw}
                  className={`w-full rounded-xl bg-white shadow-lg ${isDrawer && phase === 'drawing' ? 'cursor-crosshair' : ''}`}
                  style={{ aspectRatio: `${CANVAS_W}/${CANVAS_H}`, touchAction: 'none' }}
                />

                {phase === 'reveal' && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-xl">
                    <div className="text-center">
                      <p className="text-gray-300 text-sm mb-1">The word was</p>
                      <p className="text-white text-3xl font-bold">{drawerWord || '???'}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Drawer tools */}
              {isDrawer && phase === 'drawing' && (
                <div className="flex items-center gap-3 mt-3 flex-wrap justify-center">
                  <div className="flex gap-1.5">
                    {COLORS.map(c => (
                      <button
                        key={c}
                        onClick={() => { setColor(c); setIsEraser(false); }}
                        className={`w-7 h-7 rounded-full border-2 transition-all ${color === c && !isEraser ? 'border-white scale-110' : 'border-gray-600'}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                  <div className="flex gap-1.5">
                    {BRUSH_SIZES.map(s => (
                      <button
                        key={s}
                        onClick={() => setBrush(s)}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${brush === s ? 'bg-purple-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                      >
                        <span className="rounded-full bg-white" style={{ width: s, height: s }} />
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setIsEraser(e => !e)}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${isEraser ? 'bg-purple-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                    title="Eraser"
                  >
                    <Eraser className="w-4 h-4 text-white" />
                  </button>
                  <button
                    onClick={handleClearCanvas}
                    className="px-3 h-8 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-xs font-semibold transition-colors"
                  >
                    Clear
                  </button>
                </div>
              )}

              {/* Guesser input */}
              {!isDrawer && phase === 'drawing' && (
                <form onSubmit={submitGuess} className="w-full max-w-md mt-3 flex gap-2">
                  {iGuessedRight ? (
                    <div className="flex-1 text-center py-2.5 bg-green-600/20 border border-green-500/40 text-green-300 rounded-xl font-semibold">
                      ✅ You got it!
                    </div>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={guessText}
                        onChange={(e) => setGuessText(e.target.value)}
                        placeholder="Type your guess…"
                        className="flex-1 bg-gray-900 border-2 border-gray-700 focus:border-pink-500 rounded-xl px-4 py-2.5 text-white focus:outline-none"
                      />
                      <button
                        type="submit"
                        className="px-5 py-2.5 bg-pink-600 hover:bg-pink-700 text-white font-bold rounded-xl transition-colors"
                      >
                        Guess
                      </button>
                    </>
                  )}
                </form>
              )}

              {isDrawer && phase === 'drawing' && (
                <p className="text-gray-500 text-xs mt-2">You're drawing! Others are guessing.</p>
              )}

              {/* Host round controls */}
              {isHostUser && (
                <div className="flex gap-2 mt-4">
                  {phase === 'drawing' && (
                    <button
                      onClick={() => onMove({ move_type: 'end_round' })}
                      className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-semibold text-sm transition-colors"
                    >
                      End Round
                    </button>
                  )}
                  {phase === 'reveal' && (
                    <button
                      onClick={() => onMove({ move_type: 'next_round' })}
                      className="flex items-center gap-1.5 px-5 py-2 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-700 hover:to-purple-700 text-white rounded-xl font-semibold text-sm transition-all"
                    >
                      Next Round <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Score sidebar */}
        <div className="w-40 sm:w-52 border-l border-gray-800 bg-gray-900/60 p-3 overflow-y-auto flex-shrink-0">
          <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">Scores</p>
          <div className="space-y-2">
            {sortedPlayers.map((p, i) => {
              const isThisDrawer = p.user_id === currentDrawer;
              const guessedRight = !!correctGuessers[String(p.user_id)];
              return (
                <div key={p.user_id} className="flex items-center gap-2">
                  {i === 0 && <Trophy className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />}
                  <div className="w-3 h-3 rounded-full border border-white/30 flex-shrink-0" style={{ backgroundColor: p.color }} />
                  <span className="text-white text-xs truncate flex-1">{p.username}</span>
                  {isThisDrawer && <span title="Drawing" className="text-xs">✏️</span>}
                  {guessedRight && !isThisDrawer && <span title="Guessed it" className="text-xs">✅</span>}
                  <span className="text-yellow-400 text-xs font-bold flex-shrink-0">{Math.round(Number(scores[String(p.user_id)]) || 0)}</span>
                </div>
              );
            })}
          </div>
          {phase === 'drawing' && drawerPlayer && (
            <p className="text-gray-500 text-[11px] mt-4">
              {drawerPlayer.username} is drawing
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
