import React from 'react';

function Stars({ rating }) {
  const full = Math.round(rating);
  return (
    <div className="flex items-center" style={{ gap: 1 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <svg key={n} width="10" height="10" viewBox="0 0 10 10">
          <polygon
            points="5,1 6.18,3.64 9,3.64 6.88,5.51 7.63,8.36 5,6.77 2.37,8.36 3.12,5.51 1,3.64 3.82,3.64"
            fill={n <= full ? '#FFD700' : 'rgba(255,255,255,0.15)'}
          />
        </svg>
      ))}
    </div>
  );
}

const RANK_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32'];
const RANK_GLOW   = [
  '0 0 10px rgba(255,215,0,0.4)',
  '0 0 10px rgba(192,192,192,0.3)',
  '0 0 10px rgba(205,127,50,0.3)',
];

const RATING_ICON = {
  'G':           '/icons/G Rating Icon.webp',
  'PG':          '/icons/PG Rating Icon.webp',
  'Educational': '/icons/Educational_Rating_Icon.webp',
  'Religious':   '/icons/Religious Rating.webp',
  '13+':         '/icons/13_ Rating Icon.webp',
  '16+':         '/icons/16_ Rating Icon.webp',
  '18+':         '/icons/18_ Rating Icon.webp',
  'Mature':      '/icons/Mature Rating Icon.webp',
};

const LeaderboardCard = ({ rooms = [], fullscreen = false }) => {
  if (!rooms.length) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 px-6 text-center bg-gradient-to-br from-gray-900 to-black">
        <span className="text-4xl">🏆</span>
        <p className="text-white/60 text-sm">No rooms with enough ratings yet.</p>
        <p className="text-white/40 text-xs">Rate more sessions to unlock Room Ratings!</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col bg-gradient-to-br from-gray-900 via-slate-900 to-black overflow-hidden">
      {/* Room list — flat rows, no container box */}
      <div className="flex-1 overflow-y-auto px-3 pt-8 pb-3">
        {rooms.map((room, idx) => {
          const rank      = idx + 1;
          const rankColor = RANK_COLORS[idx] || 'rgba(255,255,255,0.4)';
          const glow      = RANK_GLOW[idx]   || 'none';
          return (
            <div
              key={room.room_id}
              className="flex items-center gap-2 pl-0 pr-2 py-3 border-b border-white/5 last:border-0"
            >
              {/* Rank badge */}
              <div
                className="flex-shrink-0 font-black text-sm w-5 text-center"
                style={{ color: rankColor, textShadow: idx < 3 ? glow : 'none' }}
              >
                {rank <= 3 ? ['🥇','🥈','🥉'][rank - 1] : `#${rank}`}
              </div>

              {/* Room image */}
              <div className="flex-shrink-0 w-9 h-9 rounded-lg overflow-hidden bg-gray-700">
                {room.image_url ? (
                  <img src={room.image_url} alt={room.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-700 to-blue-700">
                    <span className="text-lg">🎬</span>
                  </div>
                )}
              </div>

              {/* Room info */}
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-semibold truncate">{room.name}</p>
                <div className="flex items-center mt-0.5" style={{ gap: 4 }}>
                  <Stars rating={room.avg_rating} />
                  <span className="text-white/45 text-[10px]">{room.avg_rating?.toFixed(1)}</span>
                </div>
              </div>

              {/* Content rating icon — own column. Shown in both the compact
                  carousel card and the fullscreen view; slightly smaller
                  compact so it doesn't crowd the narrower card. */}
              {room.content_rating && RATING_ICON[room.content_rating] && (
                <img
                  src={RATING_ICON[room.content_rating]}
                  alt={room.content_rating}
                  className={`flex-shrink-0 object-contain ${fullscreen ? 'w-8 h-8' : 'w-6 h-6'}`}
                />
              )}

              {/* Host avatar */}
              <div className="flex-shrink-0 flex flex-col items-end gap-1">
                <div className="w-5 h-5 rounded-full overflow-hidden bg-gray-600">
                  {room.host_avatar_url ? (
                    <img src={room.host_avatar_url} alt={room.host_username} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-purple-500 to-blue-500" />
                  )}
                </div>
                <span className="text-white/35 text-[9px] truncate max-w-[52px]">@{room.host_username}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default LeaderboardCard;
