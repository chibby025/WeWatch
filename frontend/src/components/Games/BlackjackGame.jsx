import { X, Trophy } from 'lucide-react';

// Blackjack — each player plays their own hand against a shared dealer. No betting.
// Card contents are public (matches how it's played at a table); only the dealer's
// hole card is hidden until the dealer turn. Turn-based hit/stand/double.

const SUIT_SYMBOL = { S: '♠', H: '♥', D: '♦', C: '♣' };
const isRed = (suit) => suit === 'H' || suit === 'D';

function cardParts(card) {
  const suit = card.slice(-1);
  const rank = card.slice(0, -1);
  return { rank, suit };
}

function Card({ card, faceDown }) {
  if (faceDown || !card) {
    return (
      <div className="w-12 h-16 sm:w-14 sm:h-20 rounded-lg bg-gradient-to-br from-blue-800 to-indigo-900 border border-blue-600 flex items-center justify-center text-2xl text-blue-300 shadow-md">
        🂠
      </div>
    );
  }
  const { rank, suit } = cardParts(card);
  return (
    <div className="w-12 h-16 sm:w-14 sm:h-20 rounded-lg bg-white border border-gray-300 flex flex-col items-center justify-center shadow-md relative">
      <span className={`text-base sm:text-lg font-bold ${isRed(suit) ? 'text-red-600' : 'text-gray-900'}`}>{rank}</span>
      <span className={`text-lg sm:text-xl ${isRed(suit) ? 'text-red-600' : 'text-gray-900'}`}>{SUIT_SYMBOL[suit]}</span>
    </div>
  );
}

const STATUS_CHIP = {
  playing: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  stood:   'bg-gray-500/20 text-gray-300 border-gray-500/40',
  bust:    'bg-red-500/20 text-red-300 border-red-500/40',
  won:     'bg-green-500/20 text-green-300 border-green-500/40',
  lost:    'bg-red-500/20 text-red-300 border-red-500/40',
  push:    'bg-yellow-500/20 text-yellow-300 border-yellow-500/40',
};
const STATUS_LABEL = {
  playing: 'Playing', stood: 'Stood', bust: 'Bust',
  won: 'Won', lost: 'Lost', push: 'Push',
};

export default function BlackjackGame({ gameState, players, currentUserId, onMove, onClose, onEndGame }) {
  const gs = gameState?.game_state || {};
  const phase = gs.phase || 'player_turns';
  const playerHands = gs.player_hands || {};
  const handValues = gs.hand_values || {};
  const statuses = gs.player_statuses || {};
  const dealerVisible = gs.dealer_visible || null;
  const dealerHand = gs.dealer_hand || null;
  const dealerValue = gs.dealer_value ?? 0;

  const isHostUser = (gameState?.host_id ?? players?.[0]?.user_id) === currentUserId;
  const finished = phase === 'results' || gameState?.status === 'finished';
  const revealDealer = phase === 'dealer_turn' || phase === 'results';

  // current_turn is the index into players (from the backend's CurrentTurn).
  const currentTurnIdx = gameState?.current_turn ?? 0;
  const currentTurnPlayer = players?.[currentTurnIdx];
  const isMyTurn = phase === 'player_turns' && currentTurnPlayer?.user_id === currentUserId;

  const myStatus = statuses[String(currentUserId)] || 'playing';

  const winner = gameState?.winner_id != null
    ? (players || []).find(p => p.user_id === gameState.winner_id)
    : null;

  const endOrLeave = () => {
    if (isHostUser && onEndGame) onEndGame();
    else onClose();
  };

  const others = (players || []).filter(p => p.user_id !== currentUserId);
  const me = (players || []).find(p => p.user_id === currentUserId);

  const renderHand = (userId) => (playerHands[String(userId)] || []).map((c, i) => <Card key={i} card={c} />);

  return (
    <div className="fixed inset-0 z-[60] bg-green-950/98 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between pl-20 pr-5 py-4 border-b border-green-800/60 flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🃏</span>
          <span className="text-white font-bold text-xl">Blackjack</span>
        </div>
        <button
          onClick={endOrLeave}
          className="text-gray-300 hover:text-white hover:bg-green-800/60 p-1.5 rounded-lg transition-colors"
          title={isHostUser ? 'End game for everyone' : 'Leave game'}
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-6 flex flex-col items-center">
        {/* Dealer */}
        <div className="text-center mb-8">
          <div className="text-gray-300 text-sm font-semibold mb-2 flex items-center justify-center gap-2">
            Dealer
            <span className="text-yellow-300 text-xs">
              {revealDealer ? `(${dealerValue})` : `(${dealerValue}+)`}
            </span>
          </div>
          <div className="flex gap-2 justify-center">
            {revealDealer && dealerHand
              ? dealerHand.map((c, i) => <Card key={i} card={c} />)
              : (
                <>
                  <Card card={dealerVisible} />
                  <Card faceDown />
                </>
              )}
          </div>
        </div>

        {/* Results banner */}
        {finished && (
          <div className="text-center mb-6">
            <div className="text-5xl mb-2">{winner ? '🏆' : '🤝'}</div>
            <h2 className="text-2xl font-bold text-white">
              {winner ? `${winner.username} beats the dealer!` : 'No single winner'}
            </h2>
          </div>
        )}

        {/* My hand */}
        {me && (
          <div className="w-full max-w-lg mb-6">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded-full border border-white/30" style={{ backgroundColor: me.color }} />
                <span className="text-white font-semibold">{me.username} (You)</span>
                <span className="text-yellow-300 text-sm font-bold">{handValues[String(currentUserId)] ?? 0}</span>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_CHIP[myStatus] || STATUS_CHIP.playing}`}>
                {STATUS_LABEL[myStatus] || myStatus}
              </span>
            </div>
            <div className="flex gap-2 flex-wrap bg-green-900/40 rounded-xl p-3">
              {renderHand(currentUserId)}
            </div>

            {/* Action buttons */}
            {isMyTurn && (
              <div className="flex gap-2 mt-3">
                <button
                  onClick={() => onMove({ move_type: 'hit' })}
                  className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors"
                >
                  Hit
                </button>
                <button
                  onClick={() => onMove({ move_type: 'stand' })}
                  className="flex-1 py-2.5 bg-gray-600 hover:bg-gray-700 text-white font-bold rounded-xl transition-colors"
                >
                  Stand
                </button>
                <button
                  onClick={() => onMove({ move_type: 'double' })}
                  className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl transition-colors"
                  title="Take exactly one more card, then stand"
                >
                  Double
                </button>
              </div>
            )}
            {!isMyTurn && phase === 'player_turns' && myStatus === 'playing' && (
              <p className="text-center text-gray-400 text-xs mt-3">
                Waiting for {currentTurnPlayer?.username || 'the current player'}…
              </p>
            )}
          </div>
        )}

        {/* Other players */}
        {others.length > 0 && (
          <div className="w-full max-w-3xl grid grid-cols-1 sm:grid-cols-2 gap-3">
            {others.map(p => {
              const st = statuses[String(p.user_id)] || 'playing';
              const isTheirTurn = phase === 'player_turns' && currentTurnPlayer?.user_id === p.user_id;
              return (
                <div
                  key={p.user_id}
                  className={`bg-green-900/40 rounded-xl p-3 border ${isTheirTurn ? 'border-yellow-400/60' : 'border-transparent'}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-3.5 h-3.5 rounded-full border border-white/30 flex-shrink-0" style={{ backgroundColor: p.color }} />
                      <span className="text-white text-sm truncate">{p.username}</span>
                      <span className="text-yellow-300 text-xs font-bold flex-shrink-0">{handValues[String(p.user_id)] ?? 0}</span>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border flex-shrink-0 ${STATUS_CHIP[st] || STATUS_CHIP.playing}`}>
                      {STATUS_LABEL[st] || st}
                    </span>
                  </div>
                  <div className="flex gap-1 flex-wrap scale-90 origin-left">
                    {(playerHands[String(p.user_id)] || []).map((c, i) => <Card key={i} card={c} />)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer for host / finished */}
      {(finished || isHostUser) && (
        <div className="px-5 py-3 border-t border-green-800/60 flex justify-between flex-shrink-0">
          {isHostUser && !finished ? (
            <button
              onClick={onEndGame}
              className="px-4 py-2 bg-red-600/20 hover:bg-red-600/40 border border-red-500/40 text-red-400 rounded-xl text-sm font-semibold transition-colors"
            >
              End Game
            </button>
          ) : <span />}
          {finished && (
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-bold rounded-xl text-sm transition-all flex items-center gap-2"
            >
              <Trophy className="w-4 h-4" /> Close
            </button>
          )}
        </div>
      )}
    </div>
  );
}
