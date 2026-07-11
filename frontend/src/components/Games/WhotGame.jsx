// src/components/Games/WhotGame.jsx
import { useState } from 'react';
import { X } from 'lucide-react';

// Whot suit display: Circle, Triangle, Cross, Square, Star
const SUIT_SYMBOLS = { C: '○', T: '△', X: '✚', Q: '□', S: '★' };
const SUIT_NAMES   = { C: 'Circle', T: 'Triangle', X: 'Cross', Q: 'Square', S: 'Star' };
const SUIT_COLORS  = {
  C: 'text-blue-400',
  T: 'text-green-400',
  X: 'text-red-400',
  Q: 'text-yellow-400',
  S: 'text-purple-400',
};
const SPECIAL_LABELS = { '1': 'Hold On', '2': 'Pick 2', '5': 'Pick 3', '8': 'Hold On', '14': 'Market', W: 'Whot!' };

function parseCard(card) {
  if (!card) return { num: '', suit: '' };
  if (card === 'W') return { num: 'W', suit: '' };
  return { num: card.slice(0, -1), suit: card.slice(-1) };
}

function WhotCard({ card, faceDown, onClick, dimmed, selected }) {
  if (faceDown) {
    return (
      <div className="w-11 h-16 sm:w-13 sm:h-18 rounded-lg bg-gradient-to-br from-green-800 to-green-950 border-2 border-green-600/40 shadow-md flex items-center justify-center shrink-0">
        <span className="text-green-500/60 text-lg font-bold">W</span>
      </div>
    );
  }

  const { num, suit } = parseCard(card);
  const isWild = num === 'W';
  const isSpecial = SPECIAL_LABELS[num] && !isWild;
  const suitColor = isWild ? 'text-yellow-400' : (SUIT_COLORS[suit] || 'text-gray-300');
  const label = isWild ? 'Whot!' : SPECIAL_LABELS[num] || '';

  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={[
        'w-11 h-16 sm:w-13 sm:h-20 rounded-lg shadow-md flex flex-col items-center justify-center font-bold shrink-0 transition-transform border-2',
        isWild
          ? 'bg-yellow-950 border-yellow-500/60'
          : 'bg-gray-800 border-gray-600',
        dimmed ? 'opacity-35' : '',
        selected ? 'ring-2 ring-white scale-105' : '',
        onClick ? 'cursor-pointer hover:-translate-y-1' : 'cursor-default',
      ].join(' ')}
    >
      <span className={`text-xs font-bold leading-none ${suitColor}`}>{SUIT_SYMBOLS[suit] || '✦'}</span>
      <span className="text-white text-sm sm:text-base leading-none mt-0.5">{isWild ? '20' : num}</span>
      {label && <span className={`text-[9px] leading-none mt-0.5 ${suitColor}`}>{label}</span>}
    </button>
  );
}

export default function WhotGame({ gameState, players = [], currentUserId, myHand, onMove, onClose, onEndGame }) {
  const [pendingWild, setPendingWild] = useState(null);

  const gs = gameState?.game_state || {};
  const discardTop    = gs.discard_top || null;
  const currentSuit   = gs.current_suit || (discardTop && discardTop !== 'W' ? discardTop.slice(-1) : null);
  const drawPileCount = gs.draw_pile_count ?? 0;
  const handCounts    = gs.hand_counts || {};
  const pendingPick   = gs.pending_pick ?? 0;

  const currentTurn  = gameState?.current_turn ?? 0;
  const currentPlayer = players[currentTurn];
  const isMyTurn  = currentPlayer?.user_id === currentUserId;
  const isPlayer  = players.some(p => p.user_id === currentUserId);
  const winner    = gameState?.winner_id ? players.find(p => p.user_id === gameState.winner_id) : null;
  const isOver    = ['finished', 'forfeited', 'completed'].includes(gameState?.status);

  const hand = myHand || [];

  const canPlay = (card) => {
    if (!discardTop) return true;
    if (card === 'W') return true;
    const { num, suit } = parseCard(card);
    if (pendingPick > 0) return num === '2' || num === '5';
    const topNum = discardTop === 'W' ? '' : discardTop.slice(0, -1);
    return suit === currentSuit || (topNum && num === topNum);
  };

  const handlePlay = (card) => {
    if (!isMyTurn || isOver) return;
    if (card === 'W') {
      setPendingWild(card);
      return;
    }
    onMove({ move_type: 'play', card });
  };

  const chooseSuit = (suit) => {
    if (!pendingWild) return;
    onMove({ move_type: 'play', card: pendingWild, next_suit: suit });
    setPendingWild(null);
  };

  const handleDraw = () => {
    if (!isMyTurn || isOver) return;
    onMove({ move_type: 'draw' });
  };

  const handleForfeit = () => {
    if (winner || isOver) { onClose(); return; }
    (onEndGame || onClose)();
  };

  const { num: topNum, suit: topSuit } = parseCard(discardTop);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm">
      <div className="relative bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
          <div>
            <h2 className="text-white text-xl font-bold">Whot!</h2>
            <p className="text-gray-400 text-sm">{players.map(p => p.username).join(' · ')}</p>
          </div>
          <button onClick={handleForfeit} className="text-gray-400 hover:text-white" title={winner || isOver ? 'Close' : 'End Game'}>
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Opponent hands */}
        <div className="flex items-center justify-center gap-3 px-4 py-3 flex-wrap">
          {players.filter(p => p.user_id !== currentUserId).map(p => {
            const count = handCounts[String(p.user_id)] ?? 0;
            const isActive = currentPlayer?.user_id === p.user_id;
            return (
              <div key={p.user_id}
                className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg ${isActive ? 'bg-green-900/40 ring-2 ring-green-500' : 'bg-gray-800/50'}`}>
                <span className="text-white text-sm font-medium">{p.username}</span>
                <div className="flex -space-x-5">
                  {Array.from({ length: Math.min(count, 6) }).map((_, i) => <WhotCard key={i} faceDown />)}
                </div>
                <span className="text-gray-400 text-xs">{count} card{count !== 1 ? 's' : ''}</span>
              </div>
            );
          })}
        </div>

        {/* Table: draw pile + discard */}
        <div className="flex items-center justify-center gap-8 py-5">
          <div className="flex flex-col items-center gap-1.5">
            <button onClick={handleDraw} disabled={!isMyTurn || isOver}
              className={!isMyTurn || isOver ? 'cursor-default' : 'cursor-pointer'}>
              <WhotCard faceDown />
            </button>
            <span className="text-gray-400 text-xs">{drawPileCount} left</span>
          </div>
          <div className="flex flex-col items-center gap-1.5">
            {discardTop ? (
              <WhotCard card={discardTop} />
            ) : (
              <div className="w-11 h-16 rounded-lg border-2 border-dashed border-gray-600 flex items-center justify-center">
                <span className="text-gray-600 text-xs">Empty</span>
              </div>
            )}
            {currentSuit && (
              <span className={`text-xs font-medium ${SUIT_COLORS[currentSuit]}`}>
                {SUIT_SYMBOLS[currentSuit]} {SUIT_NAMES[currentSuit]}
              </span>
            )}
            {pendingPick > 0 && (
              <span className="text-xs text-red-400 font-semibold">+{pendingPick} pending</span>
            )}
          </div>
        </div>

        {/* Turn indicator / game over */}
        <div className="text-center pb-2">
          {isOver ? (
            <p className="text-lg font-semibold text-white">
              {winner ? `🏆 ${winner.username} wins!` : "🤝 It's a draw!"}
            </p>
          ) : (
            <p className={`text-sm font-medium ${isMyTurn ? 'text-green-400' : 'text-gray-400'}`}>
              {isMyTurn ? 'Your turn' : `${currentPlayer?.username}'s turn`}
            </p>
          )}
        </div>

        {/* Player's hand */}
        {isPlayer && (
          <div className="px-4 pb-4">
            <div className="flex items-center justify-center gap-1.5 flex-wrap">
              {hand.map((card, i) => (
                <WhotCard
                  key={`${card}-${i}`}
                  card={card}
                  dimmed={isMyTurn && !isOver && !canPlay(card)}
                  onClick={isMyTurn && !isOver ? () => handlePlay(card) : undefined}
                />
              ))}
            </div>
            {hand.length === 0 && !isOver && (
              <p className="text-center text-gray-500 text-sm mt-2">No cards — you win!</p>
            )}
          </div>
        )}

        {/* Forfeit */}
        {!isOver && (
          <div className="flex justify-end px-5 pb-5">
            <button onClick={handleForfeit}
              className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium">
              Forfeit
            </button>
          </div>
        )}

        {/* Wild suit picker overlay */}
        {pendingWild && (
          <div className="absolute inset-0 bg-black/85 flex items-center justify-center rounded-2xl">
            <div className="bg-gray-800 rounded-xl p-5 flex flex-col items-center gap-3">
              <p className="text-white font-medium">Call a suit (Whot!)</p>
              <div className="flex gap-2 flex-wrap justify-center">
                {whotSuitOrder.map(suit => (
                  <button key={suit} onClick={() => chooseSuit(suit)}
                    className="flex flex-col items-center gap-1 w-14 h-14 rounded-xl bg-gray-700 hover:bg-gray-600 justify-center">
                    <span className={`text-2xl ${SUIT_COLORS[suit]}`}>{SUIT_SYMBOLS[suit]}</span>
                    <span className="text-gray-300 text-[10px]">{SUIT_NAMES[suit]}</span>
                  </button>
                ))}
              </div>
              <button onClick={() => setPendingWild(null)} className="text-gray-400 text-sm mt-1">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const whotSuitOrder = ['C', 'T', 'X', 'Q', 'S'];
