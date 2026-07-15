import { useState, useEffect, useMemo, useCallback } from 'react';
import { X } from 'lucide-react';

const COLS = 7;
const ROWS = 6;

const PIECE_COLOR = { R: '#ef4444', Y: '#eab308' };

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

// ── Avatar pill ───────────────────────────────────────────────────────────────
function PlayerPill({ player, piece, isActive, isOver }) {
  const hex = PIECE_COLOR[piece];
  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-semibold transition-all duration-200 ${isActive && !isOver ? 'scale-105' : 'opacity-60'}`}
      style={{
        background: `${hex}22`,
        border: `1.5px solid ${isActive && !isOver ? hex : hex + '55'}`,
        color: hex,
      }}
    >
      <div className="w-5 h-5 rounded-full overflow-hidden flex-shrink-0">
        {player?.avatar ? (
          <img src={player.avatar} alt={player.username} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[9px] font-bold text-white"
            style={{ background: hex }}>
            {player?.username?.[0]?.toUpperCase()}
          </div>
        )}
      </div>
      <span className="max-w-[64px] truncate">{player?.username || 'Player'}</span>
      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: hex }} />
      {isActive && !isOver && (
        <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse flex-shrink-0" />
      )}
    </div>
  );
}

export default function ConnectFourGame({ gameState, players = [], currentUserId, onMove, onClose, onEndGame }) {
  const [board, setBoard]       = useState(emptyBoard());
  const [currentTurn, setCurrentTurn] = useState(0);
  const [winner, setWinner]     = useState(null);
  const [isOver, setIsOver]     = useState(false);
  const [hoverCol, setHoverCol] = useState(null);
  const [selectedCol, setSelectedCol] = useState(3);

  useEffect(() => {
    if (!gameState) return;
    const gs = gameState.game_state || {};
    setBoard(gs.board || emptyBoard());
    setCurrentTurn(gameState.current_turn ?? 0);
    const over = ['finished', 'completed', 'forfeited'].includes(gameState.status);
    setIsOver(over);
    setWinner(over
      ? (gameState.winner_id ? players.find(p => p.user_id === gameState.winner_id) || null : null)
      : null);
  }, [gameState, players]);

  const myIdx    = players.findIndex(p => p.user_id === currentUserId);
  const myPiece  = myIdx === 0 ? 'R' : 'Y';
  const isMyTurn = !isOver && players[currentTurn]?.user_id === currentUserId;
  const wins     = useMemo(() => isOver ? winningCells(board) : null, [isOver, board]);

  // Derive winner piece for avatar ring
  const winnerIdx   = winner ? players.findIndex(p => p.user_id === winner.user_id) : -1;
  const winnerPiece = winnerIdx === 0 ? 'R' : 'Y';
  const winnerHex   = winner ? PIECE_COLOR[winnerPiece] : null;

  const drop = useCallback((col) => {
    if (!isMyTurn) return;
    const row = legalDrop(board, col);
    if (row === -1) return;
    onMove({ col });
  }, [isMyTurn, board, onMove]);

  // Keyboard navigation: ← → to pick column, Enter/Space to drop
  useEffect(() => {
    const handler = (e) => {
      if (!isMyTurn || isOver) return;
      if (e.key === 'ArrowLeft')  { e.preventDefault(); setSelectedCol(c => Math.max(0, c - 1)); }
      if (e.key === 'ArrowRight') { e.preventDefault(); setSelectedCol(c => Math.min(COLS - 1, c + 1)); }
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); drop(selectedCol); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isMyTurn, isOver, selectedCol, drop]);

  const p0 = players[0];
  const p1 = players[1];

  return (
    <>
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
          0%   { transform:translateY(-20px) rotate(0deg);   opacity:1; }
          100% { transform:translateY(120px) rotate(720deg); opacity:0; }
        }
      `}</style>

      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
        <div className="relative bg-gray-900 rounded-2xl shadow-2xl w-full max-w-xl flex flex-col gap-4 p-5 overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">🔵</span>
              <div>
                <h2 className="text-white font-bold text-lg leading-none">Connect Four</h2>
                <p className="text-blue-400 text-[10px]">2-player game</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!isOver && (
                <button
                  onClick={onEndGame}
                  className="px-3 py-1 rounded-lg text-xs font-bold text-white transition-all active:scale-95"
                  style={{ background: '#dc2626', boxShadow: '0 2px 6px rgba(220,38,38,0.45)' }}
                >
                  Forfeit
                </button>
              )}
              <button onClick={isOver ? onClose : onEndGame} className="text-gray-400 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors">
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Player pills */}
          <div className="flex items-center justify-between px-1">
            <PlayerPill player={p0} piece="R" isActive={currentTurn === 0} isOver={isOver} />
            <span className="text-gray-600 text-xs font-bold">VS</span>
            <PlayerPill player={p1} piece="Y" isActive={currentTurn === 1} isOver={isOver} />
          </div>

          {/* Board */}
          <div
            className="bg-blue-700 rounded-xl p-2 select-none"
            onMouseLeave={() => setHoverCol(null)}
          >
            {/* Drop indicator row — hover col takes priority, then selected col */}
            <div className="grid mb-1" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)`, gap: '4px' }}>
              {Array.from({ length: COLS }, (_, c) => {
                const active = isMyTurn && (hoverCol !== null ? hoverCol === c : selectedCol === c);
                return (
                  <div key={c} className="flex justify-center h-4">
                    {active && legalDrop(board, c) !== -1 && (
                      <div className={`w-4 h-4 rounded-full ${myPiece === 'R' ? 'bg-red-400' : 'bg-yellow-300'}`}
                        style={{ opacity: hoverCol !== null ? 0.7 : 1 }} />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Cells */}
            <div className="grid" style={{ gridTemplateColumns: `repeat(${COLS}, 1fr)`, gap: '4px' }}>
              {board.map((cell, idx) => {
                const col = idx % COLS;
                const isWinCell = wins?.has(idx);
                const hex = cell ? PIECE_COLOR[cell] : null;
                return (
                  <button
                    key={idx}
                    className={`aspect-square rounded-full transition-all duration-100
                      ${isMyTurn && legalDrop(board, col) !== -1 ? 'cursor-pointer' : 'cursor-default'}
                      ${isWinCell ? 'ring-2 ring-white scale-105' : ''}
                    `}
                    style={{
                      background: hex
                        ? `radial-gradient(circle at 35% 30%, ${hex}ff, ${hex}cc)`
                        : 'rgba(17,24,39,0.7)',
                      boxShadow: hex ? `0 0 8px 2px ${hex}66` : 'none',
                    }}
                    onMouseEnter={() => isMyTurn && setHoverCol(col)}
                    onClick={() => drop(col)}
                  />
                );
              })}
            </div>
          </div>

          {/* Column navigator — always visible on your turn for touch/keyboard users */}
          {isMyTurn && !isOver && (
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setSelectedCol(c => Math.max(0, c - 1))}
                disabled={selectedCol === 0}
                className="w-9 h-9 rounded-lg bg-gray-700 hover:bg-gray-600 active:bg-gray-500 disabled:opacity-25 text-white font-bold text-xl flex items-center justify-center transition-colors select-none"
                aria-label="Move left"
              >‹</button>
              <button
                onClick={() => drop(selectedCol)}
                disabled={legalDrop(board, selectedCol) === -1}
                className="flex-1 max-w-[140px] h-9 rounded-lg font-bold text-sm text-white transition-all active:scale-95 disabled:opacity-40 select-none"
                style={{
                  background: legalDrop(board, selectedCol) !== -1 ? PIECE_COLOR[myPiece] : '#374151',
                  boxShadow: legalDrop(board, selectedCol) !== -1 ? `0 2px 10px ${PIECE_COLOR[myPiece]}55` : 'none',
                }}
              >Drop ▼</button>
              <button
                onClick={() => setSelectedCol(c => Math.min(COLS - 1, c + 1))}
                disabled={selectedCol === COLS - 1}
                className="w-9 h-9 rounded-lg bg-gray-700 hover:bg-gray-600 active:bg-gray-500 disabled:opacity-25 text-white font-bold text-xl flex items-center justify-center transition-colors select-none"
                aria-label="Move right"
              >›</button>
            </div>
          )}

          {/* Status line */}
          <div className="text-center text-sm min-h-[20px]">
            {!isOver && (
              isMyTurn
                ? <p className="text-gray-400 text-xs">Tap a column, use ‹ › to select, or press ← → Enter</p>
                : <p className="text-gray-400">Waiting for {players[currentTurn]?.username}…</p>
            )}
          </div>

          {/* ── Winner banner overlay ── */}
          {isOver && (
            <div className="absolute inset-0 z-50 flex items-center justify-center rounded-2xl"
              style={{ background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(6px)' }}>

              {/* Confetti */}
              {[...Array(16)].map((_, i) => {
                const colors = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#f97316'];
                const left  = 10 + (i * 5.5) % 82;
                const delay = (i * 0.18) % 1.6;
                const dur   = 1.4 + (i % 4) * 0.25;
                const size  = 6 + (i % 4) * 3;
                return (
                  <div key={i} style={{
                    position: 'absolute', left: `${left}%`, top: '-10px',
                    width: size, height: size,
                    borderRadius: i % 3 === 0 ? '2px' : '50%',
                    background: colors[i % colors.length],
                    animation: `confettiFall ${dur}s ${delay}s ease-in infinite`,
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
                  minWidth: 240, maxWidth: 320,
                }}>

                {winner ? (
                  <>
                    <div style={{ fontSize: 60, lineHeight: 1, animation: 'trophySpin 2s ease-in-out infinite' }}>🏆</div>
                    <div className="flex flex-col items-center gap-2">
                      {/* Winner avatar */}
                      <div className="w-14 h-14 rounded-full overflow-hidden"
                        style={{ boxShadow: `0 0 0 4px ${winnerHex}` }}>
                        {winner.avatar ? (
                          <img src={winner.avatar} alt={winner.username} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-xl font-bold text-white"
                            style={{ background: winnerHex }}>
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
                      {/* Piece colour badge */}
                      <div className="px-3 py-0.5 rounded-full text-xs font-bold text-white"
                        style={{ background: winnerHex }}>
                        {winnerPiece === 'R' ? '🔴 Red' : '🟡 Yellow'}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 52, lineHeight: 1 }}>🤝</div>
                    <div>
                      <p className="text-white text-xl font-black">It's a Draw!</p>
                      <p className="text-purple-300 text-sm mt-1">Board is full — no winner</p>
                    </div>
                  </>
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
      </div>
    </>
  );
}
