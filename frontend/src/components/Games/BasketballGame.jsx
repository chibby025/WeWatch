// src/components/Games/BasketballGame.jsx
// Forked from mike007jd/vibebasketball (MIT) — a real Three.js 3D
// basketball engine, trimmed to a single free-shooting player (no defender,
// no local AI, no dribble/steal/block resolution — see
// basketball-engine/game/wwGame.js's own header comment for the full
// architectural rationale). basketball.go remains the sole authority on
// make/miss, via a distance+power tolerance formula; this component's only
// job is capturing the shooter's chosen distance (their live court position)
// and a continuous power value (derived from the engine's own release-
// timing accuracy) and replaying whatever the server decides.
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { X, Volume2, VolumeX } from 'lucide-react';
import GameWinnerBanner from './GameWinnerBanner';
import GameRulesButton from './GameRulesButton';
import { WWGame } from './basketball-engine/game/wwGame.js';
import { CameraRig } from './basketball-engine/game/cameraRig.js';
import { buildEnvironment } from './basketball-engine/world/environment.js';

const HORSE_WORD = 'HORSE';

// navigator.vibrate feature-detected — Safari/iOS has no Vibration API at
// all. Same convention already established in Ping Pong/Air Hockey/Archery.
function hapticImpact(pattern) {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(pattern);
  }
}

// Synthesized swish/miss cue, layered on top of the engine's own rim/board/
// dribble SFX (CourtSfx, ported unchanged) — a distinct "the SERVER just
// confirmed this" sting, mirroring Darts/Archery's own playHitSound.
function playResultSound(made, enabled) {
  if (!enabled || typeof window === 'undefined') return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = made ? 'triangle' : 'sine';
    oscillator.frequency.setValueAtTime(made ? 520 : 140, context.currentTime);
    if (made) oscillator.frequency.exponentialRampToValueAtTime(720, context.currentTime + 0.12);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + (made ? 0.28 : 0.16));
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.3);
    setTimeout(() => context.close(), 400);
  } catch {
    /* ignore — sound is a pure nicety */
  }
}

// Dispatches a real DOM KeyboardEvent on window — input.js (the ported
// engine's own singleton input handler) listens there and reads e.code,
// making this indistinguishable from an actual key press. The engine has
// zero touch/pointer support of its own (confirmed by reading input.js in
// full), so this is the only way to make it playable on mobile without
// touching any of its input logic.
function pressKey(code) { window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true })); }
function releaseKey(code) { window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true })); }

const isTouchDevice = () => (typeof window !== 'undefined') && ('ontouchstart' in window) && navigator.maxTouchPoints > 0;

// Live shot relay — a real 3D mirror now (see isMyTurnRef's own comment
// further down for the full architecture): the shooter's device sends
// continuous player position + in-flight ball position, which every other
// connected device uses to directly drive the SAME shared court/ball/player
// meshes, dead-reckoning-extrapolated between packets.
const PROGRESS_SEND_EVERY_FRAMES = 6; // ~10Hz @ 60fps

// ── Cached engine, module-scope ─────────────────────────────────────────
// buildEnvironment()/new WWGame() procedurally construct a whole stadium's
// worth of geometry + canvas-drawn textures (skyline, bleachers, fences,
// signs, court markings, backboard, ball skins, jersey numbers) every time
// they're called — real, synchronous, main-thread CPU work with no network
// I/O involved at all (confirmed: no GLTFLoader/TextureLoader anywhere in
// this engine, only THREE.CanvasTexture + primitive geometries). Every
// player in a H.O.R.S.E. match sees the identical set — the court/hoop/
// stadium never change shot to shot — so redoing that work from scratch on
// every single turn (which the old isMyTurn-gated effect did, since it
// fully disposed the renderer and nulled everything on every teardown) was
// pure waste, felt like "reloading the same asset" on every shot.
//
// True cross-DEVICE sharing isn't possible (each browser is an independent
// process/GPU context — there's no way to hand another user's tab a
// pre-built WebGL scene) — what IS achievable, and what this actually
// fixes, is per-device reuse: build it once per browser tab for the whole
// life of this match, then just reattach the same renderer's canvas + WWGame
// instance on every subsequent turn instead of rebuilding. WWGame's own
// state machine already anticipates this — it has a built-in "retrieve the
// loose ball" cycle for handling consecutive shots (see wwGame.js's
// _retrieveTimer) — so reusing one instance across turns exercises exactly
// the lifecycle the engine already expects, not a workaround.
let cachedBasketballEngine = null; // { scene, renderer, camera, wwGame, cameraRig }

function buildBasketballEngine(mount) {
  const scene = new THREE.Scene();
  const width = mount.clientWidth || 1, height = mount.clientHeight || 1;
  const camera = new THREE.PerspectiveCamera(46, width / height, 0.1, 100);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;

  buildEnvironment(scene, renderer);

  const wwGame = new WWGame(scene, {});
  const cameraRig = new CameraRig(camera);
  wwGame.cameraRig = cameraRig;

  return { scene, renderer, camera, wwGame, cameraRig };
}

// Only called on a genuine full unmount of this component (leaving the
// game entirely), never on an ordinary turn-to-turn teardown — see the
// dedicated cleanup effect below.
function disposeBasketballEngine() {
  if (!cachedBasketballEngine) return;
  const { renderer, scene } = cachedBasketballEngine;
  scene.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      mats.forEach((m) => {
        Object.values(m).forEach((v) => { if (v && v.isTexture) v.dispose(); });
        m.dispose();
      });
    }
  });
  renderer.dispose();
  if (typeof window !== 'undefined' && window.__wwBasketballGame === cachedBasketballEngine.wwGame) {
    delete window.__wwBasketballGame;
  }
  cachedBasketballEngine = null;
}

export default function BasketballGame({ gameState, players = [], currentUserId, onMove, onClose, onEndGame, onPostResult, onPlayAgain }) {
  const mountRef = useRef(null);
  const wwGameRef = useRef(null);
  const soundEnabledRef = useRef(true);
  const lastResultKeyRef = useRef(null);

  const [soundEnabled, setSoundEnabled] = useState(() => {
    try { return localStorage.getItem('basketball_sound_enabled') !== 'false'; } catch { return true; }
  });
  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
    try { localStorage.setItem('basketball_sound_enabled', String(soundEnabled)); } catch { /* ignore */ }
  }, [soundEnabled]);

  const [meter, setMeter] = useState(null);
  const [lastHitLabel, setLastHitLabel] = useState(null);
  const lastHitLabelTimerRef = useRef(null);
  useEffect(() => () => { if (lastHitLabelTimerRef.current) clearTimeout(lastHitLabelTimerRef.current); }, []);

  const gs = gameState?.game_state || {};
  const letters = useMemo(() => gs.letters || {}, [gs.letters]);
  const eliminated = useMemo(() => gs.eliminated || {}, [gs.eliminated]);
  const hasPendingShot = !!gs.has_pending_shot;
  const setDistance = gs.set_distance ?? 0;
  const lastResult = gs.last_result;

  const currentTurn = gameState?.current_turn ?? 0;
  const currentPlayer = players[currentTurn];
  const isMyTurn = currentPlayer?.user_id === currentUserId;
  const isPlayer = players.some((p) => p.user_id === currentUserId);
  const winner = gameState?.winner_id ? players.find((p) => p.user_id === gameState.winner_id) : null;
  const isOver = ['finished', 'forfeited', 'completed'].includes(gameState?.status);

  // ── Real live 3D mirror for every connected player, not just the current
  // shooter ─────────────────────────────────────────────────────────────
  // Confirmed via real 2-account testing that the old design (canvas only
  // shown to whoever's turn it was; everyone else saw a static "X is
  // shooting…" placeholder) left a spectator seeing essentially nothing.
  // The fix: the canvas is now mounted for EVERY player for the whole match
  // (see showCanvasScene below — no longer gated on isMyTurn at all), and
  // this ALSO solves the separate "loads for the first player" complaint as
  // a side effect — every device now builds the (procedurally generated,
  // no network assets) cachedBasketballEngine once, right when the game
  // starts, instead of only the first time it becomes that device's turn.
  //
  // The shooter's own device still runs the real local wwGame.update(dt)
  // physics/input loop exactly as before. A NON-shooting device instead
  // renders the SAME shared court/ball/player meshes, but positions them
  // directly from the shooter's own relayed shoot_progress data (dead-
  // reckoning extrapolated between packets — same technique already proven
  // in TankBattleGame.jsx/BombermanGame.jsx) — never running its own
  // physics, so there's no risk of the two devices' simulations diverging.
  const isMyTurnRef = useRef(isMyTurn);
  isMyTurnRef.current = isMyTurn;
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  // Extrapolation anchors for a SPECTATING device — velocity estimated from
  // consecutive shoot_progress samples, same secant technique already used
  // by BowlingGame.jsx's own relay-smoothing fix. `player` updates
  // continuously for the whole duration of the shooter's turn (dribbling,
  // positioning); `ball` is only ever present while the shot is actually
  // airborne, and is cleared (active:false) the moment a tick arrives with
  // no ball data — meaning "the shot has resolved, stop extrapolating a
  // stale flight."
  const playerAnchorRef = useRef({ x: 0, y: 0, z: 0, facing: 0, vx: 0, vy: 0, vz: 0, t: 0, valid: false });
  const ballAnchorRef = useRef({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0, active: false });
  const prevProgressSampleRef = useRef({ player: null, ball: null, t: 0 });
  useEffect(() => {
    const progress = gs.shoot_progress;
    if (!progress) return;
    const now = Date.now();
    const prev = prevProgressSampleRef.current;
    const dtSec = Math.max((now - (prev.t || now)) / 1000, 1 / 90);
    if (progress.player) {
      const p = progress.player;
      const prevP = prev.player;
      playerAnchorRef.current = {
        x: p.x, y: p.y ?? 0, z: p.z,
        facing: typeof p.facing === 'number' ? p.facing : playerAnchorRef.current.facing,
        vx: prevP ? (p.x - prevP.x) / dtSec : 0,
        vy: prevP ? ((p.y ?? 0) - (prevP.y ?? 0)) / dtSec : 0,
        vz: prevP ? (p.z - prevP.z) / dtSec : 0,
        t: now, valid: true,
      };
    }
    if (progress.ball) {
      const b = progress.ball;
      const prevB = prev.ball;
      ballAnchorRef.current = {
        x: b.x, y: b.y, z: b.z,
        vx: prevB ? (b.x - prevB.x) / dtSec : 0,
        vy: prevB ? (b.y - prevB.y) / dtSec : 0,
        vz: prevB ? (b.z - prevB.z) / dtSec : 0,
        t: now, active: true,
      };
    } else {
      ballAnchorRef.current = { ...ballAnchorRef.current, active: false };
    }
    prevProgressSampleRef.current = { player: progress.player || prev.player, ball: progress.ball || null, t: now };
  }, [gs.shoot_progress]);

  // Always mounted for the whole match, for every connected player — the
  // old per-turn show/hide (and its "keep it open a beat after MY release
  // so the animation can finish" holdSceneOpen mechanism) is no longer
  // needed once the canvas never actually unmounts between turns at all.
  const showCanvasScene = !isOver;
  // True only while the very first (uncached) build of this page session is
  // actually running — every later turn reattaches the cached engine
  // instantly, so this only ever shows once per match, not once per shot.
  const [engineLoading, setEngineLoading] = useState(false);

  // ── Three.js scene + WWGame attach/detach — reuses cachedBasketballEngine
  // (built once) for the WHOLE match, for EVERY connected player — see the
  // big comment above isMyTurnRef for the full rationale. Deps are now just
  // [isOver]: the scene mounts once when the game starts and only tears
  // down when it ends (or this component unmounts), never per-turn.
  useEffect(() => {
    if (!showCanvasScene) return undefined;
    const mount = mountRef.current;
    if (!mount) return undefined;
    let cancelled = false;
    let raf;
    let resizeHandler;

    const runLoop = (engine) => {
      const { scene, renderer, camera, wwGame } = engine;
      wwGame.onShootAttempt = (payload) => onMoveRef.current({ move_type: 'shoot', ...payload });
      wwGame.onShotMeterUpdate = setMeter;
      wwGameRef.current = wwGame;

      resizeHandler = () => {
        const w = mount.clientWidth || 1, h = mount.clientHeight || 1;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      resizeHandler(); // correct sizing immediately on (re)attach — the mount container may differ in size from whenever this engine was first built
      window.addEventListener('resize', resizeHandler);

      let progressFrameCount = 0;
      let wasAirborne = false; // edge-detect ONLY the held->shot transition
      const EXTRAP_CAP_S = 0.25; // dead-reckoning cap — same order of magnitude already proven in TankBattle/Bomberman
      const clock = new THREE.Clock();
      const animate = () => {
        raf = requestAnimationFrame(animate);
        const dt = Math.min(clock.getDelta(), 0.05);

        if (isMyTurnRef.current) {
          // ── Active shooter: real local physics, exactly as before ──
          wwGame.update(dt);

          // Continuous relay for the WHOLE turn (not just mid-shot) — a
          // spectator now needs to see the shooter move/dribble around the
          // court too, not just the ball during flight. `player` is always
          // included; `ball` only while genuinely airborne. The very first
          // frame of a NEW "shot" state always sends immediately, bypassing
          // the throttle — confirmed via real testing that this engine
          // pauses a shot's visual release until the server's result comes
          // back, then plays the whole flight out quickly enough that the
          // old throttle-only gate could miss it entirely for a fast shot.
          const isAirborne = wwGame.ball?.state === 'shot';
          const justLaunched = isAirborne && !wasAirborne;
          progressFrameCount += 1;
          if (justLaunched || progressFrameCount >= PROGRESS_SEND_EVERY_FRAMES) {
            progressFrameCount = 0;
            const payload = {};
            if (wwGame.userPlayer) {
              payload.player = {
                x: wwGame.userPlayer.pos.x, y: wwGame.userPlayer.y || 0, z: wwGame.userPlayer.pos.z,
                facing: wwGame.userPlayer.facing,
              };
            }
            if (isAirborne && wwGame.ball) {
              payload.ball = { x: wwGame.ball.pos.x, y: wwGame.ball.pos.y, z: wwGame.ball.pos.z };
            }
            if (payload.player || payload.ball) onMoveRef.current({ move_type: 'shoot_progress', ...payload });
          }
          wasAirborne = isAirborne;
        } else {
          // ── Spectating: never run local physics (would diverge from the
          // shooter's own authoritative result — the exact "each plays
          // independently" bug already reported once). Instead, directly
          // position the SAME shared meshes from the shooter's relayed,
          // dead-reckoning-extrapolated state.
          progressFrameCount = 0;
          wasAirborne = false;
          const nowMs = Date.now();
          const anchorP = playerAnchorRef.current;
          const anchorB = ballAnchorRef.current;
          if (anchorP.valid && wwGame.userPlayer?.rig?.group) {
            const el = Math.min(Math.max((nowMs - anchorP.t) / 1000, 0), EXTRAP_CAP_S);
            const ex = anchorP.x + anchorP.vx * el;
            const ey = anchorP.y + anchorP.vy * el;
            const ez = anchorP.z + anchorP.vz * el;
            wwGame.userPlayer.pos.set(ex, 0, ez);
            wwGame.userPlayer.y = ey;
            wwGame.userPlayer.facing = anchorP.facing;
            wwGame.userPlayer.rig.group.position.set(ex, ey, ez);
            wwGame.userPlayer.rig.group.rotation.y = anchorP.facing;
          }
          if (wwGame.ball) {
            if (anchorB.active) {
              const el = Math.min(Math.max((nowMs - anchorB.t) / 1000, 0), EXTRAP_CAP_S);
              const ex = anchorB.x + anchorB.vx * el;
              const ey = anchorB.y + anchorB.vy * el;
              const ez = anchorB.z + anchorB.vz * el;
              wwGame.ball.pos.set(ex, ey, ez);
              wwGame.ball.mesh.position.set(ex, ey, ez);
            } else if (anchorP.valid) {
              // Not airborne — approximate "held in the shooter's hands"
              // rather than leaving the ball frozen at its last flight
              // position. A simplification, not a physically exact hand
              // attachment (that's the real local physics' own job, and
              // only runs on the shooter's own device).
              wwGame.ball.pos.set(anchorP.x, anchorP.y + 1.0, anchorP.z);
              wwGame.ball.mesh.position.copy(wwGame.ball.pos);
            }
          }
        }

        renderer.render(scene, camera);
      };
      animate();
    };

    if (cachedBasketballEngine) {
      mount.appendChild(cachedBasketballEngine.renderer.domElement);
      runLoop(cachedBasketballEngine);
    } else {
      // First-ever build this match. Flip the loading flag now, but defer
      // the actual (synchronous, main-thread-blocking) construction until
      // AFTER that state update has genuinely been painted to the screen.
      //
      // A bare setTimeout(fn, 0) does NOT guarantee this — it only orders
      // relative to the macrotask queue, not relative to the browser's own
      // paint cycle, so React's setEngineLoading(true) and the heavy build
      // work could both complete within the same tick with zero paint in
      // between, meaning the spinner would never actually become visible
      // (confirmed as the real cause of "no loading animation shows" — the
      // fix is the standard "wait two animation frames" idiom: the first
      // rAF fires just before the browser's next paint (which will include
      // the spinner, since React's state update has already committed a
      // new DOM by then); a paint happens between that callback returning
      // and the second rAF firing, so by the time the second one runs, the
      // spinner is guaranteed to have actually been drawn on screen).
      setEngineLoading(true);
      let rafId1 = null;
      let rafId2 = null;
      rafId1 = requestAnimationFrame(() => {
        rafId2 = requestAnimationFrame(() => {
          if (cancelled) return;
          const engine = buildBasketballEngine(mount);
          cachedBasketballEngine = engine;
          mount.appendChild(engine.renderer.domElement);
          setEngineLoading(false);
          runLoop(engine);
        });
      });
      return () => {
        cancelled = true;
        if (rafId1 != null) cancelAnimationFrame(rafId1);
        if (rafId2 != null) cancelAnimationFrame(rafId2);
        setEngineLoading(false);
      };
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      if (resizeHandler) window.removeEventListener('resize', resizeHandler);
      // Detach only — the cached engine itself (renderer/scene/wwGame)
      // persists in module scope for the next turn to reattach. Real
      // disposal only happens on a genuine full unmount, see below.
      if (cachedBasketballEngine && mount.contains(cachedBasketballEngine.renderer.domElement)) {
        mount.removeChild(cachedBasketballEngine.renderer.domElement);
      }
    };
  }, [showCanvasScene]);

  // True disposal — only on leaving the game entirely (component unmount),
  // never on an ordinary turn-to-turn teardown handled above.
  useEffect(() => () => disposeBasketballEngine(), []);

  // ── Deliver the server's confirmed result to the engine the instant it
  // broadcasts, regardless of whose local UI triggered it — every connected
  // client (not just the shooter) receives game_state_update, but only the
  // shooter's own device has an active WWGame instance waiting on it. ─────
  useEffect(() => {
    if (!lastResult || lastResult.made == null) return;
    const key = `${lastResult.shooter_id}-${lastResult.distance}-${lastResult.power}-${lastResult.made}`;
    if (lastResultKeyRef.current === key) return;
    lastResultKeyRef.current = key;

    if (lastResult.shooter_id === currentUserId && wwGameRef.current) {
      wwGameRef.current.resolveServerShot(lastResult.made);
    }
    playResultSound(lastResult.made, soundEnabledRef.current);
    hapticImpact(lastResult.made ? [20, 40, 20] : [10]);
    setLastHitLabel(lastResult.made ? 'SWISH!' : 'MISS');
    if (lastHitLabelTimerRef.current) clearTimeout(lastHitLabelTimerRef.current);
    lastHitLabelTimerRef.current = setTimeout(() => setLastHitLabel(null), 1600);
  }, [lastResult, currentUserId]);

  const handleForfeit = () => {
    if (winner || isOver) { onClose(); return; }
    (onEndGame || onClose)();
  };

  const sortedPlayers = useMemo(
    () => [...players].sort((a, b) => (letters[String(a.user_id)]?.length ?? 0) - (letters[String(b.user_id)]?.length ?? 0)),
    [players, letters],
  );

  const touch = isTouchDevice();

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <div className="relative bg-gray-900 rounded-2xl shadow-2xl w-full max-w-3xl mx-4 overflow-hidden flex flex-col" style={{ maxHeight: '92vh' }}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 shrink-0">
            <div>
              <h2 className="text-white text-xl font-bold">Basketball Shootout 🏀</h2>
              <p className="text-gray-400 text-sm">
                {hasPendingShot ? `Match the shot — ${Math.round(setDistance * 100)}% to the arc` : 'Free shot — pick your spot'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSoundEnabled((v) => !v)}
                className="text-gray-400 hover:text-white"
                title={soundEnabled ? 'Mute sounds' : 'Unmute sounds'}
              >
                {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
              </button>
              <GameRulesButton gameType="basketball" />
              {!isOver && (
                <button onClick={handleForfeit} className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium">
                  End Game
                </button>
              )}
              <button onClick={handleForfeit} className="text-gray-400 hover:text-white" title={winner || isOver ? 'Close' : 'End Game'}>
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-center gap-3 px-5 py-2.5 flex-wrap shrink-0 border-b border-gray-800">
            {sortedPlayers.map((p) => {
              const word = letters[String(p.user_id)] || '';
              const isElim = !!eliminated[String(p.user_id)];
              return (
                <div
                  key={p.user_id}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
                    isElim ? 'bg-gray-800/30 opacity-50' : currentPlayer?.user_id === p.user_id ? 'bg-purple-900/40 ring-2 ring-purple-500' : 'bg-gray-800/50'
                  }`}
                >
                  {p.avatar ? (
                    <img src={p.avatar} alt={p.username} className="w-5 h-5 rounded-full object-cover shrink-0" />
                  ) : (
                    <span className="w-5 h-5 rounded-full bg-gray-700 flex items-center justify-center text-[9px] font-bold text-gray-300 shrink-0">
                      {p.username?.[0]?.toUpperCase()}
                    </span>
                  )}
                  <span className="text-white text-sm font-medium">{p.username}</span>
                  <span className="font-mono text-xs tracking-widest">
                    {HORSE_WORD.split('').map((ch, i) => (
                      <span key={i} className={i < word.length ? 'text-red-400 font-bold' : 'text-gray-600'}>{ch}</span>
                    ))}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="relative flex-1 min-h-[320px]">
            {showCanvasScene ? (
              <>
                {/* Now mounted for EVERY connected player for the whole
                    match, not just whoever's turn it is — see the big
                    comment above isMyTurnRef. A non-shooting player sees the
                    exact same court/ball/player, positioned live from the
                    shooter's own relayed state, instead of a flat
                    placeholder. */}
                <div ref={mountRef} className="absolute inset-0" />
                {engineLoading && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-900">
                    <div className="relative w-14 h-14">
                      <span className="absolute inset-0 flex items-center justify-center text-3xl">🏀</span>
                      <div className="absolute inset-0 rounded-full border-4 border-gray-700 border-t-orange-500 animate-spin" />
                    </div>
                    <p className="text-gray-400 text-sm">Setting up the court…</p>
                  </div>
                )}
                {!isMyTurn && !engineLoading && (
                  <p className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5 text-sm text-white bg-black/60 px-3 py-1 rounded-full whitespace-nowrap pointer-events-none">
                    {currentPlayer?.avatar && (
                      <img src={currentPlayer.avatar} alt="" className="w-4 h-4 rounded-full object-cover" />
                    )}
                    {currentPlayer?.username || 'Opponent'}&apos;s turn
                  </p>
                )}
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-gray-400">
                <span className="text-5xl">🏀</span>
              </div>
            )}
            {lastHitLabel && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/70 text-yellow-400 font-bold text-sm">
                {lastHitLabel}
              </div>
            )}
          </div>

          {isMyTurn && !isOver && (
            <div className="px-5 pb-4 pt-2 shrink-0">
              <div className="relative h-4 bg-gray-800 rounded-full overflow-hidden border border-gray-700 mb-3">
                {meter && (
                  <>
                    <div
                      className="absolute inset-y-0 bg-green-500/40"
                      style={{ left: `${clampPct(meter.stable0)}%`, width: `${clampPct(meter.stable1 - meter.stable0)}%` }}
                    />
                    <div
                      className="absolute inset-y-0 bg-green-400"
                      style={{ left: `${clampPct(meter.green0)}%`, width: `${clampPct(meter.green1 - meter.green0)}%` }}
                    />
                    <div
                      className="absolute inset-y-0 bg-yellow-300"
                      style={{ left: `${clampPct(meter.progress) - 0.5}%`, width: '3px' }}
                    />
                  </>
                )}
              </div>
              {touch && (
                <div className="flex items-center justify-between gap-3">
                  <div className="grid grid-cols-3 gap-1 w-32">
                    <div />
                    <TouchBtn code="KeyW" label="↑" />
                    <div />
                    <TouchBtn code="KeyA" label="←" />
                    <div />
                    <TouchBtn code="KeyD" label="→" />
                    <div />
                    <TouchBtn code="KeyS" label="↓" />
                    <div />
                  </div>
                  <TouchBtn code="Space" label="SHOOT" wide />
                </div>
              )}
              {!touch && (
                <p className="text-center text-xs text-gray-500">WASD to move · hold Space to charge, release to shoot</p>
              )}
            </div>
          )}

          {!isMyTurn && !isOver && isPlayer && (
            <div className="px-5 pb-4 text-center text-gray-500 text-xs shrink-0">Waiting for your turn…</div>
          )}
        </div>
      </div>

      {isOver && (
        <GameWinnerBanner
          winner={winner}
          players={players}
          gameType="basketball"
          gameStats={{ lines: players.map((p) => ({ label: p.username, value: `${letters[String(p.user_id)] || '(clean)'}` })) }}
          isForfeit={gameState?.status === 'forfeited'}
          onClose={onClose}
          onPostResult={onPostResult}
          secondaryAction={(gameState?.host_id ?? players?.[0]?.user_id) === currentUserId && onPlayAgain ? { label: 'Play Again 🔄', onClick: onPlayAgain } : undefined}
        />
      )}
    </>
  );
}

function clampPct(v) {
  if (v == null || Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(100, v * 100));
}

function TouchBtn({ code, label, wide }) {
  return (
    <button
      onPointerDown={(e) => { e.preventDefault(); pressKey(code); }}
      onPointerUp={(e) => { e.preventDefault(); releaseKey(code); }}
      onPointerLeave={() => releaseKey(code)}
      className={`select-none rounded-lg bg-white/10 hover:bg-white/20 active:bg-white/30 text-white font-bold flex items-center justify-center ${wide ? 'px-6 py-4 text-sm' : 'h-9 text-sm'}`}
      style={{ touchAction: 'none' }}
    >
      {label}
    </button>
  );
}
