import { useEffect, useRef, useState } from 'react';

const SPEED = 60; // px/s — slow and meditative
const SIZE = 80;  // px logo size

// Try public folder first; fall back to BunnyCDN if the file isn't in the build
const LOGO_SRCS = [
  '/icons/lwoIcon.webp',
  'https://LetsWatchOut.b-cdn.net/icons/lwoIcon.webp',
  '/icons/lwoIcon.png',
];

// Hue offsets to cycle through on each wall bounce
const HUE_ROTATIONS = [0, 60, 130, 200, 270, 330];

export default function DVDBounce() {
  const wrapRef  = useRef(null);
  const imgRef   = useRef(null);
  const [srcIdx, setSrcIdx] = useState(0);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const state = {
      x:       Math.random() * Math.max(0, wrap.clientWidth  - SIZE),
      y:       Math.random() * Math.max(0, wrap.clientHeight - SIZE),
      dx:      (Math.random() > 0.5 ? 1 : -1) * SPEED,
      dy:      (Math.random() > 0.5 ? 1 : -1) * (SPEED * 0.65),
      hueIdx:  0,
      lastTs:  null,
    };

    let rafId;

    const tick = (ts) => {
      if (state.lastTs === null) { state.lastTs = ts; rafId = requestAnimationFrame(tick); return; }

      const dt = Math.min((ts - state.lastTs) / 1000, 0.05);
      state.lastTs = ts;

      state.x += state.dx * dt;
      state.y += state.dy * dt;

      const w = wrap.clientWidth;
      const h = wrap.clientHeight;
      let bounced = false;

      if (state.x <= 0) {
        state.x = 0; state.dx = Math.abs(state.dx); bounced = true;
      } else if (state.x >= w - SIZE) {
        state.x = w - SIZE; state.dx = -Math.abs(state.dx); bounced = true;
      }
      if (state.y <= 0) {
        state.y = 0; state.dy = Math.abs(state.dy); bounced = true;
      } else if (state.y >= h - SIZE) {
        state.y = h - SIZE; state.dy = -Math.abs(state.dy); bounced = true;
      }

      if (bounced) state.hueIdx = (state.hueIdx + 1) % HUE_ROTATIONS.length;

      const img = imgRef.current;
      if (img) {
        img.style.transform = `translate(${state.x}px, ${state.y}px)`;
        if (bounced) img.style.filter = `hue-rotate(${HUE_ROTATIONS[state.hueIdx]}deg)`;
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div ref={wrapRef} className="absolute inset-0 pointer-events-none overflow-hidden z-10">
      <style>{`
        @keyframes dvd-fadein { from { opacity: 0 } to { opacity: 0.45 } }
      `}</style>
      <img
        ref={imgRef}
        src={LOGO_SRCS[srcIdx]}
        alt=""
        draggable={false}
        onError={() => setSrcIdx(i => Math.min(i + 1, LOGO_SRCS.length - 1))}
        style={{
          position:  'absolute',
          left:      0,
          top:       0,
          width:     SIZE,
          height:    SIZE,
          objectFit: 'contain',
          animation: 'dvd-fadein 1.5s ease-in forwards',
          willChange: 'transform, filter',
        }}
      />
    </div>
  );
}
