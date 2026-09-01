// src/components/Games/RockPaperScissorsGame.jsx
import { useState, useEffect } from 'react';
import { X as CloseIcon, Clock } from 'lucide-react';
import GameWinnerBanner from './GameWinnerBanner';
import GameRulesButton from './GameRulesButton';

const choices = [
  { id: 'rock', name: 'Rock', icon: '🪨' },
  { id: 'paper', name: 'Paper', icon: '📄' },
  { id: 'scissors', name: 'Scissors', icon: '✂️' }
];

export default function RockPaperScissorsGame({ gameState, players, currentUserId, onMove, onClose, onEndGame, onPlayAgain, onPostResult, introResolved = true }) {
  const [myPick, setMyPick] = useState(null);
  const [countdown, setCountdown] = useState(5);
  const [revealed, setRevealed] = useState(false);
  const [winner, setWinner] = useState(null);

  const handleForfeit = () => {
    if (onEndGame) onEndGame();
    else onClose();
  };

  useEffect(() => {
    const finalPicks = gameState?.game_state?.final_picks;
    const picks = gameState?.game_state?.picks || {};
    const playerIds = (players || []).map(p => String(p.user_id));
    const hasFinalPicks = !!finalPicks || (playerIds.length >= 2 && playerIds.every(id => picks[id]));
    const isOver = gameState?.status === 'finished' || gameState?.status === 'completed' || gameState?.status === 'forfeited';

    if (hasFinalPicks || isOver) setRevealed(true);

    if (isOver) {
      const winnerId = gameState.winner_id;
      setWinner(!winnerId ? 'draw' : (players.find(p => p.user_id === winnerId) || 'draw'));
    }
  }, [gameState, players]);

  useEffect(() => {
    // Don't start ticking while the GameStartInfoModal intro popup is still
    // covering the screen (~2s) — previously this ran the instant the
    // component mounted, racing against that popup and burning through 2 of
    // the 5 seconds before the player could even see the countdown.
    if (!introResolved) return;
    if (revealed || myPick) return;
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown, revealed, myPick, introResolved]);

  const handlePick = (choice) => {
    if (myPick || revealed) return;
    setMyPick(choice);
    onMove({ pick: choice });
  };

  // gameState.host_id (the real, backend-confirmed host) rather than assuming
  // players[0] is always the host — matches the pattern used everywhere else
  // GameWinnerBanner's Play Again is wired in, and stays correct even if a
  // future setup flow ever adds the host to the players list in a different
  // position.
  const isHost = gameState?.host_id === currentUserId;

  const getPlayerPick = (userId) => {
    if (!revealed) return null;
    const src = gameState?.game_state?.final_picks || gameState?.game_state?.picks;
    return src?.[String(userId)] || null;
  };

  const finalPicks = gameState?.game_state?.final_picks || gameState?.game_state?.picks || {};

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg mx-4">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-700">
            <div>
              <h2 className="text-2xl font-bold text-white mb-1">Rock Paper Scissors</h2>
              <div className="flex items-center gap-1.5 flex-wrap text-sm text-gray-400">
                {players.map((p, i) => (
                  <span key={p.user_id} className="flex items-center gap-1.5">
                    {i > 0 && <span className="text-gray-500">vs</span>}
                    {p.avatar_url ? (
                      <img src={p.avatar_url} alt={p.username} className="w-5 h-5 rounded-full object-cover" />
                    ) : (
                      <span className="w-5 h-5 rounded-full bg-gray-600 flex items-center justify-center text-[9px] font-bold text-white">
                        {(p.username || '?').slice(0, 2).toUpperCase()}
                      </span>
                    )}
                    <span>{p.username}</span>
                  </span>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <GameRulesButton gameType="rock_paper_scissors" />
              {!winner && (
                <button
                  onClick={handleForfeit}
                  className="px-3 py-1.5 bg-red-700 hover:bg-red-800 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  End Game
                </button>
              )}
              <button
                onClick={revealed ? handleForfeit : handleForfeit}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <CloseIcon className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Countdown */}
          {!revealed && (
            <div className="p-6 bg-gradient-to-r from-orange-500/20 to-red-500/20 border-b border-gray-700">
              <div className="flex items-center justify-center gap-3">
                <Clock className="w-6 h-6 text-orange-400" />
                <span className="text-3xl font-bold text-white">{countdown}s</span>
                <span className="text-gray-300">
                  {myPick ? 'Waiting for opponent...' : 'Make your pick!'}
                </span>
              </div>
            </div>
          )}

          {/* Choice Selection or Reveal */}
          <div className="p-8">
            {!revealed ? (
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
                    <div className="text-sm font-semibold text-white">{choice.name}</div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-6">
                {players.map(player => {
                  const pick = getPlayerPick(player.user_id);
                  const pickData = choices.find(c => c.id === pick);
                  return (
                    <div
                      key={player.user_id}
                      className="text-center p-6 rounded-xl border-2 border-gray-600 bg-gray-700/50"
                    >
                      <div className="text-lg font-semibold text-white mb-2">{player.username}</div>
                      <div className="text-7xl mb-2">{pickData?.icon || '❓'}</div>
                      <div className="text-sm text-gray-400">{pickData?.name || 'No pick'}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {winner && (
        <GameWinnerBanner
          winner={winner === 'draw' ? null : winner}
          players={players}
          gameType="rock_paper_scissors"
          gameStats={{ lines: players.map(p => {
            const pick = finalPicks[String(p.user_id)];
            return pick ? { label: p.username, value: pick.charAt(0).toUpperCase() + pick.slice(1) } : null;
          }).filter(Boolean) }}
          isForfeit={gameState?.status === 'forfeited'}
          onClose={onClose}
          onPostResult={onPostResult}
          secondaryAction={isHost && onPlayAgain ? { label: 'Play Again 🔄', onClick: onPlayAgain } : undefined}
        />
      )}
    </>
  );
}
