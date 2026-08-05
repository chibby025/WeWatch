import { useState, useMemo, useRef, useEffect } from 'react';
import { X, Shuffle, RotateCcw, Send } from 'lucide-react';
import GameWinnerBanner from './GameWinnerBanner';
import GameRulesButton from './GameRulesButton';

const BOARD_SIZE = 15;

// Mirrors backend/internal/handlers/games/wordsmith.go's wordsmithBoardLayout
// exactly — this is cosmetic only (the server is fully authoritative on
// legality/scoring), but must match so the premium-square colors the player
// sees are the ones actually being scored.
const LAYOUT = [
  't..2...t...2..t',
  '.d...3...3...d.',
  '..d...2.2...d..',
  '2..d...2...d..2',
  '....d.....d....',
  '.3...3...3...3.',
  '..2...2.2...2..',
  't..2...*...2..t',
  '..2...2.2...2..',
  '.3...3...3...3.',
  '....d.....d....',
  '2..d...2...d..2',
  '..d...2.2...d..',
  '.d...3...3...d.',
  't..2...t...2..t',
];

const PREMIUM_STYLE = {
  't': { bg: '#dc2626', label: 'TW' },
  'd': { bg: '#f472b6', label: 'DW' },
  '*': { bg: '#f472b6', label: '★' },
  '3': { bg: '#2563eb', label: 'TL' },
  '2': { bg: '#93c5fd', label: 'DL' },
};

const TILE_VALUES = {
  A: 1, B: 3, C: 3, D: 2, E: 1, F: 4, G: 2, H: 4, I: 1, J: 8, K: 5, L: 1,
  M: 3, N: 1, O: 1, P: 3, Q: 10, R: 1, S: 1, T: 1, U: 1, V: 4, W: 4, X: 8,
  Y: 4, Z: 10, '?': 0,
};

function cellIdx(row, col) { return row * BOARD_SIZE + col; }

// Small popup asking which letter a blank tile should represent.
function BlankLetterPicker({ onPick, onCancel }) {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70" onClick={onCancel}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-4 max-w-xs" onClick={e => e.stopPropagation()}>
        <p className="text-white text-sm font-semibold mb-3 text-center">Blank tile — pick a letter</p>
        <div className="grid grid-cols-6 gap-1.5">
          {letters.map(l => (
            <button
              key={l}
              onClick={() => onPick(l)}
              className="w-8 h-8 rounded-lg bg-gray-700 hover:bg-purple-600 text-white font-bold text-sm transition-colors"
            >
              {l}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function RackTile({ tile, selected, onClick, disabled }) {
  const isBlank = tile === '?';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`relative flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center font-black text-lg transition-all
        ${selected ? 'ring-2 ring-yellow-400 -translate-y-2 shadow-xl' : 'hover:-translate-y-1'}
        ${disabled ? 'opacity-40' : 'cursor-pointer'}`}
      style={{
        background: 'linear-gradient(135deg,#fde68a,#f59e0b)',
        color: '#3f2d00',
        boxShadow: selected ? '0 8px 20px rgba(0,0,0,0.5)' : '0 2px 6px rgba(0,0,0,0.4)',
      }}
    >
      {isBlank ? '' : tile}
      <span className="absolute bottom-0.5 right-1 text-[8px] font-bold opacity-70">
        {isBlank ? '' : TILE_VALUES[tile] ?? ''}
      </span>
    </button>
  );
}

export default function WordsmithGame({ gameState, players, currentUserId, myHand, onMove, onClose, onEndGame, onPostResult, gameErrorMsg, gameErrorKey }) {
  const gs = gameState?.game_state || {};
  const board = gs.board || [];
  const scores = gs.scores || {};
  const rackCounts = gs.rack_counts || {};
  const bagCount = gs.bag_count ?? 0;
  const lastWord = gs.last_word || '';
  const lastScore = gs.last_score || 0;
  const lastPlayerId = gs.last_player_id;

  const isOver = ['finished', 'completed', 'forfeited'].includes(gameState?.status || '');
  const currentTurnIdx = gameState?.current_turn ?? 0;
  const currentTurnPlayer = players?.[currentTurnIdx];
  const isMyTurn = !isOver && currentTurnPlayer?.user_id === currentUserId;

  const rack = myHand || [];
  const [selectedRackIdx, setSelectedRackIdx] = useState(null);
  const [pending, setPending] = useState([]); // [{row, col, tile, letter?, rackIdx}]
  const [blankPromptFor, setBlankPromptFor] = useState(null); // {row, col} awaiting a letter

  // ── Invalid-move banner + "Insist Upon Word" ──────────────────────────────
  // `pending` is deliberately NOT cleared the moment a placement is submitted
  // (unlike the old behavior) — it now stays on the board until the server
  // actually confirms acceptance, so a rejected word's tiles stay visible for
  // the player to either insist on or recall, instead of vanishing on submit.
  const [submitting, setSubmitting]         = useState(false);
  const [insisting, setInsisting]           = useState(false);
  const [insistAttempted, setInsistAttempted] = useState(false);
  const [errorBanner, setErrorBanner]       = useState(null); // { message, canInsist }
  const lastSubmittedRef    = useRef(null); // placements array of the most recent place/insist attempt
  const pendingRef          = useRef(pending);
  pendingRef.current = pending;
  const insistAttemptedRef  = useRef(insistAttempted);
  insistAttemptedRef.current = insistAttempted;
  const lastHandledErrorKeyRef = useRef(gameErrorKey);
  const lastSuccessRef = useRef({ word: lastWord, playerId: lastPlayerId });

  // A fresh server-rejected-move error arrives → if it's plausibly about my
  // own in-flight placement (I have pending tiles down), surface the banner.
  useEffect(() => {
    if (gameErrorKey === lastHandledErrorKeyRef.current) return;
    lastHandledErrorKeyRef.current = gameErrorKey;
    setSubmitting(false);
    setInsisting(false);
    if (pendingRef.current.length === 0) return;
    const canInsist = !insistAttemptedRef.current && /is not a valid word/i.test(gameErrorMsg || '');
    setErrorBanner({ message: gameErrorMsg, canInsist });
  }, [gameErrorKey, gameErrorMsg]);

  // My own placement (or insist) was actually accepted the moment last_word/
  // last_player_id change to reflect a move by me — clear pending + banner.
  useEffect(() => {
    if (lastWord === lastSuccessRef.current.word && lastPlayerId === lastSuccessRef.current.playerId) return;
    lastSuccessRef.current = { word: lastWord, playerId: lastPlayerId };
    if (lastPlayerId !== currentUserId) return;
    setPending([]);
    setSelectedRackIdx(null);
    setSubmitting(false);
    setInsisting(false);
    setInsistAttempted(false);
    setErrorBanner(null);
    lastSubmittedRef.current = null;
  }, [lastWord, lastPlayerId, currentUserId]);

  const pendingByCell = useMemo(() => {
    const m = new Map();
    pending.forEach(p => m.set(cellIdx(p.row, p.col), p));
    return m;
  }, [pending]);

  const usedRackIdxs = useMemo(() => new Set(pending.map(p => p.rackIdx)), [pending]);

  const handleRackTileClick = (idx) => {
    if (!isMyTurn || usedRackIdxs.has(idx)) return;
    setSelectedRackIdx(prev => (prev === idx ? null : idx));
  };

  // Editing the placement after a rejection invalidates whatever banner/
  // insist state was tied to the old attempt.
  const clearBannerState = () => {
    if (errorBanner) setErrorBanner(null);
    setInsistAttempted(false);
  };

  const handleCellClick = (row, col) => {
    if (!isMyTurn) return;
    const idx = cellIdx(row, col);
    const boardOccupied = !!board[idx];
    const pendingHere = pendingByCell.get(idx);

    if (pendingHere) {
      // Tap an already-pending cell to pick it back up.
      setPending(prev => prev.filter(p => cellIdx(p.row, p.col) !== idx));
      clearBannerState();
      return;
    }
    if (boardOccupied) return;
    if (selectedRackIdx === null) return;

    const tile = rack[selectedRackIdx];
    if (tile === '?') {
      setBlankPromptFor({ row, col, rackIdx: selectedRackIdx, tile });
      return;
    }
    setPending(prev => [...prev, { row, col, tile, rackIdx: selectedRackIdx }]);
    setSelectedRackIdx(null);
    clearBannerState();
  };

  const confirmBlankLetter = (letter) => {
    if (!blankPromptFor) return;
    setPending(prev => [...prev, { ...blankPromptFor, letter }]);
    setBlankPromptFor(null);
    setSelectedRackIdx(null);
    clearBannerState();
  };

  const recallAll = () => {
    setPending([]);
    setSelectedRackIdx(null);
    setErrorBanner(null);
    setInsistAttempted(false);
    setInsisting(false);
    setSubmitting(false);
    lastSubmittedRef.current = null;
  };

  const submitWord = () => {
    if (pending.length === 0 || submitting) return;
    const placements = pending.map(p => ({
      row: p.row, col: p.col, tile: p.tile,
      ...(p.tile === '?' ? { letter: p.letter } : {}),
    }));
    lastSubmittedRef.current = placements;
    setInsistAttempted(false);
    setErrorBanner(null);
    setSubmitting(true);
    onMove({ move_type: 'place', placements });
  };

  const handleInsist = () => {
    if (!lastSubmittedRef.current || insisting) return;
    setInsisting(true);
    setInsistAttempted(true);
    setErrorBanner(null);
    onMove({ move_type: 'insist', placements: lastSubmittedRef.current });
  };

  const passTurn = () => {
    recallAll();
    onMove({ move_type: 'pass' });
  };

  const [exchanging, setExchanging] = useState(false);
  const [exchangeSet, setExchangeSet] = useState(new Set());
  const toggleExchangeTile = (idx) => {
    setExchangeSet(prev => {
      const n = new Set(prev);
      n.has(idx) ? n.delete(idx) : n.add(idx);
      return n;
    });
  };
  const submitExchange = () => {
    if (exchangeSet.size === 0) return;
    onMove({ move_type: 'exchange', tiles: [...exchangeSet].map(i => rack[i]) });
    setExchangeSet(new Set());
    setExchanging(false);
  };

  const winner = gameState?.winner_id
    ? (players.find(p => p.user_id === gameState.winner_id) || 'draw')
    : 'draw';
  const gameStats = {
    lines: players.map(p => ({
      label: p.username,
      value: `${Math.round(Number(scores[String(p.user_id)]) || 0)} pts`,
    })),
  };

  const endOrLeave = () => {
    const isHostUser = (gameState?.host_id ?? players?.[0]?.user_id) === currentUserId;
    if (isHostUser && onEndGame) onEndGame();
    else onClose();
  };

  return (
    <>
      {isOver && (
        <GameWinnerBanner
          winner={winner === 'draw' ? null : winner}
          players={players}
          gameType="wordsmith"
          gameStats={gameStats}
          isForfeit={gameState?.status === 'forfeited'}
          onClose={onClose}
          onPostResult={onPostResult}
        />
      )}

      <div className="fixed inset-0 z-50 flex flex-col bg-gray-950">
        <style>{`
          @keyframes wordsmithBannerIn {
            0%   { opacity:0; transform:translate(-50%,-50%) scale(0.82); }
            100% { opacity:1; transform:translate(-50%,-50%) scale(1); }
          }
        `}</style>

        {blankPromptFor && (
          <BlankLetterPicker onPick={confirmBlankLetter} onCancel={() => setBlankPromptFor(null)} />
        )}

        {/* ── Invalid-move banner — mirrors WhotGame's Pick-2/Pick-3 event
            announcements visually, but stays open (real actions attached)
            instead of auto-dismissing. ── */}
        {errorBanner && (
          <div
            style={{
              position: 'absolute', top: '38%', left: '50%',
              zIndex: 65,
              animation: 'wordsmithBannerIn 0.4s cubic-bezier(0.34,1.56,0.64,1) forwards',
            }}
          >
            <div style={{
              background: 'linear-gradient(135deg,#b91c1c,#7f1d1d)',
              borderRadius: 20,
              padding: '18px 26px',
              textAlign: 'center',
              boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
              border: '1.5px solid rgba(255,255,255,0.2)',
              minWidth: 240, maxWidth: 320,
            }}>
              <div style={{ fontSize: 40, lineHeight: 1, marginBottom: 8 }}>⚠️</div>
              <div style={{
                color: '#fff', fontSize: 18, fontWeight: 900,
                letterSpacing: 0.3, lineHeight: 1.25,
                textShadow: '0 2px 10px rgba(0,0,0,0.5)',
              }}>
                Invalid Move
              </div>
              <div style={{
                color: 'rgba(255,255,255,0.85)', fontSize: 12.5,
                marginTop: 6, fontWeight: 600, lineHeight: 1.4,
              }}>
                {errorBanner.message}
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 14, flexWrap: 'wrap' }}>
                {errorBanner.canInsist && (
                  <button
                    onClick={handleInsist}
                    disabled={insisting}
                    className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-black text-xs font-bold rounded-lg transition-colors"
                  >
                    {insisting ? 'Checking dictionary…' : 'Insist Upon Word'}
                  </button>
                )}
                <button
                  onClick={recallAll}
                  className="px-3 py-1.5 bg-white/15 hover:bg-white/25 text-white text-xs font-semibold rounded-lg transition-colors"
                >
                  Recall
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-gray-900 border-b border-gray-800 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-white font-bold text-lg">Wordsmith</span>
            <span className="text-gray-500 text-xs">{bagCount} in bag</span>
          </div>
          <div className="flex items-center gap-2">
            <GameRulesButton gameType="wordsmith" className="text-gray-400 hover:text-white" />
            {!isOver && (
              <button
                onClick={endOrLeave}
                className="px-3 py-1 bg-red-700 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                End Game
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-white p-1"><X size={18} /></button>
          </div>
        </div>

        {/* Scores row */}
        <div className="flex gap-2 px-4 py-2 overflow-x-auto bg-gray-900/50 border-b border-gray-800 flex-shrink-0">
          {players.map(p => {
            const isTheirTurn = currentTurnPlayer?.user_id === p.user_id;
            return (
              <div key={p.user_id} className={`flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs flex-shrink-0
                ${isTheirTurn ? 'bg-purple-800/60 ring-1 ring-purple-400' : 'bg-gray-800/50'}`}>
                <span className="text-gray-300 font-semibold">{p.username}</span>
                <span className="text-yellow-300 font-bold">{Math.round(Number(scores[String(p.user_id)]) || 0)}</span>
                <span className="text-gray-500">({rackCounts[String(p.user_id)] ?? 0})</span>
              </div>
            );
          })}
        </div>

        {lastWord && (
          <div className="text-center py-1 flex-shrink-0">
            <span className="text-gray-400 text-xs">
              {players.find(p => p.user_id === lastPlayerId)?.username || 'Someone'} played <b className="text-white">{lastWord}</b> for {lastScore} pts
            </span>
          </div>
        )}

        {/* Board */}
        <div className="flex-1 flex items-center justify-center overflow-auto p-2 min-h-0">
          <div
            className="grid aspect-square"
            style={{
              gridTemplateColumns: `repeat(${BOARD_SIZE}, minmax(0,1fr))`,
              width: 'min(92vw, 60vh, 600px)',
              gap: 1,
              background: '#1a0533',
              border: '2px solid #6d28d9',
              borderRadius: 6,
              padding: 3,
            }}
          >
            {Array.from({ length: BOARD_SIZE }, (_, row) =>
              Array.from({ length: BOARD_SIZE }, (_, col) => {
                const idx = cellIdx(row, col);
                const letter = board[idx];
                const pendingHere = pendingByCell.get(idx);
                const layoutCh = LAYOUT[row][col];
                const premium = PREMIUM_STYLE[layoutCh];
                const bg = pendingHere
                  ? 'linear-gradient(135deg,#fde68a,#f59e0b)'
                  : letter
                    ? 'linear-gradient(135deg,#fde68a,#f59e0b)'
                    : premium
                      ? premium.bg
                      : '#f1f5f9';
                return (
                  <div
                    key={idx}
                    onClick={() => handleCellClick(row, col)}
                    className="relative flex items-center justify-center font-bold select-none"
                    style={{
                      background: bg,
                      opacity: letter || pendingHere ? 1 : premium ? 0.85 : 1,
                      borderRadius: 2,
                      cursor: isMyTurn && !letter ? 'pointer' : 'default',
                      color: letter || pendingHere ? '#3f2d00' : premium ? '#fff' : '#94a3b8',
                      fontSize: 'clamp(7px, 1.6vw, 15px)',
                      outline: pendingHere ? '2px solid #facc15' : 'none',
                      outlineOffset: -2,
                    }}
                  >
                    {letter
                      ? letter.toUpperCase()
                      : pendingHere
                        ? (pendingHere.letter || pendingHere.tile)
                        : premium
                          ? premium.label
                          : ''}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Rack + controls */}
        {!isOver && (
          <div className="bg-gray-900/80 border-t border-gray-800 px-3 py-3 flex-shrink-0">
            {/* Rack — always visible, even on the opponent's turn, so a player can
                plan their next move ahead of time. The backend pushes a fresh
                hand_update the instant your own move resolves (not gated on whose
                turn it is), so `rack` already reflects your post-move tiles the
                whole time — this just stops hiding that. Only interactive
                (selectable) on your own turn; a plain read-only tile otherwise. */}
            {!isMyTurn && (
              <p className="text-center text-gray-500 text-[10px] mb-1.5">Your tiles — plan your next move</p>
            )}
            <div className="flex items-center justify-center gap-1.5 mb-3 flex-wrap">
              {rack.map((tile, i) => (
                !isMyTurn ? (
                  <div
                    key={i}
                    className="relative flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center font-black text-lg opacity-70 cursor-default"
                    style={{ background: 'linear-gradient(135deg,#fde68a,#f59e0b)', color: '#3f2d00' }}
                  >
                    {tile === '?' ? '' : tile}
                    <span className="absolute bottom-0.5 right-1 text-[8px] font-bold opacity-70">
                      {tile === '?' ? '' : TILE_VALUES[tile] ?? ''}
                    </span>
                  </div>
                ) : exchanging ? (
                  <button
                    key={i}
                    onClick={() => toggleExchangeTile(i)}
                    className={`relative flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center font-black text-lg transition-all
                      ${exchangeSet.has(i) ? 'ring-2 ring-red-400 -translate-y-2 shadow-xl' : 'hover:-translate-y-1'}`}
                    style={{
                      background: 'linear-gradient(135deg,#fde68a,#f59e0b)',
                      color: '#3f2d00',
                      boxShadow: exchangeSet.has(i) ? '0 8px 20px rgba(220,38,38,0.5)' : '0 2px 6px rgba(0,0,0,0.4)',
                    }}
                  >
                    {tile === '?' ? '' : tile}
                    {exchangeSet.has(i) && (
                      <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center shadow">✕</span>
                    )}
                  </button>
                ) : (
                  <RackTile
                    key={i}
                    tile={tile}
                    selected={selectedRackIdx === i}
                    disabled={usedRackIdxs.has(i)}
                    onClick={() => handleRackTileClick(i)}
                  />
                )
              ))}
            </div>

            {isMyTurn ? (
              exchanging ? (
                <div className="flex flex-col items-center gap-2">
                  <p className="text-amber-300 text-xs font-semibold text-center">
                    {exchangeSet.size === 0
                      ? 'Tap tiles above to mark them for exchange'
                      : `${exchangeSet.size} tile${exchangeSet.size > 1 ? 's' : ''} marked — tap Exchange to confirm and end your turn`}
                  </p>
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={submitExchange}
                      disabled={exchangeSet.size === 0}
                      className="flex items-center gap-1.5 px-5 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-all shadow-lg"
                    >
                      <Shuffle size={15} /> {exchangeSet.size > 0 ? `Exchange ${exchangeSet.size} →` : 'Exchange'}
                    </button>
                    <button
                      onClick={() => { setExchanging(false); setExchangeSet(new Set()); }}
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-semibold rounded-xl transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  <button
                    onClick={submitWord}
                    disabled={pending.length === 0 || submitting}
                    className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-colors"
                  >
                    <Send size={15} /> {submitting ? 'Playing…' : 'Play Word'}
                  </button>
                  <button
                    onClick={recallAll}
                    disabled={pending.length === 0}
                    className="flex items-center gap-1.5 px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors"
                  >
                    <RotateCcw size={15} /> Recall
                  </button>
                  <button
                    onClick={() => setExchanging(true)}
                    disabled={pending.length > 0 || bagCount === 0}
                    title={bagCount === 0 ? 'Bag is empty' : 'Swap tiles for new ones'}
                    className="flex items-center gap-1.5 px-3 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white text-sm font-semibold rounded-xl transition-colors"
                  >
                    <Shuffle size={15} /> Exchange
                  </button>
                  <button
                    onClick={passTurn}
                    className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-semibold rounded-xl transition-colors"
                  >
                    Pass
                  </button>
                </div>
              )
            ) : (
              <p className="text-center text-gray-400 text-sm py-2">
                Waiting for {currentTurnPlayer?.username || 'the next player'}…
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
}
