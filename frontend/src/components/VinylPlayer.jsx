import React, { useEffect, useRef } from 'react';

const VinylPlayer = ({ artworkUrl, title, artist, isPlaying = true, size = 220 }) => {
  const discRef   = useRef(null);
  const rotRef    = useRef(0);
  const rafRef    = useRef(null);
  const lastTsRef = useRef(null);

  useEffect(() => {
    const disc = discRef.current;
    if (!disc) return;

    if (!isPlaying) {
      cancelAnimationFrame(rafRef.current);
      lastTsRef.current = null;
      return;
    }

    const tick = (ts) => {
      if (lastTsRef.current !== null) {
        // 33⅓ RPM → 360° per 1800 ms → 0.2°/ms
        rotRef.current = (rotRef.current + (ts - lastTsRef.current) * 0.2) % 360;
        disc.style.transform = `rotate(${rotRef.current}deg)`;
      }
      lastTsRef.current = ts;
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying]);

  const labelDiam = Math.round(size * 0.42);
  const holeDiam  = Math.round(size * 0.055);

  return (
    <div className="flex flex-col items-center gap-3 select-none">
      {/* Disc wrapper: extra space on right for tonearm */}
      <div className="relative" style={{ width: size + 28, height: size }}>

        {/* Spinning vinyl disc */}
        <div
          ref={discRef}
          className="absolute rounded-full"
          style={{
            width:  size,
            height: size,
            top: 0,
            left: 0,
            background: 'radial-gradient(circle at 50% 50%, #2a2a2a 0%, #141414 100%)',
            boxShadow: '0 16px 56px rgba(0,0,0,0.85), inset 0 0 0 1px rgba(255,255,255,0.06)',
          }}
        >
          {/* Groove rings */}
          {[...Array(9)].map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full border"
              style={{
                inset: `${10 + i * 4.2}%`,
                borderColor: i % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.01)',
              }}
            />
          ))}

          {/* Center label */}
          <div
            className="absolute rounded-full overflow-hidden"
            style={{
              width:  labelDiam,
              height: labelDiam,
              top:    '50%',
              left:   '50%',
              transform: 'translate(-50%, -50%)',
              boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)',
            }}
          >
            {artworkUrl ? (
              <img
                src={artworkUrl}
                alt={title || 'Track artwork'}
                className="w-full h-full object-cover"
              />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #7c3aed 0%, #2563eb 100%)' }}
              >
                <img
                  src="/icons/lwoIcon.webp"
                  alt=""
                  className="opacity-75"
                  style={{ width: labelDiam * 0.45, height: labelDiam * 0.45, objectFit: 'contain' }}
                />
              </div>
            )}
          </div>

          {/* Spindle hole */}
          <div
            className="absolute rounded-full bg-black"
            style={{
              width:  holeDiam,
              height: holeDiam,
              top:    '50%',
              left:   '50%',
              transform: 'translate(-50%, -50%)',
            }}
          />
        </div>

        {/* Tonearm (static) — pivots at top-right, tip rests near groove */}
        <div
          className="absolute"
          style={{
            right: 0,
            top:   size * 0.04,
            width:  4,
            height: size * 0.52,
            background: 'linear-gradient(to bottom, #aaa 0%, #555 100%)',
            borderRadius: 3,
            transformOrigin: 'top center',
            transform: isPlaying ? 'rotate(-20deg)' : 'rotate(-38deg)',
            transition: 'transform 0.9s ease',
            zIndex: 10,
          }}
        >
          {/* Pivot cap */}
          <div
            className="absolute rounded-full"
            style={{
              width: 10,
              height: 10,
              top: -4,
              left: '50%',
              transform: 'translateX(-50%)',
              background: '#999',
              boxShadow: '0 1px 4px rgba(0,0,0,0.5)',
            }}
          />
          {/* Stylus tip */}
          <div
            className="absolute rounded-full"
            style={{
              width: 6,
              height: 6,
              bottom: -2,
              left: '50%',
              transform: 'translateX(-50%)',
              background: '#ccc',
            }}
          />
        </div>
      </div>

      {(title || artist) && (
        <div className="text-center px-2">
          {title  && <p className="text-white font-semibold text-sm truncate max-w-[220px]">{title}</p>}
          {artist && <p className="text-white/55 text-xs truncate max-w-[220px] mt-0.5">{artist}</p>}
        </div>
      )}
    </div>
  );
};

export default VinylPlayer;
