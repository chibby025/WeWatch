import { useState, useEffect, useMemo } from 'react';
import { X } from 'lucide-react';

const COLS = 7;
const ROWS = 6;

function emptyBoard() { return Array(ROWS * COLS).fill(''); }

function hasWon(board, row, col, piece) {
  const dirs = [[0,1],[1,0],[1,1],[1,-1]];
  for (const [dr, dc] of dirs) {
    let count = 1;
    for (const sign of [1, -1]) {
      let r = row + dr*sign, c = col + dc*sign;
      while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r*COLS+c] === piece) {
        count++; r += dr*sign; c += dc*sign;
      }
    }
    if (count >= 4) return true;
  }
  return false;
}

function legalDrop(board, col) {
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r * COLS + col] === '') return r;
  }
  return -1;
}

// Returns array of winning cell indices (for highlight), or null.
function winningCells(board) {
  const dirs = [[0,1],[1,0],[1,1],[1,-1]];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const piece = board[r*COLS+c];
      if (!piece) continue;
      for (const [dr, dc] of dirs) {
        const cells = [[r, c]];
        let nr = r+dr, nc = c+dc;
        while (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && board[nr*COLS+nc] === piece) {
          cells.push([nr, nc]); nr += dr; nc += dc;
        }
        if (cells.length >= 4) return new Set(cells.map(([row, col]) => row*COLS+col));
      }
    }
  }
  return null;
}

export default function ConnectFourGame({ gameState, players, currentUserId, onMove, onClose, onEndGame }) {
  const [board, setBoard] = useState(emptyBoard());
  const [currentTurn, setCurrentTurn] = useState(0);
  const [winner, setWinner]   = useState(null);
  const [isOver, setIsOver]   = useState(false);
  const [hoverCol, setHoverCol] = useState(null);

  useEffect(() => {
    if (!gameState) return;
    const gs = gameState.game_state || {};
    setBoard(gs.board || emptyBoard());
    setCurrentTurn(gameState.current_turn ?? 0);
    const over = ['finished','completed','forfeited'].includes(gameState.status);
    setIsOver(over);
    setWinner(over
      ? (gameState.winner_id ? players.find(p => p.user_id === gameState.winner_id) || 'draw' : 'draw')
      : null);
  }, [gameState, players]);

  const myPiece  = players.findIndex(p => p.user_id === currentUserId) === 0 ? 'R' : 'Y';
  const isMyTurn = !isOver && players[currentTurn]?.user_id === currentUserId;
  const wins     = useMemo(() => isOver ? winningCells(board) : null, [isOver, board]);

  function drop(col) {
    if (!isMyTurn) return;
    const row = legalDrop(board, col);
    if (row === -1) return;
    const next = [...board];
    next[row * COLS + col] = myPiece;
    if (hasWon(next, row, col, myPiece)) {
      // Optimistic win render; server confirms.
    }
    onMove({ move_type: 'move', move_data: { col } });
  }

  const playerColor = (piece) => piece === 'R'
    ? 'bg-red-500 shadow-[0_0_8px_2px_rgba(239,68,68,0.6)]'
    : 'bg-yellow-400 shadow-[0_0_8px_2px_rgba(250,204,21,0.6)]';

  const p0 = players[0];
  const p1 = players[1];
  const myColor = myPiece === 'R' ? 'text-red-400' : 'text-yellow-400';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
      <div className="bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md flex flex-col gap-4 p-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🔴</span>
            <span className="text-white font-bold text-lg">Connect Four</span>
          </div>
          <button onClick={isOver ? onClose : onEndGame} className="text-gray-400 hover:text-white p-1">
            <X size={20} />
          </button>
        </div>

        {/* Player labels */}
        <div className="flex justify-between text-sm px-1">
          <span className={`font-semibold ${currentTurn === 0 && !isOver ? 'text-red-400' : 'text-gray-500'}`}>
            🔴 {p0?.username || 'Player 1'}{players.findIndex(p => p.user_id === currentUserId) === 0 ? ' (you)' : ''}
          </span>
          <span className={`font-semibold ${currentTurn === 1 && !isOver ? 'text-yellow-400' : 'text-gray-500'}`}>
            🟡 {p1?.username || 'Player 2'}{players.findIndex(p => p.user_id === currentUserId) === 1 ? ' (you)' : ''}
          </span>
        </div>

        {/* Board */}
        <div
          className="bg-blue-700 rounded-xl p-2 select-none"
          onMouseLeave={() => setHoverCol(null)}
        >
          {/* Drop indicator */}
          <div className="grid mb-1" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)`, gap: '4px' }}>
            {Array.from({ length: COLS }, (_, c) => (
              <div key={c} className="flex justify-center h-4">
                {isMyTurn && hoverCol === c && legalDrop(board, c) !== -1 && (
                  <div className={`w-4 h-4 rounded-full ${myPiece === 'R' ? 'bg-red-400' : 'bg-yellow-300'} opacity-70`} />
                )}
              </div>
            ))}
          </div>

          {/* Cells */}
          <div className="grid" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)`, gap: '4px' }}>
            {board.map((cell, idx) => {
              const row = Math.floor(idx / COLS);
              const col = idx % COLS;
              const isWinCell = wins?.has(idx);
              return (
                <button
                  key={idx}
                  className={`aspect-square rounded-full transition-all duration-100
                    ${isMyTurn && legalDrop(board, col) !== -1 ? 'cursor-pointer' : 'cursor-default'}
                    ${cell === '' ? 'bg-gray-900/70' : ''}
                    ${cell !== '' ? playerColor(cell) : ''}
                    ${isWinCell ? 'ring-2 ring-white scale-105' : ''}
                  `}
                  onMouseEnter={() => isMyTurn && setHoverCol(col)}
                  onClick={() => drop(col)}
                />
              );
            })}
          </div>
        </div>

        {/* Status */}
        <div className="text-center text-sm">
          {isOver ? (
            winner === 'draw'
              ? <p className="text-gray-400 font-semibold">🤝 It's a Draw!</p>
              : <p className="text-white font-bold text-base">
                  {winner?.user_id === currentUserId ? '🎉 You won!' : `${winner?.username} wins!`}
                </p>
          ) : isMyTurn ? (
            <p className={`font-semibold ${myColor}`}>Your turn — click a column</p>
          ) : (
            <p className="text-gray-400">Waiting for {players[currentTurn]?.username}…</p>
          )}
        </div>

        {/* Footer */}
        {isOver ? (
          <button onClick={onClose} className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-semibold transition-colors">
            Close
          </button>
        ) : (
          <button onClick={onEndGame} className="w-full py-2 bg-red-700 hover:bg-red-600 text-white rounded-xl font-semibold transition-colors">
            Forfeit
          </button>
        )}
      </div>
    </div>
  );
}
