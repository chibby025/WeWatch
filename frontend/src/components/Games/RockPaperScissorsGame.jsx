// src/components/Games/RockPaperScissorsGame.jsx
import { useState, useEffect } from 'react';
import { X as CloseIcon, Trophy, Clock } from 'lucide-react';

const choices = [
  { id: 'rock', name: 'Rock', icon: '🪨' },
  { id: 'paper', name: 'Paper', icon: '📄' },
  { id: 'scissors', name: 'Scissors', icon: '✂️' }
];

export default function RockPaperScissorsGame({ gameState, players, currentUserId, onMove, onClose, onEndGame, onPlayAgain }) {
  const [myPick, setMyPick] = useState(null);
  const [countdown, setCountdown] = useState(5);
  const [revealed, setRevealed] = useState(false);
  const [winner, setWinner] = useState(null);

  // BUG FIX (2026-06-24): this was the only one of the four games whose Forfeit
  // button called onClose directly — onClose just dismisses the overlay locally, it
  // never reaches the backend. No winner was ever computed (endGameLocked never ran)
  // and the lobby session-preview poster never cleared (that logic lives inside
  // endGameLocked too). onEndGame sends the real end_game WS message, same as
  // TicTacToe/Chess's forfeit.
  const handleForfeit = () => {
    if (onEndGame) {
      onEndGame();
    } else {
      onClose();
    }
  };

  useEffect(() => {
    const finalPicks = gameState?.game_state?.final_picks;
    const picks = gameState?.game_state?.picks || {};
    const playerIds = (players || []).map(p => String(p.user_id));
    // Reveal if explicit final_picks exist, OR if picks has an entry for every player
    const hasFinalPicks = !!finalPicks || (playerIds.length >= 2 && playerIds.every(id => picks[id]));
    // 'forfeited' is what handleEndGame's optimistic update sets locally, and what the
    // backend's own EndGame(..., "forfeited") broadcasts back — missing it here meant
    // a forfeit was never actually recognized as "over" at all.
    const isOver = gameState?.status === 'finished' || gameState?.status === 'completed' || gameState?.status === 'forfeited';

    // BUG FIX (2026-06-24): a forfeit ends the game (isOver) before both players ever
    // picked, so hasFinalPicks stays false forever in that case — the UI was stuck on
    // the pick-a-choice screen with no way to show the winner/draw banner, and the X/
    // Forfeit buttons (gated on `revealed`) kept calling handleForfeit again on a game
    // that had already ended, which the backend silently rejects ("no active game"),
    // looking exactly like "the X button doesn't work."
    if (hasFinalPicks || isOver) {
      setRevealed(true);
    }

    if (isOver) {
      const winnerId = gameState.winner_id;
      if (!winnerId) {
        setWinner('draw');
      } else {
        setWinner(players.find(p => p.user_id === winnerId) || 'draw');
      }
    }
  }, [gameState, players]);

  // Countdown timer
  useEffect(() => {
    if (revealed || myPick) return;
    
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown, revealed, myPick]);

  const handlePick = (choice) => {
    if (myPick || revealed) return;
    setMyPick(choice);
    onMove({ pick: choice });
  };

  const isHost = players?.[0]?.user_id === currentUserId;

  const getPlayerPick = (userId) => {
    if (!revealed) return null;
    const key = String(userId);
    const src = gameState?.game_state?.final_picks || gameState?.game_state?.picks;
    return src?.[key] || null;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div>
            <h2 className="text-2xl font-bold text-white mb-1">Rock Paper Scissors</h2>
            <div className="text-sm text-gray-400">
              {players.map(p => p.username).join(' vs ')}
            </div>
          </div>
          <button
            onClick={revealed ? onClose : handleForfeit}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <CloseIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Countdown */}
        {!revealed && (
          <div className="p-6 bg-gradient-to-r from-orange-500/20 to-red-500/20 border-b border-gray-700">
            <div className="flex items-center justify-center gap-3">
              <Clock className="w-6 h-6 text-orange-400" />
              <span className="text-3xl font-bold text-white">
                {countdown}s
              </span>
              <span className="text-gray-300">
                {myPick ? 'Waiting for opponent...' : 'Make your pick!'}
              </span>
            </div>
          </div>
        )}

        {/* Winner Display */}
        {revealed && winner && (
          <div className="p-4 bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border-b border-gray-700">
            <div className="flex items-center justify-center gap-3">
              <Trophy className="w-6 h-6 text-yellow-400" />
              <span className="text-xl font-bold text-white">
                {winner === 'draw'
                  ? "It's a draw!"
                  : `${winner.username} wins! 🎉`
                }
              </span>
            </div>
          </div>
        )}

        {/* Choice Selection or Reveal */}
        <div className="p-8">
          {!revealed ? (
            // Choice buttons
            <div className="grid grid-cols-3 gap-4">
              {choices.map(choice => (
                <button
                  key={choice.id}
                  onClick={() => handlePick(choice.id)}
                  disabled={myPick !== null}
                  className={`
                    aspect-square rounded-xl border-2 flex flex-col items-center justify-center
                    transition-all text-6xl
                    ${myPick === choice.id
                      ? 'border-green-500 bg-green-500/20 scale-105'
                      : myPick
                        ? 'border-gray-600 bg-gray-800/50 opacity-50 cursor-not-allowed'
                        : 'border-purple-500 bg-purple-500/10 hover:bg-purple-500/20 hover:scale-105 cursor-pointer'
                    }
                  `}
                >
                  <div className="mb-2">{choice.icon}</div>
                  <div className="text-sm font-semibold text-white">
                    {choice.name}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            // Reveal both picks
            <div className="grid grid-cols-2 gap-6">
              {players.map(player => {
                const pick = getPlayerPick(player.user_id);
                const pickData = choices.find(c => c.id === pick);
                
                return (
                  <div
                    key={player.user_id}
                    className="text-center p-6 rounded-xl border-2 border-gray-600 bg-gray-700/50"
                  >
                    <div className="text-lg font-semibold text-white mb-2">
                      {player.username}
                    </div>
                    <div className="text-7xl mb-2">
                      {pickData?.icon || '❓'}
                    </div>
                    <div className="text-sm text-gray-400">
                      {pickData?.name || 'No pick'}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-700 flex justify-end gap-3">
          {revealed && isHost && (
            <button
              onClick={onPlayAgain}
              className="px-6 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-lg font-semibold transition-colors"
            >
              Play Again 🔄
            </button>
          )}
          <button
            onClick={revealed ? onClose : handleForfeit}
            className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
          >
            {revealed ? 'Close' : 'Forfeit'}
          </button>
        </div>
      </div>
    </div>
  );
}
