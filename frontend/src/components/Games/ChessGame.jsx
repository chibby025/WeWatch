import { useState, useEffect, useCallback } from 'react';
import { Chess } from 'chess.js';
import { defaultPieces } from 'react-chessboard';

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

function PlayerBar({ player, isCurrentUser, colorLabel, isTheirTurn, isGameOver }) {
  const name = player?.username || '?';
  const initials = name.slice(0, 2).toUpperCase();
  // avatar comes from backend as `avatar`, fallback to `avatar_url` for optimistic state
  const avatarSrc = player?.avatar || player?.avatar_url || null;

  return (
    <div className={`flex items-center gap-2 w-full px-1 py-1.5 rounded-lg transition-colors
      ${isTheirTurn && !isGameOver ? 'bg-white/8' : ''}`}>
      {/* Avatar */}
      <div className={`w-9 h-9 rounded-full border-2 overflow-hidden flex-shrink-0 shadow-md
        ${isCurrentUser ? 'border-purple-400' : 'border-gray-500'}`}>
        {avatarSrc ? (
          <img
            src={avatarSrc}
            alt={name}
            className="w-full h-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.parentElement.querySelector('.avatar-initials').style.display = 'flex';
            }}
          />
        ) : (
          <div className={`avatar-initials w-full h-full flex items-center justify-center text-xs font-bold text-white
            ${isCurrentUser ? 'bg-purple-600' : 'bg-gray-600'}`}>
            {initials}
          </div>
        )}
      </div>

      {/* Name + color pill */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold truncate
            ${isCurrentUser ? 'text-purple-300' : 'text-gray-200'}`}>
            {name}
          </span>
          {isCurrentUser && (
            <span className="text-xs text-gray-500 shrink-0">You</span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <div className={`w-2.5 h-2.5 rounded-full border flex-shrink-0
            ${colorLabel === 'White' ? 'bg-[#f0d9b5] border-gray-400' : 'bg-[#4a3728] border-gray-600'}`} />
          <span className="text-xs text-gray-500">{colorLabel}</span>
        </div>
      </div>

      {/* Turn indicator */}
      {isTheirTurn && !isGameOver && (
        <div className="flex-shrink-0 w-2 h-2 rounded-full bg-green-400 shadow-[0_0_6px_#4ade80] animate-pulse" />
      )}
    </div>
  );
}

export default function ChessGame({ gameState, players, currentUserId, onMove, onClose, onEndGame }) {
  const [game, setGame] = useState(() => new Chess());
  const [selectedSquare, setSelectedSquare] = useState(null);
  const [legalMoves, setLegalMoves] = useState([]);

  useEffect(() => {
    const fen = gameState?.game_state?.fen;
    if (!fen) return;
    try {
      const g = new Chess(fen);
      setGame(g);
      setSelectedSquare(null);
      setLegalMoves([]);
    } catch (e) {
      console.warn('[ChessGame] Invalid FEN:', fen, e);
    }
  }, [gameState?.game_state?.fen]);

  const myIndex      = players?.findIndex(p => p.user_id === currentUserId) ?? -1;
  const myColor      = myIndex === 0 ? 'white' : 'black';
  const myColorCode  = myColor === 'white' ? 'w' : 'b';

  // Prefer top-level status — it's updated by both WS events and the local optimistic
  // forfeit update. game_state.status may still say 'active' when we optimistically set
  // top-level status to 'forfeited', so check it second.
  const serverStatus = gameState?.status || gameState?.game_state?.status || 'active';
  const isGameOver   = ['checkmate', 'stalemate', 'draw', 'finished', 'forfeited', 'completed'].includes(serverStatus);

  const gameTurn  = game.turn();
  const isMyTurn  = !isGameOver && gameTurn === myColorCode;

  const myPlayerObj   = players?.find(p => p.user_id === currentUserId);
  const opponentObj   = players?.find(p => p.user_id !== currentUserId);
  const winnerId      = gameState?.winner_id;
  const winnerPlayer  = winnerId ? players?.find(p => p.user_id === winnerId) : null;
  const isInCheck     = !isGameOver && game.isCheck();

  const isDraw     = serverStatus === 'stalemate' || serverStatus === 'draw';
  const iWon       = winnerId === currentUserId;
  const winnerName = winnerPlayer?.username || (iWon ? 'You' : (opponentObj?.username || 'Opponent'));

  // Which player is white / black
  const whitePlayer = players?.[0];
  const blackPlayer = players?.[1];
  const opponentIsWhite = myColor === 'black';

  // From my POV: opponent is at top, I'm at bottom
  const topPlayer    = opponentObj;
  const bottomPlayer = myPlayerObj;
  const topColor     = opponentIsWhite ? 'White' : 'Black';
  const bottomColor  = opponentIsWhite ? 'Black' : 'White';
  const isTopTurn    = gameTurn !== myColorCode;
  const isBottomTurn = gameTurn === myColorCode;

  const statusText = () => {
    if (serverStatus === 'checkmate') return winnerPlayer ? `${winnerPlayer.username} wins! ♟` : 'Checkmate!';
    if (serverStatus === 'stalemate') return 'Stalemate — Draw!';
    if (serverStatus === 'draw')      return "It's a Draw!";
    if (serverStatus === 'forfeited') return winnerId
      ? (iWon ? 'Opponent forfeited — You win!' : `${winnerName} wins!`)
      : 'Game forfeited';
    if (serverStatus === 'finished' || serverStatus === 'completed') {
      if (isDraw || !winnerId) return "It's a Draw!";
      return iWon ? 'You win! 🏆' : `${winnerName} wins!`;
    }
    if (isInCheck) return isMyTurn ? '⚠ You are in check!' : `⚠ ${opponentObj?.username || 'Opponent'} is in check`;
    return isMyTurn
      ? 'Your turn — tap a piece to select'
      : `${opponentObj?.username || 'Opponent'}'s turn`;
  };

  const attemptMove = useCallback((from, to) => {
    const copy  = new Chess(game.fen());
    const piece = copy.get(from);
    const isPromotion = piece?.type === 'p' &&
      ((piece.color === 'w' && to[1] === '8') || (piece.color === 'b' && to[1] === '1'));
    let result;
    try { result = copy.move({ from, to, promotion: isPromotion ? 'q' : undefined }); }
    catch { return false; }
    if (!result) return false;
    onMove({ from, to, ...(isPromotion && { promotion: 'q' }) });
    setGame(copy);
    setSelectedSquare(null);
    setLegalMoves([]);
    return true;
  }, [game, onMove]);

  const handleSquareClick = useCallback((square) => {
    if (!isMyTurn) return;

    if (selectedSquare) {
      if (square === selectedSquare) { setSelectedSquare(null); setLegalMoves([]); return; }
      const moved = attemptMove(selectedSquare, square);
      if (moved) return;
    }

    const piece = game.get(square);
    if (!piece || piece.color !== myColorCode) { setSelectedSquare(null); setLegalMoves([]); return; }

    const moves = game.moves({ square, verbose: true });
    if (!moves.length) { setSelectedSquare(null); setLegalMoves([]); return; }

    setSelectedSquare(square);
    setLegalMoves(moves.map(m => ({ to: m.to, isCapture: !!game.get(m.to) })));
  }, [isMyTurn, selectedSquare, attemptMove, game, myColorCode]);

  const ranks          = myColor === 'white' ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8];
  const files          = myColor === 'white' ? FILES : [...FILES].reverse();
  const legalTargets   = new Set(legalMoves.map(m => m.to));
  const captureTargets = new Set(legalMoves.filter(m => m.isCapture).map(m => m.to));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      style={{ touchAction: 'none' }}
    >
      <div className="flex flex-col items-center gap-2 w-full max-w-[min(80vw,420px)]">

        {/* Status pill */}
        <div className={`px-5 py-1.5 rounded-full text-sm font-semibold transition-colors
          ${isGameOver
            ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/40'
            : isMyTurn
              ? 'bg-green-500/20 text-green-300 border border-green-500/40'
              : 'bg-gray-700/80 text-gray-300 border border-gray-600'
          }`}>
          {statusText()}
        </div>

        {/* Opponent bar (top) */}
        <PlayerBar
          player={topPlayer}
          isCurrentUser={false}
          colorLabel={topColor}
          isTheirTurn={isTopTurn}
          isGameOver={isGameOver}
        />

        {/* Board */}
        <div className="w-full rounded-lg overflow-hidden relative" style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.7)' }}>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(8, 1fr)' }}>
            {ranks.map(rank =>
              files.map(file => {
                const square     = `${file}${rank}`;
                const piece      = game.get(square);
                const fileIdx    = FILES.indexOf(file);
                const rankIdx    = 8 - rank;
                const isLight    = (fileIdx + rankIdx) % 2 === 1;
                const isSelected = square === selectedSquare;
                const isLegal    = legalTargets.has(square);
                const isCapture  = captureTargets.has(square);

                let bg = isLight ? '#f0d9b5' : '#4a3728';
                if (isSelected)              bg = '#f6f669';
                else if (isLegal && !isCapture) bg = isLight ? '#cdd26a' : '#aaa23a';

                return (
                  <div
                    key={square}
                    onClick={() => handleSquareClick(square)}
                    className="relative flex items-center justify-center select-none"
                    style={{
                      background: bg,
                      aspectRatio: '1',
                      cursor: isMyTurn && !isGameOver ? 'pointer' : 'default',
                    }}
                  >
                    {isCapture && (
                      <div
                        className="absolute inset-0 pointer-events-none"
                        style={{ boxShadow: 'inset 0 0 0 4px rgba(0,0,0,0.35)' }}
                      />
                    )}
                    {piece && (() => {
                      const key     = `${piece.color}${piece.type.toUpperCase()}`;
                      const PieceSvg = defaultPieces[key];
                      return PieceSvg ? (
                        <div className="pointer-events-none" style={{ width: '80%', height: '80%' }}>
                          <PieceSvg svgStyle={{ width: '100%', height: '100%' }} />
                        </div>
                      ) : null;
                    })()}
                  </div>
                );
              })
            )}
          </div>

          {/* Winner overlay */}
          {isGameOver && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/75 backdrop-blur-sm z-10 gap-4">
              <div className="text-5xl">{isDraw ? '🤝' : iWon ? '🏆' : '😔'}</div>
              <div className="text-2xl font-bold text-white text-center px-4">
                {isDraw ? "It's a Draw!" : iWon ? 'You Win!' : `${winnerName} Wins!`}
              </div>
              {serverStatus === 'forfeited' && !iWon && <div className="text-sm text-gray-400">You forfeited</div>}
              {serverStatus === 'forfeited' && iWon  && <div className="text-sm text-gray-400">Opponent forfeited</div>}
              <button
                onClick={onClose}
                className="mt-2 px-6 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          )}
        </div>

        {/* Current user bar (bottom) */}
        <PlayerBar
          player={bottomPlayer}
          isCurrentUser={true}
          colorLabel={bottomColor}
          isTheirTurn={isBottomTurn}
          isGameOver={isGameOver}
        />

        {!isGameOver && (
          <button
            onClick={onEndGame || onClose}
            className="px-5 py-1.5 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm transition-colors"
          >
            Forfeit
          </button>
        )}
      </div>
    </div>
  );
}
