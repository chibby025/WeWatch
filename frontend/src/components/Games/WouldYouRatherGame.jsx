import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import GameRulesButton from './GameRulesButton';

function WyrEndScreen({ players, round, onPostResult, onClose }) {
  const questionsAnswered = Math.max(0, round - 1);

  const handleClose = () => {
    if (onPostResult) {
      onPostResult(`🏆 Would You Rather — ${questionsAnswered} question${questionsAnswered !== 1 ? 's' : ''} answered! Everyone wins! 🎉`);
    }
    onClose?.();
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)' }}
    >
      <div
        className="flex flex-col items-center gap-5 px-8 py-8 rounded-2xl mx-6 text-center w-full"
        style={{
          background: 'linear-gradient(135deg,#1e1b4b 0%,#1e3a8a 100%)',
          border: '2px solid #6d28d9',
          boxShadow: '0 0 40px rgba(109,40,217,0.5), 0 20px 60px rgba(0,0,0,0.7)',
          maxWidth: 360,
          animation: 'gwbBannerIn 0.4s cubic-bezier(0.34,1.56,0.64,1) both',
        }}
      >
        <style>{`
          @keyframes gwbBannerIn {
            0%   { opacity:0; transform:scale(0.88); }
            100% { opacity:1; transform:scale(1); }
          }
        `}</style>

        <div style={{ fontSize: 52, lineHeight: 1 }}>🎉</div>

        <div>
          <p className="text-white text-xl font-black">Everyone's a Winner!</p>
          <p className="text-purple-300 text-sm mt-1">Would You Rather — {questionsAnswered} question{questionsAnswered !== 1 ? 's' : ''} answered</p>
        </div>

        {/* All players shown as winners */}
        <div className="flex flex-wrap justify-center gap-3 w-full">
          {players.map(p => (
            <div key={p.user_id} className="flex flex-col items-center gap-1">
              <div className="relative">
                <div
                  className="w-12 h-12 rounded-full overflow-hidden flex-shrink-0"
                  style={{ boxShadow: '0 0 0 3px #7c3aed' }}
                >
                  {p.avatar ? (
                    <img src={p.avatar} alt={p.username} className="w-full h-full object-cover" />
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center text-lg font-bold text-white"
                      style={{ background: p.color || '#7c3aed' }}
                    >
                      {p.username?.[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
                <span className="absolute -top-1 -right-1 text-base leading-none">🏆</span>
              </div>
              <span className="text-white text-xs font-semibold max-w-[64px] truncate">{p.username}</span>
            </div>
          ))}
        </div>

        <button
          onClick={handleClose}
          className="w-full py-3 rounded-xl text-white font-bold text-sm transition-all active:scale-95"
          style={{
            background: 'linear-gradient(135deg,#7c3aed,#4f46e5)',
            boxShadow: '0 4px 14px rgba(124,58,237,0.5)',
          }}
        >
          Close Game
        </button>
      </div>
    </div>
  );
}

export default function WouldYouRatherGame({ gameState, players, currentUserId, onMove, onClose, onEndGame, onPostResult }) {
  const [gs, setGs] = useState(null);

  useEffect(() => {
    if (!gameState?.game_state) return;
    setGs(gameState.game_state);
  }, [gameState]);

  if (!gs) return null;

  const isHost     = players[0]?.user_id === currentUserId;
  const phase      = gs.phase || 'presenting';
  const round      = gs.round || 1;
  const total      = gs.total_rounds || 1;
  const optionA    = gs.option_a || '';
  const optionB    = gs.option_b || '';
  const votes      = gs.votes || {};
  const tallyA     = gs.tally_a || 0;
  const tallyB     = gs.tally_b || 0;
  const totalVotes = tallyA + tallyB;
  const myVote     = votes[String(currentUserId)];
  const isOver     = gameState.status === 'finished' || gameState.status === 'completed' || gameState.status === 'forfeited';

  function vote(choice) {
    onMove({ move_type: 'vote', choice });
  }

  function next() {
    onMove({ move_type: 'next' });
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
    <>
      {isOver && (
        <WyrEndScreen
          players={players}
          round={round}
          onPostResult={onPostResult}
          onClose={onClose}
        />
      )}

      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
        <div className="bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col gap-5 p-5">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🤔</span>
              <span className="text-white font-bold text-lg">Would You Rather</span>
              <span className="text-gray-500 text-sm ml-1">Round {round}/{total}</span>
            </div>
            <div className="flex items-center gap-1">
              <GameRulesButton gameType="would_you_rather" />
              {isHost && !isOver && (
                <button onClick={onEndGame} className="px-3 py-1 bg-red-800 hover:bg-red-700 text-white rounded-xl font-semibold transition-colors text-sm">
                  End
                </button>
              )}
              <button onClick={isOver ? onClose : (isHost ? onEndGame : onClose)} className="text-gray-400 hover:text-white p-1">
                <X size={20} />
              </button>
            </div>
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
          </div>

          {/* Host controls */}
          {isHost && !isOver && phase === 'reveal' && (
            <div className="flex gap-2">
              <button onClick={next} className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-semibold transition-colors">
                Next Question →
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
