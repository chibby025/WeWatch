import React from 'react';

export default function GlassBridgeGame({ gameState, players, currentUserId, onMove, onClose, onEndGame }) {
  const gs = gameState?.game_state || {};
  const slots = gs.slots || 6;
  const revealed = gs.revealed || [];
  const safeSides = gs.safe_sides || [];
  const positions = gs.positions || {};
  const phase = gs.phase || 'playing';
  const attempts = gs.attempts || {};

  const myKey = String(currentUserId);
  const myPos = positions[myKey] ?? -1;

  // Determine whose turn it is
  const currentTurn = gameState?.current_turn ?? 0;
  const currentPlayer = (players || [])[currentTurn];
  const isMyTurn = currentPlayer?.user_id === currentUserId;

  function handleStep(side) {
    if (!isMyTurn || phase !== 'playing') return;
    onMove({ move_type: 'step', side });
  }

  // Build platform grid: N slots × 2 sides
  const platformCells = Array.from({ length: slots }, (_, i) => ({
    index: i,
    isRevealed: !!revealed[i],
    safeSide: safeSides[i] || '',
    playersHere: Object.entries(positions)
      .filter(([, pos]) => pos === i)
      .map(([uid]) => (players || []).find(p => String(p.user_id) === uid)),
  }));

  const SIDE_COLORS = {
    left: 'bg-blue-600',
    right: 'bg-purple-600',
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-900 text-white select-none overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700">
        <div>
          <h2 className="text-lg font-bold text-purple-300">Glass Bridge</h2>
          <p className="text-xs text-gray-400">
            {phase === 'playing'
              ? isMyTurn ? 'Your turn — choose a side!' : `Waiting for ${currentPlayer?.username || '...'}…`
              : 'Game Over'}
          </p>
        </div>
        <div className="flex gap-2">
          {onEndGame && (
            <button onClick={() => { onEndGame?.(); onClose?.(); }} className="px-3 py-1 text-sm bg-red-600 hover:bg-red-700 rounded-lg">
              End
            </button>
          )}
          <button onClick={onClose} className="px-3 py-1 text-sm bg-gray-600 hover:bg-gray-700 rounded-lg">✕</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* Bridge */}
        <div className="mb-6">
          {/* Start zone */}
          <div className="flex gap-2 mb-2 justify-center">
            {(players || []).filter(p => (positions[String(p.user_id)] ?? -1) === -1).map(p => (
              <span key={p.user_id} className="text-lg" title={p.username}>🚶</span>
            ))}
            {(players || []).filter(p => (positions[String(p.user_id)] ?? -1) === -1).length === 0 && (
              <span className="text-gray-600 text-xs">All on bridge</span>
            )}
          </div>
          <p className="text-center text-xs text-gray-500 mb-3">⬆ START</p>

          {/* Platform rows */}
          <div className="flex flex-col gap-2 items-center">
            {platformCells.map(cell => (
              <div key={cell.index} className="flex gap-2 items-center w-full max-w-xs">
                <span className="text-xs text-gray-500 w-4 text-right">{cell.index + 1}</span>

                {/* Left platform */}
                <button
                  onClick={() => handleStep('left')}
                  disabled={!isMyTurn || phase !== 'playing' || myPos !== cell.index - 1}
                  className={`flex-1 h-12 rounded-lg font-bold text-sm transition-all relative
                    ${cell.isRevealed && cell.safeSide === 'left' ? 'bg-green-700 text-white cursor-default' :
                      cell.isRevealed && cell.safeSide === 'right' ? 'bg-red-900/60 text-red-400 cursor-default' :
                      isMyTurn && myPos === cell.index - 1 ? 'bg-gray-700 hover:bg-blue-700 text-white active:scale-95 cursor-pointer' :
                      'bg-gray-800/60 text-gray-600 cursor-default'}
                    ${cell.isRevealed && cell.safeSide === 'left' ? 'ring-1 ring-green-500' : ''}`}
                >
                  {cell.isRevealed ? (cell.safeSide === 'left' ? '✓ SAFE' : '✗') : 'LEFT'}
                  {/* Players on this side */}
                  {cell.playersHere.filter(p => p && (positions[String(p.user_id)] === cell.index)).length > 0 && (
                    <span className="absolute top-1 right-1 text-xs">🚶</span>
                  )}
                </button>

                {/* Right platform */}
                <button
                  onClick={() => handleStep('right')}
                  disabled={!isMyTurn || phase !== 'playing' || myPos !== cell.index - 1}
                  className={`flex-1 h-12 rounded-lg font-bold text-sm transition-all relative
                    ${cell.isRevealed && cell.safeSide === 'right' ? 'bg-green-700 text-white cursor-default' :
                      cell.isRevealed && cell.safeSide === 'left' ? 'bg-red-900/60 text-red-400 cursor-default' :
                      isMyTurn && myPos === cell.index - 1 ? 'bg-gray-700 hover:bg-purple-700 text-white active:scale-95 cursor-pointer' :
                      'bg-gray-800/60 text-gray-600 cursor-default'}
                    ${cell.isRevealed && cell.safeSide === 'right' ? 'ring-1 ring-green-500' : ''}`}
                >
                  {cell.isRevealed ? (cell.safeSide === 'right' ? '✓ SAFE' : '✗') : 'RIGHT'}
                </button>
              </div>
            ))}
          </div>

          <p className="text-center text-xs text-gray-400 mt-3">🏁 FINISH LINE</p>
        </div>

        {/* Game Over */}
        {(phase === 'ended' || gameState?.status === 'forfeited' || gameState?.status === 'finished') && (
          <div className="text-center bg-purple-900/40 border border-purple-500 rounded-xl p-4 mb-4">
            {gameState?.status === 'forfeited' ? (
              <>
                <p className="text-2xl mb-1">{gameState?.winner_id === currentUserId ? '🏆' : '💀'}</p>
                <p className="text-purple-200 font-bold">
                  {gameState?.winner_id === currentUserId
                    ? 'You win — opponent forfeited!'
                    : 'You forfeited'}
                </p>
              </>
            ) : (
              <>
                <p className="text-2xl mb-1">🏆</p>
                <p className="text-purple-200 font-bold">
                  {(players || []).find(p => (positions[String(p.user_id)] ?? -1) === slots - 1)?.username || 'Someone'} crossed first!
                </p>
              </>
            )}
            <button onClick={onClose} className="mt-3 px-5 py-1.5 bg-purple-700 hover:bg-purple-600 rounded-lg text-sm font-bold">
              Close
            </button>
          </div>
        )}

        {/* Player status */}
        <div className="grid grid-cols-2 gap-2">
          {(players || []).map((p, i) => {
            const pos = positions[String(p.user_id)] ?? -1;
            const progress = pos < 0 ? 0 : Math.round(((pos + 1) / slots) * 100);
            const wrongCount = attempts[String(p.user_id)] || 0;
            return (
              <div key={p.user_id} className={`bg-gray-800 rounded-lg p-2
                ${i === currentTurn && phase === 'playing' ? 'ring-1 ring-yellow-400' : ''}`}>
                <p className="text-sm font-medium text-gray-200 truncate">{p.username}</p>
                <p className="text-xs text-gray-400">
                  {pos < 0 ? 'At start' : pos === slots - 1 ? '🏁 Crossed!' : `Slot ${pos + 1}/${slots}`}
                </p>
                <div className="h-1 bg-gray-700 rounded-full mt-1.5">
                  <div className="h-1 bg-purple-500 rounded-full transition-all" style={{ width: `${progress}%` }} />
                </div>
                {wrongCount > 0 && (
                  <p className="text-xs text-red-400 mt-1">❌ {wrongCount} falls</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
