import React, { useState } from 'react';

// 5 aim zones with emoji representations for the table
const AIM_ZONES = [0, 1, 2, 3, 4];
const ZONE_LABELS = ['⬅⬅', '⬅', '◉', '➡', '➡➡'];
const ZONE_NAMES = ['Far Left', 'Left', 'Center', 'Right', 'Far Right'];
const BANK_OPTIONS = [
  { value: 'none', label: 'No Bank', emoji: '↑' },
  { value: 'left', label: 'Bank Left', emoji: '↖' },
  { value: 'right', label: 'Bank Right', emoji: '↗' },
];
const BLOCK_OPTIONS = [
  { value: 'left', label: 'Block Left' },
  { value: 'center', label: 'Block Center' },
  { value: 'right', label: 'Block Right' },
];

export default function AirHockeyGame({ gameState, players, currentUserId, onMove, onClose, onEndGame }) {
  const gs = gameState?.game_state || {};
  const phase = gs.phase || 'attacking';
  const attackerID = gs.attacker_id || '';
  const defenderID = gs.defender_id || '';
  const scores = gs.scores || {};
  const lastResult = gs.last_result || '';
  const lastZone = gs.last_zone;
  const lastBank = gs.last_bank;
  const lastBlock = gs.last_block;
  const winScore = gs.win_score || 5;
  const rally = gs.rally || 0;

  const myKey = String(currentUserId);
  const isAttacker = attackerID === myKey;
  const isDefender = defenderID === myKey;

  const attackerName = (players || []).find(p => String(p.user_id) === attackerID)?.username || 'Attacker';
  const defenderName = (players || []).find(p => String(p.user_id) === defenderID)?.username || 'Defender';

  const [selectedZone, setSelectedZone] = useState(null);
  const [selectedBank, setSelectedBank] = useState('none');

  function handleShoot() {
    if (selectedZone === null || !isAttacker || phase !== 'attacking') return;
    onMove({ move_type: 'aim', zone: selectedZone, bank: selectedBank });
    setSelectedZone(null);
    setSelectedBank('none');
  }

  function handleBlock(block) {
    if (!isDefender || phase !== 'defending') return;
    onMove({ move_type: 'block', block });
  }

  const isEnded = phase === 'ended';

  return (
    <div className="flex flex-col h-full bg-gray-900 text-white select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700">
        <div>
          <h2 className="text-lg font-bold text-cyan-300">Air Hockey</h2>
          <p className="text-xs text-gray-400">
            {isEnded ? 'Game Over' :
              phase === 'attacking' ? `${attackerName} is shooting` :
              `${defenderName} is blocking`}
          </p>
        </div>
        <div className="flex gap-2">
          {onEndGame && (
            <button onClick={onEndGame} className="px-3 py-1 text-sm bg-red-600 hover:bg-red-700 rounded-lg">End</button>
          )}
          <button onClick={onClose} className="px-3 py-1 text-sm bg-gray-600 hover:bg-gray-700 rounded-lg">✕</button>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center overflow-y-auto p-4 gap-4">
        {/* Scoreboard */}
        <div className="flex gap-8 items-center">
          <div className="text-center">
            <p className="text-xs text-gray-400 truncate max-w-[80px]">{attackerName}</p>
            <p className="text-4xl font-black text-cyan-400">{scores[attackerID] || 0}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-500">Rally {rally}</p>
            <p className="text-gray-500">–</p>
            <p className="text-xs text-gray-500">First to {winScore}</p>
          </div>
          <div className="text-center">
            <p className="text-xs text-gray-400 truncate max-w-[80px]">{defenderName}</p>
            <p className="text-4xl font-black text-orange-400">{scores[defenderID] || 0}</p>
          </div>
        </div>

        {/* Last result badge */}
        {lastResult && rally > 0 && (
          <div className={`text-sm font-bold px-4 py-1.5 rounded-full
            ${lastResult === 'scored' ? 'bg-green-800 text-green-300' : 'bg-orange-900 text-orange-300'}`}>
            {lastResult === 'scored'
              ? `⚡ Goal! (Zone ${ZONE_NAMES[lastZone] || lastZone}${lastBank !== 'none' ? `, bank ${lastBank}` : ''})`
              : `🥅 Saved! (${lastBlock} block)`}
          </div>
        )}

        {/* Hockey table visual */}
        <div className="relative w-full max-w-xs bg-cyan-950/60 border-2 border-cyan-700 rounded-xl overflow-hidden" style={{ height: 80 }}>
          <div className="absolute inset-0 flex items-center justify-center opacity-20">
            <div className="w-16 h-16 rounded-full border-2 border-cyan-400" />
          </div>
          <div className="absolute inset-x-0 top-1/2 h-0.5 bg-cyan-700/50" />
          {/* Goal */}
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-20 h-2 bg-orange-600/60 rounded-t" />
          <p className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[9px] text-orange-300">GOAL</p>
        </div>

        {isEnded ? (
          <div className="text-center bg-cyan-900/40 border border-cyan-500 rounded-xl p-6">
            <p className="text-3xl mb-2">🏒</p>
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
            <div className="w-full max-w-xs">
              <p className="text-sm text-gray-400 mb-2">🥅 Pick aim zone:</p>
              <div className="flex gap-1.5">
                {AIM_ZONES.map(z => (
                  <button
                    key={z}
                    onClick={() => setSelectedZone(z === selectedZone ? null : z)}
                    className={`flex-1 py-3 rounded-lg text-lg font-bold transition-all active:scale-95
                      ${selectedZone === z ? 'bg-cyan-600 ring-2 ring-white' : 'bg-gray-700 hover:bg-gray-600'}`}
                    title={ZONE_NAMES[z]}
                  >
                    {ZONE_LABELS[z]}
                  </button>
                ))}
              </div>
              {selectedZone !== null && (
                <p className="text-xs text-cyan-300 mt-1 text-center">{ZONE_NAMES[selectedZone]}</p>
              )}
            </div>

            <div className="w-full max-w-xs">
              <p className="text-sm text-gray-400 mb-2">🔀 Bank shot (optional):</p>
              <div className="flex gap-2">
                {BANK_OPTIONS.map(b => (
                  <button
                    key={b.value}
                    onClick={() => setSelectedBank(b.value)}
                    className={`flex-1 py-2 rounded-lg text-sm transition-all
                      ${selectedBank === b.value ? 'bg-yellow-600 text-white ring-1 ring-yellow-300' : 'bg-gray-700 hover:bg-gray-600 text-gray-300'}`}
                  >
                    <div className="text-lg">{b.emoji}</div>
                    <div className="text-xs">{b.label}</div>
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={handleShoot}
              disabled={selectedZone === null}
              className="w-full max-w-xs py-3 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 rounded-xl font-bold text-white"
            >
              🏒 Shoot!
            </button>
          </>
        ) : phase === 'defending' && isDefender ? (
          <div className="w-full max-w-xs">
            <p className="text-sm text-gray-400 mb-3 text-center">🥅 Pick your block zone:</p>
            <div className="flex gap-2">
              {BLOCK_OPTIONS.map(b => (
                <button
                  key={b.value}
                  onClick={() => handleBlock(b.value)}
                  className="flex-1 py-5 rounded-xl text-sm font-bold bg-gray-700 hover:bg-orange-700 active:scale-95 transition-all"
                >
                  {b.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2 text-center">
              Left covers zones 0-1 · Center covers zone 2 · Right covers zones 3-4
            </p>
          </div>
        ) : (
          <div className="text-center text-gray-400 py-6">
            <p className="text-4xl mb-3">🏒</p>
            <p className="text-sm">
              {phase === 'attacking' ? `Waiting for ${attackerName} to shoot…` :
               `Waiting for ${defenderName} to block…`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
