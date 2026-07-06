import { useState, useEffect } from 'react';
import { X } from 'lucide-react';

export default function WouldYouRatherGame({ gameState, players, currentUserId, onMove, onClose, onEndGame }) {
  const [gs, setGs] = useState(null);

  useEffect(() => {
    if (!gameState?.game_state) return;
    setGs(gameState.game_state);
  }, [gameState]);

  if (!gs) return null;

  const isHost     = players[0]?.user_id === currentUserId;
  const phase      = gs.phase || 'presenting';
  const round      = gs.round || 1;
  const total      = gs.total_rounds || 25;
  const optionA    = gs.option_a || '';
  const optionB    = gs.option_b || '';
  const votes      = gs.votes || {};
  const tallyA     = gs.tally_a || 0;
  const tallyB     = gs.tally_b || 0;
  const totalVotes = tallyA + tallyB;
  const myVote     = votes[String(currentUserId)];
  const isOver     = gameState.status === 'finished' || gameState.status === 'completed';

  function vote(choice) {
    onMove({ move_type: 'vote', move_data: { choice } });
  }

  function next() {
    onMove({ move_type: 'next', move_data: {} });
  }

  function pct(n) {
    if (totalVotes === 0) return 50;
    return Math.round((n / totalVotes) * 100);
  }

  const choiceBtn = (label, choice, color) => {
    const picked = myVote === choice;
    const revealed = phase === 'reveal';
    const tally = choice === 'A' ? tallyA : tallyB;
    return (
      <button
        key={choice}
        onClick={() => !myVote && phase === 'presenting' && vote(choice)}
        disabled={!!myVote || phase !== 'presenting'}
        className={`relative w-full rounded-2xl p-5 text-left transition-all duration-200 overflow-hidden
          ${picked ? (color === 'A' ? 'ring-2 ring-purple-400 bg-purple-900/60' : 'ring-2 ring-rose-400 bg-rose-900/60') : 'bg-gray-800 hover:bg-gray-700'}
          ${!myVote && phase === 'presenting' ? 'cursor-pointer' : 'cursor-default'}
        `}
      >
        {/* Progress bar (reveal only) */}
        {revealed && (
          <div
            className={`absolute inset-y-0 left-0 ${color === 'A' ? 'bg-purple-600/30' : 'bg-rose-600/30'} transition-all duration-700`}
            style={{ width: `${pct(tally)}%` }}
          />
        )}
        <div className="relative flex items-start gap-3">
          <span className={`text-2xl font-black ${color === 'A' ? 'text-purple-400' : 'text-rose-400'}`}>{choice}</span>
          <span className="text-white font-semibold text-base leading-snug">{choice === 'A' ? optionA : optionB}</span>
        </div>
        {revealed && (
          <div className="relative mt-2 text-sm font-bold text-right">
            <span className={color === 'A' ? 'text-purple-300' : 'text-rose-300'}>
              {tally} vote{tally !== 1 ? 's' : ''} — {pct(tally)}%
            </span>
          </div>
        )}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col gap-5 p-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🤔</span>
            <span className="text-white font-bold text-lg">Would You Rather</span>
            <span className="text-gray-500 text-sm ml-1">Round {round}/{total}</span>
          </div>
          <button onClick={isOver ? onClose : (isHost ? onEndGame : onClose)} className="text-gray-400 hover:text-white p-1">
            <X size={20} />
          </button>
        </div>

        {/* Question */}
        <p className="text-center text-gray-400 text-sm font-medium uppercase tracking-wide">Would you rather…</p>

        {/* Options */}
        <div className="flex flex-col gap-3">
          {choiceBtn(optionA, 'A', 'A')}
          <div className="text-center text-gray-500 text-xs font-bold">OR</div>
          {choiceBtn(optionB, 'B', 'B')}
        </div>

        {/* Status */}
        <div className="text-center text-sm text-gray-400">
          {phase === 'presenting' && !myVote && <span>Pick one!</span>}
          {phase === 'presenting' && myVote && <span>Waiting for others… ({totalVotes}/{players.length} voted)</span>}
          {phase === 'reveal' && <span className="text-white">Results are in! {isHost ? 'Hit Next to continue.' : 'Waiting for host…'}</span>}
          {isOver && <span className="text-purple-400 font-semibold">Game over!</span>}
        </div>

        {/* Host controls */}
        {isHost && !isOver && (
          <div className="flex gap-2">
            {phase === 'reveal' && (
              <button onClick={next} className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-semibold transition-colors">
                Next Question →
              </button>
            )}
            <button onClick={onEndGame} className="px-4 py-2.5 bg-red-800 hover:bg-red-700 text-white rounded-xl font-semibold transition-colors text-sm">
              End
            </button>
          </div>
        )}

        {isOver && (
          <button onClick={onClose} className="w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-semibold transition-colors">
            Close
          </button>
        )}
      </div>
    </div>
  );
}
