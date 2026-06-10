import { useState, useEffect } from 'react';
import { Chessboard } from 'react-chessboard';
import { Chess } from 'chess.js';

export default function ChessGame({ gameState, players, currentUserId, onMove, onClose }) {
  const [game, setGame] = useState(() => new Chess());

  // Sync board with authoritative server FEN on every state update
  useEffect(() => {
    const fen = gameState?.game_state?.fen;
    if (!fen) return;
    try {
      const g = new Chess(fen);
      setGame(g);
    } catch (e) {
      console.warn('[ChessGame] Invalid FEN from server:', fen, e);
    }
  }, [gameState?.game_state?.fen]);

  // Player at index 0 plays White, index 1 plays Black
  const myIndex = players?.findIndex(p => p.user_id === currentUserId) ?? -1;
  const myColor = myIndex === 0 ? 'white' : 'black';

  const serverStatus = gameState?.game_state?.status || gameState?.status || 'active';
  const isGameOver = serverStatus === 'checkmate' || serverStatus === 'stalemate' || serverStatus === 'draw';

  const gameTurn = game.turn(); // 'w' or 'b'
  const isMyTurn = !isGameOver && (
    (gameTurn === 'w' && myColor === 'white') ||
    (gameTurn === 'b' && myColor === 'black')
  );

  const opponent = players?.find(p => p.user_id !== currentUserId);
  const winnerId = gameState?.winner_id;
  const winnerPlayer = winnerId ? players?.find(p => p.user_id === winnerId) : null;

  const isInCheck = !isGameOver && game.isCheck();

  const statusText = () => {
    if (serverStatus === 'checkmate') return winnerPlayer ? `${winnerPlayer.username} wins! ♟` : 'Checkmate!';
    if (serverStatus === 'stalemate') return 'Stalemate — Draw!';
    if (serverStatus === 'draw') return "It's a Draw!";
    if (isInCheck) return isMyTurn ? '⚠ You are in check!' : `⚠ ${opponent?.username || 'Opponent'} is in check`;
    return isMyTurn ? 'Your turn' : `${opponent?.username || 'Opponent'}'s turn`;
  };

  function onPieceDrop(sourceSquare, targetSquare, piece) {
    if (!isMyTurn) return false;

    const isPromotion =
      (piece === 'wP' && targetSquare[1] === '8') ||
      (piece === 'bP' && targetSquare[1] === '1');

    // Validate locally with chess.js before sending to server
    const copy = new Chess(game.fen());
    let result;
    try {
      result = copy.move({ from: sourceSquare, to: targetSquare, promotion: isPromotion ? 'q' : undefined });
    } catch {
      return false;
    }
    if (!result) return false;

    onMove({
      from: sourceSquare,
      to: targetSquare,
      ...(isPromotion && { promotion: 'q' }),
    });

    // Optimistic update — server will confirm via game_state_update
    setGame(copy);
    return true;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="flex flex-col items-center gap-3 w-full max-w-[min(80vw,520px)]">

        {/* Status */}
        <div className={`px-5 py-2 rounded-full text-sm font-semibold transition-colors
          ${isGameOver
            ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40'
            : isMyTurn
              ? 'bg-green-500/20 text-green-300 border border-green-500/40'
              : 'bg-gray-700/80 text-gray-300 border border-gray-600'
          }`}>
          {statusText()}
        </div>

        {/* Board */}
        <div className="w-full">
          <Chessboard
            position={game.fen()}
            onPieceDrop={onPieceDrop}
            boardOrientation={myColor}
            arePiecesDraggable={isMyTurn}
            customBoardStyle={{ borderRadius: '8px', boxShadow: '0 8px 40px rgba(0,0,0,0.7)' }}
            customDarkSquareStyle={{ backgroundColor: '#4a3728' }}
            customLightSquareStyle={{ backgroundColor: '#f0d9b5' }}
          />
        </div>

        {/* Player labels */}
        <div className="flex items-center justify-between w-full px-1 text-sm">
          {players?.map((p, i) => (
            <div key={p.user_id} className={`flex items-center gap-2 ${p.user_id === currentUserId ? 'text-purple-400 font-semibold' : 'text-gray-400'}`}>
              <div className={`w-3 h-3 rounded-full border-2 flex-shrink-0
                ${i === 0 ? 'bg-white border-gray-300' : 'bg-gray-900 border-gray-500'}`} />
              <span>{p.username} {i === 0 ? '(White)' : '(Black)'}{p.user_id === currentUserId ? ' — You' : ''}</span>
            </div>
          ))}
        </div>

        <button
          onClick={onClose}
          className="px-5 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm transition-colors"
        >
          {isGameOver ? 'Close' : 'Forfeit'}
        </button>
      </div>
    </div>
  );
}
