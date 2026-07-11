import React, { useState } from 'react';

// 3×3 aim grid zones (row 0-2, col 0-2) encoded as 0-8
const AIM_ZONES = Array.from({ length: 9 }, (_, i) => i);
// Zone labels for display
const ZONE_LABELS = ['↖', '↑', '↗', '←', '◉', '→', '↙', '↓', '↘'];
const BLOCK_ZONES = ['left', 'center', 'right'];
const BLOCK_LABELS = { left: '⬅ Left', center: '↕ Center', right: '➡ Right' };

export default function PingPongGame({ gameState, players, currentUserId, onMove, onClose, onEndGame }) {
  const gs = gameState?.game_state || {};
  const phase = gs.phase || 'attacking';
  const attackerID = gs.attacker_id || '';
  const defenderID = gs.defender_id || '';
  const scores = gs.scores || {};
  const lastShot = gs.last_shot;
  const lastBlock = gs.last_block;
  const lastResult = gs.last_result || '';
  const rally = gs.rally || 0;
  const winScore = gs.win_score || 7;
  const gamePhase = gs.phase;

  const myKey = String(currentUserId);
  const isAttacker = attackerID === myKey;
  const isDefender = defenderID === myKey;

  const attackerName = (players || []).find(p => String(p.user_id) === attackerID)?.username || 'Attacker';
  const defenderName = (players || []).find(p => String(p.user_id) === defenderID)?.username || 'Defender';

  const [selectedZone, setSelectedZone] = useState(null);

  function handleShoot() {
    if (selectedZone === null || !isAttacker || phase !== 'attacking') return;
    onMove({ move_type: 'aim', zone: selectedZone });
    setSelectedZone(null);
  }

  function handleBlock(block) {
    if (!isDefender || phase !== 'defending') return;
    onMove({ move_type: 'block', block });
  }

  // Map zone index to column for block coverage highlight
  function zoneBlocked(zone, block) {
    const col = zone % 3;
    return (block === 'left' && col === 0) ||
           (block === 'center' && col === 1) ||
           (block === 'right' && col === 2);
  }

  const isEnded = gamePhase === 'ended';

  return (
    <div className="flex flex-col h-full bg-gray-900 text-white select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700">
        <div>
          <h2 className="text-lg font-bold text-purple-300">Ping Pong</h2>
          <p className="text-xs text-gray-400">
            {isEnded ? 'Game Over' :
              phase === 'attacking' ? `${attackerName} is attacking` :
              `${defenderName} is defending`}
          </p>
        </div>
        <div className="flex gap-2">
          {onEndGame && (
            <button onClick={onEndGame} className="px-3 py-1 text-sm bg-red-600 hover:bg-red-700 rounded-lg">End</button>
          )}
          <button onClick={onClose} className="px-3 py-1 text-sm bg-gray-600 hover:bg-gray-700 rounded-lg">✕</button>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center overflow-y-auto p-4 gap-5">
        {/* Scoreboard */}
        <div className="flex gap-8 items-center">
          <div className="text-center">
            <p className="text-xs text-gray-400 truncate max-w-[80px]">{attackerName}</p>
            <p className="text-4xl font-black text-blue-400">{scores[attackerID] || 0}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500">Rally {rally}</p>
            <p className="text-gray-500">–</p>
            <p className="text-xs text-gray-500">First to {winScore}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-400 truncate max-w-[80px]">{defenderName}</p>
            <p className="text-4xl font-black text-purple-400">{scores[defenderID] || 0}</p>
          </div>
        </div>

        {/* Last result */}
        {lastResult && rally > 0 && (
          <div className={`text-sm font-bold px-4 py-1.5 rounded-full
            ${lastResult === 'scored' ? 'bg-green-800 text-green-300' : 'bg-blue-900 text-blue-300'}`}>
            {lastResult === 'scored' ? '⚡ Point scored!' : '🛡 Blocked!'}
          </div>
        )}

        {isEnded ? (
          <div className="text-center bg-purple-900/40 border border-purple-500 rounded-xl p-6">
            <p className="text-3xl mb-2">🏆</p>
            {(() => {
              const a = scores[attackerID] || 0;
              const d = scores[defenderID] || 0;
              const winner = a >= winScore ? attackerName : d >= winScore ? defenderName : (a > d ? attackerName : d > a ? defenderName : null);
              return winner
                ? <><p className="text-xl font-bold text-white">{winner} wins!</p><p className="text-gray-400 text-sm mt-1">{a} – {d}</p></>
                : <p className="text-xl font-bold text-yellow-300">🤝 Draw!</p>;
            })()}
          </div>
        ) : phase === 'attacking' && isAttacker ? (
          <>
            <p className="text-sm text-gray-300">🏓 Pick your aim zone:</p>
            <div className="grid grid-cols-3 gap-2">
              {AIM_ZONES.map(z => (
                <button
                  key={z}
                  onClick={() => setSelectedZone(z === selectedZone ? null : z)}
                  className={`w-16 h-16 rounded-xl text-2xl font-bold transition-all active:scale-95
                    ${selectedZone === z ? 'bg-blue-600 ring-2 ring-white' : 'bg-gray-700 hover:bg-gray-600'}`}
                >
                  {ZONE_LABELS[z]}
                </button>
              ))}
            </div>
            <button
              onClick={handleShoot}
              disabled={selectedZone === null}
              className="px-8 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 rounded-xl font-bold text-white"
            >
              🏓 Shoot!
            </button>
          </>
        ) : phase === 'defending' && isDefender ? (
          <>
            <p className="text-sm text-gray-300">🛡 Pick your block zone:</p>
            <div className="flex gap-3">
              {BLOCK_ZONES.map(b => (
                <button
                  key={b}
                  onClick={() => handleBlock(b)}
                  className="flex-1 py-6 rounded-xl text-sm font-bold bg-gray-700 hover:bg-purple-700 active:scale-95 transition-all"
                >
                  {BLOCK_LABELS[b]}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="text-center text-gray-400 py-8">
            <p className="text-4xl mb-3">🏓</p>
            <p className="text-sm">
              {phase === 'attacking' ? `Waiting for ${attackerName} to aim…` :
               `Waiting for ${defenderName} to block…`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
