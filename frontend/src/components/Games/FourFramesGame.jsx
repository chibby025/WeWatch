import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { X, Clock, Trophy, Send, ChevronRight, ImageOff } from 'lucide-react';
import GameRulesButton from './GameRulesButton';
import GameWinnerBanner from './GameWinnerBanner';

const ROUND_SECONDS = 45;

// One photo cell in the 2x2 grid — real photos fetched server-side from the
// Pexels API (see backend/internal/handlers/games/four_frames.go), so unlike
// Rebus Round's token renderer there's no custom drawing here, just an <img>
// with a graceful fallback if a given URL ever fails to load.
function PhotoCell({ url }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]); // reset the fallback when a new round's photo arrives
  return (
    <div className="aspect-square rounded-xl overflow-hidden bg-gray-900 flex items-center justify-center">
      {url && !failed ? (
        <img
          src={url}
          alt=""
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <ImageOff className="w-8 h-8 text-gray-700" />
      )}
    </div>
  );
}

export default function FourFramesGame({ gameState, currentUserId, onMove, onClose, onPostResult, gameErrorMsg, gameErrorKey }) {
  const [guess, setGuess] = useState('');
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);
  const [isSendingNext, setIsSendingNext] = useState(false);
  const [shakeError, setShakeError] = useState(null);
  const revealSentRef = useRef(false);
  const nextRoundTimeoutRef = useRef(null);
  const lastHandledErrorKeyRef = useRef(gameErrorKey);
  const inputRef = useRef(null);

  const gs = gameState?.game_state || {};
  const phase = gs.phase || 'waiting';
  const photos = gs.current_photos || [];
  const scores = gs.scores || {};
  const correctOrder = gs.correct_order || [];
  const round = Number(gs.round) || 0;
  const totalRounds = Number(gs.total_rounds) || 0;
  const revealedAnswer = gs.revealed_answer || '';
  const revealedAlternates = gs.revealed_alternates || [];

  const players = gameState?.players || [];
  const isHostUser = (gameState?.host_id ?? players[0]?.user_id) === currentUserId;
  const isPlayer = players.some(p => p.user_id === currentUserId);
  const isLastRound = totalRounds > 0 && round >= totalRounds;

  const myCorrectEntry = correctOrder.find(e => Number(e.user_id) === currentUserId);
  const alreadySolvedThisRound = !!myCorrectEntry;

  const roundRef = useRef(round);
  useEffect(() => { roundRef.current = round; }, [round]);

  // A fresh server-rejected-guess error → show a quick shake/message near the
  // input, same gameErrorMsg/gameErrorKey pattern as Rebus Round/Wordsmith.
  useEffect(() => {
    if (gameErrorKey === lastHandledErrorKeyRef.current) return;
    lastHandledErrorKeyRef.current = gameErrorKey;
    if (!gameErrorMsg) return;
    setShakeError(gameErrorMsg);
    const t = setTimeout(() => setShakeError(null), 1800);
    return () => clearTimeout(t);
  }, [gameErrorKey, gameErrorMsg]);

  // Clear the input + stuck-detection guard whenever a new round starts.
  useEffect(() => {
    if (phase === 'puzzle') {
      setGuess('');
      revealSentRef.current = false;
      setTimeLeft(ROUND_SECONDS);
    }
  }, [round, phase]);

  useEffect(() => {
    if (nextRoundTimeoutRef.current) {
      clearTimeout(nextRoundTimeoutRef.current);
      nextRoundTimeoutRef.current = null;
    }
    setIsSendingNext(false);
  }, [round]);

  useEffect(() => () => {
    if (nextRoundTimeoutRef.current) clearTimeout(nextRoundTimeoutRef.current);
  }, []);

  // Countdown + host-side auto-reveal, same shape as Rebus Round/Trivia.
  useEffect(() => {
    if (phase !== 'puzzle' || !gs.started_at) return;
    const interval = setInterval(() => {
      const elapsed = (Date.now() - Number(gs.started_at)) / 1000;
      const remaining = Math.max(0, ROUND_SECONDS - elapsed);
      setTimeLeft(Math.ceil(remaining));
      if (remaining <= 0 && isHostUser && !revealSentRef.current) {
        revealSentRef.current = true;
        onMove({ move_type: 'reveal' });
      }
    }, 500);
    return () => clearInterval(interval);
  }, [phase, gs.started_at, isHostUser, onMove]);

  const sendStart = () => {
    if (isLastRound && round > 0) return;
    const sentAtRound = round;
    onMove({ move_type: 'four_frames_start' });
    setIsSendingNext(true);
    if (nextRoundTimeoutRef.current) clearTimeout(nextRoundTimeoutRef.current);
    // Photos are fetched live from Pexels on the backend when this move is
    // processed — a slower/network-dependent step than Rebus Round's purely
    // local puzzle pick, so this failure-detection window matters more here.
    nextRoundTimeoutRef.current = setTimeout(() => {
      nextRoundTimeoutRef.current = null;
      setIsSendingNext(false);
      if (roundRef.current === sentAtRound) {
        toast.error('Failed to load photos for the next round — tap the button to retry.');
      }
    }, 8000);
  };

  const sendGuess = () => {
    const trimmed = guess.trim();
    if (!trimmed || !isPlayer || phase !== 'puzzle' || alreadySolvedThisRound) return;
    onMove({ move_type: 'answer', guess: trimmed });
  };

  const sendReveal = () => {
    if (revealSentRef.current) return;
    revealSentRef.current = true;
    onMove({ move_type: 'reveal' });
  };

  const endOrLeave = () => {
    if (isHostUser) onMove({ move_type: 'four_frames_end' });
    else onClose();
  };

  const sortedPlayers = [...players].sort(
    (a, b) => (Number(scores[String(b.user_id)]) || 0) - (Number(scores[String(a.user_id)]) || 0)
  );
  const scoreOf = (p) => Number(scores[String(p.user_id)]) || 0;
  const topScore = sortedPlayers.length ? scoreOf(sortedPlayers[0]) : 0;
  const hasSoleLeader = topScore > 0 && sortedPlayers.filter(p => scoreOf(p) === topScore).length === 1;
  const finalWinner = gameState?.winner_id != null ? players.find(p => p.user_id === gameState.winner_id) : null;

  return (
    <div className="fixed inset-0 z-[60] bg-gray-950/98 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between pl-20 pr-5 py-4 border-b border-gray-800 flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-2xl">📸</span>
          <span className="text-white font-bold text-xl">Four Frames</span>
          {round > 0 && totalRounds > 0 && (
            <span className="text-gray-400 text-sm ml-1">Round {round}/{totalRounds}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <GameRulesButton gameType="four_frames" />
          <button
            onClick={endOrLeave}
            className="text-gray-400 hover:text-white hover:bg-gray-800 p-1.5 rounded-lg transition-colors"
            title={isHostUser ? 'End game for everyone' : 'Leave game'}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Score strip */}
      {round > 0 && (
        <div className="flex items-center gap-4 px-5 py-2 bg-gray-900 overflow-x-auto flex-shrink-0">
          {sortedPlayers.map((p, i) => (
            <div key={p.user_id} className="flex items-center gap-1.5 flex-shrink-0">
              {i === 0 && hasSoleLeader && <Trophy className="w-3.5 h-3.5 text-yellow-400" />}
              <div className="w-5 h-5 rounded-full border border-white/30" style={{ backgroundColor: p.color }} />
              <span className="text-white text-sm">{p.username}</span>
              <span className="text-yellow-400 text-xs font-bold">{scoreOf(p)}pts</span>
            </div>
          ))}
        </div>
      )}

      {/* Body */}
      <div className="flex-1 flex flex-col items-center justify-center px-5 py-6 overflow-y-auto">

        {/* Waiting */}
        {phase === 'waiting' && (
          <div className="text-center">
            <div className="text-6xl mb-5">{isHostUser ? '📸' : '⏳'}</div>
            <h2 className="text-2xl font-bold text-white mb-2">{isHostUser ? 'Ready!' : 'Get Ready!'}</h2>
            <p className="text-gray-400 mb-8 text-sm max-w-sm">
              {isHostUser
                ? '4 real photos appear — type the one word that connects them. First correct guess scores the most!'
                : 'Waiting for the host to start the first round…'}
            </p>
            {isHostUser && (
              <button
                onClick={sendStart}
                disabled={isSendingNext}
                className="px-8 py-3 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold rounded-xl text-base transition-all"
              >
                {isSendingNext ? 'Loading photos…' : 'Start Round 1'}
              </button>
            )}
          </div>
        )}

        {/* Puzzle / Reveal */}
        {(phase === 'puzzle' || phase === 'reveal') && (
          <div className="w-full max-w-md">
            {phase === 'puzzle' && (
              <div className="flex items-center gap-3 mb-4">
                <Clock className={`w-4 h-4 flex-shrink-0 ${timeLeft <= 8 ? 'text-red-400 animate-pulse' : 'text-gray-400'}`} />
                <div className="flex-1 bg-gray-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${timeLeft <= 8 ? 'bg-red-500' : 'bg-purple-500'}`}
                    style={{ width: `${(timeLeft / ROUND_SECONDS) * 100}%` }}
                  />
                </div>
                <span className={`text-xs font-bold w-6 text-right tabular-nums ${timeLeft <= 8 ? 'text-red-400' : 'text-gray-300'}`}>
                  {timeLeft}s
                </span>
              </div>
            )}

            {/* Photo grid */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              {(photos.length ? photos : [null, null, null, null]).map((url, i) => (
                <PhotoCell key={i} url={url} />
              ))}
            </div>

            {/* Who's solved it so far */}
            {phase === 'puzzle' && (
              <div className="flex items-center justify-center gap-1.5 flex-wrap mb-4 min-h-[24px]">
                {correctOrder.length === 0 ? (
                  <p className="text-gray-500 text-xs">Nobody's solved it yet…</p>
                ) : (
                  correctOrder.map((entry) => {
                    const p = players.find(pl => pl.user_id === Number(entry.user_id));
                    if (!p) return null;
                    return (
                      <span key={entry.user_id} className="flex items-center gap-1 bg-green-600/20 border border-green-500/40 text-green-300 text-xs font-semibold px-2 py-0.5 rounded-full">
                        ✓ {p.username}
                      </span>
                    );
                  })
                )}
              </div>
            )}

            {/* Reveal */}
            {phase === 'reveal' && (
              <div className="text-center mb-5">
                <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">The answer was</p>
                <p className="text-white text-2xl font-black capitalize">{revealedAnswer}</p>
                {revealedAlternates.length > 0 && (
                  <p className="text-gray-500 text-xs mt-1">Also accepted: {revealedAlternates.join(', ')}</p>
                )}
              </div>
            )}

            {/* Player input */}
            {phase === 'puzzle' && isPlayer && (
              <div className="flex flex-col items-center gap-2">
                {alreadySolvedThisRound ? (
                  <p className="text-green-400 text-sm font-semibold">🎉 You got it! Waiting for the round to end…</p>
                ) : (
                  <>
                    <div className={`flex w-full gap-2 ${shakeError ? 'animate-shake' : ''}`}>
                      <input
                        ref={inputRef}
                        type="text"
                        value={guess}
                        onChange={(e) => setGuess(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') sendGuess(); }}
                        placeholder="Type your guess…"
                        className="flex-1 bg-gray-900/70 border border-gray-700 focus:border-purple-500 rounded-xl px-4 py-3 text-white placeholder-gray-500 text-base focus:outline-none"
                        autoComplete="off"
                      />
                      <button
                        onClick={sendGuess}
                        disabled={!guess.trim()}
                        className="px-4 py-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors flex-shrink-0"
                      >
                        <Send className="w-5 h-5" />
                      </button>
                    </div>
                    {shakeError && <p className="text-red-400 text-xs font-medium">{shakeError}</p>}
                  </>
                )}
              </div>
            )}
            {phase === 'puzzle' && !isPlayer && (
              <p className="text-center text-gray-500 text-sm">You're hosting — sit back and watch!</p>
            )}

            {/* Host controls */}
            {isHostUser && (
              <div className="flex justify-between items-center mt-5">
                <button
                  onClick={endOrLeave}
                  className="px-4 py-2.5 bg-red-600/20 hover:bg-red-600/40 border border-red-500/40 text-red-400 hover:text-red-300 rounded-xl text-sm font-semibold transition-colors"
                >
                  End Game
                </button>
                <div className="flex justify-center">
                  {phase === 'puzzle' && (
                    <button
                      onClick={sendReveal}
                      className="px-6 py-2.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold rounded-xl text-sm transition-colors"
                    >
                      Reveal Answer
                    </button>
                  )}
                  {phase === 'reveal' && (
                    <button
                      onClick={isLastRound ? endOrLeave : sendStart}
                      disabled={isSendingNext}
                      className="flex items-center gap-1.5 px-6 py-2.5 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 disabled:opacity-60 text-white font-bold rounded-xl text-sm transition-all"
                    >
                      {isSendingNext ? 'Loading…' : isLastRound ? 'Show Results' : 'Next Round'}
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            )}
            {!isHostUser && phase === 'reveal' && (
              <p className="text-center text-gray-500 text-xs mt-4">Waiting for the host to start the next round…</p>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes fourFramesShake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-6px); }
          40%, 80% { transform: translateX(6px); }
        }
        .animate-shake { animation: fourFramesShake 0.4s ease-in-out; }
      `}</style>

      {phase === 'ended' && (
        <GameWinnerBanner
          winner={finalWinner}
          gameType="four_frames"
          gameStats={{ lines: sortedPlayers.map(p => ({ label: p.username, value: `${scoreOf(p)}pts` })) }}
          isForfeit={gameState?.status === 'forfeited'}
          onClose={onClose}
          onPostResult={onPostResult}
        />
      )}
    </div>
  );
}
