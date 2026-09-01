// src/components/Games/BowlingGame.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { X, Volume2, VolumeX } from 'lucide-react';
import GameWinnerBanner from './GameWinnerBanner';
import GameRulesButton from './GameRulesButton';
import ControlsTutorialOverlay from './ControlsTutorialOverlay';
import { BowlPhysics, FRAME_ROLL_TIME, BALL_RADIUS, BALL_LINE, BALL_HEIGHT, TRACK_WIDTH, PIN_POSITIONS } from './bowlingPhysics';

// Real, GPL-3.0 bowling-alley/ball/pin assets from github.com/iliagrigorevdev/
// bowling, hosted on our own BunnyCDN — see CLAUDE.md's Bowling section for
// the full provenance/verification trail.
const AMMO_URL = 'https://LetsWatchOut.b-cdn.net/games/bowling/ammo.js';
const SCENE_URL = 'https://LetsWatchOut.b-cdn.net/games/bowling/scene.gltf';

// Camera — a single source of truth used by BOTH the thrower's physics
// scene and the passive broadcast scene (previously each hardcoded its own
// copy of these three values, which had already drifted into a genuine
// divergence risk once — see buildEnvironment's own history above). A
// narrower FOV pulled further back reads as more "long lane, seen down its
// length" (a telephoto-style compression, closer to real broadcast bowling
// coverage) than the original wide/close framing, which made the lane read
// as short since a wide FOV up close visually compresses depth rather than
// exaggerating it.
const CAMERA_FOV_DEG = 48;
const CAMERA_POSITION_Y = 0.45;
const CAMERA_POSITION_Z = 4.3;
const CAMERA_PITCH_DEG = -4;
const GRAB_THRESHOLD_PX = 5; // pointer must move at least this far before a "pick" becomes a drag
const BALL_ANGLE_MAX = Math.PI / 12;
// ~10Hz @ 60fps — matches pool's own shot_progress relay cadence
// (PoolGame.jsx/wewatch-bridge.js). Frequent enough to look smooth, far
// below what would meaningfully burden the WS/DB write path (throw_progress
// is registered as a volatile move in game_manager.go — no DB persistence
// per packet).
const PROGRESS_SEND_EVERY_FRAMES = 6;
// If no throw_progress packet has arrived in this long, the passive
// broadcast scene (below) treats the throw as over and falls back to the
// idle rack/parked-ball view — covers both "the throw genuinely settled and
// the server cleared throw_progress" and "a packet or two got dropped."
const RELAY_STALE_MS = 600;

// Module-level singleton promises — ammo.js and the glTF model are each
// fetched/parsed exactly once for the whole page's lifetime, not once per
// turn or per component remount. CRITICAL: a rejected promise must be
// cleared back to null (not left cached forever) — otherwise one transient
// network hiccup on the very first load attempt permanently breaks bowling's
// visuals (pins/ball/lane, all from the same glTF) for the rest of the page
// session, since every subsequent .then()/.catch() would just immediately
// re-reject against the same stale rejected promise with no way to retry.
let ammoLoadPromise = null;
function loadAmmo() {
  if (window.Ammo && typeof window.Ammo !== 'function') return Promise.resolve();
  if (!ammoLoadPromise) {
    ammoLoadPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = AMMO_URL;
      script.async = true;
      script.onload = () => {
        // The real Ammo.js build is a global factory function returning a
        // Promise that resolves to the actual WASM/asm.js module instance —
        // reassign the global to that resolved instance so every
        // `window.Ammo.btVector3` etc. reference inside bowlingPhysics.js
        // keeps working unmodified after this point.
        window.Ammo().then((AmmoInstance) => {
          window.Ammo = AmmoInstance;
          resolve();
        }, (e) => { ammoLoadPromise = null; reject(e); });
      };
      script.onerror = () => { ammoLoadPromise = null; reject(new Error('Failed to load the physics engine')); };
      document.head.appendChild(script);
    });
  }
  return ammoLoadPromise;
}

let gltfLoadPromise = null;
function loadBowlingScene() {
  if (!gltfLoadPromise) {
    gltfLoadPromise = new Promise((resolve, reject) => {
      new GLTFLoader().load(
        SCENE_URL,
        (gltf) => {
          const trackMesh = gltf.scene.children.find((c) => c.name === 'Track');
          const ballMesh = gltf.scene.children.find((c) => c.name === 'Ball');
          const pinMesh = gltf.scene.children.find((c) => c.name === 'Pin');
          if (!trackMesh || !ballMesh || !pinMesh) {
            gltfLoadPromise = null;
            reject(new Error('Bowling scene is missing an expected mesh'));
            return;
          }
          resolve({ trackMesh, ballMesh, pinMesh });
        },
        undefined,
        () => { gltfLoadPromise = null; reject(new Error('Failed to load the bowling lane model')); },
      );
    });
  }
  return gltfLoadPromise;
}

// Exported so GameLobbyModal/GameStartInfoModal can start warming these two
// URLs into the browser's HTTP cache the moment bowling is merely being
// BROWSED (carousel centered on it) or its intro popup is showing — well
// before the full Three.js/Ammo.js scene actually needs to construct itself.
// Deliberately a raw fetch(), not a call into loadAmmo()/loadBowlingScene()
// themselves: those parse/instantiate the WASM module and glTF scene graph
// immediately, which would mean paying that real CPU/memory cost twice (once
// here, speculatively, and again for real once the game actually starts) —
// a plain fetch only primes the HTTP cache, so the later real load call
// still does the actual parsing exactly once, just against already-cached
// bytes instead of a fresh network round-trip.
// eslint-disable-next-line react-refresh/only-export-components -- same accepted cross-file data-export pattern already used by GameLobbyModal.jsx's getGameMeta
export function preloadBowlingAssets() {
  try {
    fetch(AMMO_URL, { mode: 'cors', credentials: 'omit' }).catch(() => {});
    fetch(SCENE_URL, { mode: 'cors', credentials: 'omit' }).catch(() => {});
  } catch { /* best-effort only */ }
}

// ── Shared environment builder — lights + procedural walls/ceiling/floor.
// Used by BOTH the active thrower's own physics scene and the passive
// broadcast scene everyone else in the room sees, so the two always look
// identical and a future visual tweak only needs to happen in one place.
function buildEnvironment(scene) {
  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const dLight = new THREE.DirectionalLight(0xffffff, 0.7);
  dLight.position.set(-0.4, 0.6, 1.0);
  scene.add(dLight);
  // Two extra warm lights over the pin deck — the original scene was lit
  // for just the lane/pins in isolation; the added walls need something to
  // actually catch the light or they'd read as flat black silhouettes
  // against the sky-colored background.
  const overheadLight = new THREE.PointLight(0xfff2d9, 0.9, 12);
  overheadLight.position.set(0, 2.6, 0.5);
  scene.add(overheadLight);
  const fillLight = new THREE.HemisphereLight(0xdbe9ff, 0x2a2a30, 0.45);
  scene.add(fillLight);

  // ── Procedural enclosure — no real "bowling alley wall" asset was found
  // that would sit cleanly around this exact lane's dimensions, so this part
  // stays hand-built (cheap, zero licensing risk, matches the same technique
  // BasketballGame.jsx/environment.js already uses for its own court
  // surroundings). ───────────────────────────────────────────────────────
  const wallDisposables = [];
  const addWall = (w, h, mat, x, y, z, ry = 0) => {
    const geo = new THREE.PlaneGeometry(w, h);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    scene.add(mesh);
    wallDisposables.push(geo);
  };
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x9aa7b8, roughness: 0.9 });
  const ceilMat = new THREE.MeshStandardMaterial({ color: 0x6d7686, roughness: 1 });
  wallDisposables.push(wallMat, ceilMat);
  const enclosureWidth = TRACK_WIDTH + 5.0;
  const enclosureHeight = 3.0;
  const enclosureBackZ = -3.4; // behind the pin deck
  const enclosureFrontZ = 7.0; // behind the camera/player — comfortably past CAMERA_POSITION_Z so the floor/walls don't visibly end mid-frame
  addWall(enclosureWidth, enclosureHeight, wallMat, 0, enclosureHeight / 2, enclosureBackZ); // back wall
  addWall(enclosureWidth, enclosureHeight, wallMat, -enclosureWidth / 2, enclosureHeight / 2, (enclosureBackZ + enclosureFrontZ) / 2, Math.PI / 2); // left wall
  addWall(enclosureWidth, enclosureHeight, wallMat, enclosureWidth / 2, enclosureHeight / 2, (enclosureBackZ + enclosureFrontZ) / 2, -Math.PI / 2); // right wall
  const ceilGeo = new THREE.PlaneGeometry(enclosureWidth, enclosureFrontZ - enclosureBackZ);
  const ceiling = new THREE.Mesh(ceilGeo, ceilMat);
  ceiling.position.set(0, enclosureHeight, (enclosureBackZ + enclosureFrontZ) / 2);
  ceiling.rotation.x = Math.PI / 2;
  scene.add(ceiling);
  wallDisposables.push(ceilGeo);
  // Floor — the original scene had none at all, so the walls appeared to
  // float in the plain sky-colored background below y=0 with nothing
  // grounding them. Sits a hair below y=0 to avoid z-fighting with the lane
  // mesh's own approach-area geometry.
  const floorGeo = new THREE.PlaneGeometry(enclosureWidth, enclosureFrontZ - enclosureBackZ);
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x3a2a30, roughness: 0.95 });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.position.set(0, -0.02, (enclosureBackZ + enclosureFrontZ) / 2);
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);
  wallDisposables.push(floorGeo, floorMat);

  return { wallDisposables };
}

// navigator.vibrate feature-detected — Safari/iOS has no Vibration API at
// all. Deliberately independent of the sound-mute toggle, same convention
// already established in PingPongGame.jsx/ArcheryGame.jsx.
function hapticImpact(pattern) {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(pattern);
  }
}

// Synthesized ball-release "whoosh" — a short filtered-noise-ish sweep via a
// fast-descending sawtooth, pitch/volume scaled by real release velocity. No
// external audio asset, same convention as every other game in this app's
// arcade/party roster (Darts/Archery/Ping Pong/Air Hockey).
function playReleaseSound(velocity, enabled) {
  if (!enabled || typeof window === 'undefined') return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sawtooth';
    const startFreq = 220 + Math.min(velocity, 12) * 18;
    oscillator.frequency.setValueAtTime(startFreq, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(startFreq * 0.4, context.currentTime + 0.22);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.1, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.24);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.26);
    setTimeout(() => context.close(), 340);
  } catch {
    /* ignore — sound is a pure nicety */
  }
}

// Synthesized pin-crash/thud, fired at the exact moment the local physics
// simulation's own pin count settles (the same instant the "throw" move is
// sent) — intensity/timbre scaled by how many pins actually fell. A bigger
// crash for a strike than a single clipped pin.
function playCrashSound(beatenCount, enabled) {
  if (!enabled || typeof window === 'undefined') return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    const context = new AudioContextClass();
    const noiseTaps = Math.max(1, Math.min(beatenCount, 10));
    for (let i = 0; i < noiseTaps; i++) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'triangle';
      const t0 = context.currentTime + i * 0.014;
      oscillator.frequency.setValueAtTime(70 + Math.random() * 90, t0);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.11, t0 + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.15);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(t0);
      oscillator.stop(t0 + 0.16);
    }
    setTimeout(() => context.close(), 400 + noiseTaps * 14);
  } catch {
    /* ignore — sound is a pure nicety */
  }
}

// A short triumphant 3-note ascending chime for a strike or spare — the one
// "real bowling alley" celebratory beat this game didn't have any audio
// payoff for at all before.
function playStrikeFanfare(enabled) {
  if (!enabled || typeof window === 'undefined') return;
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    const context = new AudioContextClass();
    const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
    notes.forEach((freq, i) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const t0 = context.currentTime + i * 0.09;
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(0.12, t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.3);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(t0);
      oscillator.stop(t0 + 0.32);
    });
    setTimeout(() => context.close(), 700);
  } catch {
    /* ignore — sound is a pure nicety */
  }
}

function fmtDigit(n) {
  return n === 0 ? '-' : String(n);
}

// Real bowling-scoresheet convention for the 10th frame's up-to-3 throws,
// including the "mini spare" (`/`) a strike-opener's bonus two balls can
// still form. Purely a display concern — the actual score total always
// comes from the server's own `score` field.
function formatTenthFrame(t0, t1, t2) {
  if (t0 === 10) {
    if (t1 === 10) return ['X', 'X', t2 === 10 ? 'X' : fmtDigit(t2)];
    const third = t1 + t2 === 10 ? '/' : t2 === 10 ? 'X' : fmtDigit(t2);
    return ['X', fmtDigit(t1), third];
  }
  if (t0 + t1 === 10) return [fmtDigit(t0), '/', t2 === 10 ? 'X' : fmtDigit(t2)];
  return [fmtDigit(t0), fmtDigit(t1), ''];
}

// Derives what to show in a given frame's throw boxes purely from the
// player's server-confirmed BowlingScores, disambiguating "not yet reached"
// from "in progress, N throws made so far" from "fully resolved" using
// frame_number/throw_number/frame_states together (throw_results alone
// can't distinguish a real gutter-ball 0 from an unplayed slot).
function frameDisplayChars(frameIdx, scores) {
  const isTenth = frameIdx === 9;
  const state = scores.frame_states?.[frameIdx] ?? 0;
  const raw = scores.throw_results?.[frameIdx] ?? [0, 0, 0];

  if (state === 1) return isTenth ? ['', 'X', ''] : ['', 'X']; // strike
  if (state === 2) return isTenth ? [fmtDigit(raw[0]), '/', ''] : [fmtDigit(raw[0]), '/']; // spare
  if (state === 3) {
    if (!isTenth) return [fmtDigit(raw[0]), fmtDigit(raw[1])];
    return formatTenthFrame(raw[0], raw[1], raw[2]);
  }
  // Not yet fully resolved — show whichever throws have actually landed if
  // this is the player's current frame.
  if (frameIdx === (scores.frame_number ?? 0) && !scores.game_over) {
    const made = scores.throw_number ?? 0;
    const slots = isTenth ? 3 : 2;
    const chars = new Array(slots).fill('');
    for (let i = 0; i < made && i < slots; i++) chars[i] = raw[i] === 10 ? 'X' : fmtDigit(raw[i]);
    return chars;
  }
  return isTenth ? ['', '', ''] : ['', ''];
}

function Scoreboard({ players, scoresMap, currentPlayerId }) {
  return (
    <div className="overflow-x-auto px-3 py-2 border-b border-gray-800">
      <table className="text-xs text-white border-collapse mx-auto">
        <tbody>
          {players.map((p) => {
            const s = scoresMap[String(p.user_id)] || {};
            return (
              <tr key={p.user_id} className={p.user_id === currentPlayerId ? 'bg-purple-900/30' : ''}>
                <td className="pr-2 py-1">
                  <div className="flex items-center gap-1.5 max-w-[110px]">
                    <div className="w-5 h-5 rounded-full overflow-hidden shrink-0 bg-gray-700">
                      {p.avatar ? (
                        <img src={p.avatar} alt={p.username} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[9px] font-bold text-gray-300">
                          {p.username?.[0]?.toUpperCase()}
                        </div>
                      )}
                    </div>
                    <span className="font-medium whitespace-nowrap truncate">{p.username}</span>
                  </div>
                </td>
                {Array.from({ length: 10 }).map((_, fi) => {
                  const chars = frameDisplayChars(fi, s);
                  return (
                    <td key={fi} className="border border-gray-700 align-top">
                      <div className="flex">
                        {chars.map((c, ci) => (
                          <div key={ci} className="w-4 h-4 flex items-center justify-center border-r border-gray-700 last:border-r-0 text-[9px]">
                            {c}
                          </div>
                        ))}
                      </div>
                      <div className="text-center text-[9px] text-yellow-400/90 border-t border-gray-700 min-h-[10px]">
                        {s.frame_states?.[fi] === 3 ? s.frame_results?.[fi] : ''}
                      </div>
                    </td>
                  );
                })}
                <td className="pl-2 font-bold text-yellow-400 whitespace-nowrap">{s.score ?? 0}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function BowlingGame({ gameState, players = [], currentUserId, onMove, onClose, onEndGame, onPostResult, onPlayAgain }) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null); // { camera, renderer, raycaster }
  const physicsRef = useRef(null);
  const ballMeshRef = useRef(null);
  const pinMeshesRef = useRef(null);
  const reportedThrowRef = useRef(false);
  const lastPinsStandingRef = useRef(null);
  // ── Broadcast-relay state, read by the passive spectator scene's own
  // animate() loop (never by the thrower's — see the effect below). Kept in
  // sync via lightweight ref-writing effects rather than being read directly
  // off the `gs` closure, since the animate loop runs every frame and can't
  // depend on a fresh closure the way a React effect can.
  const relayRef = useRef({ ball: null, pins: null, receivedAt: 0 });
  // Velocity-extrapolation anchor for the passive/spectator scene's ball —
  // same dead-reckoning technique already proven in TankBattleGame.jsx/
  // BombermanGame.jsx/PingPongGame.jsx for a relayed object that only
  // updates a few times a second: rather than bare-snapping the ball to
  // whatever position the last packet said (which reads as a stutter/freeze
  // between packets while the thrower's own physics keeps running smooth
  // 60fps), estimate the ball's velocity from the delta between the last two
  // packets and extrapolate its position forward every render frame in
  // between. Rotation is left as a snap (no slerp) — a spinning ball's
  // orientation is far less visually distracting mid-teleport than its
  // position is, so this isn't worth the extra complexity.
  const relayVelAnchorRef = useRef({ x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, t: 0 });
  const RELAY_EXTRAPOLATION_CAP_S = 0.25;
  const pinMaskRef = useRef(-1); // -1 = unknown/full rack (matches BowlPhysics.resetPhysics's own convention)
  // A knocked-over pin lies flat and mostly disappears from view at this
  // camera angle — with nothing else marking the moment, a genuine strike
  // can look exactly like "nothing happened." This transient label is the
  // one unmistakable on-screen confirmation that a throw actually landed,
  // for every throw (not just strikes/spares, which already get the
  // separate playStrikeFanfare sound below).
  const [throwLabel, setThrowLabel] = useState(null);
  const throwLabelTimerRef = useRef(null);
  useEffect(() => () => { if (throwLabelTimerRef.current) clearTimeout(throwLabelTimerRef.current); }, []);
  const touchPointRef = useRef(new THREE.Vector2());
  const inputRef = useRef({
    pickingBall: false,
    positioningBall: false,
    rollingBall: false,
    pickX: 0,
    pickY: 0,
    pickOffset: 0,
    pickTime: 0,
    pickPoint: new THREE.Vector3(),
    dragPoint: new THREE.Vector3(),
  });

  const [engineReady, setEngineReady] = useState(false);
  const [loadError, setLoadError] = useState(null);
  // Bumped to force the scene-build effect to re-run after a manual retry —
  // see handleRetryLoad below. The effect's own deps stay [isMyTurn, isOver]
  // deliberately (rebuilding on every render would be wrong), so a distinct
  // "please try again" signal is needed.
  const [retryTick, setRetryTick] = useState(0);

  // Warm the physics-engine/lane-model URLs into the browser's HTTP cache the
  // moment this component mounts — covers "preload fully while the
  // GameStartInfoModal intro popup is still covering the screen", since this
  // component is already mounted underneath that popup by the time it shows
  // (matching BombermanGame.jsx's own introResolved-gated-countdown
  // precedent). A no-op if GameLobbyModal already warmed the same URLs while
  // this game was merely being browsed.
  useEffect(() => { preloadBowlingAssets(); }, []);

  // Sound only ever plays on the active thrower's own device — spectators
  // have no local physics simulation and no per-throw broadcast to sync
  // audio/haptics against (see the "Waiting for your turn" placeholder
  // branch below), matching this game's existing client-authoritative-
  // physics trust model. soundEnabledRef mirrors the state into the
  // animate() loop's closure, which is created once per scene-build effect
  // run and doesn't have soundEnabled in its own dependency array (adding
  // it would tear down and rebuild the whole Three.js/Ammo scene on every
  // mute toggle).
  const [soundEnabled, setSoundEnabled] = useState(() => {
    try { return localStorage.getItem('bowling_sound_enabled') !== 'false'; } catch { return true; }
  });
  const soundEnabledRef = useRef(soundEnabled);
  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
    try { localStorage.setItem('bowling_sound_enabled', String(soundEnabled)); } catch { /* ignore */ }
  }, [soundEnabled]);

  // Detects a NEW strike/spare on the current viewer's own scoresheet (index
  // transitioning from "not yet resolved" to strike(1)/spare(2)) to fire a
  // celebratory fanfare — this game had zero audio payoff for its single
  // most exciting moment before this.
  const prevFrameStatesRef = useRef(null);

  const gs = gameState?.game_state || {};
  const scoresMap = gs.scores || {};
  const currentTurn = gameState?.current_turn ?? 0;
  const currentPlayer = players[currentTurn];
  const isMyTurn = currentPlayer?.user_id === currentUserId;
  const isPlayer = players.some((p) => p.user_id === currentUserId);
  const myScores = scoresMap[String(currentUserId)];
  // Whichever player is CURRENTLY at bat — this is `myScores` itself during
  // your own turn (same object, so nothing changes for the thrower), but
  // also gives spectators a live view into the action's scoresheet without
  // needing their own turn. Used to drive spectator sound/label reactions
  // below.
  const activeThrowerScores = scoresMap[String(currentPlayer?.user_id)];
  const winner = gameState?.winner_id ? players.find((p) => p.user_id === gameState.winner_id) : null;
  const isOver = ['finished', 'forfeited', 'completed'].includes(gameState?.status);

  // Keep the two broadcast-relay refs current on every gameState update —
  // the passive spectator scene's animate() loop reads them every frame and
  // can't itself depend on a fresh `gs` closure.
  useEffect(() => {
    pinMaskRef.current = typeof gs.pin_mask === 'number' ? gs.pin_mask : -1;
  }, [gs.pin_mask]);
  useEffect(() => {
    if (!gs.throw_progress) return; // cleared server-side once a throw settles — let it go stale naturally (RELAY_STALE_MS)
    const ball = gs.throw_progress.ball || null;
    const now = Date.now();
    const prevAnchor = relayVelAnchorRef.current;
    const prevBall = relayRef.current.ball;
    const wasFreshTurn = relayRef.current.ball && now - relayRef.current.receivedAt < RELAY_STALE_MS * 3;
    if (ball && wasFreshTurn && prevBall) {
      const dtSec = Math.max((now - prevAnchor.t) / 1000, 1 / 90);
      relayVelAnchorRef.current = {
        x: ball.x, y: ball.y, z: ball.z,
        vx: (ball.x - prevBall.x) / dtSec,
        vy: (ball.y - prevBall.y) / dtSec,
        vz: (ball.z - prevBall.z) / dtSec,
        t: now,
      };
    } else if (ball) {
      // First packet of a fresh throw — no prior sample to derive a
      // velocity from yet; hold position with zero velocity until the next
      // packet arrives.
      relayVelAnchorRef.current = { x: ball.x, y: ball.y, z: ball.z, vx: 0, vy: 0, vz: 0, t: now };
    }
    relayRef.current = { ball, pins: gs.throw_progress.pins || null, receivedAt: now };
  }, [gs.throw_progress]);

  const updateTouchRay = useCallback((clientX, clientY) => {
    const s = sceneRef.current;
    if (!s) return null;
    const rect = s.renderer.domElement.getBoundingClientRect();
    touchPointRef.current.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    touchPointRef.current.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    s.raycaster.setFromCamera(touchPointRef.current, s.camera);
    return s.raycaster.ray;
  }, []);

  // Intersects at the BALL's own height (its center, not the lane surface
  // it rolls on) so a click that visually lands on the ball always resolves
  // to a world point very close to the ball's real position, regardless of
  // camera angle. This used to intersect at BASE_HEIGHT (the lane surface,
  // BALL_RADIUS below the ball's center) — with the original steep, distant
  // camera the couple-centimeter gap between the two heights was invisible
  // in practice, but the new low, near-horizontal camera (CAMERA_PITCH_DEG)
  // makes rays nearly parallel to any horizontal plane — extending a ray
  // that extra BALL_RADIUS in Y sends its X/Z intersection wildly off,
  // silently missing the ball's actual grab radius entirely. Nothing else
  // in the pick/drag/release math cares which height this plane sits at —
  // pick point and drag point are always compared to each other or to
  // BALL_LINE/releasePosition on the same plane, never to BASE_HEIGHT
  // itself — so this is a pure precision fix, not a behavior change.
  const intersectTouchPlane = useCallback((ray, out) => {
    if (Math.abs(ray.direction.y) > 1e-5) {
      const t = (BALL_HEIGHT - ray.origin.y) / ray.direction.y;
      if (t >= 0) {
        out.copy(ray.direction).multiplyScalar(t).add(ray.origin);
        return true;
      }
    }
    return false;
  }, []);

  // ── Build a fresh Three.js scene + BowlPhysics instance whenever a fresh
  // turn begins for this player (never rebuilt mid-turn — a single open
  // frame's 2-3 throws all share one physics instance, matching the real
  // game's own persistent-until-frame-closes model). Resumes exactly where
  // the server says this player's own frame is (fresh rack vs. partial
  // reset), so a reconnect mid-frame recovers correctly too.
  useEffect(() => {
    if (!isMyTurn || isOver) return undefined;
    const mount = mountRef.current;
    if (!mount) return undefined;

    let cancelled = false;
    let disposeFn = null;
    setEngineReady(false);
    setLoadError(null);

    Promise.all([loadAmmo(), loadBowlingScene()])
      .then(([, assets]) => {
        if (cancelled || !mountRef.current) return;
        const activeMount = mountRef.current;

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0.75, 0.8, 0.9);

        const width = activeMount.clientWidth || 1;
        const height = activeMount.clientHeight || 1;
        const camera = new THREE.PerspectiveCamera(CAMERA_FOV_DEG, width / height, 0.1, 20);
        camera.position.set(0, CAMERA_POSITION_Y, CAMERA_POSITION_Z);
        camera.rotation.x = (CAMERA_PITCH_DEG / 180) * Math.PI;

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        activeMount.appendChild(renderer.domElement);

        const { wallDisposables } = buildEnvironment(scene);

        scene.add(assets.trackMesh.clone());
        const ballMesh = assets.ballMesh.clone();
        scene.add(ballMesh);
        ballMeshRef.current = ballMesh;
        const pinMeshes = [];
        for (let i = 0; i < 10; i++) {
          const pm = assets.pinMesh.clone();
          scene.add(pm);
          pinMeshes.push(pm);
        }
        pinMeshesRef.current = pinMeshes;

        const physics = new BowlPhysics();
        physicsRef.current = physics;

        const standingNow = myScores?.pins_standing ?? 10;
        physics.resetPhysics(true, standingNow >= 10 ? -1 : physics.detectStandingPins());
        lastPinsStandingRef.current = standingNow;
        reportedThrowRef.current = false;

        const raycaster = new THREE.Raycaster();
        sceneRef.current = { camera, renderer, raycaster };

        let raf;
        let progressFrameCount = 0;
        const clock = new THREE.Clock();
        const animate = () => {
          raf = requestAnimationFrame(animate);
          const dt = clock.getDelta();
          physics.updatePhysics(dt);

          const bt = physics.ballBody.getCenterOfMassTransform();
          const bp = bt.getOrigin();
          const bq = bt.getRotation();
          ballMesh.position.set(bp.x(), bp.y(), bp.z());
          ballMesh.quaternion.set(bq.x(), bq.y(), bq.z(), bq.w());

          for (let i = 0; i < pinMeshes.length; i++) {
            const body = physics.pinBodies[i];
            if (body) {
              const pt = body.getCenterOfMassTransform();
              const pp = pt.getOrigin();
              const pq = pt.getRotation();
              pinMeshes[i].visible = true;
              pinMeshes[i].position.set(pp.x(), pp.y(), pp.z());
              pinMeshes[i].quaternion.set(pq.x(), pq.y(), pq.z(), pq.w());
            } else {
              pinMeshes[i].visible = false;
            }
          }

          // Live broadcast — while this throw is actively rolling (from
          // release until it settles/gets reported below), relay the ball
          // and every pin's already-just-computed transform to the room at a
          // throttled ~10Hz (matching pool's own shot_progress cadence), so
          // everyone else sees the throw happen instead of a static
          // "X is bowling…" placeholder. Deliberately gated on
          // `!reportedThrowRef.current`, NOT `physics.simulationActive` alone
          // — the latter stays true for the rest of the turn (only cleared
          // by the next resetPhysics call), long after the ball/pins have
          // visually stopped moving.
          if (physics.simulationActive && !reportedThrowRef.current) {
            progressFrameCount++;
            if (progressFrameCount % PROGRESS_SEND_EVERY_FRAMES === 0) {
              onMove({
                move_type: 'throw_progress',
                ball: { x: bp.x(), y: bp.y(), z: bp.z(), qx: bq.x(), qy: bq.y(), qz: bq.z(), qw: bq.w() },
                pins: pinMeshes.map((pm) => ({
                  visible: pm.visible,
                  x: pm.position.x,
                  y: pm.position.y,
                  z: pm.position.z,
                  qx: pm.quaternion.x,
                  qy: pm.quaternion.y,
                  qz: pm.quaternion.z,
                  qw: pm.quaternion.w,
                })),
              });
            }
          }

          if (physics.simulationActive && physics.simulationTime > FRAME_ROLL_TIME && !reportedThrowRef.current) {
            reportedThrowRef.current = true;
            const standingMask = physics.detectStandingPins();
            const beatenMask = physics.currentPinsMask & ~standingMask;
            const beatenCount = physics.countPins(beatenMask);
            onMove({ move_type: 'throw', pins_down: beatenCount, pin_mask: standingMask });
            playCrashSound(beatenCount, soundEnabledRef.current);
            hapticImpact(beatenCount >= 8 ? [20, 40, 20] : beatenCount > 0 ? [12] : [6]);
            setThrowLabel(beatenCount === 10 ? 'STRIKE!' : beatenCount === 0 ? 'GUTTER' : `${beatenCount} PIN${beatenCount === 1 ? '' : 'S'}!`);
            if (throwLabelTimerRef.current) clearTimeout(throwLabelTimerRef.current);
            throwLabelTimerRef.current = setTimeout(() => setThrowLabel(null), 2200);
          }

          renderer.render(scene, camera);
        };
        animate();
        setEngineReady(true);

        const handleResize = () => {
          const w = activeMount.clientWidth || 1;
          const h = activeMount.clientHeight || 1;
          camera.aspect = w / h;
          camera.updateProjectionMatrix();
          renderer.setSize(w, h);
        };
        window.addEventListener('resize', handleResize);

        disposeFn = () => {
          cancelAnimationFrame(raf);
          window.removeEventListener('resize', handleResize);
          renderer.dispose();
          // Walls/ceiling are freshly created per scene-build (not clones of
          // a shared cache like the track/ball/pin assets are), so they're
          // the one thing here that actually needs explicit disposal to
          // avoid leaking a geometry+material set every turn.
          for (const d of wallDisposables) d.dispose();
          if (activeMount.contains(renderer.domElement)) activeMount.removeChild(renderer.domElement);
          sceneRef.current = null;
          physicsRef.current = null;
          ballMeshRef.current = null;
          pinMeshesRef.current = null;
        };
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e.message || 'Failed to load the bowling lane');
      });

    return () => {
      cancelled = true;
      if (disposeFn) disposeFn();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMyTurn, isOver, retryTick]);

  // Manual retry — clears whichever module-level promise(s) failed (both are
  // already self-clearing on rejection, so this is really just "try loading
  // again now" rather than needing to reset anything itself) and bumps
  // retryTick so the scene-build effect above re-runs its Promise.all(...)
  // from scratch.
  const handleRetryLoad = useCallback(() => {
    setLoadError(null);
    setRetryTick((t) => t + 1);
  }, []);

  // ── Reset physics for the NEXT throw within an already-open turn (a
  // strike/full-clear on frames < 9, or the 10th frame's own 2nd/3rd bonus
  // throws) — the scene-build effect above only fires when isMyTurn flips
  // true, which never happens again mid-turn, so this is the only place a
  // continuing frame's next throw gets a correctly-primed physics reset.
  useEffect(() => {
    if (!isMyTurn || isOver) {
      lastPinsStandingRef.current = null;
      return;
    }
    const physics = physicsRef.current;
    if (!physics) return;
    const standing = myScores?.pins_standing;
    if (standing == null) return;
    if (lastPinsStandingRef.current === standing) return;
    const isFirstObservation = lastPinsStandingRef.current === null;
    lastPinsStandingRef.current = standing;
    if (isFirstObservation) return; // already primed by the scene-build effect
    reportedThrowRef.current = false;
    physics.resetPhysics(false, standing >= 10 ? -1 : physics.detectStandingPins());
  }, [isMyTurn, isOver, myScores?.pins_standing]);

  // ── Passive "broadcast" scene for anyone who is NOT the active thrower —
  // renders the exact same lane/walls (via the shared buildEnvironment
  // helper), but has no Ammo.js/physics of its own at all: it's driven
  // entirely by the active thrower's relayed throw_progress transforms while
  // fresh (relayRef), falling back to the last-known standing-pin layout
  // (pinMaskRef, from the "throw" move's own pin_mask) plus a ball parked at
  // the foul line once a throw has settled or nothing is happening yet.
  // Deliberately a fully separate effect/scene from the thrower's own,
  // rather than a shared one branching internally — the thrower's path is
  // load-bearing, already-verified gameplay logic, and duplicating this
  // strictly-cosmetic renderer keeps zero risk of the two interfering.
  useEffect(() => {
    if (isMyTurn || isOver) return undefined;
    const mount = mountRef.current;
    if (!mount) return undefined;

    let cancelled = false;
    let disposeFn = null;

    loadBowlingScene().then((assets) => {
      if (cancelled || !mountRef.current) return;
      const activeMount = mountRef.current;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0.75, 0.8, 0.9);

      const width = activeMount.clientWidth || 1;
      const height = activeMount.clientHeight || 1;
      const camera = new THREE.PerspectiveCamera(CAMERA_FOV_DEG, width / height, 0.1, 20);
      camera.position.set(0, CAMERA_POSITION_Y, CAMERA_POSITION_Z);
      camera.rotation.x = (CAMERA_PITCH_DEG / 180) * Math.PI;

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      activeMount.appendChild(renderer.domElement);

      const { wallDisposables } = buildEnvironment(scene);

      scene.add(assets.trackMesh.clone());
      const ballMesh = assets.ballMesh.clone();
      scene.add(ballMesh);
      const pinMeshes = [];
      for (let i = 0; i < 10; i++) {
        const pm = assets.pinMesh.clone();
        scene.add(pm);
        pinMeshes.push(pm);
      }

      // Idle state — no live relay currently fresh — shows the rack exactly
      // as the last-known pin_mask says (all 10 standing by default, i.e.
      // pinMaskRef.current === -1) and parks the ball at the foul line
      // (BALL_LINE/BALL_HEIGHT are the same constants the real physics uses
      // for a freshly-reset ball, so this matches what the thrower
      // themselves sees at the very start of a turn).
      const applyIdleState = () => {
        ballMesh.visible = true;
        ballMesh.position.set(0, BALL_HEIGHT, BALL_LINE);
        ballMesh.quaternion.identity();
        const mask = pinMaskRef.current;
        for (let i = 0; i < 10; i++) {
          const standing = mask === -1 || (mask & (1 << i)) !== 0;
          pinMeshes[i].visible = standing;
          if (standing) {
            const pos = PIN_POSITIONS[i];
            pinMeshes[i].position.set(pos[0], pos[1], pos[2]);
            pinMeshes[i].quaternion.identity();
          }
        }
      };
      applyIdleState();

      let raf;
      let wasFresh = false;
      const animate = () => {
        raf = requestAnimationFrame(animate);
        const relay = relayRef.current;
        const fresh = relay.ball && Date.now() - relay.receivedAt < RELAY_STALE_MS;
        if (fresh && !wasFresh) {
          // Relay just went idle→active — a new throw has begun. The relay
          // payload only carries position/rotation (not velocity), so there's
          // no real measured speed to scale the sound by yet at this exact
          // instant; a fixed mid-range value (BALL_VELOCITY_MIN..MAX is
          // 3.0-6.0) is a reasonable stand-in, matching how playCrashSound's
          // own doc comment already treats sound as "a pure nicety."
          playReleaseSound(4.5, soundEnabledRef.current);
        }
        wasFresh = fresh;
        if (fresh) {
          ballMesh.visible = true;
          // Extrapolate the ball's position forward from the last-known
          // velocity anchor instead of snapping straight to the raw relay
          // sample — see relayVelAnchorRef's own comment above for why.
          const anchor = relayVelAnchorRef.current;
          const elapsedS = Math.min(Math.max((Date.now() - anchor.t) / 1000, 0), RELAY_EXTRAPOLATION_CAP_S);
          ballMesh.position.set(
            anchor.x + anchor.vx * elapsedS,
            anchor.y + anchor.vy * elapsedS,
            anchor.z + anchor.vz * elapsedS,
          );
          ballMesh.quaternion.set(relay.ball.qx, relay.ball.qy, relay.ball.qz, relay.ball.qw);
          if (Array.isArray(relay.pins)) {
            for (let i = 0; i < 10 && i < relay.pins.length; i++) {
              const p = relay.pins[i];
              if (!p || p.visible === false) {
                pinMeshes[i].visible = false;
                continue;
              }
              pinMeshes[i].visible = true;
              pinMeshes[i].position.set(p.x, p.y, p.z);
              pinMeshes[i].quaternion.set(p.qx, p.qy, p.qz, p.qw);
            }
          }
        } else {
          applyIdleState();
        }
        renderer.render(scene, camera);
      };
      animate();

      const handleResize = () => {
        const w = activeMount.clientWidth || 1;
        const h = activeMount.clientHeight || 1;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      window.addEventListener('resize', handleResize);

      disposeFn = () => {
        cancelAnimationFrame(raf);
        window.removeEventListener('resize', handleResize);
        renderer.dispose();
        for (const d of wallDisposables) d.dispose();
        if (activeMount.contains(renderer.domElement)) activeMount.removeChild(renderer.domElement);
      };
    }).catch(() => {
      // Best-effort — if even the lightweight visual assets fail to load
      // for a spectator, the "waiting"/scoreboard UI around this scene still
      // works fine; there's nothing more disruptive to fall back to here.
    });

    return () => {
      cancelled = true;
      if (disposeFn) disposeFn();
    };
  }, [isMyTurn, isOver]);

  // Fires once per newly-closed strike/spare — keyed on the CURRENTLY
  // ACTIVE THROWER's own scoresheet (not just the local viewer's), so
  // everyone in the room hears the fanfare whenever anyone gets a
  // strike/spare, not only the person who rolled it. During your own turn
  // this is the exact same object as before (currentPlayer.user_id ===
  // currentUserId), so the thrower's own experience is unchanged — this
  // purely extends who else can hear it.
  useEffect(() => {
    const states = activeThrowerScores?.frame_states;
    if (!Array.isArray(states)) return;
    const prev = prevFrameStatesRef.current;
    if (prev) {
      for (let i = 0; i < states.length; i++) {
        const wasOpen = !prev[i] || prev[i] === 0;
        if (wasOpen && (states[i] === 1 || states[i] === 2)) {
          playStrikeFanfare(soundEnabledRef.current);
          hapticImpact([15, 60, 15, 60, 25]);
          break;
        }
      }
    }
    prevFrameStatesRef.current = states;
  }, [activeThrowerScores]);

  // ── Spectator/non-thrower reactions to broadcast throw results —
  // previously a spectator got zero audio feedback at all for anyone
  // else's throw (only the thrower's own local physics loop played crash
  // sounds/showed the throwLabel banner). Tracks each player's own
  // (frame_number, throw_number, game_over) progress; when it advances for
  // whoever's currently at bat, the exact just-recorded throw result is
  // read straight from their scoresheet's throw_results — the same
  // authoritative number the server already computed — rather than trying
  // to infer "how many pins fell" from noisy relay position/mask deltas.
  //
  // The (frame, throw) pair alone isn't quite enough: AddThrowResult always
  // WRITES to the pre-advance indices then advances them — EXCEPT for the
  // 10th frame's own final bonus throw, where closeFrame's own "already at
  // the last frame" branch sets game_over=true without ever touching
  // FrameNumber/ThrowNumber (see bowling.go's closeFrame). That throw would
  // otherwise be silently missed since neither index moves — caught here by
  // also treating a false→true `game_over` transition as an advance, still
  // reading the SAME (unmoved) indices, which is exactly where that final
  // throw was written.
  const throwProgressRef = useRef({});
  useEffect(() => {
    if (isMyTurn || isOver) return; // the thrower already gets this from their own physics loop
    const scores = activeThrowerScores;
    const throwerID = currentPlayer?.user_id;
    if (!scores || throwerID == null) return;

    const key = String(throwerID);
    const prevProgress = throwProgressRef.current[key];
    const frameNum = scores.frame_number ?? 0;
    const throwNum = scores.throw_number ?? 0;
    const gameOver = !!scores.game_over;

    if (prevProgress) {
      const framesAdvanced = frameNum > prevProgress.frame || (frameNum === prevProgress.frame && throwNum > prevProgress.throw);
      const gameJustEnded = gameOver && !prevProgress.gameOver;
      if (framesAdvanced || gameJustEnded) {
        const raw = scores.throw_results?.[prevProgress.frame]?.[prevProgress.throw];
        if (typeof raw === 'number') {
          playCrashSound(raw, soundEnabledRef.current);
          setThrowLabel(raw === 10 ? 'STRIKE!' : raw === 0 ? 'GUTTER' : `${raw} PIN${raw === 1 ? '' : 'S'}!`);
          if (throwLabelTimerRef.current) clearTimeout(throwLabelTimerRef.current);
          throwLabelTimerRef.current = setTimeout(() => setThrowLabel(null), 2200);
        }
      }
    }
    throwProgressRef.current[key] = { frame: frameNum, throw: throwNum, gameOver };
  }, [isMyTurn, isOver, activeThrowerScores, currentPlayer?.user_id]);

  const handlePointerDown = useCallback(
    (e) => {
      const physics = physicsRef.current;
      if (!physics || physics.simulationActive) return;
      const ray = updateTouchRay(e.clientX, e.clientY);
      if (!ray) return;
      const input = inputRef.current;
      input.pickingBall = false;
      input.positioningBall = false;
      input.rollingBall = false;
      if (!intersectTouchPlane(ray, input.dragPoint)) return;

      const ballX = physics.releasePosition;
      const dx = input.dragPoint.x - ballX;
      const dz = input.dragPoint.z - BALL_LINE;
      const grabRadius = BALL_RADIUS * 3;
      if (dx * dx + dz * dz < grabRadius * grabRadius) {
        input.pickOffset = input.dragPoint.x - ballX;
        input.pickPoint.copy(input.dragPoint);
        input.pickingBall = true;
        input.pickX = e.clientX;
        input.pickY = e.clientY;
        input.pickTime = e.timeStamp;
      }
    },
    [updateTouchRay, intersectTouchPlane],
  );

  const handlePointerMove = useCallback(
    (e) => {
      const physics = physicsRef.current;
      if (!physics || physics.simulationActive) return;
      const ray = updateTouchRay(e.clientX, e.clientY);
      if (!ray) return;
      const input = inputRef.current;
      if (!intersectTouchPlane(ray, input.dragPoint)) return;

      if (input.pickingBall) {
        const distX = e.clientX - input.pickX;
        const distY = e.clientY - input.pickY;
        if (distX * distX + distY * distY > GRAB_THRESHOLD_PX * GRAB_THRESHOLD_PX) {
          const rollRatio = Math.tan(BALL_ANGLE_MAX);
          if ((input.pickPoint.z - input.dragPoint.z) * rollRatio > Math.abs(input.pickPoint.x - input.dragPoint.x)) {
            input.rollingBall = true;
          } else {
            input.positioningBall = true;
          }
          input.pickingBall = false;
        }
      }

      if (input.positioningBall) {
        physics.positionBall(input.dragPoint.x - input.pickOffset);
      }
    },
    [updateTouchRay, intersectTouchPlane],
  );

  const handlePointerUp = useCallback((e) => {
    const physics = physicsRef.current;
    const input = inputRef.current;
    if (physics && !physics.simulationActive && input.rollingBall) {
      const rv = new THREE.Vector3().copy(input.dragPoint).sub(input.pickPoint);
      const dtMs = e.timeStamp - input.pickTime;
      const velocity = dtMs > 0 ? rv.length() / (0.001 * dtMs) : 6.0;
      const angle = Math.atan2(-rv.x, -rv.z);
      physics.releaseBall(velocity, angle);
      playReleaseSound(velocity, soundEnabledRef.current);
      hapticImpact(Math.round(Math.min(20, 8 + velocity)));
    }
    input.pickingBall = false;
    input.positioningBall = false;
    input.rollingBall = false;
  }, []);

  const handleForfeit = () => {
    if (winner || isOver) {
      onClose();
      return;
    }
    (onEndGame || onClose)();
  };

  const currentFrameForDisplay = Math.min((gs.scores?.[String(currentPlayer?.user_id)]?.frame_number ?? 0) + 1, 10);

  return (
    <>
      {isMyTurn && !isOver && (
        <ControlsTutorialOverlay
          gameType="bowling"
          steps={[
            { icon: 'swipe-lr', text: 'Drag left/right to line up your shot along the lane.' },
            { icon: 'swipe-up', text: 'Then flick upward toward the pins to release the ball — a faster flick throws harder.' },
          ]}
        />
      )}
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <div
          className="relative bg-gray-900 rounded-2xl shadow-2xl w-full max-w-4xl mx-4 overflow-hidden flex flex-col"
          style={{ maxHeight: '94vh' }}
        >
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 shrink-0">
            <div>
              <h2 className="text-white text-xl font-bold">Bowling 🎳</h2>
              {!isOver && <p className="text-gray-400 text-sm">Frame {currentFrameForDisplay} of 10</p>}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSoundEnabled((v) => !v)}
                className="text-gray-400 hover:text-white"
                title={soundEnabled ? 'Mute sounds' : 'Unmute sounds'}
              >
                {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
              </button>
              <GameRulesButton gameType="bowling" />
              {!isOver && (
                <button onClick={handleForfeit} className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium">
                  Forfeit
                </button>
              )}
              <button onClick={handleForfeit} className="text-gray-400 hover:text-white" title={winner || isOver ? 'Close' : 'Forfeit'}>
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          <Scoreboard players={players} scoresMap={scoresMap} currentPlayerId={currentPlayer?.user_id} />

          {!isOver && (
            <div className="text-center py-1.5 shrink-0">
              <p className={`text-sm font-medium ${isMyTurn ? 'text-green-400' : 'text-gray-400'}`}>
                {isMyTurn ? 'Your turn — drag left/right to aim, flick toward the pins to bowl' : `${currentPlayer?.username || 'Opponent'}'s turn`}
              </p>
            </div>
          )}

          <div className="relative flex-1 min-h-[320px]">
            {throwLabel && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 px-4 py-1.5 rounded-full bg-black/70 text-yellow-400 font-bold text-base pointer-events-none">
                {throwLabel}
              </div>
            )}
            {/* The 3D mount is now always present — driven by real local
                physics on the active thrower's own device (see the
                scene-build effect above), or by the passive broadcast scene
                (see the effect right after it) for every other room member.
                Previously, anyone who wasn't the current thrower saw nothing
                but a static "X is bowling… (N pins standing)" placeholder —
                no lane, no live pins, no ball — the whole 3D scene was
                gated behind isMyTurn. */}
            {!isOver && <div ref={mountRef} className="absolute inset-0" />}
            {isMyTurn && !isOver && (
              <>
                {engineReady && (
                  <div
                    className="absolute inset-0"
                    style={{ touchAction: 'none', cursor: 'grab' }}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerLeave={handlePointerUp}
                  />
                )}
                {!engineReady && !loadError && (
                  <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">Loading lane…</div>
                )}
                {loadError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-red-400 text-sm px-6 text-center">
                    <span>{loadError}</span>
                    <span className="text-gray-500 text-xs">Check your connection and try again.</span>
                    <button
                      onClick={handleRetryLoad}
                      className="mt-2 px-4 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium"
                    >
                      Retry
                    </button>
                  </div>
                )}
              </>
            )}
            {isOver && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-gray-400">
                <span className="text-5xl">🎳</span>
              </div>
            )}
          </div>

          {!isMyTurn && !isOver && isPlayer && (
            <div className="px-5 pb-4 text-center text-gray-500 text-xs shrink-0">Waiting for your turn…</div>
          )}
        </div>
      </div>

      {isOver && (
        <GameWinnerBanner
          winner={winner}
          players={players}
          gameType="bowling"
          gameStats={{ lines: players.map((p) => ({ label: p.username, value: `${scoresMap[String(p.user_id)]?.score ?? 0} pts` })) }}
          isForfeit={gameState?.status === 'forfeited'}
          onClose={onClose}
          onPostResult={onPostResult}
          secondaryAction={(gameState?.host_id ?? players?.[0]?.user_id) === currentUserId && onPlayAgain ? { label: 'Play Again 🔄', onClick: onPlayAgain } : undefined}
        />
      )}
    </>
  );
}
