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
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
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

// Live shot relay — mirrors BowlingGame.jsx's own throw_progress mechanism
// (same ~10Hz cadence, same "sender never renders it, only the receiving
// spectator's stale-check matters" shape), scaled down since basketball has
// no parallel spectator 3D scene to drive — just enough to answer "not
// broadcast in real time when clicked": a spectator now sees the actual
// shot arc rise and fall live, not just a static waiting screen until the
// server's result lands a beat later.
const PROGRESS_SEND_EVERY_FRAMES = 6; // ~10Hz @ 60fps
const RELAY_STALE_MS = 700; // a bit more forgiving than a fixed-cadence 3D relay — this is a coarse height cue, not physics
const RELAY_HEIGHT_MAX = 5; // meters — normalizes Ball.pos.y into a 0-100% vertical position for the CSS indicator below
const SHOT_SETTLE_GRACE_MS = 900; // let the ball's landing / result label read for a beat before letting go
const SHOT_HOLD_SAFETY_CAP_MS = 6000; // backstop only — in case ball.state never leaves 'shot' for some reason

export default function BasketballGame({ gameState, players = [], currentUserId, onMove, onClose, onEndGame, onPostResult }) {
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

  // Spectator-side live relay indicator — see PROGRESS_SEND_EVERY_FRAMES's
  // own comment above for the full "why" (answers the "not broadcast in
  // real time" report). Plain useState + a staleness timeout is enough here
  // (no rAF loop needed, unlike BowlingGame.jsx's full 3D relay scene) —
  // this only ever drives one CSS transform on a small 2D indicator.
  const [relayHeightPct, setRelayHeightPct] = useState(null);
  const relayStaleTimerRef = useRef(null);
  useEffect(() => {
    const ball = gs.shoot_progress?.ball;
    if (!ball) return;
    const pct = Math.max(0, Math.min(100, (ball.y / RELAY_HEIGHT_MAX) * 100));
    setRelayHeightPct(pct);
    if (relayStaleTimerRef.current) clearTimeout(relayStaleTimerRef.current);
    relayStaleTimerRef.current = setTimeout(() => setRelayHeightPct(null), RELAY_STALE_MS);
  }, [gs.shoot_progress]);
  useEffect(() => () => { if (relayStaleTimerRef.current) clearTimeout(relayStaleTimerRef.current); }, []);

  const currentTurn = gameState?.current_turn ?? 0;
  const currentPlayer = players[currentTurn];
  const isMyTurn = currentPlayer?.user_id === currentUserId;
  const isPlayer = players.some((p) => p.user_id === currentUserId);
  const winner = gameState?.winner_id ? players.find((p) => p.user_id === gameState.winner_id) : null;
  const isOver = ['finished', 'forfeited', 'completed'].includes(gameState?.status);

  // ── Keep the scene mounted through a shot's release/arc/net animation ──
  // The engine deliberately PAUSES a shooter's release at the top of their
  // motion (see player.js's WeWatch bridge block) until resolveServerShot()
  // is called — which only happens once game_state_update delivers
  // last_result, in the very same broadcast that also flips isMyTurn to
  // false (turn passes) or isOver to true (game-ending shot). Tearing the
  // scene down on that same commit — which the old `!isMyTurn || isOver`
  // gate below did — killed the RAF loop before the now-just-unblocked
  // release/arc/rim-or-net animation had any chance to actually play.
  //
  // `holdSceneOpen` is flagged the instant OUR new result appears, via a
  // direct state adjustment during render (not inside a useEffect) — React
  // re-renders with the corrected value before any effect ever runs, so
  // there's no cross-effect ordering/race to get wrong here (a plain
  // useState set from a sibling effect would NOT be visible to another
  // effect in that same commit, since each effect's closure is captured at
  // render time).
  const [holdSceneOpen, setHoldSceneOpen] = useState(false);
  const lastResultKeyForHoldRef = useRef(null);
  if (lastResult?.made != null && lastResult.shooter_id === currentUserId) {
    const holdKey = `${lastResult.shooter_id}-${lastResult.distance}-${lastResult.power}-${lastResult.made}`;
    if (lastResultKeyForHoldRef.current !== holdKey) {
      lastResultKeyForHoldRef.current = holdKey;
      if (!holdSceneOpen) setHoldSceneOpen(true);
    }
  }
  // Safety-cap backstop only — the real close trigger lives inside the RAF
  // loop below (fires once ball.state genuinely leaves 'shot', i.e. the
  // ball has actually landed), this just guarantees the scene can never get
  // stuck mounted forever if that never happens for some reason.
  useEffect(() => {
    if (!holdSceneOpen) return undefined;
    const t = setTimeout(() => setHoldSceneOpen(false), SHOT_HOLD_SAFETY_CAP_MS);
    return () => clearTimeout(t);
  }, [holdSceneOpen]);

  const showCanvasScene = holdSceneOpen || (isMyTurn && !isOver);

  const handleShootAttempt = useCallback(({ distance, power }) => {
    onMove({ move_type: 'shoot', distance, power });
  }, [onMove]);

  // ── Three.js scene + WWGame setup — rebuilt whenever it becomes this
  // player's own turn (mirrors BowlingGame.jsx's identical "only the active
  // thrower's device runs the engine" lifecycle), and now also kept mounted
  // through showCanvasScene's hold window so a just-released shot's
  // animation can finish (see above). ───────────────────────────────────
  useEffect(() => {
    if (!showCanvasScene) return undefined;
    const mount = mountRef.current;
    if (!mount) return undefined;

    const scene = new THREE.Scene();
    const width = mount.clientWidth || 1, height = mount.clientHeight || 1;
    const camera = new THREE.PerspectiveCamera(46, width / height, 0.1, 100);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    mount.appendChild(renderer.domElement);

    buildEnvironment(scene, renderer);

    const wwGame = new WWGame(scene, {
      onShootAttempt: handleShootAttempt,
      onShotMeterUpdate: setMeter,
    });
    wwGame.cameraRig = new CameraRig(camera);
    wwGameRef.current = wwGame;

    let raf;
    let progressFrameCount = 0;
    let sawShotState = false;
    let closeTimer = null;
    const clock = new THREE.Clock();
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const dt = Math.min(clock.getDelta(), 0.05);
      wwGame.update(dt);
      renderer.render(scene, camera);

      // Live relay: only while the ball is actually airborne after a real
      // release (Ball.state === 'shot' — set by Ball.shoot()/shootDunk() in
      // ball.js). Never fires for a held/dribbled ball, so a spectator's
      // indicator only ever appears for the part of the action that's
      // actually a "shot" — matching what the placeholder text already says.
      if (wwGame.ball?.state === 'shot') {
        progressFrameCount += 1;
        if (progressFrameCount >= PROGRESS_SEND_EVERY_FRAMES) {
          progressFrameCount = 0;
          const p = wwGame.ball.pos;
          onMove({ move_type: 'shoot_progress', ball: { x: p.x, y: p.y, z: p.z } });
        }
        sawShotState = true;
      } else {
        progressFrameCount = 0;
        // The shot has fully played out — ball.js only leaves 'shot' once
        // the ball actually lands (rim miss bouncing to the floor, or a
        // make falling through the net and landing) — see ball.js's floor
        // -bounce branch. Let go of the hold a beat later so the result
        // has a moment to read; a no-op if isMyTurn alone already keeps
        // the scene open (shooter made it and gets to keep shooting).
        if (sawShotState && !closeTimer) {
          closeTimer = setTimeout(() => setHoldSceneOpen(false), SHOT_SETTLE_GRACE_MS);
        }
      }
    };
    animate();

    const handleResize = () => {
      const w = mount.clientWidth || 1, h = mount.clientHeight || 1;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(raf);
      if (closeTimer) clearTimeout(closeTimer);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
      wwGameRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCanvasScene]);

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
              <h2 className="text-white text-xl font-bold">Basketball — H.O.R.S.E 🏀</h2>
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
              <div ref={mountRef} className="absolute inset-0" />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-gray-400 overflow-hidden">
                {relayHeightPct != null ? (
                  // Live shot in flight — a real, near-real-time rise/fall cue
                  // rather than a static waiting screen. Deliberately coarse
                  // (height only, no 3D re-simulation) — this is a spectator
                  // convenience, not a claim of matching the shooter's exact
                  // physics; the actual make/miss result still comes from the
                  // server-authoritative "shoot" move alone.
                  <div className="relative w-full h-full">
                    <span
                      className="absolute left-1/2 text-4xl transition-[bottom] duration-150 ease-linear"
                      style={{ bottom: `${relayHeightPct}%`, transform: 'translateX(-50%)' }}
                    >
                      🏀
                    </span>
                    <p className="absolute bottom-3 left-1/2 -translate-x-1/2 text-sm whitespace-nowrap">
                      {currentPlayer?.username || 'Opponent'}&apos;s shot is in the air…
                    </p>
                  </div>
                ) : (
                  <>
                    <span className="text-5xl">🏀</span>
                    {!isOver && <p className="text-sm">{currentPlayer?.username || 'Opponent'} is shooting…</p>}
                  </>
                )}
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

          {!isOver && (
            <div className="flex justify-end px-5 pb-4 shrink-0">
              <button onClick={handleForfeit} className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium">
                End Game
              </button>
            </div>
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
