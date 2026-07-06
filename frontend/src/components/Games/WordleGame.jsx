import { useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';

const MAX_GUESSES = 6;
const WORD_LEN = 5;

// Colour helpers matching the server's G/Y/X encoding.
function cellColor(ch) {
  if (ch === 'G') return 'bg-green-600 border-green-500 text-white';
  if (ch === 'Y') return 'bg-yellow-500 border-yellow-400 text-white';
  return 'bg-gray-700 border-gray-600 text-gray-300';
}

function KeyboardKey({ letter, status, onClick }) {
  const color =
    status === 'G' ? 'bg-green-600 text-white' :
    status === 'Y' ? 'bg-yellow-500 text-white' :
    status === 'X' ? 'bg-gray-700 text-gray-400' :
    'bg-gray-600 text-white hover:bg-gray-500';

  return (
    <button
      onClick={() => onClick(letter)}
      className={`h-12 min-w-[2.2rem] rounded-lg font-bold text-sm transition-colors ${color} px-1`}
    >
      {letter}
    </button>
  );
}

const KEYBOARD_ROWS = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L'],
  ['ENTER','Z','X','C','V','B','N','M','⌫'],
];

export default function WordleGame({ gameState, players, currentUserId, onMove, onClose, onEndGame }) {
  const [gs, setGs]             = useState(null);
  const [currentInput, setInput] = useState('');
  const [shake, setShake]       = useState(false);
  const [message, setMessage]   = useState('');

  useEffect(() => {
    if (!gameState?.game_state) return;
    setGs(gameState.game_state);
  }, [gameState]);

  const myKey = String(currentUserId);
  const myGuesses = gs?.guesses?.[myKey] || [];
  const myResults = gs?.results?.[myKey] || [];
  const eliminated = gs?.eliminated || [];
  const isEliminated = eliminated.includes(myKey);
  const isOver = gameState?.status === 'finished' || gameState?.status === 'completed';
  const phase = gs?.phase || 'playing';
  const secret = isOver ? (gs?.secret || '') : '';

  // Build keyboard letter statuses from my results.
  const letterStatus = {};
  for (let g = 0; g < myGuesses.length; g++) {
    const word = myGuesses[g];
    const res = myResults[g] || '';
    for (let i = 0; i < WORD_LEN; i++) {
      const ch = word[i];
      const fb = res[i];
      const cur = letterStatus[ch];
      if (cur === 'G') continue;
      if (fb === 'G' || (!cur && fb === 'Y') || (!cur && fb === 'X')) {
        letterStatus[ch] = fb;
      }
    }
  }

  function pressKey(key) {
    if (isOver || isEliminated || phase !== 'playing') return;
    if (key === '⌫' || key === 'BACKSPACE') {
      setInput(p => p.slice(0, -1));
    } else if (key === 'ENTER') {
      submitGuess();
    } else if (/^[A-Z]$/.test(key) && currentInput.length < WORD_LEN) {
      setInput(p => p + key);
    }
  }

  function submitGuess() {
    if (currentInput.length !== WORD_LEN) {
      setMessage('Not enough letters');
      setShake(true);
      setTimeout(() => setShake(false), 600);
      setTimeout(() => setMessage(''), 1500);
      return;
    }
    onMove({ move_type: 'guess', move_data: { word: currentInput } });
    setInput('');
  }

  useEffect(() => {
    function onKey(e) {
      const k = e.key.toUpperCase();
      pressKey(k === 'BACKSPACE' ? '⌫' : k);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [currentInput, isOver, isEliminated, phase]);

  // Render grid for a player.
  function PlayerGrid({ playerKey, name, isSelf }) {
    const guesses = gs?.guesses?.[playerKey] || [];
    const results = gs?.results?.[playerKey] || [];
    const elim = eliminated.includes(playerKey);
    const won = gs?.winner_id === playerKey;

    return (
      <div className={`flex flex-col gap-1 items-center ${isSelf ? 'flex-1' : ''}`}>
        <p className={`text-xs font-semibold mb-1 ${won ? 'text-green-400' : elim ? 'text-red-400' : 'text-gray-400'}`}>
          {name}{isSelf ? ' (you)' : ''} {won ? '🏆' : elim ? '💀' : ''}
        </p>
        {Array.from({ length: MAX_GUESSES }, (_, row) => (
          <div key={row} className="flex gap-1">
            {Array.from({ length: WORD_LEN }, (_, col) => {
              const guess = guesses[row] || '';
              const result = results[row] || '';
              const isCurrentRow = isSelf && row === guesses.length && !isOver && !isEliminated;
              const letter = isCurrentRow ? (currentInput[col] || '') : (guess[col] || '');
              const fb = result[col] || '';
              return (
                <div
                  key={col}
                  className={`w-9 h-9 border-2 flex items-center justify-center font-bold text-sm rounded transition-all
                    ${fb ? cellColor(fb) : isCurrentRow && letter ? 'border-gray-400 bg-gray-800 text-white' : 'border-gray-700 bg-gray-800/50 text-gray-500'}
                    ${shake && isCurrentRow ? 'animate-bounce' : ''}
                  `}
                >
                  {letter}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  }

  const myPlayer = players.find(p => p.user_id === currentUserId);
  const others = players.filter(p => p.user_id !== currentUserId);
  const winner = isOver && gs?.winner_id
    ? players.find(p => String(p.user_id) === gs.winner_id)
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-3 overflow-y-auto">
      <div className="bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg flex flex-col gap-4 p-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🟩</span>
            <span className="text-white font-bold text-lg">Wordle</span>
            <span className="text-gray-500 text-xs">competitive</span>
          </div>
          <button onClick={isOver ? onClose : onEndGame} className="text-gray-400 hover:text-white p-1"><X size={20} /></button>
        </div>

        {/* Message */}
        {message && <p className="text-center text-red-400 text-sm font-semibold">{message}</p>}

        {/* Result banner */}
        {isOver && (
          <div className="text-center py-2">
            {winner
              ? <p className="text-white font-bold text-lg">{winner.user_id === currentUserId ? '🎉 You got it!' : `${winner.username} won!`}</p>
              : <p className="text-gray-400 font-semibold">No winner — the word was <span className="text-white font-mono font-bold">{secret}</span></p>
            }
            {secret && <p className="text-gray-500 text-sm mt-1">The word was <span className="font-mono text-purple-300">{secret}</span></p>}
          </div>
        )}

        {/* Grids */}
        <div className="flex gap-4 justify-center">
          {myPlayer && (
            <PlayerGrid
              playerKey={myKey}
              name={myPlayer.username}
              isSelf
            />
          )}
          {others.length > 0 && (
            <div className="flex flex-col gap-4">
              {others.map(p => (
                <PlayerGrid key={p.user_id} playerKey={String(p.user_id)} name={p.username} isSelf={false} />
              ))}
            </div>
          )}
        </div>

        {/* Status */}
        {!isOver && (
          <p className="text-center text-sm text-gray-400">
            {isEliminated
              ? '💀 You\'re out — watching others finish…'
              : `Guess ${myGuesses.length + 1} / ${MAX_GUESSES}`}
          </p>
        )}

        {/* Keyboard */}
        {!isOver && !isEliminated && (
          <div className="flex flex-col gap-1.5 items-center">
            {KEYBOARD_ROWS.map((row, i) => (
              <div key={i} className="flex gap-1">
                {row.map(k => (
                  <KeyboardKey key={k} letter={k} status={letterStatus[k]} onClick={pressKey} />
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        {isOver ? (
          <button onClick={onClose} className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-semibold transition-colors">
            Close
          </button>
        ) : (
          <button onClick={onEndGame} className="w-full py-2 bg-red-800 hover:bg-red-700 text-white rounded-xl text-sm font-semibold transition-colors">
            End Game
          </button>
        )}
      </div>
    </div>
  );
}
