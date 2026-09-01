// src/components/Games/DartsGame.jsx
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { X } from 'lucide-react';
import GameWinnerBanner from './GameWinnerBanner';
import GameRulesButton from './GameRulesButton';
import DartboardScene from './DartboardScene';

const ROUNDS = 3;
const DARTS_PER_TURN = 3;
const DEFAULT_COLORS = ['#16815f', '#d94a4a', '#2f6fd6', '#c98b1f'];
// Matches DartboardScene.jsx's own internal BOARD.doubleOuter exactly — kept
// as a small, deliberately duplicated scalar rather than exported from that
// file (which shares a file with a component and can't export anything else
// without breaking Fast Refresh there). See DartboardScene.jsx's own header
// comment for why this conversion exists at all: its 3D scene stays at its
// native tuned scale; only the two boundary points (sending an aim to the
// server, replaying a server-confirmed landing spot) convert through this.
const DART_SCALE = 2.22;

// Synthesized dart-hit sound (forked from dart-room's own playHitSound) — a
// short oscillator blip, pitch/timbre scaled by the score, no external audio
// asset needed. Matches this codebase's own established convention (Ping
// Pong/Air Hockey/DOOM etc all synthesize SFX the same way).
function playHitSound(hit, enabled) {
  if (!enabled || typeof window === 'undefined') return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = hit.label?.includes('Bullseye') || hit.label?.startsWith('Triple') ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(hit.score === 0 ? 90 : 170 + hit.score * 4.2, context.currentTime);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.2);
    setTimeout(() => context.close(), 300);
  } catch {
    /* ignore — sound is a pure nicety */
  }
}

export default function DartsGame({ gameState, players = [], currentUserId, onMove, onClose, onEndGame, onPostResult, onPlayAgain }) {
  const sceneRef = useRef(null);

  const gs = gameState?.game_state || {};
  const scores = gs.scores || {};
  const currentRound = gs.current_round ?? 1;
  const dartsThisTurn = gs.darts_this_turn ?? 0;
  const lastThrow = gs.last_throw;

  const currentTurn = gameState?.current_turn ?? 0;
  const currentPlayer = players[currentTurn];
  const isMyTurn = currentPlayer?.user_id === currentUserId;
  const isPlayer = players.some((p) => p.user_id === currentUserId);
  const winner = gameState?.winner_id ? players.find((p) => p.user_id === gameState.winner_id) : null;
  const isOver = ['finished', 'forfeited', 'completed'].includes(gameState?.status);

  const [soundEnabled] = useState(() => {
    try { return localStorage.getItem('darts_sound_enabled') !== 'false'; } catch { return true; }
  });
  const [lastHitLabel, setLastHitLabel] = useState(null);
  const lastHitLabelTimerRef = useRef(null);

  const colorForPlayer = useCallback((userId) => {
    const idx = players.findIndex((p) => p.user_id === userId);
    return players[idx]?.color || DEFAULT_COLORS[idx >= 0 ? idx % DEFAULT_COLORS.length : 0];
  }, [players]);
  const myColor = colorForPlayer(currentUserId);

  // ── Clear the board's stuck darts exactly once per fresh turn ──────────
  // darts.go resets darts_this_turn to 0 the instant a new turn begins
  // (either the same player continuing after dart 1-2, which does NOT reset
  // it, or a genuinely new thrower/round, which does) — so "just became 0,
  // for a turn/round combination we haven't cleared for yet" is exactly the
  // right, server-driven signal for when to wipe the visual board.
  const turnKey = `${currentTurn}-${currentRound}`;
  const lastClearedTurnKeyRef = useRef(null);
  useEffect(() => {
    if (dartsThisTurn === 0 && lastClearedTurnKeyRef.current !== turnKey) {
      lastClearedTurnKeyRef.current = turnKey;
      sceneRef.current?.clearDarts();
    }
  }, [turnKey, dartsThisTurn]);

  // ── Animate the most recently confirmed throw flying in ────────────────
  // Fires for BOTH players uniformly — mine or theirs — since darts.go is
  // the sole authority on where a dart actually lands (server-side wobble,
  // see DartboardScene.jsx's header comment). Neither player's own gesture
  // triggers a visible throw by itself; both wait for this same broadcast.
  const lastThrowKeyRef = useRef(null);
  useEffect(() => {
    if (!lastThrow || lastThrow.x == null) return;
    const key = `${lastThrow.player_id}-${lastThrow.x}-${lastThrow.y}-${lastThrow.score}`;
    if (lastThrowKeyRef.current === key) return;
    lastThrowKeyRef.current = key;
    sceneRef.current?.throwAt(lastThrow.x * DART_SCALE, lastThrow.y * DART_SCALE, colorForPlayer(lastThrow.player_id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastThrow]);

  const handleAimRelease = useCallback(({ x, y, quality }) => {
    if (!isMyTurn || isOver) return;
    onMove({ move_type: 'throw', aim_x: x / DART_SCALE, aim_y: y / DART_SCALE, power: quality });
  }, [isMyTurn, isOver, onMove]);

  const handleHit = useCallback((hit) => {
    playHitSound(hit, soundEnabled);
    setLastHitLabel(hit.label);
    if (lastHitLabelTimerRef.current) clearTimeout(lastHitLabelTimerRef.current);
    lastHitLabelTimerRef.current = setTimeout(() => setLastHitLabel(null), 1800);
  }, [soundEnabled]);

  useEffect(() => () => { if (lastHitLabelTimerRef.current) clearTimeout(lastHitLabelTimerRef.current); }, []);

  const handleForfeit = () => {
    if (winner || isOver) { onClose(); return; }
    (onEndGame || onClose)();
  };

  const sortedPlayers = useMemo(
    () => [...players].sort((a, b) => (scores[String(b.user_id)] ?? 0) - (scores[String(a.user_id)] ?? 0)),
    [players, scores],
  );

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <div className="relative bg-gray-900 rounded-2xl shadow-2xl w-full max-w-3xl mx-4 overflow-hidden flex flex-col" style={{ maxHeight: '92vh' }}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 shrink-0">
            <div>
              <h2 className="text-white text-xl font-bold">Darts 🎯</h2>
              <p className="text-gray-400 text-sm">Round {Math.min(currentRound, ROUNDS)} of {ROUNDS}</p>
            </div>
            <div className="flex items-center gap-2">
              <GameRulesButton gameType="darts" />
              {!isOver && (
                <button onClick={handleForfeit} className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium">
                  Forfeit
                </button>
              )}
              <button onClick={handleForfeit} className="text-gray-400 hover:text-white" title={winner || isOver ? 'Close' : 'Forfeit'}>
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-center gap-3 px-5 py-2.5 flex-wrap shrink-0 border-b border-gray-800">
            {sortedPlayers.map((p) => (
              <div
                key={p.user_id}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
                  currentPlayer?.user_id === p.user_id ? 'bg-purple-900/40 ring-2 ring-purple-500' : 'bg-gray-800/50'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: colorForPlayer(p.user_id) }} />
                <span className="text-white text-sm font-medium">{p.username}</span>
                <span className="text-yellow-400 font-bold text-sm">{scores[String(p.user_id)] ?? 0}</span>
              </div>
            ))}
          </div>

          {!isOver && (
            <div className="text-center py-1.5 shrink-0 flex flex-col items-center gap-0.5">
              <p className={`text-sm font-medium ${isMyTurn ? 'text-green-400' : 'text-gray-400'}`}>
                {isMyTurn ? `Your turn — dart ${dartsThisTurn + 1} of ${DARTS_PER_TURN}` : `${currentPlayer?.username || 'Opponent'}'s turn`}
              </p>
              {lastHitLabel && <p className="text-xs text-yellow-400 font-semibold">{lastHitLabel}</p>}
            </div>
          )}

          <div className="relative flex-1 min-h-[320px]">
            <DartboardScene
              ref={sceneRef}
              disabled={!isMyTurn || isOver}
              playerColor={myColor}
              onAimRelease={handleAimRelease}
              onHit={handleHit}
            />
          </div>

          {!isMyTurn && !isOver && isPlayer && (
            <div className="px-5 pb-4 text-center text-gray-500 text-xs shrink-0">Waiting for your turn…</div>
          )}
        </div>
      </div>

      {isOver && (
        <GameWinnerBanner
          winner={winner}
          players={players}
          gameType="darts"
          gameStats={{ lines: players.map(p => ({ label: p.username, value: `${scores[String(p.user_id)] ?? 0} pts` })) }}
          isForfeit={gameState?.status === 'forfeited'}
          onClose={onClose}
          onPostResult={onPostResult}
          secondaryAction={(gameState?.host_id ?? players?.[0]?.user_id) === currentUserId && onPlayAgain ? { label: 'Play Again 🔄', onClick: onPlayAgain } : undefined}
        />
      )}
    </>
  );
}
