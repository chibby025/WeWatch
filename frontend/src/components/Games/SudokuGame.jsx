import React, { useState, useEffect } from 'react';
import GameWinnerBanner from './GameWinnerBanner';
import GameRulesButton from './GameRulesButton';

export default function SudokuGame({ gameState, players, currentUserId, onMove, onClose, onEndGame, onPostResult }) {
  const gs = gameState?.game_state || {};
  const puzzle = gs.puzzle || Array(81).fill(0);
  const phase = gs.phase || 'playing';
  const submissions = gs.submissions || {};
  const startTime = gs.start_time || Date.now();

  const isHostUser = (gameState?.host_id ?? players?.[0]?.user_id) === currentUserId;
  const isOver = phase === 'ended' || gameState?.status === 'finished' || gameState?.status === 'forfeited';
  const winner = gameState?.winner_id
    ? (players || []).find(p => p.user_id === gameState.winner_id)
    : null;

  const endOrLeave = () => {
    if (isHostUser && onEndGame) onEndGame();
    else onClose();
  };

  // Local grid state: null = blank, number = player entry
  const [grid, setGrid] = useState(() => puzzle.map(v => v || null));
  const [selected, setSelected] = useState(null); // index 0-80
  const [submitted, setSubmitted] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // Keep grid in sync with puzzle (in case of late-join rehydration)
  useEffect(() => {
    setGrid(puzzle.map(v => v || null));
  }, [puzzle.join(',')]);

  // Timer
  useEffect(() => {
    if (phase !== 'playing') return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [phase, startTime]);

  const myResult = submissions[String(currentUserId)];
  const isGiven = (i) => puzzle[i] !== 0;
  // Only present once phase is "ended" — sudokuPublicState on the backend
  // keeps this stripped for the whole "playing" phase so nobody can peek.
  const solution = gs.solution || null;

  const resultLabel = { correct: 'Solved it!', incorrect: 'Didn\'t solve it' };
  const gameStats = {
    lines: (players || []).map(p => ({
      label: p.username,
      value: resultLabel[submissions[String(p.user_id)]] || 'No submission',
    })),
  };

  function handleCellClick(i) {
    if (isGiven(i) || phase !== 'playing' || submitted) return;
    setSelected(i);
  }

  function handleDigit(d) {
    if (selected === null || isGiven(selected) || phase !== 'playing' || submitted) return;
    const next = [...grid];
    next[selected] = d === 0 ? null : d;
    setGrid(next);
  }

  function handleSubmit() {
    const arr = grid.map(v => v || 0);
    onMove({ move_type: 'submit', grid: arr });
    setSubmitted(true);
  }

  // Keyboard input
  useEffect(() => {
    function onKey(e) {
      if (e.key >= '1' && e.key <= '9') handleDigit(parseInt(e.key));
      else if (e.key === '0' || e.key === 'Backspace' || e.key === 'Delete') handleDigit(0);
      else if (e.key === 'ArrowRight' && selected !== null) setSelected(i => Math.min(80, i + 1));
      else if (e.key === 'ArrowLeft' && selected !== null) setSelected(i => Math.max(0, i - 1));
      else if (e.key === 'ArrowDown' && selected !== null) setSelected(i => Math.min(80, i + 9));
      else if (e.key === 'ArrowUp' && selected !== null) setSelected(i => Math.max(0, i - 9));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, grid, phase, submitted]);

  function formatTime(s) {
    const m = Math.floor(s / 60);
    return `${m}:${String(s % 60).padStart(2, '0')}`;
  }

  // Highlight same digit as selected
  const selectedDigit = selected !== null ? grid[selected] : null;

  // Determine 3×3 box for selected
  const selectedBox = selected !== null ? (Math.floor(selected / 27) * 3 + Math.floor((selected % 9) / 3)) : -1;

  return (
    <>
      {isOver && (
        <GameWinnerBanner
          winner={winner}
          players={players}
          gameType="sudoku"
          gameStats={gameStats}
          isForfeit={gameState?.status === 'forfeited'}
          onClose={onClose}
          onPostResult={onPostResult}
        />
      )}
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-900 text-white select-none overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700">
        <div>
          <h2 className="text-lg font-bold text-purple-300">Sudoku Race</h2>
          <p className="text-xs text-gray-400">Fill the grid, submit first!</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-yellow-300 font-mono">{formatTime(elapsed)}</span>
          <GameRulesButton gameType="sudoku" className="text-gray-400 hover:text-white" />
          {!isOver && (
            <button
              onClick={endOrLeave}
              className="px-3 py-1 text-sm bg-red-600 hover:bg-red-700 rounded-lg"
              title={isHostUser ? 'End game for everyone' : 'Leave game'}
            >
              End
            </button>
          )}
          <button onClick={onClose} className="px-3 py-1 text-sm bg-gray-600 hover:bg-gray-700 rounded-lg">✕</button>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center overflow-y-auto p-2 gap-3">
        {/* Result banner */}
        {myResult === 'correct' && (
          <div className="w-full max-w-xs bg-green-900/40 border border-green-500 rounded-xl px-4 py-3 text-center">
            <p className="text-green-300 font-bold text-lg">🎉 Correct! You solved it first!</p>
          </div>
        )}
        {myResult === 'incorrect' && (
          <div className="w-full max-w-xs bg-orange-900/40 border border-orange-500 rounded-xl px-4 py-2 text-center">
            <p className="text-orange-300 text-sm">❌ Incorrect — keep trying!</p>
          </div>
        )}

        {/* Grid */}
        <div className="grid grid-cols-9 border-2 border-gray-500 rounded"
          style={{ width: 'min(90vw, 350px)', aspectRatio: '1' }}>
          {grid.map((val, i) => {
            const row = Math.floor(i / 9);
            const col = i % 9;
            const boxRow = Math.floor(row / 3);
            const boxCol = Math.floor(col / 3);
            const box = boxRow * 3 + boxCol;
            const given = isGiven(i);
            const isSelected = selected === i;
            const sameDigit = selectedDigit && val === selectedDigit && val !== null;
            const sameBox = box === selectedBox && selectedBox !== -1;
            const sameRow = selected !== null && Math.floor(selected / 9) === row;
            const sameCol = selected !== null && selected % 9 === col;
            const isHighlighted = !isSelected && (sameRow || sameCol || sameBox);

            // Once the round is over, the backend includes the real solution
            // in the public state (see sudokuPublicState) — reveal it here
            // instead of leaving everyone's grid frozen wherever they left it.
            const revealed = isOver && solution;
            const displayVal = revealed ? solution[i] : val;

            const rightBorder = (col + 1) % 3 === 0 && col !== 8 ? 'border-r-2 border-r-gray-500' : 'border-r border-r-gray-700';
            const bottomBorder = (row + 1) % 3 === 0 && row !== 8 ? 'border-b-2 border-b-gray-500' : 'border-b border-b-gray-700';

            return (
              <button
                key={i}
                onClick={() => handleCellClick(i)}
                className={`flex items-center justify-center text-sm font-bold transition-colors
                  ${rightBorder} ${bottomBorder}
                  ${isSelected ? 'bg-purple-700 text-white' :
                    sameDigit ? 'bg-blue-900 text-blue-200' :
                    isHighlighted ? 'bg-gray-700/60' :
                    'bg-gray-900'}
                  ${revealed && !given ? 'text-green-400' : given ? 'text-gray-200 cursor-default' : 'text-purple-300 cursor-pointer'}
                  ${!given && phase === 'playing' && !submitted ? 'hover:bg-gray-700' : ''}`}
              >
                {displayVal || ''}
              </button>
            );
          })}
        </div>

        {/* Digit pad */}
        <div className="flex gap-1.5">
          {[1,2,3,4,5,6,7,8,9].map(d => (
            <button
              key={d}
              onClick={() => handleDigit(d)}
              disabled={phase !== 'playing' || submitted}
              className="w-8 h-8 sm:w-9 sm:h-9 bg-gray-700 hover:bg-purple-600 disabled:opacity-40 rounded text-sm font-bold"
            >
              {d}
            </button>
          ))}
          <button
            onClick={() => handleDigit(0)}
            disabled={phase !== 'playing' || submitted}
            className="w-8 h-8 sm:w-9 sm:h-9 bg-gray-700 hover:bg-red-700 disabled:opacity-40 rounded text-sm"
          >
            ⌫
          </button>
        </div>

        {/* Submit */}
        {phase === 'playing' && !submitted && (
          <button
            onClick={handleSubmit}
            className="px-8 py-3 bg-green-600 hover:bg-green-500 rounded-xl font-bold text-white"
          >
            Submit Solution
          </button>
        )}

        {/* Other players' status */}
        <div className="w-full max-w-xs grid grid-cols-2 gap-2">
          {(players || []).map(p => {
            const result = submissions[String(p.user_id)];
            return (
              <div key={p.user_id} className={`bg-gray-800 rounded-lg px-3 py-2 flex items-center gap-2
                ${result === 'correct' ? 'ring-1 ring-green-500' : result === 'incorrect' ? 'ring-1 ring-orange-500' : ''}`}>
                <span className="text-base">
                  {result === 'correct' ? '✅' : result === 'incorrect' ? '❌' : '🟡'}
                </span>
                <span className="text-sm truncate text-gray-300">{p.username}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
    </>
  );
}
