import React, { useEffect } from 'react';
import { HeartIcon } from '@heroicons/react/24/solid';

// Called by VideoWatch / CinemaScene3DDemo / LobbyPage.
// Props:
//   hearts   – array of { id, left, color, scale, dur, drift }
//   onRemove – (id) => void  called when a heart finishes animating
const TikTokHeartAnimation = ({ hearts = [], onRemove }) => {
  if (!hearts.length) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden">
      {hearts.map(h => (
        <Heart key={h.id} heart={h} onRemove={onRemove} />
      ))}
      <style>{`
        @keyframes heart-float-up {
          0%   { transform: translateY(0) translateX(0) scale(0.3); opacity: 0; }
          12%  { transform: translateY(-30px) translateX(calc(var(--drift) * 0.15)) scale(1.25); opacity: 1; }
          40%  { transform: translateY(-130px) translateX(calc(var(--drift) * 0.5)) scale(1); opacity: 0.9; }
          100% { transform: translateY(-320px) translateX(var(--drift)) scale(0.75); opacity: 0; }
        }
        .heart-float {
          animation: heart-float-up var(--dur) cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
        }
      `}</style>
    </div>
  );
};

const Heart = ({ heart, onRemove }) => {
  useEffect(() => {
    const t = setTimeout(() => onRemove?.(heart.id), heart.dur * 1000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="absolute heart-float"
      style={{
        left:      `${heart.left}%`,
        bottom:    '18%',
        '--drift': `${heart.drift}px`,
        '--dur':   `${heart.dur}s`,
      }}
    >
      <HeartIcon
        style={{ width: heart.scale * 64, height: heart.scale * 64, color: heart.color }}
        className="drop-shadow-xl"
      />
    </div>
  );
};

// Convenience factory — call this to create a heart entry for the state array.
export const makeHeart = () => ({
  id:    Math.random(),
  left:  30 + Math.random() * 40,          // 30–70 % of screen width
  color: ['#ff4d6d','#ff6b81','#ff3b5c','#ff758f','#ff85a1'][Math.floor(Math.random() * 5)],
  scale: 0.85 + Math.random() * 0.55,      // 0.85–1.4×
  dur:   1.4  + Math.random() * 0.6,       // 1.4–2.0 s
  drift: (Math.random() - 0.5) * 80,       // –40 to +40 px horizontal drift
});

export default TikTokHeartAnimation;
