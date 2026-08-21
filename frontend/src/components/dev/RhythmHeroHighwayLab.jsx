// Rhythm Hero — highway-only isolation lab.
//
// Purpose: a real phone test on the FULL RhythmHeroGame reported the highway
// rendering confined to roughly the top quarter of the screen — a much more
// severe symptom than the width-clipping bug investigated (and fixed) earlier
// via Chrome DevTools emulation, and one that's never been reproduced there.
// This page exists to answer one narrow question first, before any bigger
// rebuild (orthographic camera, 2D/3D hybrid, etc.) is attempted: does the
// EXISTING, unmodified production camera/highway code reproduce the bug when
// nothing else is on screen?
//
// Deliberately minimal — this is NOT the real game, and isn't trying to be:
//   - highway plane + side rails + the 5 fret rings only
//   - NO falling notes, no audience, no lyrics overlay, no HUD, no bloom/
//     postprocessing, no particles, no starfield, no audio at all
// If this reproduces "confined to a corner" on a real phone, the bug is in
// the camera/highway math itself (or in how the canvas gets its on-screen
// size), independent of anything else in the real game. If it DOESN'T
// reproduce, the bug is caused by something else in the full game coexisting
// with the highway — a much smaller, much less risky fix than a rebuild.
//
// Round 1 (mode=bare — a full-viewport canvas, nothing else): confirmed on a
// real phone the highway/camera math fills the screen exactly (canvasCSSSize
// matched viewport exactly), ruling out the camera math itself as the cause.
// Round 2 (mode=wrapped, the default): mounts the same bare highway inside a
// faithful replica of RhythmHeroGame.jsx's OWN real containing structure —
// header bar, flex-1 middle area, footer bar — instead of a clean full-
// viewport root, to test whether that surrounding layout (not present at
// all in round 1) is what's actually responsible. Tap the "mode: …" button
// (bottom-left) to switch between the two — each switch does a real page
// reload (see the mode-read comment below for why), so both are always
// available for direct back-to-back comparison on the same device.
//
// Every camera/highway constant and function used below is IMPORTED from
// rhythmGameEngine.js (not re-derived or copied) — this tests the literal
// production formulas, not an approximation of them. See that file's own
// comment next to the export list for why.
//
// The on-screen debug readout is the point of this page, not an afterthought
// — it exists so the camera-math-vs-canvas-sizing question can be answered
// just by looking at a real phone screen, with no remote debugging needed:
// it reports both the canvas's CSS-displayed size AND its actual WebGL
// drawing-buffer size side by side, which is exactly the pair of numbers
// that disagree if this is a canvas-sizing bug rather than a camera-framing
// one.
//
// Round 3: a second toggle ("stage: …", bottom-center) switches between the
// STAGES visual themes defined in rhythmGameEngine.js (Cosmic Void vs
// Retrowave Sunset) — the swappable-highway-look feature built on top of
// this whole investigation once the framing itself was confirmed solid.
// Applies the same scene background/fog/highway-base-tint/ambient-light
// colors the real Game class now uses per stage, so this is the intended
// place to judge a new stage's palette on a real phone before it's used in
// the actual game (where it's picked at random once per song).
//
// Access: linked only from LobbyLeftSidebar.jsx's super-admin-only menu.
// Gated at the page level too (redirects a non-super-admin visitor) since
// this is reachable on the real production deployment once pushed.
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as THREE from 'three';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import {
  LANES,
  LANE_W,
  HIGHWAY_W,
  HIGHWAY_LEN,
  HIT_Z,
  SPEED,
  CAMERA_BASE_Z,
  LIFTED_CAM_H,
  STAGES,
  DEFAULT_STAGE_ID,
  laneX,
  fovForAspect,
  idealVfovForAspect,
  dollyMultiplierForAspect,
  mobileZoomMultiplier,
  computeLiftedLookAtY,
  highwayVert,
  highwayFrag,
} from '../Games/rhythm/rhythmGameEngine';

// Matches RhythmHeroGame.jsx's real guitar config exactly — colors have no
// bearing on the framing/sizing question this page exists to answer, a
// fixed instrument is enough.
const GUITAR_COLORS = [0x3fe34a, 0xff3b30, 0xffd60a, 0x2f7cff, 0xff9500];
const GUITAR_ACCENT = 0x8a2be2;
const GUITAR_ACCENT_RAIL = 0xb14cff;

// ---------------------------------------------------------------- engine
// A minimal, standalone Three.js scene — NOT the real Game class from
// rhythmGameEngine.js (that constructor unconditionally builds notes,
// audience, particles, bloom, starfield, etc. with no way to opt out — using
// it here would defeat the entire point of an isolated test). Reuses only
// the camera math + highway shader imported above; everything else
// (geometry, lighting, resize handling) is written fresh but intentionally
// mirrors the real Game class's own approach line-for-line where it matters
// (canvas.clientWidth/clientHeight for sizing, never window.innerWidth —
// see the real engine's own comment on this; the same ResizeObserver +
// resize-self-heal-timer pattern for the same Chrome DevTools race).
class HighwayLabEngine {
  constructor(canvas, onDebug, stageId) {
    this.canvas = canvas;
    this.onDebug = onDebug;
    // Same STAGES config the real engine uses — see its own comment in
    // rhythmGameEngine.js. Resolved once, at construction, matching how the
    // real Game class also locks stage in for the whole instance lifetime.
    this.stage = STAGES[stageId] || STAGES[DEFAULT_STAGE_ID];
    this._raf = 0;
    this._initThree();
  }

  _recomputeCameraDistance(aspect) {
    const mult = dollyMultiplierForAspect(aspect) * mobileZoomMultiplier(aspect);
    this.baseCameraZ = CAMERA_BASE_Z * mult;
    this._lastDollyMultiplier = mult;
  }

  // The actual diagnostic payload — reports canvas CSS size vs canvas WebGL
  // drawing-buffer size side by side (the pair that disagrees if this is a
  // canvas-sizing bug), plus the full camera math trail, plus raw viewport
  // dimensions for cross-reference. Both console-logged (filter by
  // "[HighwayLab]") and pushed to the on-screen overlay via onDebug — a real
  // phone test won't always have remote debugging handy.
  _logDebug(reason, aspect) {
    const buf = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const info = {
      reason,
      time: new Date().toLocaleTimeString(),
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      canvasCSSSize: `${this.canvas.clientWidth}x${this.canvas.clientHeight}`,
      canvasBufferPx: `${Math.round(buf.x)}x${Math.round(buf.y)}`,
      devicePixelRatio: window.devicePixelRatio,
      aspect: aspect.toFixed(4),
      idealVfov: idealVfovForAspect(aspect).toFixed(2) + 'deg',
      appliedVfov: this.baseFov.toFixed(2) + 'deg',
      capEngaged: idealVfovForAspect(aspect) > this.baseFov + 0.01,
      dollyMultiplier: this._lastDollyMultiplier.toFixed(3),
      baseCameraZ: this.baseCameraZ.toFixed(2),
      liftedCamH: LIFTED_CAM_H,
      liftedLookAtY: this._liftedLookAtY?.toFixed(2),
      stage: this.stage.id,
    };
    console.log('[HighwayLab]', info);
    this.onDebug?.(info);
  }

  _initThree() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const w0 = this.canvas.clientWidth || window.innerWidth;
    const h0 = this.canvas.clientHeight || window.innerHeight;
    // `false` = do not write an inline CSS size onto the canvas — same
    // reasoning as the real Game class (see its own comment): leaving the
    // canvas's displayed size purely CSS-driven and only using this
    // measurement to pick a matching WebGL drawing-buffer resolution.
    this.renderer.setSize(w0, h0, false);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.stage.sceneBackground);
    this.scene.fog = new THREE.Fog(this.stage.fogColor, 32, 78);

    this.baseFov = fovForAspect(w0 / h0);
    this._recomputeCameraDistance(w0 / h0);
    this.camera = new THREE.PerspectiveCamera(this.baseFov, w0 / h0, 0.1, 200);
    this.camera.position.set(0, LIFTED_CAM_H, this.baseCameraZ);
    this._liftedLookAtY = computeLiftedLookAtY(this.baseCameraZ, this.baseFov);
    this.camera.lookAt(0, this._liftedLookAtY, -16);

    this.scene.add(new THREE.AmbientLight(this.stage.ambientLightColor, 0.5));
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(4, 12, 6);
    this.scene.add(dirLight);

    this._buildHighway();
    this._buildFrets();

    this._onResize = () => {
      const w = this.canvas.clientWidth;
      const h = this.canvas.clientHeight;
      if (!w || !h) return;
      this.camera.aspect = w / h;
      this.baseFov = fovForAspect(this.camera.aspect);
      this.camera.fov = this.baseFov;
      this._recomputeCameraDistance(this.camera.aspect);
      this.camera.position.z = this.baseCameraZ;
      this._liftedLookAtY = computeLiftedLookAtY(this.baseCameraZ, this.baseFov);
      this.camera.lookAt(0, this._liftedLookAtY, -16);
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h, false);
      this._logDebug('resize', this.camera.aspect);
    };
    this._resizeObserver = new ResizeObserver(this._onResize);
    this._resizeObserver.observe(this.canvas);
    window.addEventListener('resize', this._onResize);
    // Same Chrome DevTools device-emulation-override race self-heal as the
    // real engine — see its own comment for why this exists.
    this._resizeSelfHealTimer = setTimeout(this._onResize, 400);

    this._logDebug('construct', w0 / h0);

    this._start = performance.now();
    this._loop();
  }

  _buildHighway() {
    const [br, bg, bb] = this.stage.highwayBaseColor;
    this.highwayUniforms = {
      uScroll: { value: 0 },
      uBeat: { value: SPEED * 0.5 },
      uLineColor: { value: new THREE.Color(GUITAR_ACCENT) },
      uPulse: { value: 0 },
      uBaseColor: { value: new THREE.Color(br, bg, bb) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.highwayUniforms,
      vertexShader: highwayVert,
      fragmentShader: highwayFrag,
    });
    const geo = new THREE.PlaneGeometry(HIGHWAY_W, HIGHWAY_LEN);
    const plane = new THREE.Mesh(geo, mat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(0, 0, -HIGHWAY_LEN / 2 + 5);
    this.scene.add(plane);

    const railGeo = new THREE.BoxGeometry(0.18, 0.3, HIGHWAY_LEN);
    const railMat = new THREE.MeshBasicMaterial({ color: GUITAR_ACCENT_RAIL });
    for (const s of [-1, 1]) {
      const rail = new THREE.Mesh(railGeo, railMat);
      rail.position.set(s * (HIGHWAY_W / 2 + 0.1), 0.15, -HIGHWAY_LEN / 2 + 5);
      this.scene.add(rail);
    }
  }

  _buildFrets() {
    const ringGeo = new THREE.TorusGeometry(0.68, 0.09, 12, 32);
    const discGeo = new THREE.CircleGeometry(0.6, 28);
    for (let i = 0; i < LANES; i++) {
      const group = new THREE.Group();
      group.position.set(laneX(i), 0.12, HIT_Z);

      const ringMat = new THREE.MeshStandardMaterial({
        color: GUITAR_COLORS[i],
        emissive: GUITAR_COLORS[i],
        emissiveIntensity: 0.5,
        roughness: 0.35,
        metalness: 0.6,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      group.add(ring);

      // Matches the real engine's resting (never-pressed) state exactly —
      // invisible disc, only the ring shows at rest.
      const discMat = new THREE.MeshBasicMaterial({ color: GUITAR_COLORS[i], transparent: true, opacity: 0 });
      const disc = new THREE.Mesh(discGeo, discMat);
      disc.rotation.x = -Math.PI / 2;
      disc.position.y = 0.01;
      group.add(disc);

      this.scene.add(group);
    }
  }

  // Bare render loop — only scrolls the highway's beat-line texture over
  // time (a free, useful "is this actually rendering every frame or is it
  // frozen" signal on a real device), nothing else animates.
  _loop() {
    this._raf = requestAnimationFrame(() => this._loop());
    const t = (performance.now() - this._start) / 1000;
    this.highwayUniforms.uScroll.value = t * SPEED * 0.25;
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    cancelAnimationFrame(this._raf);
    clearTimeout(this._resizeSelfHealTimer);
    this._resizeObserver?.disconnect();
    window.removeEventListener('resize', this._onResize);
    this.renderer?.dispose();
  }
}

// ---------------------------------------------------------------- page
export default function RhythmHeroHighwayLab() {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  // Guards against React StrictMode's dev-only double-invoke — see
  // RhythmHeroHighwayOnly.jsx's identical, already-proven comment for why
  // this effect deliberately has NO disposal cleanup (a dispose-on-cleanup
  // here would kill the freshly-built engine on StrictMode's synthetic first
  // unmount, before the real second mount ever gets to use it).
  const startedRef = useRef(false);
  const [debugInfo, setDebugInfo] = useState(null);
  // Hidden by default so the highway itself is unobstructed once you're just
  // eyeballing the framing — the numbers are still one tap away via the
  // small toggle button (bottom-right), not lost.
  const [showDebug, setShowDebug] = useState(false);

  // 'wrapped' (default) mounts the highway inside a faithful replica of
  // RhythmHeroGame.jsx's OWN real containing structure — a fixed-inset flex-
  // col root with a real header bar and footer bar around a flex-1/relative/
  // overflow-hidden middle area, the canvas absolutely positioned to fill
  // just that middle area — instead of a bare full-viewport root. This is
  // the step that came after confirming the highway/camera math alone (mode=
  // bare) fills the screen correctly in isolation: since that held on a real
  // phone, the leading suspect for the real game's "top quarter" bug moved
  // from the camera math itself to this containing structure.
  //
  // Deliberately read ONCE from the URL rather than kept as React state —
  // switching modes does a full page reload (see toggleMode below), never a
  // live re-render. Toggling it as live state would unmount/remount the
  // canvas DOM node under an ALREADY-constructed engine instance, and
  // combining that with this file's own established "no cleanup on the
  // construction effect" StrictMode workaround (see startedRef's comment
  // below) would silently leave a disposed/stale engine wired to a since-
  // replaced canvas element. A full reload sidesteps all of that — either
  // mode is a genuinely fresh mount, using the exact same proven one-shot
  // construction path.
  const mode = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('mode') === 'bare'
    ? 'bare'
    : 'wrapped';

  // Same reasoning as mode above (read once from the URL, switched via a
  // full reload) — lets Stage 2 (or any future stage) be visually judged
  // here, on a real phone, before it ever reaches the real game.
  const stageParam = typeof window !== 'undefined'
    ? new URLSearchParams(window.location.search).get('stage')
    : null;
  const stageId = STAGES[stageParam] ? stageParam : DEFAULT_STAGE_ID;

  useEffect(() => {
    if (!currentUser) {
      navigate('/');
      return;
    }
    if (currentUser.role !== 'super_admin') {
      toast.error('Access denied. Super admin only.');
      navigate('/lobby');
    }
  }, [currentUser, navigate]);

  useEffect(() => {
    if (currentUser?.role !== 'super_admin') return;
    if (startedRef.current) return;
    startedRef.current = true;
    if (!canvasRef.current) return;
    engineRef.current = new HighwayLabEngine(canvasRef.current, setDebugInfo, stageId);
    // No cleanup — see startedRef's comment above for why.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser]);

  if (!currentUser || currentUser.role !== 'super_admin') return null;

  // Both toggles preserve the OTHER param — switching stage shouldn't reset
  // mode, and vice versa — so the two axes stay independently comparable.
  const toggleMode = () => {
    const next = mode === 'wrapped' ? 'bare' : 'wrapped';
    window.location.href = `/dev/rhythm-hero-highway-lab?mode=${next}&stage=${stageId}`;
  };
  const stageIds = Object.keys(STAGES);
  const toggleStage = () => {
    const idx = stageIds.indexOf(stageId);
    const next = stageIds[(idx + 1) % stageIds.length];
    window.location.href = `/dev/rhythm-hero-highway-lab?mode=${mode}&stage=${next}`;
  };

  // Shared across both layout branches below — the toggle buttons and debug
  // readout are identical either way, only what wraps the <canvas> differs.
  const controls = (
    <>
      <button
        onClick={() => setShowDebug((v) => !v)}
        className="absolute bottom-2 right-2 z-30 w-8 h-8 rounded-full bg-black/50 text-white/80 text-xs font-mono flex items-center justify-center"
      >
        i
      </button>
      <button
        onClick={toggleMode}
        className="absolute bottom-2 left-2 z-30 px-2 h-8 rounded-full bg-black/50 text-white/80 text-[10px] font-mono flex items-center justify-center"
      >
        mode: {mode}
      </button>
      <button
        onClick={toggleStage}
        className="absolute bottom-2 left-1/2 -translate-x-1/2 z-30 px-2 h-8 rounded-full bg-black/50 text-white/80 text-[10px] font-mono flex items-center justify-center"
      >
        stage: {STAGES[stageId]?.label ?? stageId}
      </button>
    </>
  );
  const debugOverlay = showDebug && debugInfo && (
    <div className="absolute top-2 left-2 right-2 text-[10px] text-white/80 font-mono pointer-events-none z-20 bg-black/50 p-2 rounded leading-tight whitespace-pre-wrap break-all">
      {Object.entries(debugInfo).map(([k, v]) => `${k}: ${v}`).join('\n')}
    </div>
  );

  if (mode === 'bare') {
    return (
      /* 100dvh, zero padding/header — matches exactly what the real game's
         own canvas container gets, so a result here carries over directly. */
      <div className="bg-black" style={{ height: '100dvh' }}>
        <div className="relative w-full h-full overflow-hidden">
          <canvas ref={canvasRef} className="w-full h-full block" />
          {controls}
          {debugOverlay}
        </div>
      </div>
    );
  }

  // mode === 'wrapped' — a faithful replica of RhythmHeroGame.jsx's OWN real
  // containing structure (verbatim classes, cross-checked against its
  // current source): a fixed-inset flex-col root, a real header bar
  // (shrink-0), the flex-1/relative/overflow-hidden middle area the canvas
  // gets absolutely positioned into (exactly the same nesting containerRef's
  // own div has in the real game), and a real footer bar (shrink-0). Header/
  // footer content here is placeholder text/buttons, not the real icons/
  // GameRulesButton — this step is testing container/layout MECHANICS, not
  // visual content, and placeholder content of similar size consumes
  // comparable vertical space in those bars either way.
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black select-none" style={{ height: '100dvh' }}>
      <div className="flex items-center justify-between px-3 py-2 bg-gray-900 border-b border-gray-700 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-sm font-bold tracking-widest text-purple-400">RHYTHM HERO</h2>
          <span className="text-xs text-gray-500 truncate">— Highway Lab (wrapped)</span>
        </div>
        <div className="flex gap-2 flex-shrink-0">
          <button className="px-2 py-1 text-xs bg-red-700 rounded font-medium">End</button>
          <button className="px-2 py-1 text-xs bg-white/20 rounded">X</button>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center overflow-hidden relative">
        <div className="absolute inset-0">
          <canvas ref={canvasRef} className="w-full h-full block" />
        </div>
        {controls}
        {debugOverlay}
      </div>

      <div className="shrink-0 text-center py-1 bg-gray-900 border-t border-gray-800">
        <p className="text-xs text-gray-600">Keyboard: A S D F G to tap · hold for sustained notes · Space for Star Power</p>
      </div>
    </div>
  );
}
