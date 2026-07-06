import { X, Trophy, Play, Crown } from 'lucide-react';

// TournamentBracket — renders the single-elimination bracket tree for an active
// tournament. Shown alongside the game overlay (in VideoWatch) so players can see the
// bracket between/around their matches. The host gets a "Start This Match" button next
// to each pending match; starting it fires a normal start_game with that match's two
// players, which the backend links back to the match (tournament.go).

const STATUS_STYLE = {
  pending:   'border-gray-600 bg-gray-800/60',
  active:    'border-yellow-400/70 bg-yellow-500/10',
  completed: 'border-green-500/50 bg-green-600/10',
  bye:       'border-blue-500/40 bg-blue-500/10',
};

function MatchSlot({ player, isWinner }) {
  return (
    <div className={`flex items-center gap-2 px-2 py-1 rounded ${isWinner ? 'bg-green-600/25' : ''}`}>
      {player ? (
        <>
          <div className="w-3 h-3 rounded-full border border-white/30 flex-shrink-0" style={{ backgroundColor: player.color || '#888' }} />
          <span className={`text-xs truncate ${isWinner ? 'text-green-300 font-semibold' : 'text-white'}`}>{player.username}</span>
          {isWinner && <Crown className="w-3 h-3 text-yellow-400 flex-shrink-0 ml-auto" />}
        </>
      ) : (
        <span className="text-gray-500 text-xs italic">— bye —</span>
      )}
    </div>
  );
}

export default function TournamentBracket({ tournament, currentUserId, onStartMatch, onClose }) {
  if (!tournament) return null;

  const rounds = tournament.rounds || [];
  const isHost = tournament.host_id === currentUserId;
  const players = tournament.players || [];
  const winner = tournament.winner_id != null ? players.find(p => p.user_id === tournament.winner_id) : null;

  const roundLabel = (i, total) => {
    const remaining = total - i;
    if (remaining === 1) return 'Final';
    if (remaining === 2) return 'Semifinals';
    if (remaining === 3) return 'Quarterfinals';
    return `Round ${i + 1}`;
  };

  const handleStart = (match) => {
    if (!onStartMatch || !match.player1 || !match.player2) return;
    onStartMatch(match, tournament.game_type);
  };

  return (
    <div className="fixed inset-0 z-[55] bg-gray-950/97 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between pl-20 pr-5 py-4 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Trophy className="w-6 h-6 text-yellow-400" />
          <span className="text-white font-bold text-xl">Tournament</span>
          <span className="text-gray-400 text-sm capitalize">{(tournament.game_type || '').replace(/_/g, ' ')}</span>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white hover:bg-gray-800 p-1.5 rounded-lg transition-colors"
          title="Hide bracket"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Winner banner */}
      {tournament.status === 'completed' && (
        <div className="text-center py-6 bg-gradient-to-r from-yellow-600/20 to-amber-600/20 border-b border-yellow-500/30">
          <div className="text-5xl mb-2">🏆</div>
          <h2 className="text-2xl font-bold text-white">
            {winner ? `${winner.username} is the Champion!` : 'Tournament Complete'}
          </h2>
        </div>
      )}

      {/* Bracket columns */}
      <div className="flex-1 overflow-auto p-6">
        <div className="flex gap-8 min-w-max">
          {rounds.map((round, rIdx) => (
            <div key={rIdx} className="flex flex-col justify-around gap-4 min-w-[220px]">
              <div className="text-center text-gray-400 text-xs font-semibold uppercase tracking-wider mb-2">
                {roundLabel(rIdx, rounds.length)}
              </div>
              {round.map((match) => {
                const isCurrentRound = rIdx === tournament.current_round;
                return (
                  <div
                    key={match.index}
                    className={`rounded-lg border p-2 ${STATUS_STYLE[match.status] || STATUS_STYLE.pending}`}
                  >
                    <MatchSlot player={match.player1} isWinner={match.winner_id === match.player1?.user_id && match.status === 'completed'} />
                    {match.player2 && (
                      <>
                        <div className="text-center text-[10px] text-gray-600 py-0.5">vs</div>
                        <MatchSlot player={match.player2} isWinner={match.winner_id === match.player2?.user_id && match.status === 'completed'} />
                      </>
                    )}

                    {/* Status / action */}
                    {match.status === 'bye' && (
                      <div className="mt-1 text-center text-[10px] text-blue-300">Auto-advance</div>
                    )}
                    {match.status === 'active' && (
                      <div className="mt-1 text-center text-[10px] text-yellow-300 animate-pulse">In progress…</div>
                    )}
                    {match.status === 'pending' && isCurrentRound && match.player1 && match.player2 && (
                      isHost ? (
                        <button
                          onClick={() => handleStart(match)}
                          className="mt-2 w-full flex items-center justify-center gap-1 px-2 py-1.5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded text-xs font-semibold transition-all"
                        >
                          <Play className="w-3 h-3" /> Start This Match
                        </button>
                      ) : (
                        <div className="mt-1 text-center text-[10px] text-gray-500">Waiting for host…</div>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="px-5 py-3 border-t border-gray-800 flex justify-end flex-shrink-0">
        <button
          onClick={onClose}
          className="px-6 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm font-semibold transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}
