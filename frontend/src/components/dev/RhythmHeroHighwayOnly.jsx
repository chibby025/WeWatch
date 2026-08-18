// Bare, fullscreen render of ONLY the rhythm-hero highway — no header, no
// instrument picker, no simulate buttons, no status text, nothing else on
// screen. Built specifically so the camera FOV/dolly-back formula in
// rhythmGameEngine.js can be judged against real Chrome mobile device
// emulation (DevTools' device toolbar, real WebGL rendering path) with
// nothing else competing for layout space or attention.
//
// Deliberately a SEPARATE route/file from /dev/rhythm-hero-highway
// (RhythmHeroHighwayPreview.jsx), not a replacement of it — that one keeps
// its instrument picker + PERFECT/GOOD/MISS simulate buttons for judging
// sprite-sheet playback and speed-ramping, which this page has no use for.
//
// No real audio at all — a synthetic SILENT AudioBuffer + a hand-built
// chart (see below), not a fetched/decoded file. This page only needs the
// highway's geometry/camera framing to be right, never actual playback, so
// there's nothing here that can ever fail to decode (an earlier version
// fetched+decoded a real WAV test tone and hit a real `decodeAudioData`
// failure specifically on the mobile browser this page exists to test
// against — that whole class of risk is gone now, not just fixed). The
// engine's Game.start() only ever reads `audioBuffer.duration` and pipes
// the buffer through a real AudioBufferSourceNode for timing — a silent
// buffer of the same duration drives the exact same scroll/spawn timing as
// a real song, just makes no sound.
//
// Auto-starts immediately on mount with a fixed instrument (guitar) — colors
// don't affect the camera/FOV math this page exists to validate, only the
// geometry/perspective does, so no picker is needed. The canvas fills the
// entire real viewport (100dvh, zero padding) — exactly what the real game's
// own canvas gets (see RhythmHeroGame.jsx's `absolute inset-0` canvas
// container inside its own 100dvh root), so a formula that looks right here
// should carry over directly, since both pages already run the exact same
// Game class / camera functions — there is nothing to copy-paste, only the
// shared rhythmGameEngine.js file to tune if a change is ever needed.
//
// Registered as a persistent dev route (/dev/rhythm-hero-highway-only),
// matching this project's existing SVGComparison/VsBattlePreview/
// RhythmHeroHighwayPreview dev-tool convention — not a one-off harness
// deleted after use.
import { useEffect, useRef, useState } from 'react';
import { Game } from '../Games/rhythm/rhythmGameEngine';
import { InstrumentTopOverlay } from '../Games/rhythm/InstrumentCloseup';
import { INSTRUMENT_TOP_SHEETS } from '../Games/rhythm/spriteSheets';

// Matches RhythmHeroGame.jsx's real guitar config exactly.
const GUITAR_COLORS = [0x3fe34a, 0xff3b30, 0xffd60a, 0x2f7cff, 0xff9500];
const GUITAR_ACCENT = 0x8a2be2;
const GUITAR_ACCENT_RAIL = 0xb14cff;

// Long enough to leave running indefinitely while you eyeball the framing
// (no "song ends, engine stops" interruption mid-check).
const DURATION_SECONDS = 600;
// One note roughly every 1.2s, cycling through all 5 lanes so every lane's
// on-screen position (including the outermost ones, closest to the rails —
// the actual thing this page exists to verify) gets exercised, with an
// occasional sustain note (len>0) mixed in so tail-rendering is visible too.
function buildSyntheticChart() {
  const notes = [];
  for (let i = 0, t = 2; t < DURATION_SECONDS - 2; i++, t += 1.2) {
    notes.push({ t, lane: i % 5, len: i % 6 === 0 ? 0.6 : 0 });
  }
  return { bpm: 120, duration: DURATION_SECONDS, notes };
}

export default function RhythmHeroHighwayOnly() {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const engineRef = useRef(null);
  const topSpriteRef = useRef(null);
  // Guards the mount effect against React StrictMode's dev-only double
  // invoke — `startedRef` persists across StrictMode's synthetic
  // unmount+remount (same component instance, same refs object), so only
  // the first invocation's setup ever actually runs. Deliberately NOT
  // paired with a disposal cleanup on this same effect (see below) — a
  // dispose-on-cleanup was tried first and was a real, confirmed bug: even
  // with this guard preventing a SECOND construction, StrictMode still
  // fires the FIRST invocation's own cleanup immediately, which disposed
  // the freshly-built engine a moment after building it — before the
  // second (real, lasting) mount ever got to use it. Confirmed by checking
  // how RhythmHeroGame.jsx's own production engine-construction effect
  // handles this identical scenario: it has no cleanup function at all —
  // matching that proven pattern here instead of re-inventing one.
  const startedRef = useRef(false);

  // Visible on-screen status — small and unobtrusive, doesn't add any
  // header/chrome that would compete with the highway itself, but means a
  // failure (e.g. WebGL unavailable) is visible without needing
  // devtools/Eruda open.
  const [status, setStatus] = useState('');

  // Chrome (desktop and mobile alike) creates every new AudioContext already
  // 'suspended' and refuses to let it start running without a genuine user
  // gesture (autoplay policy) — confirmed directly: audioCtx.state stayed
  // 'suspended' and .currentTime never advanced past 0 for a full 10s with
  // no interaction. The highway/rails/camera don't depend on that clock and
  // render fine regardless, but NOTE SPAWNING does (it's driven off
  // audioCtx.currentTime), so without a gesture the highway stays visible
  // but permanently empty. Rather than gating the whole page behind an
  // explicit "tap to start" button, this listens for the very FIRST
  // interaction anywhere on the page (which naturally happens while
  // testing — tapping the device-toolbar viewport, scrolling, etc.) and
  // resumes the already-created context at that moment, satisfying the
  // gesture requirement with zero extra UI.
  const audioCtxRef = useRef(null);
  useEffect(() => {
    const unlock = () => { audioCtxRef.current?.resume?.(); };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, []);

  // Responsive canvas sizing — same pattern as the real game/sibling tool.
  useEffect(() => {
    const el = containerRef.current;
    const canvas = canvasRef.current;
    if (!el || !canvas) return;
    const resize = () => { canvas.width = el.clientWidth; canvas.height = el.clientHeight; };
    resize();
    const obs = new ResizeObserver(resize);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Build a silent buffer + synthetic chart and start the engine — all on
  // mount, fully synchronous (no fetch/decode/await left at all), no
  // click/interaction needed.
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (!canvasRef.current) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      audioCtxRef.current = ctx;
      ctx.resume?.(); // succeeds immediately if a gesture has already happened
      // Default (all-zero) samples — genuinely silent, never fails to
      // "decode" since nothing is ever decoded.
      const audioBuffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * DURATION_SECONDS), ctx.sampleRate);
      const hud = {
        onScore: () => {},
        onRock: () => {},
        onSP: () => {},
        onJudge: () => {},
        onBanner: () => {},
        onCountdown: () => {},
        onLanePress: () => {},
        onLaneRelease: () => {},
        onEnd: () => {},
      };
      engineRef.current = new Game(canvasRef.current, hud, {
        instrumentColors: GUITAR_COLORS,
        highwayAccentColor: GUITAR_ACCENT,
        highwayAccentColorRail: GUITAR_ACCENT_RAIL,
      });
      engineRef.current.start(ctx, audioBuffer, buildSyntheticChart(), { trackName: 'Highway Only', artistName: '' });
    } catch (e) {
      console.error('[RhythmHeroHighwayOnly] failed to start', e);
      setStatus(`failed: ${e.message}`);
    }
    // No cleanup here — see startedRef's comment above for why.
  }, []);

  return (
    /* height:100dvh, zero padding/header — the canvas fills the entire real
       viewport, matching exactly what the real game's own canvas container
       gets (both are a plain absolute/flex-1 box inside a 100dvh root). */
    <div className="bg-black" style={{ height: '100dvh' }}>
      <div ref={containerRef} className="relative w-full h-full overflow-hidden">
        <canvas ref={canvasRef} className="w-full h-full block" />
        <InstrumentTopOverlay ref={topSpriteRef} engineRef={engineRef} accentColor={GUITAR_ACCENT} sheet={INSTRUMENT_TOP_SHEETS.guitar} />
        {status && (
          <div className="absolute top-2 left-2 text-[10px] text-white/60 font-mono pointer-events-none z-10">
            {status}
          </div>
        )}
      </div>
    </div>
  );
}
