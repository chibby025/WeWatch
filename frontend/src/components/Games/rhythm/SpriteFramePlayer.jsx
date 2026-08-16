import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

// Plays a horizontal sprite sheet (pre-decoded from a real GIF the user
// supplied — see the guitar top/bottom close-up wiring in InstrumentCloseup)
// frame-by-frame, driven by our own requestAnimationFrame loop rather than
// the browser's native GIF decoder. A plain <img src="x.gif"> gives
// JavaScript zero control over playback (no play/pause/rate) — this is what
// makes rolling-accuracy-driven speed actually possible.
//
// Sizing uses the standard responsive CSS sprite-sheet technique: the
// container is sized to exactly one frame (height fixed via aspect-ratio),
// background-size is frameCount*100% 100% (so the whole sheet spans
// frameCount container-widths), and background-position-x steps in
// 100/(frameCount-1)% increments — this selects frame i by percentage alone,
// no pixel math, no breakpoint-specific recomputation needed.
const SpriteFramePlayer = forwardRef(function SpriteFramePlayer(
  { sheetUrl, frameCount, frameWidth, frameHeight, baseFrameMs = 80, minSpeed = 0.35, maxSpeed = 1.5, className, style },
  ref
) {
  const elRef = useRef(null);
  const speedRef = useRef(1);
  const frameIdxRef = useRef(0);
  const accumRef = useRef(0);
  const rafRef = useRef(null);
  const lastTsRef = useRef(null);

  useImperativeHandle(ref, () => ({
    setSpeed(multiplier) {
      speedRef.current = Math.max(minSpeed, Math.min(maxSpeed, multiplier));
    },
    // Exposes the underlying root DOM node so a caller (InstrumentTopOverlay's
    // beat-synced sway / streak rim-light effects) can apply imperative,
    // per-frame style mutations (filter/transform) DIRECTLY to it — without
    // needing to wrap this component in an extra div. That wrapper approach
    // was tried once and reverted: nesting this element's aspect-ratio-based
    // sizing one level deeper inside an auto-width, absolutely-positioned
    // ancestor is a real cross-browser rough edge (shrink-to-fit width
    // computation through an aspect-ratio box can behave inconsistently),
    // and it visibly broke the overlay's on-screen position. Reaching
    // through to this element directly avoids that risk entirely — its own
    // parent relationship (and thus the parent's sizing) is unchanged.
    get element() {
      return elRef.current;
    },
  }), [minSpeed, maxSpeed]);

  useEffect(() => {
    frameIdxRef.current = 0;
    accumRef.current = 0;
    lastTsRef.current = null;
    const step = 100 / Math.max(1, frameCount - 1);

    function apply() {
      if (elRef.current) {
        elRef.current.style.backgroundPositionX = `${frameIdxRef.current * step}%`;
      }
    }
    apply();

    function loop(ts) {
      if (lastTsRef.current == null) lastTsRef.current = ts;
      const dt = ts - lastTsRef.current;
      lastTsRef.current = ts;
      const frameDuration = baseFrameMs / speedRef.current;
      accumRef.current += dt;
      // Cap the catch-up to one frame per tick even after a long tab-hidden
      // gap — avoids a visible fast-forward flash through many frames at once.
      if (accumRef.current >= frameDuration) {
        accumRef.current = accumRef.current % frameDuration;
        frameIdxRef.current = (frameIdxRef.current + 1) % frameCount;
        apply();
      }
      rafRef.current = requestAnimationFrame(loop);
    }
    rafRef.current = requestAnimationFrame(loop);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [frameCount, baseFrameMs]);

  return (
    <div
      ref={elRef}
      className={className}
      style={{
        aspectRatio: `${frameWidth} / ${frameHeight}`,
        backgroundImage: `url(${sheetUrl})`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: `${frameCount * 100}% 100%`,
        backgroundPosition: '0% 0%',
        ...style,
      }}
    />
  );
});

export default SpriteFramePlayer;
