import React, { useState, useEffect, useRef } from 'react';

export default function RedLightGreenLightGame({ gameState, players, currentUserId, onMove, onClose, onEndGame }) {
  const gs = gameState?.game_state || {};
  const phase = gs.phase || 'waiting';
  const schedule = gs.schedule || [];
  const startTime = gs.start_time || 0; // Unix ms
  const alive = gs.alive || {};
  const positions = gs.positions || {};
  const finishLine = gs.finish_line || 100;

  const isHostUser = (players || [])[0]?.user_id === currentUserId;
  const myKey = String(currentUserId);
  const isAlive = alive[myKey] !== false;
  const myPos = positions[myKey] || 0;

  // Client-side current color computed from schedule + start_time
  const [currentColor, setCurrentColor] = useState('red');
  const [eliminated, setEliminated] = useState(false);
  const [moving, setMoving] = useState(false);
  const colorIntervalRef = useRef(null);

  useEffect(() => {
    if (phase !== 'running' || !startTime) {
      setCurrentColor('red');
      clearInterval(colorIntervalRef.current);
      return;
    }

    function computeColor() {
      const elapsed = Date.now() - startTime;
      let cumulative = 0;
      for (const entry of schedule) {
        if (elapsed < cumulative + entry.duration_ms) {
          setCurrentColor(entry.color);
          return;
        }
        cumulative += entry.duration_ms;
      }
      setCurrentColor('red'); // schedule ended
    }

    computeColor();
    colorIntervalRef.current = setInterval(computeColor, 100);
    return () => clearInterval(colorIntervalRef.current);
  }, [phase, startTime, schedule]);

  useEffect(() => {
    if (!alive[myKey]) setEliminated(true);
  }, [alive]);

  function handleMove() {
    if (phase !== 'running' || eliminated) return;
    setMoving(true);
    setTimeout(() => setMoving(false), 150);
    onMove({ move_type: 'move' });
  }

  // Keyboard support
  useEffect(() => {
    function onKey(e) {
      if (e.code === 'Space' || e.code === 'ArrowRight' || e.code === 'ArrowUp') {
        e.preventDefault();
        handleMove();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, eliminated, currentColor]);

  const bgColor = phase === 'waiting' ? 'from-gray-800 to-gray-900'
    : currentColor === 'green' ? 'from-green-900 to-green-950'
    : 'from-red-900 to-red-950';

  return (
    <div className={`flex flex-col h-full bg-gradient-to-b ${bgColor} text-white select-none transition-all duration-300`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/30 backdrop-blur-sm">
        <div>
          <h2 className="text-lg font-bold text-white">Red Light, Green Light</h2>
          <p className="text-xs text-white/60">Move on Green · Freeze on Red</p>
        </div>
        <div className="flex gap-2">
          {onEndGame && (
            <button onClick={onEndGame} className="px-3 py-1 text-sm bg-red-700 hover:bg-red-800 rounded-lg">End</button>
          )}
          <button onClick={onClose} className="px-3 py-1 text-sm bg-white/20 hover:bg-white/30 rounded-lg">✕</button>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-between p-4 gap-4">
        {/* Traffic light */}
        <div className="flex flex-col items-center gap-2 mt-4">
          <div className="bg-gray-800 rounded-2xl p-3 flex flex-col gap-2 shadow-2xl border border-gray-700">
            <div className={`w-14 h-14 rounded-full transition-all duration-200
              ${phase === 'running' && currentColor === 'red' ? 'bg-red-500 shadow-red-500/60 shadow-lg' : 'bg-red-900/40'}`} />
            <div className={`w-14 h-14 rounded-full transition-all duration-200
              ${phase === 'running' && currentColor === 'green' ? 'bg-green-500 shadow-green-500/60 shadow-lg' : 'bg-green-900/40'}`} />
          </div>
          <p className={`font-black text-2xl tracking-widest ${
            phase === 'waiting' ? 'text-white/40' :
            currentColor === 'green' ? 'text-green-400' : 'text-red-400'}`}>
            {phase === 'waiting' ? 'READY' : currentColor === 'green' ? 'GO!' : 'STOP!'}
          </p>
        </div>

        {/* Track */}
        <div className="w-full max-w-sm">
          <div className="relative h-8 bg-gray-800/60 rounded-full border border-gray-700">
            {/* Finish line */}
            <div className="absolute right-2 top-0 bottom-0 w-0.5 bg-yellow-400/60" />
            {/* Player dots */}
            {(players || []).map(p => {
              const isAliveP = alive[String(p.user_id)] !== false;
              const pos = positions[String(p.user_id)] || 0;
              const percent = (pos / finishLine) * 90; // leave margin for finish
              return (
                <div
                  key={p.user_id}
                  title={p.username}
                  className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 transition-all duration-300 text-xs flex items-center justify-center
                    ${isAliveP ? 'bg-green-500 border-green-300' : 'bg-gray-700 border-gray-600 opacity-40'}
                    ${p.user_id === currentUserId ? 'ring-2 ring-white' : ''}`}
                  style={{ left: `${percent}%` }}
                >
                  {!isAliveP && '💀'}
                </div>
              );
            })}
          </div>
          <div className="flex justify-between text-xs text-white/40 mt-1">
            <span>Start</span>
            <span>🏁 Finish</span>
          </div>
        </div>

        {/* My status */}
        <div className="text-center">
          {eliminated ? (
            <div className="bg-red-900/40 border border-red-600 rounded-xl px-6 py-3">
              <p className="text-3xl">💀</p>
              <p className="text-red-300 font-bold">Eliminated!</p>
              <p className="text-gray-400 text-sm">You moved on red</p>
            </div>
          ) : myPos >= finishLine ? (
            <div className="bg-green-900/40 border border-green-500 rounded-xl px-6 py-3">
              <p className="text-3xl">🏆</p>
              <p className="text-green-300 font-bold">You crossed!</p>
            </div>
          ) : phase === 'waiting' ? (
            <div className="text-white/50 text-sm">
              {isHostUser ? (
                <button
                  onClick={() => onMove({ move_type: 'start' })}
                  className="px-8 py-3 bg-green-600 hover:bg-green-500 rounded-xl font-bold text-white text-lg"
                >
                  Start Game
                </button>
              ) : (
                <p>Waiting for host to start…</p>
              )}
            </div>
          ) : phase === 'ended' ? (
            <div className="bg-purple-900/40 border border-purple-500 rounded-xl px-6 py-3">
              <p className="text-xl font-bold text-purple-200">Game Over</p>
            </div>
          ) : (
            <button
              onPointerDown={handleMove}
              disabled={eliminated || phase !== 'running'}
              className={`w-36 h-36 rounded-full text-white font-black text-2xl transition-all
                ${currentColor === 'green'
                  ? 'bg-green-600 hover:bg-green-500 shadow-lg shadow-green-900 active:scale-95'
                  : 'bg-gray-700/50 cursor-not-allowed opacity-40'}
                ${moving ? 'scale-90' : ''}`}
            >
              {currentColor === 'green' ? 'MOVE!' : '⛔'}
              <div className="text-xs font-normal mt-1 opacity-70">Space / →</div>
            </button>
          )}
        </div>

        {/* Player list */}
        {phase !== 'waiting' && (
          <div className="w-full max-w-sm grid grid-cols-2 gap-2">
            {(players || []).map(p => {
              const isAliveP = alive[String(p.user_id)] !== false;
              const pos = positions[String(p.user_id)] || 0;
              return (
                <div key={p.user_id} className={`bg-white/5 rounded-lg px-3 py-2 flex items-center gap-2
                  ${!isAliveP ? 'opacity-40' : ''}`}>
                  <span>{isAliveP ? '🟢' : '💀'}</span>
                  <div className="min-w-0">
                    <p className="text-sm truncate">{p.username}</p>
                    <p className="text-xs text-white/40">{pos}/{finishLine}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
