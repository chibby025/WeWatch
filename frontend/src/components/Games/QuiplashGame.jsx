import { useState, useEffect, useRef } from 'react';
import { X } from 'lucide-react';

export default function QuiplashGame({ gameState, players, currentUserId, onMove, onClose, onEndGame }) {
  const [gs, setGs]         = useState(null);
  const [answer, setAnswer] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const inputRef            = useRef(null);

  useEffect(() => {
    if (!gameState?.game_state) return;
    setGs(gameState.game_state);
    // Reset answer input when a new prompt appears.
    setAnswer('');
    setSubmitted(false);
  }, [gameState?.game_state?.round, gameState?.game_state?.phase]);

  useEffect(() => {
    if (!gameState?.game_state) return;
    setGs(gameState.game_state);
  }, [gameState]);

  if (!gs) return null;

  const isHost     = players[0]?.user_id === currentUserId;
  const phase      = gs.phase || 'answering';
  const round      = gs.round || 1;
  const total      = gs.total_rounds || 5;
  const prompt     = gs.prompt || '';
  const answers    = gs.answers || {};
  const votes      = gs.votes || {};
  const scores     = gs.scores || {};
  const isOver     = ['finished','completed','forfeited'].includes(gameState?.status || '');
  const myKey      = String(currentUserId);
  const myAnswer   = answers[myKey];
  const myVote     = votes[myKey];

  function submitAnswer() {
    if (!answer.trim()) return;
    onMove({ move_type: 'answer', move_data: { text: answer.trim() } });
    setSubmitted(true);
  }

  function voteFor(authorKey) {
    if (myVote || authorKey === myKey) return;
    onMove({ move_type: 'vote', move_data: { for_player: authorKey } });
  }

  function next() {
    onMove({ move_type: 'next', move_data: {} });
  }

  const answeredCount = Object.keys(answers).length;
  const votedCount    = Object.keys(votes).length;

  // Sort answers randomly each round but stably (use key order from server).
  const answerEntries = Object.entries(answers);

  // Sorted scoreboard.
  const scoreboard = players
    .map(p => ({ ...p, score: scores[String(p.user_id)] || 0 }))
    .sort((a, b) => b.score - a.score);

  const winner = isOver && gameState?.winner_id
    ? players.find(p => p.user_id === gameState.winner_id) : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950 overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800">
        <div className="flex items-center gap-2">
          <span className="text-xl">😂</span>
          <span className="text-white font-bold">Quiplash</span>
          <span className="text-gray-500 text-xs ml-2">Round {round}/{total}</span>
        </div>
        <button onClick={isOver ? onClose : (isHost ? onEndGame : onClose)} className="text-gray-400 hover:text-white p-1">
          <X size={18} />
        </button>
      </div>

      {isOver ? (
        /* -------- Game Over screen -------- */
        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
          {winner
            ? <p className="text-white font-black text-2xl">
                {winner.user_id === currentUserId ? '🎉 You win!' : `${winner.username} wins!`}
              </p>
            : <p className="text-gray-400 font-bold text-xl">🤝 It's a Draw!</p>
          }
          <div className="w-full max-w-sm flex flex-col gap-2">
            {scoreboard.map((p, i) => (
              <div key={p.user_id} className={`flex items-center justify-between px-4 py-2 rounded-xl
                ${i === 0 ? 'bg-purple-800/60 ring-1 ring-purple-400' : 'bg-gray-800/50'}`}>
                <span className="text-white font-semibold">{i + 1}. {p.username}</span>
                <span className="text-white font-bold">{p.score} pts</span>
              </div>
            ))}
          </div>
          <button onClick={onClose} className="w-full max-w-sm py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold transition-colors">
            Close
          </button>
        </div>
      ) : (
        <div className="flex-1 flex flex-col overflow-y-auto">

          {/* Prompt banner */}
          <div className="px-5 py-4 bg-purple-900/30 border-b border-purple-800/50">
            <p className="text-purple-300 text-xs uppercase tracking-wide font-semibold mb-1">The prompt is…</p>
            <p className="text-white font-bold text-lg leading-snug">{prompt}</p>
          </div>

          {/* -------- ANSWERING phase -------- */}
          {phase === 'answering' && (
            <div className="flex-1 flex flex-col p-5 gap-4">
              {myAnswer ? (
                <div className="text-center py-6">
                  <p className="text-green-400 font-semibold text-lg">✅ Answer submitted!</p>
                  <p className="text-gray-400 mt-1">Waiting for others… ({answeredCount}/{players.length})</p>
                  <p className="mt-4 bg-gray-800/70 px-4 py-3 rounded-xl text-white italic">"{myAnswer.text || myAnswer}"</p>
                </div>
              ) : (
                <>
                  <textarea
                    ref={inputRef}
                    value={answer}
                    onChange={e => setAnswer(e.target.value.slice(0, 120))}
                    placeholder="Type your funniest answer…"
                    rows={3}
                    className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500"
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), submitAnswer())}
                    disabled={submitted}
                  />
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>{answer.length}/120 chars</span>
                    <span>{answeredCount}/{players.length} answered</span>
                  </div>
                  <button
                    onClick={submitAnswer}
                    disabled={!answer.trim() || submitted}
                    className="w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-colors"
                  >
                    Submit!
                  </button>
                </>
              )}
            </div>
          )}

          {/* -------- VOTING phase -------- */}
          {phase === 'voting' && (
            <div className="flex-1 flex flex-col p-5 gap-3">
              <p className="text-gray-400 text-sm text-center">Vote for the funniest answer (not your own)</p>
              {answerEntries.map(([authorKey, ans]) => {
                const ansText = ans?.text ?? ans;
                const isMe = authorKey === myKey;
                const voted = myVote === authorKey;
                return (
                  <button
                    key={authorKey}
                    onClick={() => voteFor(authorKey)}
                    disabled={isMe || !!myVote}
                    className={`w-full text-left px-5 py-4 rounded-2xl font-semibold text-base transition-all
                      ${voted ? 'bg-purple-700 ring-2 ring-purple-400 text-white' : ''}
                      ${!voted && !isMe && !myVote ? 'bg-gray-800 hover:bg-gray-700 text-white' : ''}
                      ${isMe ? 'bg-gray-800/30 text-gray-600 cursor-default' : ''}
                      ${!isMe && myVote && !voted ? 'bg-gray-800/50 text-gray-500 cursor-default' : ''}
                    `}
                  >
                    {ansText}
                    {voted && <span className="ml-2 text-purple-300">← your vote</span>}
                  </button>
                );
              })}
              <p className="text-center text-gray-500 text-xs mt-2">{votedCount}/{players.length} voted</p>
            </div>
          )}

          {/* -------- REVEAL phase -------- */}
          {phase === 'reveal' && (
            <div className="flex-1 flex flex-col p-5 gap-4">
              <p className="text-white font-semibold text-center">Results!</p>
              <div className="flex flex-col gap-3">
                {answerEntries
                  .sort(([, a], [, b]) => (b?.vote_count || 0) - (a?.vote_count || 0))
                  .map(([authorKey, ans]) => {
                    const ansText = ans?.text ?? ans;
                    const count   = ans?.vote_count || 0;
                    const authorName = players.find(p => String(p.user_id) === authorKey)?.username || 'Someone';
                    return (
                      <div key={authorKey} className="bg-gray-800 rounded-2xl px-5 py-4 flex flex-col gap-1">
                        <p className="text-white font-semibold text-base italic">"{ansText}"</p>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-400">— {authorKey === myKey ? 'you' : authorName}</span>
                          <span className="text-purple-300 font-bold">{count} 🗳️ vote{count !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* Scores */}
              <div className="mt-2">
                <p className="text-gray-500 text-xs mb-2 uppercase tracking-wide font-semibold">Scoreboard</p>
                <div className="flex flex-col gap-1">
                  {scoreboard.map((p, i) => (
                    <div key={p.user_id} className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-gray-800/50">
                      <span className="text-gray-300 text-sm">{i + 1}. {p.username}</span>
                      <span className="text-white font-bold text-sm">{p.score} pts</span>
                    </div>
                  ))}
                </div>
              </div>

              {isHost && (
                <div className="flex gap-2 mt-2">
                  <button onClick={next} className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-bold transition-colors">
                    Next Round →
                  </button>
                  <button onClick={onEndGame} className="px-4 py-2.5 bg-red-800 hover:bg-red-700 text-white rounded-xl text-sm font-semibold transition-colors">
                    End
                  </button>
                </div>
              )}
              {!isHost && (
                <p className="text-center text-gray-500 text-sm">Waiting for host to continue…</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
