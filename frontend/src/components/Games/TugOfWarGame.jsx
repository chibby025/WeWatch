import React, { useState, useEffect, useRef } from 'react';

const ROUND_DURATION = 10; // seconds per round

export default function TugOfWarGame({ gameState, players, currentUserId, onMove, onClose, onEndGame }) {
  const gs = gameState?.game_state || {};
  const phase = gs.phase || 'pulling';
  const round = gs.round || 1;
  const maxRounds = gs.max_rounds || 3;
  const team1 = gs.team1 || [];
  const team2 = gs.team2 || [];
  const pulls = gs.pulls || {};
  const team1Pulls = gs.team1_pulls || 0;
  const team2Pulls = gs.team2_pulls || 0;
  const team1Wins = gs.team1_wins || 0;
  const team2Wins = gs.team2_wins || 0;
  const ropePosition = gs.rope_position || 0; // -100..+100, positive = team2 winning
  const lastWinner = gs.last_winner || '';
  const roundHistory = gs.round_history || [];

  const isHostUser = (players || [])[0]?.user_id === currentUserId;
  const myTeam = team1.includes(currentUserId) ? 1 : 2;

  const [timeLeft, setTimeLeft] = useState(ROUND_DURATION);
  const [pulling, setPulling] = useState(false);
  const timerRef = useRef(null);
  const countRef = useRef(0);

  // Start countdown when round begins
  useEffect(() => {
    if (phase !== 'pulling') {
      setTimeLeft(ROUND_DURATION);
      clearInterval(timerRef.current);
      return;
    }
    setTimeLeft(ROUND_DURATION);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          if (isHostUser) onMove({ move_type: 'end_round' });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [round, phase]);

  function handlePull() {
    if (phase !== 'pulling') return;
    setPulling(true);
    onMove({ move_type: 'pull' });
    setTimeout(() => setPulling(false), 80);
    countRef.current++;
  }

  // Keyboard listener for spacebar pulls
  useEffect(() => {
    function onKey(e) {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        handlePull();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase]);

  function getTeamName(teamNum) {
    const ids = teamNum === 1 ? team1 : team2;
    return ids.map(uid => (players || []).find(p => p.user_id === uid)?.username || uid).join(' & ');
  }

  // Rope visual: ropePosition -100..+100, 0 = center
  // positive = team2 pulling (rope goes right), negative = team1 pulling (rope goes left)
  const knobPercent = 50 + (ropePosition / 2); // map -100..+100 to 0..100%

  const team1Color = myTeam === 1 ? 'text-blue-400' : 'text-gray-400';
  const team2Color = myTeam === 2 ? 'text-purple-400' : 'text-gray-400';

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-900 text-white select-none overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700">
        <div>
          <h2 className="text-lg font-bold text-purple-300">Tug of War</h2>
          <p className="text-xs text-gray-400">Round {round}/{maxRounds} · {timeLeft}s</p>
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

      <div className="flex-1 flex flex-col items-center justify-between p-4 gap-4 overflow-y-auto">
        {/* Round wins */}
        <div className="flex gap-4 text-center">
          <div>
            <p className="text-xs text-gray-500">{getTeamName(1)}</p>
            <p className="text-3xl font-black text-blue-400">{team1Wins}</p>
          </div>
          <p className="text-gray-500 text-xl self-center">vs</p>
          <div>
            <p className="text-xs text-gray-500">{getTeamName(2)}</p>
            <p className="text-3xl font-black text-purple-400">{team2Wins}</p>
          </div>
        </div>

        {/* Rope */}
        <div className="w-full max-w-sm">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>⬅ Team 1</span>
            <span>Team 2 ➡</span>
          </div>
          <div className="relative h-6 bg-gray-700 rounded-full overflow-visible">
            {/* Rope bar */}
            <div className="absolute inset-0 flex items-center px-3">
              <div className="h-1 bg-yellow-600 w-full rounded-full" />
            </div>
            {/* Knob */}
            <div
              className="absolute top-1/2 -translate-y-1/2 w-6 h-6 bg-yellow-400 rounded-full border-2 border-yellow-600 shadow-lg transition-all duration-300"
              style={{ left: `calc(${knobPercent}% - 12px)` }}
            />
            {/* Center mark */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 h-full w-0.5 bg-white/30" />
          </div>
          <div className="flex justify-between text-xs mt-1">
            <span className="text-blue-400">{team1Pulls} pulls</span>
            <span className="text-purple-400">{team2Pulls} pulls</span>
          </div>
        </div>

        {/* Phase overlay */}
        {(phase === 'ended' || gameState?.status === 'forfeited' || gameState?.status === 'finished') ? (
          <div className="text-center bg-purple-900/40 border border-purple-500 rounded-xl p-4 w-full max-w-sm">
            {gameState?.status === 'forfeited' && phase !== 'ended' ? (
              <>
                <p className="text-3xl mb-1">{gameState?.winner_id === currentUserId ? '🏆' : '💀'}</p>
                <p className="text-white font-bold text-xl">
                  {gameState?.winner_id === currentUserId ? 'You win — opponent forfeited!' : 'You forfeited'}
                </p>
              </>
            ) : (
              <>
                <p className="text-3xl mb-1">{team1Wins > team2Wins ? '🥇' : team2Wins > team1Wins ? '🥇' : '🤝'}</p>
                <p className="text-white font-bold text-xl">
                  {team1Wins > team2Wins ? getTeamName(1) : team2Wins > team1Wins ? getTeamName(2) : "It's a Draw!"}
                </p>
                <p className="text-gray-400 text-sm mt-1">{team1Wins} – {team2Wins} rounds</p>
              </>
            )}
            <button onClick={onClose} className="mt-3 px-5 py-1.5 bg-purple-700 hover:bg-purple-600 rounded-lg text-sm font-bold">
              Close
            </button>
          </div>
        ) : (
          <>
            {/* Timer bar */}
            <div className="w-full max-w-sm">
              <div className="h-2 bg-gray-700 rounded-full">
                <div
                  className={`h-2 rounded-full transition-all duration-1000 ${timeLeft <= 3 ? 'bg-red-500' : 'bg-green-500'}`}
                  style={{ width: `${(timeLeft / ROUND_DURATION) * 100}%` }}
                />
              </div>
            </div>

            {/* Pull button */}
            <button
              onPointerDown={handlePull}
              disabled={phase !== 'pulling'}
              className={`w-40 h-40 rounded-full text-3xl font-black transition-all select-none
                ${pulling ? 'scale-95 bg-purple-600' : 'bg-purple-700 hover:bg-purple-600 active:scale-95'}
                ${phase !== 'pulling' ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer shadow-lg shadow-purple-900'}`}
            >
              PULL!
              <div className="text-sm font-normal mt-1 opacity-70">Space / Enter</div>
            </button>

            <p className="text-xs text-gray-500">
              My pulls: <span className="text-white font-bold">{pulls[String(currentUserId)] || 0}</span>
            </p>
          </>
        )}

        {/* Round history */}
        {roundHistory.length > 0 && (
          <div className="w-full max-w-sm">
            <p className="text-xs text-gray-500 uppercase font-semibold mb-2">History</p>
            {roundHistory.map((r, i) => (
              <div key={i} className="flex justify-between text-xs text-gray-400 bg-gray-800 rounded px-3 py-1.5 mb-1">
                <span>Round {r.round}</span>
                <span>{r.team1_pulls} – {r.team2_pulls}</span>
                <span className={r.winner === 'draw' ? 'text-yellow-400' : r.winner === 'team1' ? 'text-blue-400' : 'text-purple-400'}>
                  {r.winner === 'draw' ? 'Draw' : r.winner === 'team1' ? 'Team 1 ✓' : 'Team 2 ✓'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
