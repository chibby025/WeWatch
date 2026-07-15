import React, { useState } from 'react';
import GameRulesButton from './GameRulesButton';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

export default function HangmanGame({ gameState, players, currentUserId, onMove, onClose, onEndGame }) {
  const gs = gameState?.game_state || {};
  const display = gs.display || [];
  const wrongLetters = gs.wrong_letters || [];
  const wrongCount = gs.wrong_count || 0;
  const maxWrong = gs.max_wrong || 6;
  const guessed = gs.guessed || [];
  const phase = gs.phase || 'guessing';
  const scores = gs.scores || {};
  const word = gs.word || ''; // only revealed in won/lost phase
  const wordLength = gs.word_length || display.length;
  const lastGuesser = gs.last_guesser;
  const hintsRemaining = gs.hints_remaining ?? 3;

  const [pendingLetter, setPendingLetter] = useState(null);
  const [hintPending, setHintPending] = useState(false);

  function handleGuess(letter) {
    if (phase !== 'guessing') return;
    if (guessed.includes(letter)) return;
    onMove({ move_type: 'guess', letter });
  }

  function handleHint() {
    if (phase !== 'guessing' || hintsRemaining <= 0 || hintPending) return;
    setHintPending(true);
    onMove({ move_type: 'hint' });
    setTimeout(() => setHintPending(false), 1500);
  }

  const hangmanParts = [
    // gallows — always shown
    <line key="base" x1="10" y1="90" x2="90" y2="90" stroke="currentColor" strokeWidth="3" />,
    <line key="pole" x1="30" y1="90" x2="30" y2="10" stroke="currentColor" strokeWidth="3" />,
    <line key="top" x1="30" y1="10" x2="60" y2="10" stroke="currentColor" strokeWidth="3" />,
    <line key="rope" x1="60" y1="10" x2="60" y2="20" stroke="currentColor" strokeWidth="2" />,
    // body parts (revealed per wrong guess)
    <circle key="head" cx="60" cy="27" r="7" stroke="currentColor" strokeWidth="2" fill="none" />,
    <line key="body" x1="60" y1="34" x2="60" y2="60" stroke="currentColor" strokeWidth="2" />,
    <line key="larm" x1="60" y1="40" x2="45" y2="52" stroke="currentColor" strokeWidth="2" />,
    <line key="rarm" x1="60" y1="40" x2="75" y2="52" stroke="currentColor" strokeWidth="2" />,
    <line key="lleg" x1="60" y1="60" x2="45" y2="75" stroke="currentColor" strokeWidth="2" />,
    <line key="rleg" x1="60" y1="60" x2="75" y2="75" stroke="currentColor" strokeWidth="2" />,
  ];

  const bodyStartIndex = 4; // first 4 are always-shown gallows
  const visibleBodyParts = wrongCount;

  const playerList = players || [];

  const isOver = gameState?.status === 'finished' || gameState?.status === 'completed' || gameState?.status === 'forfeited';
  const winnerId = gameState?.winner_id;
  const winner = winnerId ? playerList.find(p => String(p.user_id) === String(winnerId)) : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-900 text-white select-none overflow-y-auto">
      <style>{`
        @keyframes bannerIn {
          0%   { opacity:0; transform:scale(0.88); }
          100% { opacity:1; transform:scale(1); }
        }
        @keyframes trophySpin {
          0%   { transform:rotate(-15deg) scale(1); }
          50%  { transform:rotate(15deg)  scale(1.15); }
          100% { transform:rotate(-15deg) scale(1); }
        }
        @keyframes confettiFall {
          0%   { transform:translateY(-10px) rotate(0deg);   opacity:1; }
          100% { transform:translateY(110vh) rotate(720deg); opacity:0; }
        }
      `}</style>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700">
        <h2 className="text-lg font-bold text-purple-300">Hangman</h2>
        <div className="flex items-center gap-2">
          <GameRulesButton gameType="hangman" />
          {onEndGame && (
            <button onClick={onEndGame} className="px-3 py-1 text-sm bg-red-600 hover:bg-red-700 rounded-lg">
              End Game
            </button>
          )}
          <button onClick={onClose} className="px-3 py-1 text-sm bg-gray-600 hover:bg-gray-700 rounded-lg">✕</button>
        </div>
      </div>

      <div className="flex flex-col items-center flex-1 overflow-y-auto p-4 gap-5">
        {/* Hangman drawing */}
        <svg viewBox="0 0 100 100" className="w-32 h-32 text-gray-300">
          {/* Always-visible gallows */}
          {hangmanParts.slice(0, bodyStartIndex)}
          {/* Body parts revealed per wrong guess */}
          {hangmanParts.slice(bodyStartIndex, bodyStartIndex + visibleBodyParts)}
        </svg>

        {/* Wrong counter */}
        <p className={`text-sm font-medium ${wrongCount >= maxWrong ? 'text-red-400' : 'text-gray-400'}`}>
          {wrongCount}/{maxWrong} wrong
        </p>

        {/* Word display */}
        <div className="flex gap-2 flex-wrap justify-center">
          {(phase === 'guessing' ? Array(wordLength).fill('_').map((_, i) => display[i] || '_') : word.split('')).map((ch, i) => (
            <div key={i} className="flex flex-col items-center">
              <span className="text-2xl font-mono font-bold text-white min-w-[1.5rem] text-center">
                {ch === '_' ? ' ' : ch}
              </span>
              <div className="h-0.5 w-6 bg-gray-400 mt-1" />
            </div>
          ))}
        </div>

        {/* Phase banner */}
        {phase === 'won' && (
          <div className="text-center bg-green-800/40 border border-green-500 rounded-xl px-6 py-3">
            <p className="text-2xl">🎉</p>
            <p className="text-green-300 font-bold text-lg">Word Guessed!</p>
            <p className="text-gray-300 text-sm mt-1">The word was <span className="font-bold text-white">{word}</span></p>
          </div>
        )}
        {phase === 'lost' && (
          <div className="text-center bg-red-900/40 border border-red-500 rounded-xl px-6 py-3">
            <p className="text-2xl">💀</p>
            <p className="text-red-300 font-bold text-lg">Game Over</p>
            <p className="text-gray-300 text-sm mt-1">The word was <span className="font-bold text-white">{word}</span></p>
          </div>
        )}

        {/* Wrong letters */}
        {wrongLetters.length > 0 && (
          <div className="flex flex-wrap gap-1 justify-center">
            {wrongLetters.map(l => (
              <span key={l} className="text-red-400 font-bold text-sm line-through">{l}</span>
            ))}
          </div>
        )}

        {/* Hint button */}
        {phase === 'guessing' && (
          <button
            onClick={handleHint}
            disabled={hintsRemaining <= 0 || hintPending}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-bold transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: hintsRemaining > 0 ? '#7c3aed' : '#374151' }}
          >
            💡 Hint ({hintsRemaining} left)
          </button>
        )}

        {/* Alphabet keyboard */}
        <div className="flex flex-wrap gap-1.5 justify-center max-w-xs">
          {ALPHABET.map(letter => {
            const isGuessed = guessed.includes(letter);
            const isWrong = wrongLetters.includes(letter);
            const isCorrect = isGuessed && !isWrong;
            return (
              <button
                key={letter}
                disabled={phase !== 'guessing' || isGuessed}
                onClick={() => handleGuess(letter)}
                className={`w-9 h-9 rounded-lg text-sm font-bold transition-all
                  ${isWrong ? 'bg-red-900 text-red-300 opacity-50 cursor-not-allowed' :
                    isCorrect ? 'bg-green-800 text-green-300 opacity-70 cursor-not-allowed' :
                    phase !== 'guessing' ? 'bg-gray-700 text-gray-500 cursor-not-allowed' :
                    'bg-gray-700 hover:bg-purple-600 text-white active:scale-95'}`}
              >
                {letter}
              </button>
            );
          })}
        </div>

        {/* Scores */}
        <div className="w-full max-w-sm">
          <p className="text-xs text-gray-500 uppercase font-semibold mb-2 text-center">Scores</p>
          <div className="grid grid-cols-2 gap-2">
            {playerList.map(p => (
              <div key={p.user_id} className={`bg-gray-800 rounded-lg px-3 py-2 flex justify-between items-center
                ${String(p.user_id) === lastGuesser ? 'ring-1 ring-purple-400' : ''}`}>
                <span className="text-sm text-gray-300 truncate">{p.username}</span>
                <span className="text-sm font-bold text-yellow-300">{scores[String(p.user_id)] || 0}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Winner banner overlay ── */}
      {isOver && (
        <div className="absolute inset-0 z-[60] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(6px)' }}>

          {/* Confetti — winner only */}
          {winner && [...Array(16)].map((_, i) => {
            const cols = ['#ef4444','#3b82f6','#22c55e','#eab308','#a855f7','#f97316'];
            return (
              <div key={i} style={{
                position: 'absolute', left: `${10 + (i * 5.5) % 82}%`, top: '-10px',
                width: 6 + (i % 4) * 3, height: 6 + (i % 4) * 3,
                borderRadius: i % 3 === 0 ? '2px' : '50%',
                background: cols[i % cols.length],
                animation: `confettiFall ${1.4 + (i % 4) * 0.25}s ${(i * 0.18) % 1.6}s ease-in infinite`,
                pointerEvents: 'none',
              }} />
            );
          })}

          <div className="relative flex flex-col items-center gap-4 px-8 py-8 rounded-2xl mx-6 text-center"
            style={{
              background: 'linear-gradient(135deg,#1e1b4b 0%,#1e3a8a 100%)',
              border: '2px solid #6d28d9',
              boxShadow: '0 0 40px rgba(109,40,217,0.5), 0 20px 60px rgba(0,0,0,0.7)',
              animation: 'bannerIn 0.4s cubic-bezier(0.34,1.56,0.64,1) both',
              minWidth: 240, maxWidth: 340,
            }}>

            {/* Big emoji */}
            <div style={{
              fontSize: 56, lineHeight: 1,
              animation: winner ? 'trophySpin 2s ease-in-out infinite' : undefined,
            }}>
              {phase === 'won' ? '🏆' : phase === 'lost' ? '💀' : '🏁'}
            </div>

            {/* Winner / draw / ended */}
            {winner ? (
              <div className="flex flex-col items-center gap-2">
                <div className="w-14 h-14 rounded-full overflow-hidden"
                  style={{ boxShadow: '0 0 0 4px #7c3aed' }}>
                  {winner.avatar ? (
                    <img src={winner.avatar} alt={winner.username} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xl font-bold text-white"
                      style={{ background: '#7c3aed' }}>
                      {winner.username?.[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-white/60 text-xs uppercase tracking-widest mb-0.5">Winner</p>
                  <p className="text-white text-xl font-black">{winner.username}</p>
                  {gameState?.status === 'forfeited' && (
                    <p className="text-purple-300 text-xs mt-0.5">by forfeit</p>
                  )}
                </div>
              </div>
            ) : phase === 'lost' ? (
              <div>
                <p className="text-white text-xl font-black">Game Over</p>
                <p className="text-red-300 text-sm mt-1">The word beat everyone</p>
              </div>
            ) : playerList.length > 1 ? (
              <div>
                <p className="text-white text-xl font-black">It's a Draw!</p>
                <p className="text-purple-300 text-sm mt-1">Tied scores — no single winner</p>
              </div>
            ) : (
              <div>
                <p className="text-white text-xl font-black">Game Ended</p>
              </div>
            )}

            {/* Revealed word */}
            {word && (
              <div className="px-4 py-2 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>
                <p className="text-white/50 text-xs uppercase tracking-widest mb-1">The word was</p>
                <p className="text-white text-2xl font-black tracking-widest">{word}</p>
              </div>
            )}

            {/* Ranked scoreboard */}
            {playerList.length > 0 && (
              <div className="w-full">
                <p className="text-white/50 text-xs uppercase tracking-widest mb-2">Scores</p>
                <div className="flex flex-col gap-1.5">
                  {[...playerList]
                    .sort((a, b) => (scores[String(b.user_id)] || 0) - (scores[String(a.user_id)] || 0))
                    .map((p, rank) => {
                      const score = scores[String(p.user_id)] || 0;
                      const isWinner = String(p.user_id) === String(winnerId);
                      return (
                        <div key={p.user_id}
                          className="flex items-center gap-2 px-3 py-2 rounded-xl"
                          style={{
                            background: isWinner ? 'rgba(124,58,237,0.25)' : 'rgba(255,255,255,0.06)',
                            border: isWinner ? '1px solid rgba(124,58,237,0.5)' : '1px solid rgba(255,255,255,0.08)',
                          }}>
                          <span className="text-white/40 text-xs w-4">#{rank + 1}</span>
                          <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                            style={{ background: isWinner ? '#7c3aed' : '#374151' }}>
                            {p.username?.[0]?.toUpperCase()}
                          </div>
                          <span className="text-white text-sm font-semibold flex-1 truncate text-left">{p.username}</span>
                          <span className="text-yellow-300 font-black text-sm">{score}</span>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            <button
              onClick={onClose}
              className="mt-2 w-full py-3 rounded-xl text-white font-bold text-sm transition-all active:scale-95"
              style={{
                background: 'linear-gradient(135deg,#7c3aed,#4f46e5)',
                boxShadow: '0 4px 14px rgba(124,58,237,0.5)',
              }}>
              Close Game
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
