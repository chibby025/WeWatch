// src/components/Games/BowlingGame.jsx
import { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { X } from 'lucide-react';
import GameWinnerBanner from './GameWinnerBanner';
import GameRulesButton from './GameRulesButton';
import { BowlPhysics, FRAME_ROLL_TIME, BALL_RADIUS, BALL_LINE, BASE_HEIGHT } from './bowlingPhysics';

// Real, GPL-3.0 bowling-alley/ball/pin assets from github.com/iliagrigorevdev/
// bowling, hosted on our own BunnyCDN — see CLAUDE.md's Bowling section for
// the full provenance/verification trail.
const AMMO_URL = 'https://LetsWatchOut.b-cdn.net/games/bowling/ammo.js';
const SCENE_URL = 'https://LetsWatchOut.b-cdn.net/games/bowling/scene.gltf';

const CAMERA_FOV_DEG = 50;
const GRAB_THRESHOLD_PX = 5; // pointer must move at least this far before a "pick" becomes a drag
const BALL_ANGLE_MAX = Math.PI / 12;

// Module-level singleton promises — ammo.js and the glTF model are each
// fetched/parsed exactly once for the whole page's lifetime, not once per
// turn or per component remount.
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
        }, reject);
      };
      script.onerror = () => reject(new Error('Failed to load the physics engine'));
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
            reject(new Error('Bowling scene is missing an expected mesh'));
            return;
          }
          resolve({ trackMesh, ballMesh, pinMesh });
        },
        undefined,
        () => reject(new Error('Failed to load the bowling lane model')),
      );
    });
  }
  return gltfLoadPromise;
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
                <td className="pr-2 py-1 font-medium whitespace-nowrap max-w-[90px] truncate">{p.username}</td>
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

export default function BowlingGame({ gameState, players = [], currentUserId, onMove, onClose, onEndGame, onPostResult }) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null); // { camera, renderer, raycaster }
  const physicsRef = useRef(null);
  const ballMeshRef = useRef(null);
  const pinMeshesRef = useRef(null);
  const reportedThrowRef = useRef(false);
  const lastPinsStandingRef = useRef(null);
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

  const gs = gameState?.game_state || {};
  const scoresMap = gs.scores || {};
  const currentTurn = gameState?.current_turn ?? 0;
  const currentPlayer = players[currentTurn];
  const isMyTurn = currentPlayer?.user_id === currentUserId;
  const isPlayer = players.some((p) => p.user_id === currentUserId);
  const myScores = scoresMap[String(currentUserId)];
  const winner = gameState?.winner_id ? players.find((p) => p.user_id === gameState.winner_id) : null;
  const isOver = ['finished', 'forfeited', 'completed'].includes(gameState?.status);

  const updateTouchRay = useCallback((clientX, clientY) => {
    const s = sceneRef.current;
    if (!s) return null;
    const rect = s.renderer.domElement.getBoundingClientRect();
    touchPointRef.current.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    touchPointRef.current.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    s.raycaster.setFromCamera(touchPointRef.current, s.camera);
    return s.raycaster.ray;
  }, []);

  const intersectTouchPlane = useCallback((ray, out) => {
    if (Math.abs(ray.direction.y) > 1e-5) {
      const t = (BASE_HEIGHT - ray.origin.y) / ray.direction.y;
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
        camera.position.set(0, 1.7, 5.0);
        camera.rotation.x = (-25 / 180) * Math.PI;

        const renderer = new THREE.WebGLRenderer({ antialias: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        activeMount.appendChild(renderer.domElement);

        scene.add(new THREE.AmbientLight(0xffffff, 0.5));
        const dLight = new THREE.DirectionalLight(0xffffff, 0.7);
        dLight.position.set(-0.4, 0.6, 1.0);
        scene.add(dLight);

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

          if (physics.simulationActive && physics.simulationTime > FRAME_ROLL_TIME && !reportedThrowRef.current) {
            reportedThrowRef.current = true;
            const standingMask = physics.detectStandingPins();
            const beatenMask = physics.currentPinsMask & ~standingMask;
            const beatenCount = physics.countPins(beatenMask);
            onMove({ move_type: 'throw', pins_down: beatenCount });
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
  }, [isMyTurn, isOver]);

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
              <GameRulesButton gameType="bowling" />
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
            {isMyTurn && !isOver ? (
              <>
                <div ref={mountRef} className="absolute inset-0" />
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
                  </div>
                )}
              </>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-gray-400">
                <span className="text-5xl">🎳</span>
                {!isOver && (
                  <p className="text-sm">
                    {currentPlayer?.username || 'Opponent'} is bowling…{' '}
                    <span className="text-gray-500 text-xs">
                      ({scoresMap[String(currentPlayer?.user_id)]?.pins_standing ?? 10} pins standing)
                    </span>
                  </p>
                )}
              </div>
            )}
          </div>

          {!isMyTurn && !isOver && isPlayer && (
            <div className="px-5 pb-4 text-center text-gray-500 text-xs shrink-0">Waiting for your turn…</div>
          )}

          {!isOver && (
            <div className="flex justify-end px-5 pb-4 shrink-0">
              <button onClick={handleForfeit} className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium">
                Forfeit
              </button>
            </div>
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
        />
      )}
    </>
  );
}
