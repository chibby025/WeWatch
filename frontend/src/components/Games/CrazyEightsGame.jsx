// src/components/Games/CrazyEightsGame.jsx
import { useState } from 'react';
import { X } from 'lucide-react';

const SUIT_SYMBOLS = { S: '♠', H: '♥', D: '♦', C: '♣' };
const RED_SUITS = ['H', 'D'];

function parseCard(card) {
  if (!card) return { rank: '', suit: '' };
  return { rank: card.slice(0, -1), suit: card.slice(-1) };
}

function Card({ card, faceDown, onClick, dimmed }) {
  if (faceDown) {
    return (
      <div className="w-12 h-16 sm:w-14 sm:h-20 rounded-lg bg-gradient-to-br from-blue-700 to-blue-900 border-2 border-blue-400/40 shadow-md flex items-center justify-center shrink-0">
        <div className="w-6 h-6 rounded-full bg-blue-400/20" />
      </div>
    );
  }
  const { rank, suit } = parseCard(card);
  const isRed = RED_SUITS.includes(suit);
  return (
    <button
      onClick={onClick}
      disabled={!onClick}
      className={`w-12 h-16 sm:w-14 sm:h-20 rounded-lg bg-white border-2 shadow-md flex flex-col items-center justify-center font-bold shrink-0 transition-transform ${
        isRed ? 'text-red-600' : 'text-gray-900'
      } ${dimmed ? 'opacity-40' : ''} ${onClick ? 'cursor-pointer hover:-translate-y-1 border-gray-300' : 'cursor-default border-gray-300'}`}
    >
      <span className="text-sm sm:text-base leading-none">{rank}</span>
      <span className="text-lg sm:text-xl leading-none">{SUIT_SYMBOLS[suit]}</span>
    </button>
  );
}

export default function CrazyEightsGame({ gameState, players = [], currentUserId, myHand, onMove, onClose, onEndGame }) {
  const [pendingEight, setPendingEight] = useState(null);

  const gs = gameState?.game_state || {};
  const discardTop = gs.discard_top || null;
  const currentSuit = gs.current_suit || (discardTop ? parseCard(discardTop).suit : null);
  const drawPileCount = gs.draw_pile_count ?? 0;
  const handCounts = gs.hand_counts || {};

  const currentTurn = gameState?.current_turn ?? 0;
  const currentPlayer = players[currentTurn];
  const isMyTurn = currentPlayer?.user_id === currentUserId;
  const isPlayer = players.some(p => p.user_id === currentUserId);
  const winner = gameState?.winner_id ? players.find(p => p.user_id === gameState.winner_id) : null;
  const isOver = ['finished', 'forfeited', 'completed'].includes(gameState?.status);

  const hand = myHand || [];

  const canPlay = (card) => {
    if (!discardTop) return true;
    const { rank, suit } = parseCard(card);
    if (rank === '8') return true;
    return rank === parseCard(discardTop).rank || suit === currentSuit;
  };

  const handlePlay = (card) => {
    if (!isMyTurn || isOver) return;
    if (parseCard(card).rank === '8') {
      setPendingEight(card);
      return;
    }
    onMove({ move_type: 'play_card', card });
  };

  const chooseSuit = (suit) => {
    if (!pendingEight) return;
    onMove({ move_type: 'play_card', card: pendingEight, next_suit: suit });
    setPendingEight(null);
  };

  const handleDraw = () => {
    if (!isMyTurn || isOver) return;
    onMove({ move_type: 'draw_card' });
  };

  const handleForfeit = () => {
    if (winner || isOver) {
      onClose();
      return;
    }
    (onEndGame || onClose)();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div>
            <h2 className="text-white text-xl font-bold">Crazy Eights</h2>
            <p className="text-gray-400 text-sm">{players.map(p => p.username).join(' vs ')}</p>
          </div>
          <button onClick={handleForfeit} className="text-gray-400 hover:text-white" title={winner || isOver ? 'Close' : 'Forfeit'}>
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex items-center justify-center gap-4 px-5 py-3 flex-wrap">
          {players.filter(p => p.user_id !== currentUserId).map(p => (
            <div
              key={p.user_id}
              className={`flex flex-col items-center gap-1 px-3 py-2 rounded-lg ${
                currentPlayer?.user_id === p.user_id ? 'bg-purple-900/40 ring-2 ring-purple-500' : 'bg-gray-800/50'
              }`}
            >
              <span className="text-white text-sm font-medium">{p.username}</span>
              <div className="flex -space-x-6">
                {Array.from({ length: Math.min(handCounts[String(p.user_id)] ?? 0, 7) }).map((_, i) => (
                  <Card key={i} faceDown />
                ))}
              </div>
              <span className="text-gray-400 text-xs">{handCounts[String(p.user_id)] ?? 0} cards</span>
            </div>
          ))}
        </div>

        <div className="flex items-center justify-center gap-8 py-6">
          <div className="flex flex-col items-center gap-2">
            <button onClick={handleDraw} disabled={!isMyTurn || isOver} className={!isMyTurn || isOver ? 'cursor-default' : 'cursor-pointer'}>
              <Card faceDown />
            </button>
            <span className="text-gray-400 text-xs">{drawPileCount} left</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <Card card={discardTop} />
            <span className="text-gray-400 text-xs">{currentSuit ? `Suit: ${SUIT_SYMBOLS[currentSuit] || currentSuit}` : ''}</span>
          </div>
        </div>

        <div className="text-center pb-3">
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

        {isPlayer && (
          <div className="px-5 pb-5">
            <div className="flex items-center justify-center gap-1.5 flex-wrap">
              {hand.map((card, i) => (
                <Card
                  key={`${card}-${i}`}
                  card={card}
                  dimmed={isMyTurn && !isOver && !canPlay(card)}
                  onClick={isMyTurn && !isOver ? () => handlePlay(card) : undefined}
                />
              ))}
            </div>
            {hand.length === 0 && !isOver && (
              <p className="text-center text-gray-500 text-sm mt-2">No cards left</p>
            )}
          </div>
        )}

        {!isOver && (
          <div className="flex justify-end px-5 pb-5">
            <button onClick={handleForfeit} className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium">
              Forfeit
            </button>
          </div>
        )}

        {pendingEight && (
          <div className="absolute inset-0 bg-black/80 flex items-center justify-center rounded-2xl">
            <div className="bg-gray-800 rounded-xl p-5 flex flex-col items-center gap-3">
              <p className="text-white font-medium">Choose a suit</p>
              <div className="flex gap-3">
                {Object.entries(SUIT_SYMBOLS).map(([suit, symbol]) => (
                  <button
                    key={suit}
                    onClick={() => chooseSuit(suit)}
                    className={`w-12 h-12 rounded-full bg-gray-700 hover:bg-gray-600 flex items-center justify-center text-2xl ${
                      RED_SUITS.includes(suit) ? 'text-red-500' : 'text-white'
                    }`}
                  >
                    {symbol}
                  </button>
                ))}
              </div>
              <button onClick={() => setPendingEight(null)} className="text-gray-400 text-sm mt-1">Cancel</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
