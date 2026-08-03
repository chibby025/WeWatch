// src/components/Games/MancalaGame.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { X as CloseIcon, Users } from 'lucide-react';
import GameWinnerBanner from './GameWinnerBanner';
import GameRulesButton from './GameRulesButton';

// Mirrors mancala.go's mancalaOwnPits exactly.
function ownPits(playerIdx) {
  return playerIdx === 0 ? { start: 0, end: 5, store: 6 } : { start: 7, end: 12, store: 13 };
}

const TOP_ROW = [12, 11, 10, 9, 8, 7]; // player1's pits, right-to-left across the top
const BOTTOM_ROW = [0, 1, 2, 3, 4, 5]; // player0's pits, left-to-right across the bottom

// Client-side mirror of processMancalaMove's sow loop — deterministic given
// the starting pit + pre-move seed count, so every connected client
// (mover, opponent, spectators) can replay the identical sequence purely
// from the last_pit/last_player fields the server now persists.
function computeSowPath(startPit, seedCount, playerIdx) {
  const { store: oppStore } = ownPits(1 - playerIdx);
  const path = [];
  let idx = startPit;
  let remaining = seedCount;
  while (remaining > 0) {
    idx = (idx + 1) % 14;
    if (idx === oppStore) continue;
    path.push(idx);
    remaining--;
  }
  return path;
}

// Deterministic per-index pseudo-random offset (classic sine-hash trick) —
// stable across re-renders so a pit's seed cluster never re-shuffles/jitters
// when only the count or an unrelated pit changes.
function seedOffset(i) {
  const h1 = Math.abs(Math.sin(i * 12.9898) * 43758.5453) % 1;
  const h2 = Math.abs(Math.sin(i * 78.233 + 4.1) * 12345.6789) % 1;
  return { dx: (h1 - 0.5) * 60, dy: (h2 - 0.5) * 60 };
}

const PIT_SEED_CAP = 14;
const STORE_SEED_CAP = 20;

// ── 3-D glossy seed (adapted from LudoGame.jsx's Token — same layered-circle
// "dark ring / main fill / light ring / off-center highlight" grammar that
// fakes a glossy sphere, just amber/gold instead of a per-player palette,
// since a seed has no owner identity) ────────────────────────────────────
function Seed({ size = 14 }) {
  return (
    <svg viewBox="0 0 20 20" width={size} height={size}
      style={{ overflow: 'visible', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.5))' }}>
      <circle cx="10" cy="10" r="9" fill="#78350f" />
      <circle cx="10" cy="10" r="8" fill="#d97706" />
      <circle cx="10" cy="10" r="5.5" fill="none" stroke="#fbbf24" strokeWidth="1" opacity="0.5" />
      <circle cx="7.3" cy="6.8" r="2.2" fill="#fde68a" opacity="0.85" />
    </svg>
  );
}

// A capped, deterministically-scattered pile of seeds + an always-exact
// numeral badge (so a capped render — a store can hold up to 48 seeds —
// never becomes ambiguous about the real count).
function SeedPile({ count, cap, seedSize, badgeClassName = 'text-xs' }) {
  const shown = Math.min(count, cap);
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
      <div className="relative w-full h-full">
        {Array.from({ length: shown }, (_, i) => {
          const { dx, dy } = seedOffset(i);
          return (
            <div key={i} className="absolute top-1/2 left-1/2"
              style={{ transform: `translate(calc(-50% + ${dx}%), calc(-50% + ${dy}%))` }}>
              <Seed size={seedSize} />
            </div>
          );
        })}
      </div>
      {count > 0 && (
        <span className={`absolute bottom-0.5 right-1 ${badgeClassName} font-black text-white`}
          style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>
          {count}
        </span>
      )}
    </div>
  );
}

function Pit({ index, count, clickable, isTraveling, isCapturing, onClick }) {
  return (
    <button
      onClick={() => onClick(index)}
      disabled={!clickable}
      className={`relative aspect-square rounded-full transition-transform ${clickable ? 'cursor-pointer' : 'cursor-default'} ${isTraveling ? 'scale-110' : ''}`}
      style={{
        background: 'radial-gradient(circle at 35% 30%, #92400e, #451a03 70%)',
        outline: clickable ? '2px solid #fbbf24' : 'none',
        outlineOffset: 1,
        boxShadow: isCapturing
          ? '0 0 16px rgba(239,68,68,0.85), inset 0 3px 8px rgba(0,0,0,0.6)'
          : isTraveling
            ? 'inset 0 3px 8px rgba(0,0,0,0.6), 0 0 12px rgba(251,191,36,0.65)'
            : 'inset 0 3px 8px rgba(0,0,0,0.6), inset 0 -2px 4px rgba(217,119,6,0.15)',
        transition: 'box-shadow 200ms ease, transform 200ms ease',
      }}
    >
      <SeedPile count={count} cap={PIT_SEED_CAP} seedSize={13} />
    </button>
  );
}

function StorePit({ count, isTraveling }) {
  return (
    <div className="relative w-16 sm:w-20 rounded-2xl flex-shrink-0"
      style={{
        background: 'radial-gradient(circle at 35% 25%, #92400e, #2c1206 75%)',
        border: '2px solid #b45309',
        boxShadow: isTraveling
          ? 'inset 0 4px 10px rgba(0,0,0,0.65), 0 0 16px rgba(251,191,36,0.65)'
          : 'inset 0 4px 10px rgba(0,0,0,0.65)',
        transition: 'box-shadow 200ms ease',
      }}
    >
      <SeedPile count={count} cap={STORE_SEED_CAP} seedSize={13} badgeClassName="text-base" />
    </div>
  );
}

export default function MancalaGame({ gameState, players, currentUserId, onMove, onClose, onEndGame, onPostResult }) {
  const [board, setBoard] = useState(Array(14).fill(0));               // authoritative, from server
  const [displayBoard, setDisplayBoard] = useState(Array(14).fill(0)); // what's actually rendered (animated)
  const [travelingSeed, setTravelingSeed] = useState(null);            // pit index the "in-flight" seed is currently at
  const [captureFlash, setCaptureFlash] = useState([]);                // pit indices flashing during a capture/round-end sweep
  const [animating, setAnimating] = useState(false);
  const [currentTurn, setCurrentTurn] = useState(0);
  const [winner, setWinner] = useState(null);
  const [isOver, setIsOver] = useState(false);
  const [announcement, setAnnouncement] = useState(null);

  // Shadow ref so the sync effect always diffs against the truly-previous
  // displayed board, not a stale closure — same pattern used for Snakes &
  // Ladders' displayPositionsRef this session.
  const boardRef = useRef(Array(14).fill(0));
  boardRef.current = displayBoard;
  const hasRenderedRef = useRef(false);
  const animTimerRef = useRef(null);
  const announceTimerRef = useRef(null);

  const announce = useCallback((opts) => {
    clearTimeout(announceTimerRef.current);
    setAnnouncement({ ...opts, key: Date.now() });
    announceTimerRef.current = setTimeout(() => setAnnouncement(null), 2800);
  }, []);

  useEffect(() => {
    if (!gameState) return;
    const gs = gameState.game_state || {};
    const newBoard = gs.board && gs.board.length === 14 ? gs.board : Array(14).fill(0);
    const lastPit = typeof gs.last_pit === 'number' ? gs.last_pit : null;
    const lastPlayer = typeof gs.last_player === 'number' ? gs.last_player : null;

    setBoard(newBoard);
    setCurrentTurn(gameState.current_turn ?? 0);

    const over = gameState.status === 'finished' || gameState.status === 'completed' || gameState.status === 'forfeited';
    const winnerVal = over ? (gameState.winner_id ? (players.find(p => p.user_id === gameState.winner_id) || 'draw') : 'draw') : null;

    clearTimeout(animTimerRef.current);

    const finish = () => {
      setDisplayBoard(newBoard);
      setTravelingSeed(null);
      setCaptureFlash([]);
      setAnimating(false);
      setIsOver(over);
      setWinner(winnerVal);
    };

    const prevDisplay = boardRef.current;
    if (!hasRenderedRef.current || lastPit === null || lastPlayer === null) {
      // First render / rehydration — snap directly, nothing to animate from yet.
      hasRenderedRef.current = true;
      finish();
      return;
    }

    const seedCount = prevDisplay[lastPit] ?? 0;
    if (seedCount <= 0) {
      // Guards against a desynced ref rather than looping forever — a legal
      // move always sows at least 1 seed, so this shouldn't normally happen.
      finish();
      return;
    }

    const path = computeSowPath(lastPit, seedCount, lastPlayer);
    const { store: myStore, start: myStart, end: myEnd } = ownPits(lastPlayer);

    // The board the naive step-by-step sow alone would produce — exactly
    // what processMancalaMove's own loop does, before any capture/round-end
    // adjustment. Diffing this against the real final board is how a
    // capture (or round-end sweep) is detected client-side, with no extra
    // backend fields needed beyond last_pit/last_player.
    const naiveBoard = [...prevDisplay];
    naiveBoard[lastPit] = 0;
    path.forEach(i => { naiveBoard[i] += 1; });

    setAnimating(true);
    let stepBoard = [...prevDisplay];
    stepBoard[lastPit] = 0;
    setDisplayBoard(stepBoard);
    setTravelingSeed(lastPit);

    const playerName = players[lastPlayer]?.username || 'Player';
    const stepDelay = 240;
    let step = 0;

    const runStep = () => {
      if (step >= path.length) {
        const landedPit = path[path.length - 1];
        const capturedAmount = newBoard[myStore] - naiveBoard[myStore];
        const isCapture = !over && capturedAmount > 0 && landedPit >= myStart && landedPit <= myEnd;
        const isExtraTurn = !over && !isCapture && landedPit === myStore;

        setTravelingSeed(null);

        if (isCapture) {
          const opposite = 12 - landedPit;
          setCaptureFlash([landedPit, opposite]);
          announce({ icon: '🎯', text: 'CAPTURE!', sub: `${playerName} captures ${capturedAmount} seeds!`,
            bg: 'linear-gradient(135deg,#b45309,#78350f)' });
          animTimerRef.current = setTimeout(finish, 420);
        } else if (over) {
          const sweepingPits = [];
          for (let i = 0; i < 13; i++) { if (i !== 6 && naiveBoard[i] > 0) sweepingPits.push(i); }
          setCaptureFlash(sweepingPits);
          animTimerRef.current = setTimeout(finish, 420);
        } else {
          if (isExtraTurn) {
            announce({ icon: '🔄', text: 'GO AGAIN!', sub: `${playerName} lands in their store!`,
              bg: 'linear-gradient(135deg,#7c3aed,#4f46e5)' });
          }
          finish();
        }
        return;
      }
      const target = path[step];
      stepBoard = [...stepBoard];
      stepBoard[target] += 1;
      setDisplayBoard(stepBoard);
      setTravelingSeed(target);
      step += 1;
      animTimerRef.current = setTimeout(runStep, stepDelay);
    };
    animTimerRef.current = setTimeout(runStep, stepDelay);

    // gameState/players fully capture what varies here; announce is a stable
    // useCallback — same pattern LudoGame.jsx/SnakesAndLaddersGame.jsx already use.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, players]);

  useEffect(() => () => {
    clearTimeout(animTimerRef.current);
    clearTimeout(announceTimerRef.current);
  }, []);

  const myIdx = players.findIndex(p => p.user_id === currentUserId);
  const currentPlayer = players[currentTurn];
  const isMyTurn = currentPlayer?.user_id === currentUserId && !isOver && !animating;
  const { start, end } = ownPits(myIdx >= 0 ? myIdx : 0);

  const handlePitClick = (pit) => {
    if (!isMyTurn) return;
    if (pit < start || pit > end || board[pit] === 0) return;
    onMove({ pit });
  };

  const handleForfeit = () => {
    if (onEndGame) onEndGame();
    else onClose();
  };

  const p0Store = displayBoard[6] || 0;
  const p1Store = displayBoard[13] || 0;

  return (
    <>
      <style>{`
        @keyframes mcAnnounceIn {
          0%   { opacity:0; transform:translate(-50%,-50%) scale(0.35) rotate(-8deg); }
          18%  { opacity:1; transform:translate(-50%,-50%) scale(1.12) rotate(2deg); }
          28%  { transform:translate(-50%,-50%) scale(0.96) rotate(-0.5deg); }
          55%  { opacity:1; transform:translate(-50%,-50%) scale(1) rotate(0deg); }
          78%  { opacity:1; transform:translate(-50%,-50%) scale(1); }
          92%  { opacity:0; transform:translate(-50%,-50%) scale(0.9); }
          100% { opacity:0; transform:translate(-50%,-50%) scale(0.75); }
        }
      `}</style>

      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <div className="relative bg-gray-900 rounded-2xl shadow-2xl w-full max-w-xl mx-4 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-5"
            style={{ background: 'linear-gradient(135deg,#78350f 0%,#451a03 100%)' }}>
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">Mancala</h2>
              <div className="flex items-center gap-2 text-sm">
                <Users className="w-4 h-4 text-amber-300" />
                <span className="text-amber-200">{players.map(p => p.username).join(' vs ')}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <GameRulesButton gameType="mancala" className="text-amber-200 hover:text-white" />
              <button onClick={handleForfeit} className="text-amber-200 hover:text-white transition-colors">
                <CloseIcon className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Turn indicator */}
          {!isOver && (
            <div className="p-4" style={{ background: 'rgba(0,0,0,0.3)', borderBottom: '1px solid rgba(217,119,6,0.25)' }}>
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-3">
                  {players.map((player, index) => {
                    const active = currentTurn === index && !animating;
                    return (
                      <div
                        key={player.user_id}
                        className={`px-4 py-2 rounded-lg border-2 transition-all ${
                          active ? 'border-amber-400 bg-amber-500/20 scale-105' : 'border-gray-700 bg-black/20'
                        }`}
                      >
                        <div className="text-white font-semibold text-sm">{player.username}</div>
                        <div className="text-amber-200/70 text-xs">Store: {index === 0 ? p0Store : p1Store} seeds</div>
                      </div>
                    );
                  })}
                </div>
                {isMyTurn && <div className="text-amber-400 font-semibold animate-pulse">Your turn</div>}
                {animating && <div className="text-amber-300/70 text-sm font-medium">Sowing…</div>}
              </div>
            </div>
          )}

          {/* Board */}
          <div className="p-6">
            <div className="relative flex items-stretch gap-3 mx-auto" style={{ maxWidth: 560 }}>
              <StorePit count={p1Store} isTraveling={travelingSeed === 13} />
              <div className="flex-1 grid grid-rows-2 gap-3">
                <div className="grid grid-cols-6 gap-2">
                  {TOP_ROW.map(i => (
                    <Pit
                      key={i}
                      index={i}
                      count={displayBoard[i] || 0}
                      clickable={isMyTurn && i >= start && i <= end && board[i] > 0}
                      isTraveling={travelingSeed === i}
                      isCapturing={captureFlash.includes(i)}
                      onClick={handlePitClick}
                    />
                  ))}
                </div>
                <div className="grid grid-cols-6 gap-2">
                  {BOTTOM_ROW.map(i => (
                    <Pit
                      key={i}
                      index={i}
                      count={displayBoard[i] || 0}
                      clickable={isMyTurn && i >= start && i <= end && board[i] > 0}
                      isTraveling={travelingSeed === i}
                      isCapturing={captureFlash.includes(i)}
                      onClick={handlePitClick}
                    />
                  ))}
                </div>
              </div>
              <StorePit count={p0Store} isTraveling={travelingSeed === 6} />

              {/* ── Event announcement overlay (Capture / Go Again) ── */}
              {announcement && (
                <div
                  key={announcement.key}
                  style={{
                    position: 'absolute', top: '50%', left: '50%',
                    zIndex: 60, pointerEvents: 'none',
                    animation: 'mcAnnounceIn 2.8s cubic-bezier(0.34,1.56,0.64,1) forwards',
                  }}
                >
                  <div style={{
                    background: announcement.bg,
                    borderRadius: 20,
                    padding: '16px 30px',
                    textAlign: 'center',
                    boxShadow: '0 0 56px rgba(0,0,0,0.7), 0 12px 40px rgba(0,0,0,0.5)',
                    border: '1.5px solid rgba(255,255,255,0.2)',
                    minWidth: 200, maxWidth: 300,
                  }}>
                    <div style={{ fontSize: 40, lineHeight: 1, marginBottom: 8 }}>{announcement.icon}</div>
                    <div style={{
                      color: '#fff', fontSize: 22, fontWeight: 900,
                      letterSpacing: 0.5, textShadow: '0 2px 10px rgba(0,0,0,0.5)',
                      lineHeight: 1.1,
                    }}>{announcement.text}</div>
                    {announcement.sub && (
                      <div style={{
                        color: 'rgba(255,255,255,0.85)', fontSize: 12,
                        marginTop: 6, fontWeight: 600, letterSpacing: 0.2,
                      }}>{announcement.sub}</div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-between mx-auto text-[11px] text-gray-500 mt-2" style={{ maxWidth: 560 }}>
              <span className="ml-20">{players[1]?.username ?? 'Player 2'}'s pits</span>
              <span className="mr-20">{players[0]?.username ?? 'Player 1'}'s pits</span>
            </div>
          </div>

          {/* Footer */}
          {!isOver && (
            <div className="p-6 flex justify-end" style={{ borderTop: '1px solid rgba(217,119,6,0.25)' }}>
              <button onClick={handleForfeit} className="px-6 py-2 bg-red-700 hover:bg-red-800 text-white rounded-lg transition-colors">
                End Game
              </button>
            </div>
          )}
        </div>
      </div>

      {winner && (
        <GameWinnerBanner
          winner={winner === 'draw' ? null : winner}
          players={players}
          gameType="mancala"
          gameStats={{ lines: [
            { label: players[0]?.username ?? 'Player 1', value: `${board[6] || 0} seeds` },
            { label: players[1]?.username ?? 'Player 2', value: `${board[13] || 0} seeds` },
          ]}}
          isForfeit={gameState?.status === 'forfeited'}
          onClose={onClose}
          onPostResult={onPostResult}
        />
      )}
    </>
  );
}
