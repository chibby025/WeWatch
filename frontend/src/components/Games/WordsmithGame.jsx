import { useState, useMemo } from 'react';
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

export default function WordsmithGame({ gameState, players, currentUserId, myHand, onMove, onClose, onEndGame, onPostResult }) {
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

  const handleCellClick = (row, col) => {
    if (!isMyTurn) return;
    const idx = cellIdx(row, col);
    const boardOccupied = !!board[idx];
    const pendingHere = pendingByCell.get(idx);

    if (pendingHere) {
      // Tap an already-pending cell to pick it back up.
      setPending(prev => prev.filter(p => cellIdx(p.row, p.col) !== idx));
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
  };

  const confirmBlankLetter = (letter) => {
    if (!blankPromptFor) return;
    setPending(prev => [...prev, { ...blankPromptFor, letter }]);
    setBlankPromptFor(null);
    setSelectedRackIdx(null);
  };

  const recallAll = () => {
    setPending([]);
    setSelectedRackIdx(null);
  };

  const submitWord = () => {
    if (pending.length === 0) return;
    onMove({
      move_type: 'place',
      placements: pending.map(p => ({
        row: p.row, col: p.col, tile: p.tile,
        ...(p.tile === '?' ? { letter: p.letter } : {}),
      })),
    });
    setPending([]);
    setSelectedRackIdx(null);
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
        {blankPromptFor && (
          <BlankLetterPicker onPick={confirmBlankLetter} onCancel={() => setBlankPromptFor(null)} />
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
            {isMyTurn ? (
              <>
                <div className="flex items-center justify-center gap-1.5 mb-3 flex-wrap">
                  {rack.map((tile, i) => (
                    exchanging ? (
                      <button
                        key={i}
                        onClick={() => toggleExchangeTile(i)}
                        className={`flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 rounded-lg flex items-center justify-center font-black text-lg transition-all ${exchangeSet.has(i) ? 'ring-2 ring-red-400 opacity-50' : ''}`}
                        style={{ background: 'linear-gradient(135deg,#fde68a,#f59e0b)', color: '#3f2d00' }}
                      >
                        {tile === '?' ? '' : tile}
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

                {exchanging ? (
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={submitExchange}
                      disabled={exchangeSet.size === 0}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-sm font-bold rounded-xl transition-colors"
                    >
                      Exchange {exchangeSet.size > 0 ? exchangeSet.size : ''}
                    </button>
                    <button
                      onClick={() => { setExchanging(false); setExchangeSet(new Set()); }}
                      className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm font-semibold rounded-xl transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2 flex-wrap">
                    <button
                      onClick={submitWord}
                      disabled={pending.length === 0}
                      className="flex items-center gap-1.5 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-colors"
                    >
                      <Send size={15} /> Play Word
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
                )}
              </>
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
