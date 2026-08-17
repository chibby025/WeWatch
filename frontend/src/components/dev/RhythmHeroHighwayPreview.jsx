// Standalone dev tool for iterating on the instrument sprite overlay
// placement against a REAL rendering highway — no login, no room, no
// WebSocket, no need to click through instrument/song pickers each time.
// Fetches a small synthesized test tone once, builds a real chart from it,
// and drives the real Three.js engine + the real InstrumentTopOverlay
// component directly, so what you see here is pixel-identical to what a
// real player sees — just without any of the game-flow friction.
//
// Only the top (full-performer) overlay is a highway concern now — the
// fretting-hand close-up moved to the loading screen (see
// InstrumentLoadingSprite/StagedProgress in RhythmHeroGame.jsx), so it's no
// longer part of this tool.
//
// Registered as a persistent route (/dev/rhythm-hero-highway), matching
// this project's existing SVGComparison/VsBattlePreview dev-tool convention
// — not a one-off harness deleted after use.
import { useEffect, useRef, useState, useCallback } from 'react';
import { Game } from '../Games/rhythm/rhythmGameEngine';
import { generateChart } from '../Games/rhythm/analysis';
import { InstrumentTopOverlay } from '../Games/rhythm/InstrumentCloseup';
import { INSTRUMENT_TOP_SHEETS } from '../Games/rhythm/spriteSheets';

// Served locally (frontend/public/dev-assets/), not from BunnyCDN — same-origin,
// so this tool works regardless of the separate BunnyCDN CORS-allowlist gap
// documented where this file's audio-fetch investigation is recorded.
const TEST_AUDIO_URL = '/dev-assets/rhythm-hero-test-tone.wav';

// Matches RhythmHeroGame.jsx's real INSTRUMENTS config exactly (colors and
// accents), not a rough approximation — this tool needs to be a faithful
// preview of the real game, including the real 5-lane color set (a mismatch
// here was caught crashing Game._updateFrets when this had only 4 bass
// colors — the real engine indexes all 5 lanes unconditionally). All 4
// instruments now get a top sprite overlay (see INSTRUMENT_TOP_SHEETS) —
// only guitar/bass additionally get a bottom close-up overlay.
const INSTRUMENT_CONFIG = {
  guitar: { colors: [0x3fe34a, 0xff3b30, 0xffd60a, 0x2f7cff, 0xff9500], accent: 0x8a2be2, accentRail: 0xb14cff },
  bass: { colors: [0xff9f45, 0x37e0d1, 0xc77dff, 0x4dd2ff, 0xff4d6d], accent: 0xff6b35, accentRail: 0xffa06b },
  drums: { colors: [0xff5555, 0xffaa00, 0x55ff55, 0x5599ff, 0xff55ff], accent: 0xff3355, accentRail: 0xff7799 },
  vocals: { colors: [0xff69b4, 0xffd700, 0x00ced1, 0x9370db, 0xff6347], accent: 0xff1493, accentRail: 0xff85c2 },
};

export default function RhythmHeroHighwayPreview() {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const engineRef = useRef(null);
  const audioCtxRef = useRef(null);
  const topSpriteRef = useRef(null);
  const audioBufferRef = useRef(null);
  const chartRef = useRef(null);
  const judgeRef = useRef(null);

  const [instrumentId, setInstrumentId] = useState('guitar');
  const [status, setStatus] = useState('loading test audio…');
  const [speedLabel, setSpeedLabel] = useState('1.00x');
  const [running, setRunning] = useState(false);

  // Fetch + decode the test tone and build a real chart from it, once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        audioCtxRef.current = ctx;
        const res = await fetch(TEST_AUDIO_URL);
        if (!res.ok) throw new Error(`fetch ${res.status}`);
        const arrayBuffer = await res.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        if (cancelled) return;
        audioBufferRef.current = audioBuffer;
        chartRef.current = generateChart(audioBuffer, 'medium');
        setStatus('ready — click Start');
      } catch (e) {
        setStatus(`failed to load test audio: ${e.message}`);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Responsive canvas sizing — same pattern as the real game/mirror.
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

  const start = useCallback(() => {
    if (!canvasRef.current || !audioBufferRef.current || !chartRef.current) return;
    engineRef.current?.dispose();
    const cfg = INSTRUMENT_CONFIG[instrumentId] || INSTRUMENT_CONFIG.guitar;
    const rollingWindow = [];
    const recordJudge = (kind) => {
      rollingWindow.push(kind !== 'miss');
      if (rollingWindow.length > 12) rollingWindow.shift();
      const acc = rollingWindow.length ? rollingWindow.filter(Boolean).length / rollingWindow.length : 1;
      const speed = 0.4 + acc * 0.9;
      topSpriteRef.current?.setSpeed(speed);
      setSpeedLabel(`${speed.toFixed(2)}x`);
    };
    judgeRef.current = recordJudge;
    const hud = {
      onScore: () => {},
      onRock: () => {},
      onSP: () => {},
      onJudge: (text, kind) => recordJudge(kind),
      onBanner: () => {},
      onCountdown: () => {},
      onLanePress: () => {},
      onLaneRelease: () => {},
      onEnd: () => setStatus('ended — click Restart'),
    };
    const ctx = audioCtxRef.current;
    engineRef.current = new Game(canvasRef.current, hud, {
      instrumentColors: cfg.colors,
      highwayAccentColor: cfg.accent,
      highwayAccentColorRail: cfg.accentRail,
    });
    engineRef.current.start(ctx, audioBufferRef.current, chartRef.current, { trackName: 'Preview', artistName: 'Highway Preview' });
    setRunning(true);
    setStatus('playing');
  }, [instrumentId]);

  const simulate = (kind) => judgeRef.current?.(kind);

  const cfg = INSTRUMENT_CONFIG[instrumentId];

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <div className="p-3 flex flex-wrap items-center gap-2 bg-gray-900 border-b border-gray-800">
        <h1 className="text-sm font-bold tracking-widest text-purple-400 mr-2">RHYTHM HERO — HIGHWAY PREVIEW</h1>
        <select
          value={instrumentId}
          onChange={(e) => setInstrumentId(e.target.value)}
          className="bg-gray-800 text-sm px-2 py-1 rounded border border-gray-700"
        >
          <option value="guitar">Guitar</option>
          <option value="bass">Bass</option>
          <option value="drums">Drums</option>
          <option value="vocals">Vocals</option>
        </select>
        <button
          onClick={start}
          disabled={status.startsWith('loading') || status.startsWith('failed')}
          className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 rounded text-sm font-semibold"
        >
          {running ? 'Restart' : 'Start'}
        </button>
        <button onClick={() => simulate('perfect')} className="px-3 py-1.5 bg-green-700 hover:bg-green-800 rounded text-sm">Simulate PERFECT</button>
        <button onClick={() => simulate('good')} className="px-3 py-1.5 bg-yellow-700 hover:bg-yellow-800 rounded text-sm">Simulate GOOD</button>
        <button onClick={() => simulate('miss')} className="px-3 py-1.5 bg-red-700 hover:bg-red-800 rounded text-sm">Simulate MISS</button>
        <span className="text-xs text-gray-500 ml-auto">{status} · sprite speed {speedLabel}</span>
      </div>
      <div ref={containerRef} className="flex-1 relative overflow-hidden">
        <canvas ref={canvasRef} className="w-full h-full block" />
        {running && cfg && (
          <InstrumentTopOverlay ref={topSpriteRef} engineRef={engineRef} accentColor={cfg.accent} sheet={INSTRUMENT_TOP_SHEETS[instrumentId]} />
        )}
      </div>
    </div>
  );
}
