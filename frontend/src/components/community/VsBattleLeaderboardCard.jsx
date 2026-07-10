import React from 'react';

const RANK_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32'];
const RANK_GLOW   = [
  '0 0 10px rgba(255,215,0,0.4)',
  '0 0 10px rgba(192,192,192,0.3)',
  '0 0 10px rgba(205,127,50,0.3)',
];
const RANK_MEDALS = ['🥇', '🥈', '🥉'];

const VsBattleLeaderboardCard = ({ players = [] }) => {
  if (!players.length) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 px-6 text-center bg-gradient-to-br from-gray-900 to-black">
        <span className="text-4xl">⚔️</span>
        <p className="text-white/60 text-sm">No VS Battle records yet.</p>
        <p className="text-white/40 text-xs">Complete some battles to appear here!</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-gradient-to-br from-gray-900 via-slate-900 to-black overflow-hidden">
      <div className="flex-1 overflow-y-auto px-3 pt-8 pb-3">
        {players.map((player, idx) => {
          const rank      = idx + 1;
          const rankColor = RANK_COLORS[idx] || 'rgba(255,255,255,0.4)';
          const glow      = RANK_GLOW[idx]   || 'none';
          const winPct    = player.win_rate ?? 0;
          const barW      = Math.round(Math.min(winPct, 100));

          return (
            <div
              key={player.user_id}
              className="flex items-center gap-2 pr-2 py-3 border-b border-white/5 last:border-0"
            >
              {/* Rank */}
              <div
                className="flex-shrink-0 font-black text-sm w-5 text-center"
                style={{ color: rankColor, textShadow: idx < 3 ? glow : 'none' }}
              >
                {rank <= 3 ? RANK_MEDALS[rank - 1] : `#${rank}`}
              </div>

              {/* Avatar */}
              <div className="flex-shrink-0 w-9 h-9 rounded-full overflow-hidden bg-gray-700 ring-1 ring-white/10">
                {player.avatar_url ? (
                  <img src={player.avatar_url} alt={player.username} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-red-700 to-orange-600">
                    <span className="text-base">⚔️</span>
                  </div>
                )}
              </div>

              {/* Stats */}
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-semibold truncate">@{player.username}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-green-400 text-[10px] font-bold">{player.wins}W</span>
                  <span className="text-white/30 text-[10px]">·</span>
                  <span className="text-red-400 text-[10px] font-bold">{player.losses}L</span>
                  <span className="text-white/30 text-[10px]">·</span>
                  <span className="text-white/45 text-[10px]">{player.total_games} battles</span>
                </div>
                {/* Win-rate bar */}
                <div className="mt-1 h-1 rounded-full bg-white/10 overflow-hidden" style={{ width: '100%' }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${barW}%`,
                      background: winPct >= 60
                        ? 'linear-gradient(90deg, #22c55e, #16a34a)'
                        : winPct >= 40
                        ? 'linear-gradient(90deg, #f59e0b, #d97706)'
                        : 'linear-gradient(90deg, #ef4444, #dc2626)',
                    }}
                  />
                </div>
              </div>

              {/* Win rate label */}
              <div className="flex-shrink-0 text-right">
                <span
                  className="text-[11px] font-black"
                  style={{ color: winPct >= 60 ? '#4ade80' : winPct >= 40 ? '#fbbf24' : '#f87171' }}
                >
                  {winPct.toFixed(0)}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default VsBattleLeaderboardCard;
