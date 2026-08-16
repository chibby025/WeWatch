// Top/bottom sprite overlays for the currently-picked instrument — real,
// user-supplied GIFs decoded once into horizontal PNG sprite sheets (see
// SpriteFramePlayer for why: a plain <img src="x.gif"> gives JS zero
// playback control, and this needs to slow down/speed up with rolling
// accuracy, not just loop at a fixed rate).
//
// All 4 instruments (guitar/bass/drums/vocals) get InstrumentTopOverlay — a
// full-performer sprite absolutely positioned OVER the highway itself,
// camera-tracked to the far end (see getHighwayAnchors in
// rhythmGameEngine.js), not a separate layout row above it. Guitar/bass
// additionally get InstrumentBottomOverlay, a fretting-hand close-up at the
// near/hit-line end — drums/vocals have no equivalent second shot, so the
// caller only mounts it when INSTRUMENT_BOTTOM_SHEETS has an entry for the
// current instrument (see spriteSheets.js). Both are siblings of the
// <canvas> inside its own `relative` container, pointer-events-none
// throughout so they never intercept clicks/touches meant for the highway
// or its HUD.
//
// Drums/vocals used to render as a small procedural SVG in their own row
// above the highway instead (no licensed art was available at the time —
// see the FoFiX/UltraStar Play asset research elsewhere in this project's
// history for why that's a dead end generally) — replaced entirely once
// real GIFs were supplied for both.

import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import SpriteFramePlayer from './SpriteFramePlayer';

const hexIntToCss = (n) => `#${n.toString(16).padStart(6, '0')}`;

// Star Power's own highway/rail color shift target (rhythmGameEngine.js
// lerps toward this exact hex during SP) — reused here so the overlay's
// glow/rim-light genuinely matches what the rest of the scene is doing,
// not an independently-chosen color.
const SP_COLOR_CSS = '#3ef0ff';

// Full-body performer sprite, overlaid on the FAR (top) end of the
// highway — absolutely positioned inside the same relative container as the
// <canvas>, not a layout row of its own. Also carries this overlay's own
// "stage light" treatment: a beat-synced spotlight glow, a streak-reactive
// rim light around the sprite, a Star Power flash + color shift, a per-hit
// color-matched flash burst, and a subtle beat-synced sway — all driven by
// getPlayerVisualState() (rhythmGameEngine.js), which is just exposing math
// the engine already computes each frame for the highway/fret/audience
// visuals, not duplicating it. Identical for all 4 instruments — only the
// `sheet` (which GIF-derived sprite sheet to play) and `accentColor` (which
// instrument's own theme color) differ per caller.
//
// Every one of these is applied IMPERATIVELY via refs inside the same rAF
// loop that already tracks position below — never React state — since this
// runs every single frame during gameplay; routing it through setState would
// mean a full re-render 60x/sec for a purely cosmetic effect.
//
// Position is NOT a CSS guess — engineRef is the same ref the caller already
// holds the live Game instance in (see rhythmGameEngine.js's
// getHighwayAnchors), and this component reads the highway's real far-edge
// world point, projected through the actual live camera, every frame. A
// flat top-[X%] CSS value can only ever approximate where that point lands
// on screen (the camera's FOV responds to aspect ratio, and the camera
// itself moves slightly during play — combo sway, Star Power dolly), so it
// drifts on some window sizes/orientations no matter how carefully it's
// tuned by eye. Reading the real projection is exact on every screen size,
// with zero tuning needed. If engineRef isn't supplied (or the engine isn't
// constructed yet), falls back to a fixed className so nothing breaks.
export const InstrumentTopOverlay = forwardRef(function InstrumentTopOverlay({ className, style, engineRef, accentColor, sheet }, ref) {
  const spriteRef = useRef(null);
  const elRef = useRef(null);
  const spotlightRef = useRef(null);
  const spGlowRef = useRef(null);
  const spFlashRef = useRef(null);
  const hitFlashRef = useRef(null);
  useImperativeHandle(ref, () => ({
    setSpeed(multiplier) { spriteRef.current?.setSpeed(multiplier); },
  }), []);

  const accentCss = accentColor != null ? hexIntToCss(accentColor) : '#8a2be2';

  useEffect(() => {
    if (!engineRef) return;
    let raf;
    let lastFrame = performance.now();
    // Both smoothed locally here (not read straight off getPlayerVisualState
    // each frame) so the SP glow ramps in/out over ~150-250ms instead of
    // snapping — a snap would look like a glitch, not a "power up" moment.
    let spGlowOpacity = 0;
    let spFlashOpacity = 0;
    let wasSpActive = false;
    const loop = () => {
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastFrame) / 1000);
      lastFrame = now;

      const anchors = engineRef.current?.getHighwayAnchors?.();
      if (anchors && elRef.current) {
        // The box's BOTTOM edge (where the sprite's feet render, since the
        // sprite fills the box top-to-bottom) is what should land on the
        // computed point — not the box's top — so this uses `bottom`
        // (measured from the container's own bottom), not `top`.
        elRef.current.style.bottom = `${100 - anchors.farEdge.yPercent}%`;
        elRef.current.style.left = `${anchors.farEdge.xPercent}%`;
      }

      const vis = engineRef.current?.getPlayerVisualState?.();
      if (vis) {
        // Beat-synced spotlight glow, brightening on streak too.
        if (spotlightRef.current) {
          spotlightRef.current.style.opacity = String(0.24 + vis.beatPulse * 0.32 + vis.streakT * 0.28);
        }
        // Beat-synced sway + streak-reactive rim light, applied directly to
        // the sprite's OWN root node (via SpriteFramePlayer's `element`
        // handle) rather than a wrapper div around it — see that handle's
        // own comment for why: filter/transform never affect box size, so
        // mutating them on the sprite's existing node is guaranteed not to
        // disturb its parent's (elRef's) shrink-to-fit sizing, unlike an
        // extra wrapper level did.
        const spriteEl = spriteRef.current?.element;
        if (spriteEl) {
          spriteEl.style.transform =
            `translateY(${-vis.beatPulse * 3}px) scale(${1 + vis.beatPulse * 0.035})`;
          const rimBlur = 4 + vis.streakT * 16;
          const rimColor = vis.spActive ? SP_COLOR_CSS : accentCss;
          spriteEl.style.filter =
            `drop-shadow(0 6px 10px rgba(0,0,0,0.55)) drop-shadow(0 0 ${rimBlur}px ${rimColor})`;
        }
        // Star Power ambient color-shift glow — smoothly ramped, not snapped.
        spGlowOpacity += ((vis.spActive ? 0.9 : 0) - spGlowOpacity) * Math.min(1, dt * 6);
        if (spGlowRef.current) spGlowRef.current.style.opacity = String(spGlowOpacity);
        // One-shot flash burst exactly on the activation edge.
        if (vis.spActive && !wasSpActive) spFlashOpacity = 1;
        else spFlashOpacity = Math.max(0, spFlashOpacity - dt * 2.4);
        if (spFlashRef.current) spFlashRef.current.style.opacity = String(spFlashOpacity);
        wasSpActive = vis.spActive;
        // Per-hit color-matched flash burst, color from whichever lane was
        // just hit.
        if (hitFlashRef.current) {
          hitFlashRef.current.style.opacity = String(vis.hitFlash * 0.75);
          hitFlashRef.current.style.background =
            `radial-gradient(circle, ${hexIntToCss(vis.hitColor)} 0%, transparent 70%)`;
        }
      }

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [engineRef, accentCss]);

  return (
    <div
      ref={elRef}
      className={className ?? 'absolute -translate-x-1/2 h-[13%] sm:h-[16%] pointer-events-none z-[5]'}
      style={engineRef ? { ...style } : { top: '20%', left: '50%', ...style }}
    >
      {/* Beat/streak spotlight glow, sized well beyond the sprite bounds so
          it reads as light spilling onto a stage floor, not a halo hugging
          the sprite outline. */}
      <div
        ref={spotlightRef}
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 65% 85% at 50% 65%, ${accentCss}70 0%, transparent 72%)`,
          transform: 'scale(2.4)',
          opacity: 0.24,
        }}
      />
      {/* Star Power ambient color-shift, stacked above the base glow — ramps
          in/out with spGlowOpacity above. */}
      <div
        ref={spGlowRef}
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 65% 85% at 50% 65%, ${SP_COLOR_CSS}80 0%, transparent 72%)`,
          transform: 'scale(2.6)',
          opacity: 0,
        }}
      />
      {/* One-shot white/cyan burst on the exact frame Star Power activates. */}
      <div
        ref={spFlashRef}
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(circle, #ffffffd0 0%, ${SP_COLOR_CSS}55 45%, transparent 75%)`,
          transform: 'scale(3.2)',
          opacity: 0,
        }}
      />
      {/* Per-hit flash burst, color-matched to whichever lane was just hit. */}
      <div
        ref={hitFlashRef}
        className="absolute inset-0 pointer-events-none"
        style={{ transform: 'scale(1.8)', opacity: 0 }}
      />
      <SpriteFramePlayer
        ref={spriteRef}
        sheetUrl={sheet.url}
        frameCount={sheet.frameCount}
        frameWidth={sheet.frameWidth}
        frameHeight={sheet.frameHeight}
        baseFrameMs={80}
        className="h-full w-auto"
      />
    </div>
  );
});

// Fretting-hand close-up, overlaid on the NEAR (bottom, hit-line) end of the
// highway — same positioning approach as InstrumentTopOverlay, mirrored to
// the bottom edge. Guitar/bass only (see spriteSheets.js's
// INSTRUMENT_BOTTOM_SHEETS) — drums/vocals have no second close-up shot, so
// the caller simply doesn't mount this for those instruments.
export const InstrumentBottomOverlay = forwardRef(function InstrumentBottomOverlay({ className, style, sheet }, ref) {
  const spriteRef = useRef(null);
  useImperativeHandle(ref, () => ({
    setSpeed(multiplier) { spriteRef.current?.setSpeed(multiplier); },
  }), []);

  return (
    <div
      className={className ?? 'absolute bottom-0 left-[60%] -translate-x-1/2 h-[18%] sm:h-[22%] pointer-events-none z-[5]'}
      style={{ filter: 'drop-shadow(0 -4px 10px rgba(0,0,0,0.55))', ...style }}
    >
      <SpriteFramePlayer
        ref={spriteRef}
        sheetUrl={sheet.url}
        frameCount={sheet.frameCount}
        frameWidth={sheet.frameWidth}
        frameHeight={sheet.frameHeight}
        baseFrameMs={80}
        className="h-full w-auto"
      />
    </div>
  );
});
