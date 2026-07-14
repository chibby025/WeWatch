import React, { useState } from 'react';

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

  const [pendingLetter, setPendingLetter] = useState(null);

  function handleGuess(letter) {
    if (phase !== 'guessing') return;
    if (guessed.includes(letter)) return;
    onMove({ move_type: 'guess', letter });
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

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-900 text-white select-none overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700">
        <h2 className="text-lg font-bold text-purple-300">Hangman</h2>
        <div className="flex gap-2">
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
    </div>
  );
}
