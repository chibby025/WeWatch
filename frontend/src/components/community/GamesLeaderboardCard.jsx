import React, { useState, useMemo } from 'react';
import { ChevronDownIcon } from '@heroicons/react/24/outline';

const RANK_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32'];
const RANK_GLOW   = [
  '0 0 10px rgba(255,215,0,0.4)',
  '0 0 10px rgba(192,192,192,0.3)',
  '0 0 10px rgba(205,127,50,0.3)',
];
const RANK_MEDALS = ['🥇', '🥈', '🥉'];

function formatValue(value, metric) {
  const n = Math.round(Number(value) || 0);
  return metric === 'score' ? `${n.toLocaleString()} pts` : `${n} win${n === 1 ? '' : 's'}`;
}

// GamesLeaderboardCard — one dropdown-driven leaderboard covering every game
// GetGamesLeaderboardHandler returns (see that handler's own comment for the
// full inclusion/exclusion list). The whole payload (all games' top-10s) is
// fetched once and passed in via the `games` prop; switching the dropdown
// only changes which already-loaded group is rendered — no re-fetch.
const GamesLeaderboardCard = ({ games = [] }) => {
  // Default to the first game that actually has entries, so the card
  // doesn't land on an empty list on first render when a more interesting
  // one has real data — falls back to the first game overall if literally
  // none do yet.
  const defaultGameType = useMemo(() => {
    const withEntries = games.find(g => g.entries?.length > 0);
    return (withEntries || games[0])?.game_type || '';
  }, [games]);

  const [selectedGameType, setSelectedGameType] = useState(defaultGameType);
  const active = games.find(g => g.game_type === selectedGameType) || games[0];

  const anyDataAtAll = games.some(g => g.entries?.length > 0);

  if (!games.length || !anyDataAtAll) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 px-6 text-center bg-gradient-to-br from-gray-900 to-black">
        <span className="text-4xl">🎮</span>
        <p className="text-white/60 text-sm">No game records yet.</p>
        <p className="text-white/40 text-xs">Play some games in a room to appear here!</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-gradient-to-br from-gray-900 via-slate-900 to-black overflow-hidden">
      {/* Game picker */}
      <div className="flex-shrink-0 px-3 pt-8 pb-2" onClick={e => e.stopPropagation()}>
        <div className="relative group">
          <select
            value={selectedGameType}
            onChange={e => setSelectedGameType(e.target.value)}
            className="w-full appearance-none bg-gradient-to-r from-indigo-900/60 via-purple-900/50 to-indigo-900/60
              border border-indigo-400/25 rounded-xl pl-3.5 pr-9 py-2.5
              text-white text-xs font-semibold tracking-wide
              shadow-[0_2px_12px_rgba(129,90,255,0.2)]
              outline-none focus:ring-2 focus:ring-indigo-400/50 focus:border-indigo-400/60
              hover:border-indigo-400/50 hover:from-indigo-900/70 hover:via-purple-900/60 hover:to-indigo-900/70
              transition-all duration-200 cursor-pointer"
          >
            {games.map(g => (
              <option key={g.game_type} value={g.game_type} className="bg-gray-900 text-white">
                {g.label} {g.entries?.length ? `(${g.entries.length})` : ''}
              </option>
            ))}
          </select>
          <ChevronDownIcon className="w-4 h-4 text-indigo-300 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none transition-transform duration-200 group-focus-within:rotate-180 group-focus-within:text-purple-300" />
        </div>
      </div>

      {/* Ranked list for the selected game */}
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {!active?.entries?.length ? (
          <div className="h-full flex flex-col items-center justify-center gap-2 text-center py-6">
            <span className="text-3xl opacity-50">🎮</span>
            <p className="text-white/50 text-xs">No {active?.label} records yet.</p>
          </div>
        ) : (
          active.entries.map((entry, idx) => {
            const rank      = idx + 1;
            const rankColor = RANK_COLORS[idx] || 'rgba(255,255,255,0.4)';
            const glow      = RANK_GLOW[idx]   || 'none';

            return (
              <div
                key={entry.user_id}
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
                  {entry.avatar_url ? (
                    <img src={entry.avatar_url} alt={entry.username} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-emerald-700 to-teal-600">
                      <span className="text-base">🎮</span>
                    </div>
                  )}
                </div>

                {/* Username */}
                <div className="flex-1 min-w-0">
                  <p className="text-white text-xs font-semibold truncate">@{entry.username}</p>
                </div>

                {/* Value */}
                <div className="flex-shrink-0 text-right">
                  <span className="text-[11px] font-black text-emerald-400">
                    {formatValue(entry.value, active.metric)}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default GamesLeaderboardCard;
