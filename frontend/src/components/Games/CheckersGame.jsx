// src/components/Games/CheckersGame.jsx
import { useState, useEffect, useMemo } from 'react';
import { X as CloseIcon, Users } from 'lucide-react';
import GameWinnerBanner from './GameWinnerBanner';
import GameRulesButton from './GameRulesButton';

// Mirrors checkers.go's helpers exactly, so the client can highlight legal
// destinations and enforce mandatory-capture/multi-jump without a round-trip.
function pieceOwner(cell) {
  return cell === 'b' || cell === 'B' ? 0 : 1;
}
function isKing(cell) {
  return cell === 'B' || cell === 'R';
}

function hasCaptureFrom(board, from) {
  const piece = board[from];
  if (!piece) return false;
  const row = Math.floor(from / 8), col = from % 8;
  const owner = pieceOwner(piece);
  const king = isKing(piece);
  const forward = owner === 0 ? 1 : -1;
  for (const [dr, dc] of [[-2, -2], [-2, 2], [2, -2], [2, 2]]) {
    if (!king && dr !== 2 * forward) continue;
    const r = row + dr, c = col + dc;
    if (r < 0 || r > 7 || c < 0 || c > 7) continue;
    const to = r * 8 + c;
    if (board[to] !== '') continue;
    const midPiece = board[(row + dr / 2) * 8 + (col + dc / 2)];
    if (!midPiece || pieceOwner(midPiece) === owner) continue;
    return true;
  }
  return false;
}

function anyCaptureAvailable(board, ownerIdx) {
  for (let i = 0; i < 64; i++) {
    if (board[i] && pieceOwner(board[i]) === ownerIdx && hasCaptureFrom(board, i)) return true;
  }
  return false;
}

function destinationsFor(board, from, mandatory) {
  const piece = board[from];
  if (!piece) return [];
  const row = Math.floor(from / 8), col = from % 8;
  const owner = pieceOwner(piece);
  const king = isKing(piece);
  const forward = owner === 0 ? 1 : -1;

  const jumps = [];
  for (const [dr, dc] of [[-2, -2], [-2, 2], [2, -2], [2, 2]]) {
    if (!king && dr !== 2 * forward) continue;
    const r = row + dr, c = col + dc;
    if (r < 0 || r > 7 || c < 0 || c > 7) continue;
    const to = r * 8 + c;
    if (board[to] !== '') continue;
    const midPiece = board[(row + dr / 2) * 8 + (col + dc / 2)];
    if (!midPiece || pieceOwner(midPiece) === owner) continue;
    jumps.push(to);
  }
  if (jumps.length > 0 || mandatory) return jumps;

  const moves = [];
  const moveDirs = king ? [[-1, -1], [-1, 1], [1, -1], [1, 1]] : [[forward, -1], [forward, 1]];
  for (const [dr, dc] of moveDirs) {
    const r = row + dr, c = col + dc;
    if (r < 0 || r > 7 || c < 0 || c > 7) continue;
    const to = r * 8 + c;
    if (board[to] === '') moves.push(to);
  }
  return moves;
}

export default function CheckersGame({ gameState, players, currentUserId, onMove, onClose, onEndGame, onPostResult }) {
  const [board, setBoard] = useState(Array(64).fill(''));
  const [currentTurn, setCurrentTurn] = useState(0);
  const [mustContinueFrom, setMustContinueFrom] = useState(null);
  const [winner, setWinner] = useState(null);
  const [isOver, setIsOver] = useState(false);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (!gameState) return;
    const gs = gameState.game_state || {};
    setBoard(gs.board || Array(64).fill(''));
    setCurrentTurn(gameState.current_turn ?? 0);
    const continueFrom = typeof gs.must_continue_from === 'number' ? gs.must_continue_from : null;
    setMustContinueFrom(continueFrom);
    setSelected(continueFrom);

    const over = gameState.status === 'finished' || gameState.status === 'completed' || gameState.status === 'forfeited';
    setIsOver(over);
    if (over) {
      setWinner(gameState.winner_id ? (players.find(p => p.user_id === gameState.winner_id) || 'draw') : 'draw');
    } else {
      setWinner(null);
    }
  }, [gameState, players]);

  const myOwnerIdx = players.findIndex(p => p.user_id === currentUserId);
  const currentPlayer = players[currentTurn];
  const isMyTurn = currentPlayer?.user_id === currentUserId && !isOver;
  const mandatory = useMemo(() => (isMyTurn ? anyCaptureAvailable(board, myOwnerIdx) : false), [board, myOwnerIdx, isMyTurn]);

  const selectableSquares = useMemo(() => {
    if (!isMyTurn || mustContinueFrom !== null) return [];
    const squares = [];
    for (let i = 0; i < 64; i++) {
      if (board[i] && pieceOwner(board[i]) === myOwnerIdx && destinationsFor(board, i, mandatory).length > 0) {
        squares.push(i);
      }
    }
    return squares;
  }, [board, myOwnerIdx, isMyTurn, mandatory, mustContinueFrom]);

  const legalDestinations = useMemo(() => {
    if (selected === null) return [];
    return destinationsFor(board, selected, mandatory);
  }, [board, selected, mandatory]);

  const counts = useMemo(() => {
    let black = 0, red = 0;
    for (const cell of board) {
      if (cell === 'b' || cell === 'B') black++;
      else if (cell === 'r' || cell === 'R') red++;
    }
    return { black, red };
  }, [board]);

  const handleSquareClick = (index) => {
    if (!isMyTurn) return;
    if (mustContinueFrom !== null) {
      if (legalDestinations.includes(index)) onMove({ from: mustContinueFrom, to: index });
      return;
    }
    if (selected !== null && legalDestinations.includes(index)) {
      onMove({ from: selected, to: index });
      setSelected(null);
      return;
    }
    if (selectableSquares.includes(index)) {
      setSelected(index === selected ? null : index);
    }
  };

  const handleForfeit = () => {
    if (onEndGame) onEndGame();
    else onClose();
  };

  const isDraw = winner === 'draw';
  const iWon = winner && winner !== 'draw' && winner.user_id === currentUserId;

  return (
    <>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-700">
          <div>
            <h2 className="text-2xl font-bold text-white mb-1">Checkers</h2>
            <div className="flex items-center gap-2 text-sm">
              <Users className="w-4 h-4 text-gray-400" />
              <span className="text-gray-400">{players.map(p => p.username).join(' vs ')}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <GameRulesButton gameType="checkers" />
            <button onClick={handleForfeit} className="text-gray-400 hover:text-white transition-colors">
              <CloseIcon className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Turn indicator */}
        {!winner && (
          <div className="p-4 bg-gray-700/50 border-b border-gray-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {players.map((player, index) => (
                  <div
                    key={player.user_id}
                    className={`px-4 py-2 rounded-lg border-2 transition-all ${
                      currentTurn === index ? 'border-purple-500 bg-purple-500/20 scale-105' : 'border-gray-600 bg-gray-800/50'
                    }`}
                  >
                    <div className="text-white font-semibold text-sm">{player.username}</div>
                    <div className="text-sm flex items-center gap-1.5 text-gray-300">
                      <span className="inline-block w-3 h-3 rounded-full" style={{ background: index === 0 ? '#1a1a1a' : '#c0392b' }} />
                      {index === 0 ? counts.black : counts.red} left
                    </div>
                  </div>
                ))}
              </div>
              {isMyTurn && (
                <div className="text-green-400 font-semibold animate-pulse">
                  {mustContinueFrom !== null ? 'Continue jumping!' : mandatory ? 'Capture available!' : 'Your turn'}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Board */}
        <div className="p-6">
          <div className="grid grid-cols-8 gap-0.5 mx-auto rounded-lg overflow-hidden" style={{ maxWidth: 360 }}>
            {board.map((cell, index) => {
              const row = Math.floor(index / 8), col = index % 8;
              const dark = (row + col) % 2 === 1;
              const isSelected = selected === index;
              const isLegalDest = legalDestinations.includes(index);
              const isSelectable = selectableSquares.includes(index) && mustContinueFrom === null;
              return (
                <button
                  key={index}
                  onClick={() => handleSquareClick(index)}
                  disabled={!dark || (!isLegalDest && !isSelectable && !isSelected)}
                  className="aspect-square flex items-center justify-center relative"
                  style={{ background: dark ? '#5c3a21' : '#e8d3b0', cursor: dark ? 'pointer' : 'default' }}
                >
                  {isLegalDest && <span className="absolute inset-2 rounded-full bg-green-400/40" />}
                  {isSelected && <span className="absolute inset-0.5 rounded-sm ring-2 ring-yellow-400" />}
                  {cell && (
                    <span
                      className="block rounded-full relative"
                      style={{
                        width: '76%',
                        height: '76%',
                        background: pieceOwner(cell) === 0
                          ? 'radial-gradient(circle at 35% 30%, #444, #0a0a0a)'
                          : 'radial-gradient(circle at 35% 30%, #e0584a, #8b1a0f)',
                        boxShadow: isSelectable || isSelected ? '0 0 0 2px #fbbf24, 0 2px 4px rgba(0,0,0,0.6)' : '0 2px 4px rgba(0,0,0,0.6)',
                      }}
                    >
                      {isKing(cell) && (
                        <span className="absolute inset-0 flex items-center justify-center text-amber-300 text-sm">♛</span>
                      )}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        {!winner && (
          <div className="p-6 border-t border-gray-700 flex justify-end">
            <button onClick={handleForfeit} className="px-6 py-2 bg-red-700 hover:bg-red-800 text-white rounded-lg transition-colors">
              End Game
            </button>
          </div>
        )}
      </div>
    </div>

    {winner && (
      <GameWinnerBanner
        winner={winner === 'draw' ? null : winner}
        players={players}
        gameType="checkers"
        gameStats={{ lines: [
          { label: `${players[0]?.username ?? 'Player 1'} (⚫)`, value: `${counts.black} pieces` },
          { label: `${players[1]?.username ?? 'Player 2'} (🔴)`, value: `${counts.red} pieces` },
        ]}}
        isForfeit={gameState?.status === 'forfeited'}
        onClose={onClose}
        onPostResult={onPostResult}
      />
    )}
    </>
  );
}
