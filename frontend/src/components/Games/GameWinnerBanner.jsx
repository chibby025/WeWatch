import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

const CONFETTI_COLORS = ['#ef4444','#3b82f6','#22c55e','#eab308','#a855f7','#f97316'];

const GAME_LABELS = {
  tic_tac_toe: 'Tic-Tac-Toe',
  rock_paper_scissors: 'Rock Paper Scissors',
  chess: 'Chess',
  othello: 'Othello',
  checkers: 'Checkers',
  crazy_eights: 'Crazy Eights',
  ludo: 'Ludo',
  glass_bridge: 'Glass Bridge',
  uno: 'UNO',
  blackjack: 'Blackjack',
  jigsaw: 'Jigsaw Puzzle',
  wordle: 'Wordle',
  would_you_rather: 'Would You Rather',
  ping_pong: 'Ping Pong',
  snakes_ladders: 'Snakes & Ladders',
  mancala: 'Mancala',
  ramp_rush: 'Ramp Rush',
  wordsmith: 'Wordsmith',
  rebus_round: 'Rebus Round',
  four_frames: 'Four Frames',
  fowl_play: 'Fowl Play',
  toad_ball: 'Toad Ball',
  golf: 'Mini Golf',
  rhythm_hero: 'Rhythm Hero',
  pool: '8-Ball Pool',
  dominoes: 'Dominoes',
  darts: 'Darts',
  bowling: 'Bowling',
  basketball: 'Basketball H.O.R.S.E',
  archery: 'Archery Battle',
  curling: 'Curling',
  slice_frenzy: 'Slice Frenzy',
  skeeball: 'Skeeball',
};

/**
 * Props:
 *   winner        – player object {user_id, username, avatar, color} | null (draw) | 'draw' string
 *   gameType      – 'tic_tac_toe' | 'chess' | etc.
 *   gameStats     – { lines: [{ label, value }] }  (empty array = no stats)
 *   isForfeit     – bool
 *   onClose       – () => void
 *   onPostResult  – (text: string) => void  (called before onClose)
 *   secondaryAction – { label: string, onClick: () => void } | undefined
 */
export default function GameWinnerBanner({
  winner,
  gameType = '',
  gameStats = { lines: [] },
  isForfeit = false,
  onClose,
  onPostResult,
  secondaryAction,
}) {
  const [showStats, setShowStats] = useState(false);

  const gameName = GAME_LABELS[gameType] || gameType;

  // normalise: both null and the string 'draw' mean draw
  const isDraw = !winner || winner === 'draw';
  const winnerPlayer = isDraw ? null : winner;

  // pick ring color from player.color field, or fall back to purple
  const winnerColor = winnerPlayer?.color || '#7c3aed';

  const handleClose = () => {
    if (onPostResult) {
      let text;
      if (isDraw) {
        text = `🤝 ${gameName} ended in a draw!${isForfeit ? ' (by forfeit)' : ''}`;
      } else {
        text = `🏆 ${winnerPlayer.username} wins ${gameName}!${isForfeit ? ' (by forfeit)' : ''}`;
      }
      onPostResult(text);
    }
    onClose?.();
  };

  return (
    <>
      <style>{`
        @keyframes gwbBannerIn {
          0%   { opacity:0; transform:scale(0.88); }
          100% { opacity:1; transform:scale(1); }
        }
        @keyframes gwbTrophySpin {
          0%   { transform:rotate(-15deg) scale(1); }
          50%  { transform:rotate(15deg)  scale(1.15); }
          100% { transform:rotate(-15deg) scale(1); }
        }
        @keyframes gwbConfettiFall {
          0%   { transform:translateY(-20px) rotate(0deg);   opacity:1; }
          100% { transform:translateY(140px) rotate(720deg); opacity:0; }
        }
      `}</style>

      {/* Full-screen overlay — z-[200] sits above every game's own z-50 */}
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center"
        style={{ background: 'rgba(0,0,0,0.82)', backdropFilter: 'blur(6px)' }}
      >
        {/* Confetti (only for winner, not draw) */}
        {!isDraw && [...Array(16)].map((_, i) => {
          const left  = 10 + (i * 5.5) % 82;
          const delay = (i * 0.18) % 1.6;
          const dur   = 1.4 + (i % 4) * 0.25;
          const size  = 6 + (i % 4) * 3;
          return (
            <div key={i} style={{
              position: 'absolute',
              left: `${left}%`,
              top: '-10px',
              width: size,
              height: size,
              borderRadius: i % 3 === 0 ? '2px' : '50%',
              background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
              animation: `gwbConfettiFall ${dur}s ${delay}s ease-in infinite`,
              pointerEvents: 'none',
            }}/>
          );
        })}

        {/* Card */}
        <div
          className="relative flex flex-col items-center gap-4 px-8 py-8 rounded-2xl mx-6 text-center w-full"
          style={{
            background: 'linear-gradient(135deg,#1e1b4b 0%,#1e3a8a 100%)',
            border: '2px solid #6d28d9',
            boxShadow: '0 0 40px rgba(109,40,217,0.5), 0 20px 60px rgba(0,0,0,0.7)',
            animation: 'gwbBannerIn 0.4s cubic-bezier(0.34,1.56,0.64,1) both',
            minWidth: 240,
            maxWidth: 340,
          }}
        >
          {winnerPlayer ? (
            /* ── Winner ── */
            <>
              <div style={{ fontSize: 64, lineHeight: 1, animation: 'gwbTrophySpin 2s ease-in-out infinite' }}>
                🏆
              </div>

              {/* Avatar */}
              <div className="flex flex-col items-center gap-2">
                <div
                  className="w-14 h-14 rounded-full overflow-hidden flex-shrink-0"
                  style={{ boxShadow: `0 0 0 4px ${winnerColor}` }}
                >
                  {winnerPlayer.avatar ? (
                    <img src={winnerPlayer.avatar} alt={winnerPlayer.username} className="w-full h-full object-cover"/>
                  ) : (
                    <div
                      className="w-full h-full flex items-center justify-center text-xl font-bold text-white"
                      style={{ background: winnerColor }}
                    >
                      {winnerPlayer.username?.[0]?.toUpperCase()}
                    </div>
                  )}
                </div>
                <div>
                  <p className="text-white/60 text-xs uppercase tracking-widest mb-0.5">Winner</p>
                  <p className="text-white text-xl font-black">{winnerPlayer.username}</p>
                  {isForfeit && (
                    <p className="text-purple-300 text-xs mt-0.5">by forfeit</p>
                  )}
                </div>
              </div>
            </>
          ) : (
            /* ── Draw ── */
            <>
              <div style={{ fontSize: 56, lineHeight: 1 }}>🤝</div>
              <div>
                <p className="text-white text-xl font-black">It's a Draw!</p>
                <p className="text-purple-300 text-sm mt-1">Tied scores — no single winner</p>
                {isForfeit && (
                  <p className="text-purple-300 text-xs mt-0.5">by forfeit</p>
                )}
              </div>
            </>
          )}

          {/* Stats toggle */}
          {gameStats.lines.length > 0 && (
            <div className="w-full">
              <button
                onClick={() => setShowStats(s => !s)}
                className="flex items-center justify-center gap-1.5 w-full py-1.5 px-3 rounded-lg text-purple-300 text-xs font-semibold hover:bg-white/10 transition-colors"
              >
                {showStats ? <ChevronUp className="w-3.5 h-3.5"/> : <ChevronDown className="w-3.5 h-3.5"/>}
                {showStats ? 'Hide Stats' : 'Show Stats'}
              </button>

              {showStats && (
                <div className="mt-2 rounded-xl overflow-hidden" style={{ background: 'rgba(0,0,0,0.35)' }}>
                  {gameStats.lines.map(({ label, value }, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between px-3 py-1.5 text-xs"
                      style={{ borderTop: idx > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}
                    >
                      <span className="text-white/60">{label}</span>
                      <span className="text-white font-semibold">{value}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Buttons */}
          <div className="flex flex-col gap-2 w-full mt-1">
            {secondaryAction && (
              <button
                onClick={secondaryAction.onClick}
                className="w-full py-2.5 rounded-xl text-white font-bold text-sm transition-all active:scale-95"
                style={{
                  background: 'rgba(255,255,255,0.12)',
                  border: '1px solid rgba(255,255,255,0.18)',
                }}
              >
                {secondaryAction.label}
              </button>
            )}

            <button
              onClick={handleClose}
              className="w-full py-3 rounded-xl text-white font-bold text-sm transition-all active:scale-95"
              style={{
                background: 'linear-gradient(135deg,#7c3aed,#4f46e5)',
                boxShadow: '0 4px 14px rgba(124,58,237,0.5)',
              }}
            >
              Close Game
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
