// src/components/Games/RampRushGame.jsx
//
// Ramp Rush — 2-player turn-based car-jump game. Tap rapidly to charge power,
// the car auto-launches once you stop tapping, flies down a straight track,
// and must clear every obstacle to score. Physics/flight simulation runs
// entirely client-side (same trust model as every score-reporting game in
// this package) — only the final {cleared, distance} result is sent to the
// server, which resolves each round and the match.
//
// Obstacles stay simple primitive geometry (agreed scope: "simple obstacles
// for now"). Cars and the finish marker use real CC0 models from Kenney's
// Starter-Kit-Racing (github.com/KenneyNL/Starter-Kit-Racing) — MIT-licensed
// project, CC0-licensed models within it (confirmed on the pack's own product
// page before use). Hosted on this project's own BunnyCDN, same convention as
// every other game's poster/sound assets — games/ramp_rush/models/*.glb.
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as CANNON from 'cannon-es';
import { X as CloseIcon, Trophy } from 'lucide-react';
import GameWinnerBanner from './GameWinnerBanner';
import GameRulesButton from './GameRulesButton';

const LAUNCH_ANGLE_DEG = 42;
const MIN_LAUNCH_SPEED = 16;
const MAX_LAUNCH_SPEED = 40;
const GROUND_Y = 0;
const FALL_THRESHOLD = 1.5; // how far below ground level counts as "fell in a gap"
const LANE_WIDTH = 6;
const CAR_RADIUS = 0.6;

const RAMP_RUSH_ASSET_BASE = 'https://letswatchout.b-cdn.net/games/ramp_rush/models';

const CAR_MODELS = [
  { name: 'Green Truck', url: `${RAMP_RUSH_ASSET_BASE}/vehicle-truck-green.glb`, swatch: '#22c55e' },
  { name: 'Purple Truck', url: `${RAMP_RUSH_ASSET_BASE}/vehicle-truck-purple.glb`, swatch: '#a855f7' },
  { name: 'Red Truck', url: `${RAMP_RUSH_ASSET_BASE}/vehicle-truck-red.glb`, swatch: '#ef4444' },
  { name: 'Yellow Truck', url: `${RAMP_RUSH_ASSET_BASE}/vehicle-truck-yellow.glb`, swatch: '#eab308' },
  { name: 'Motorcycle', url: `${RAMP_RUSH_ASSET_BASE}/vehicle-motorcycle.glb`, swatch: '#94a3b8' },
];
const FINISH_MODEL_URL = `${RAMP_RUSH_ASSET_BASE}/track-finish.glb`;

// ── Track geometry helpers (pure functions, no React/three deps) ──────────
function computeGroundSegments(stage) {
  const gaps = (stage.obstacles || [])
    .filter(o => o.type === 'gap')
    .map(o => [o.position - o.size / 2, o.position + o.size / 2])
    .sort((a, b) => a[0] - b[0]);
  const segments = [];
  let cursor = -10; // solid ground behind the launch point
  for (const [gapStart, gapEnd] of gaps) {
    if (gapStart > cursor) segments.push([cursor, gapStart]);
    cursor = Math.max(cursor, gapEnd);
  }
  segments.push([cursor, stage.length + 20]);
  return segments;
}

function launchVelocityFromCharge(chargePct) {
  const speed = MIN_LAUNCH_SPEED + (Math.max(0, Math.min(100, chargePct)) / 100) * (MAX_LAUNCH_SPEED - MIN_LAUNCH_SPEED);
  const rad = (LAUNCH_ANGLE_DEG * Math.PI) / 180;
  return { vx: speed * Math.cos(rad), vy: speed * Math.sin(rad) };
}

// ── Real Kenney GLB model. Cloned per-instance (drei's useGLTF caches and
//    reuses the same parsed scene graph across every consumer of a given
//    URL — cloning avoids two simultaneous instances fighting over one
//    shared Object3D). Scale/rotation are a first-pass estimate (Kenney's
//    kit models are roughly real-world-scaled, matching this scene's other
//    "1 unit ≈ 1 meter" objects) — not visually verified against the actual
//    obstacle/lane geometry in a live browser; may need live tuning. ───────
function CarMesh({ modelUrl }) {
  const gltf = useGLTF(modelUrl);
  const scene = useMemo(() => gltf.scene.clone(true), [gltf]);
  return <primitive object={scene} scale={1} position={[0, 0, 0]} />;
}

function FinishMesh({ position }) {
  const gltf = useGLTF(FINISH_MODEL_URL);
  const scene = useMemo(() => gltf.scene.clone(true), [gltf]);
  return <primitive object={scene} scale={1} position={position} rotation={[0, Math.PI / 2, 0]} />;
}

// Preload every model up front — avoids a pop-in delay the first time a
// given car/the finish marker is actually rendered.
CAR_MODELS.forEach(c => useGLTF.preload(c.url));
useGLTF.preload(FINISH_MODEL_URL);

function BarrierMesh({ obstacle }) {
  return (
    <mesh position={[obstacle.position, obstacle.size / 2, 0]} castShadow>
      <boxGeometry args={[1, obstacle.size, LANE_WIDTH]} />
      <meshStandardMaterial color="#ef4444" />
    </mesh>
  );
}

function GapMesh({ obstacle }) {
  return (
    <mesh position={[obstacle.position, -2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[obstacle.size, LANE_WIDTH]} />
      <meshStandardMaterial color="#0a0a0a" />
    </mesh>
  );
}

function GroundMesh({ segments }) {
  return (
    <>
      {segments.map(([start, end], i) => {
        const width = end - start;
        return (
          <mesh key={i} position={[start + width / 2, -0.15, 0]} receiveShadow>
            <boxGeometry args={[width, 0.3, LANE_WIDTH]} />
            <meshStandardMaterial color="#4b5563" />
          </mesh>
        );
      })}
    </>
  );
}

// ── The 3D scene for one flight attempt. Remounted (via a `key` on round)
//    for every round so each attempt gets a fresh physics world — no manual
//    cleanup of stale bodies needed. ───────────────────────────────────────
function TrackScene({ stage, carModelUrl, phase, launchCharge, onFlightResolved }) {
  const { camera } = useThree();
  const worldRef = useRef(null);
  const carBodyRef = useRef(null);
  const [carPos, setCarPos] = useState([0, 0.4, 0]);
  const resolvedRef = useRef(false);
  const crashedRef = useRef(false);
  const maxXRef = useRef(0);
  const flightStartRef = useRef(0);

  const groundSegments = useMemo(() => computeGroundSegments(stage), [stage]);

  // Build the physics world + static colliders once.
  useEffect(() => {
    const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
    worldRef.current = world;

    groundSegments.forEach(([start, end]) => {
      const width = end - start;
      const body = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(width / 2, 0.15, LANE_WIDTH / 2)) });
      body.position.set(start + width / 2, -0.15, 0);
      body.obstacleType = 'ground';
      world.addBody(body);
    });

    (stage.obstacles || []).filter(o => o.type === 'barrier').forEach(o => {
      const body = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3(0.5, o.size / 2, LANE_WIDTH / 2)) });
      body.position.set(o.position, o.size / 2, 0);
      body.obstacleType = 'barrier';
      world.addBody(body);
    });

    return () => {
      world.bodies.slice().forEach(b => world.removeBody(b));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  // Spawn the car body the moment launch is triggered.
  useEffect(() => {
    if (phase !== 'flying' || launchCharge == null || !worldRef.current) return;
    resolvedRef.current = false;
    crashedRef.current = false;
    maxXRef.current = 0;
    flightStartRef.current = performance.now();

    const body = new CANNON.Body({ mass: 4, shape: new CANNON.Sphere(CAR_RADIUS) });
    body.position.set(0, 0.4, 0);
    const { vx, vy } = launchVelocityFromCharge(launchCharge);
    body.velocity.set(vx, vy, 0);
    body.linearDamping = 0.01;
    body.addEventListener('collide', (e) => {
      if (e.body?.obstacleType === 'barrier') crashedRef.current = true;
    });
    worldRef.current.addBody(body);
    carBodyRef.current = body;
  }, [phase, launchCharge]);

  useFrame((_, rawDelta) => {
    const world = worldRef.current;
    const body = carBodyRef.current;
    if (!world) return;

    const delta = Math.min(rawDelta, 1 / 30);
    world.step(1 / 60, delta, 3);

    if (phase === 'flying' && body && !resolvedRef.current) {
      const { x, y } = body.position;
      setCarPos([x, y, 0]);
      maxXRef.current = Math.max(maxXRef.current, x);

      if (!crashedRef.current && y < GROUND_Y - FALL_THRESHOLD) {
        crashedRef.current = true;
      }

      const elapsed = (performance.now() - flightStartRef.current) / 1000;
      const settled = x >= stage.length ||
        (elapsed > 0.5 && Math.abs(body.velocity.y) < 0.06 && y <= GROUND_Y + 0.3 && !crashedRef.current) ||
        crashedRef.current ||
        elapsed > 9; // safety timeout

      if (settled) {
        resolvedRef.current = true;
        const distance = Math.min(Math.max(maxXRef.current, 0), stage.length);
        onFlightResolved({ cleared: !crashedRef.current && distance >= stage.length - 0.5, distance });
      }

      camera.position.set(x - 9, y + 5.5, 11);
      camera.lookAt(x + 3, y, 0);
    } else if (phase !== 'flying') {
      // Idle/pre-launch framing of the upcoming course.
      camera.position.set(-9, 5.5, 11);
      camera.lookAt(stage.length * 0.35, 1, 0);
    }
  });

  return (
    <>
      <ambientLight intensity={0.65} />
      <directionalLight position={[10, 15, 8]} intensity={1} castShadow />
      <GroundMesh segments={groundSegments} />
      {(stage.obstacles || []).map((o, i) => o.type === 'barrier'
        ? <BarrierMesh key={i} obstacle={o} />
        : <GapMesh key={i} obstacle={o} />
      )}
      <group position={carPos}>
        <CarMesh modelUrl={carModelUrl} />
      </group>
      <FinishMesh position={[stage.length, 0, 0]} />
    </>
  );
}

export default function RampRushGame({ gameState, players, currentUserId, onMove, onClose, onEndGame, onPostResult }) {
  const gs = gameState?.game_state || {};
  const stages = Array.isArray(gs.stages) ? gs.stages : [];
  const round = gs.round ?? 0;
  const scores = gs.scores || {};
  const format = gs.format || 'best_of_5';
  const roundsToWin = gs.rounds_to_win ?? 3;
  const lastRoundSummary = gs.last_round_summary || null;

  const isOver = ['finished', 'completed', 'forfeited'].includes(gameState?.status || '');
  const currentTurnIdx = gameState?.current_turn ?? 0;
  const currentTurnPlayer = players?.[currentTurnIdx];
  const isMyTurn = !isOver && currentTurnPlayer?.user_id === currentUserId;

  const stageIndex = Math.min(round, Math.max(stages.length - 1, 0));
  const stage = stages[stageIndex] || { name: 'Loading…', length: 200, obstacles: [] };

  // 'car_select' → 'ready' → 'charging' → 'flying' → 'result' (mine) / 'waiting' (theirs)
  const [phase, setPhase] = useState('car_select');
  const [carIdx, setCarIdx] = useState(0);
  const [charge, setCharge] = useState(0);
  const [launchCharge, setLaunchCharge] = useState(null);
  const [myResult, setMyResult] = useState(null);
  const [announcement, setAnnouncement] = useState(null);

  const chargeRef = useRef(0);
  const decayIntervalRef = useRef(null);
  const launchTimeoutRef = useRef(null);
  const lastSummaryKeyRef = useRef(null);
  const hasPickedCarRef = useRef(false);

  const clearChargeTimers = useCallback(() => {
    clearInterval(decayIntervalRef.current);
    clearTimeout(launchTimeoutRef.current);
  }, []);

  useEffect(() => () => clearChargeTimers(), [clearChargeTimers]);

  // Track whose turn it is / reset to the right screen each time control passes.
  useEffect(() => {
    if (isOver) return;
    if (!isMyTurn) {
      clearChargeTimers();
      setPhase('waiting');
      return;
    }
    // My turn: skip car-select after the first pick, otherwise start there.
    setPhase(prev => {
      if (prev === 'flying' || prev === 'result') return prev; // don't yank the phase mid-flight/summary
      return hasPickedCarRef.current ? 'ready' : 'car_select';
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMyTurn, isOver, round]);

  // Round resolved (server broadcast) — show a brief announcement, then reset.
  useEffect(() => {
    if (!lastRoundSummary) return;
    const key = `${lastRoundSummary.round}`;
    if (lastSummaryKeyRef.current === key) return;
    lastSummaryKeyRef.current = key;

    const winnerId = lastRoundSummary.winner_id;
    const winnerPlayer = winnerId ? players.find(p => p.user_id === winnerId) : null;
    setAnnouncement({
      text: winnerPlayer ? `${winnerPlayer.username} wins the round!` : "Draw round — nobody cleared it",
      key: Date.now(),
    });
    setMyResult(null);
    setCharge(0);
    chargeRef.current = 0;
    setLaunchCharge(null);
    const t = setTimeout(() => setAnnouncement(null), 2400);
    return () => clearTimeout(t);
  }, [lastRoundSummary, players]);

  const confirmCar = () => {
    hasPickedCarRef.current = true;
    setPhase('ready');
  };

  const armLaunchTimeout = useCallback(() => {
    clearTimeout(launchTimeoutRef.current);
    launchTimeoutRef.current = setTimeout(() => {
      clearInterval(decayIntervalRef.current);
      setLaunchCharge(chargeRef.current);
      setPhase('flying');
    }, 1300);
  }, []);

  const handleTap = () => {
    if (phase === 'ready') {
      setPhase('charging');
      chargeRef.current = 0;
      setCharge(0);
      decayIntervalRef.current = setInterval(() => {
        chargeRef.current = Math.max(0, chargeRef.current - 2.5);
        setCharge(chargeRef.current);
      }, 100);
    } else if (phase !== 'charging') {
      return;
    }
    chargeRef.current = Math.min(100, chargeRef.current + 9);
    setCharge(chargeRef.current);
    armLaunchTimeout();
  };

  const handleFlightResolved = useCallback((result) => {
    setMyResult(result);
    setPhase('result');
    onMove({ move_type: 'launch', cleared: result.cleared, distance: result.distance });
  }, [onMove]);

  const winner = gameState?.winner_id
    ? (players.find(p => p.user_id === gameState.winner_id) || 'draw')
    : 'draw';
  const gameStats = {
    lines: players.map(p => ({
      label: p.username,
      value: `${scores[String(p.user_id)] ?? 0} round${(scores[String(p.user_id)] ?? 0) === 1 ? '' : 's'}`,
    })),
  };

  const handleForfeit = () => {
    if (onEndGame) onEndGame();
    else onClose();
  };

  return (
    <>
      {isOver && (
        <GameWinnerBanner
          winner={winner === 'draw' ? null : winner}
          players={players}
          gameType="ramp_rush"
          gameStats={gameStats}
          isForfeit={gameState?.status === 'forfeited'}
          onClose={onClose}
          onPostResult={onPostResult}
        />
      )}

      <div className="fixed inset-0 z-50 flex flex-col bg-gradient-to-b from-sky-900 via-gray-900 to-gray-950">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-black/40 border-b border-white/10 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-white font-bold text-lg">🏎️ Ramp Rush</span>
            <span className="text-gray-400 text-xs">
              {format === 'first_to_win' ? 'First to Win' : `Best of ${2 * roundsToWin - 1}`} · Round {round + 1}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <GameRulesButton gameType="ramp_rush" className="text-gray-300 hover:text-white" />
            {!isOver && (
              <button onClick={handleForfeit} className="px-3 py-1 bg-red-700 hover:bg-red-600 text-white text-xs font-semibold rounded-lg transition-colors">
                End Game
              </button>
            )}
            <button onClick={onClose} className="text-gray-300 hover:text-white p-1"><CloseIcon size={18} /></button>
          </div>
        </div>

        {/* Scores row */}
        <div className="flex gap-2 px-4 py-2 bg-black/25 border-b border-white/10 flex-shrink-0">
          {players.map(p => {
            const isTheirTurn = currentTurnPlayer?.user_id === p.user_id;
            return (
              <div key={p.user_id} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs ${isTheirTurn ? 'bg-sky-800/60 ring-1 ring-sky-400' : 'bg-white/5'}`}>
                {isTheirTurn && <Trophy size={12} className="text-sky-300" />}
                <span className="text-gray-200 font-semibold">{p.username}</span>
                <span className="text-yellow-300 font-bold">{scores[String(p.user_id)] ?? 0}</span>
              </div>
            );
          })}
          <span className="ml-auto text-gray-400 text-xs self-center">{stage.name}</span>
        </div>

        {/* 3D scene */}
        <div className="flex-1 relative min-h-0">
          <Canvas shadows camera={{ fov: 55, position: [-9, 5.5, 11] }}>
            <TrackScene
              key={round}
              stage={stage}
              carModelUrl={CAR_MODELS[carIdx].url}
              phase={phase === 'flying' ? 'flying' : 'idle'}
              launchCharge={launchCharge}
              onFlightResolved={handleFlightResolved}
            />
          </Canvas>

          {/* Car select overlay */}
          {phase === 'car_select' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 max-w-xs w-full mx-4">
                <p className="text-white font-bold text-center mb-3">Pick your car</p>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {CAR_MODELS.map((c, i) => (
                    <button
                      key={c.url}
                      onClick={() => setCarIdx(i)}
                      className={`flex flex-col items-center gap-1 p-2 rounded-xl border-2 transition-all ${carIdx === i ? 'border-sky-400 bg-sky-500/10' : 'border-gray-700 hover:border-gray-500'}`}
                    >
                      <span className="w-8 h-8 rounded-full" style={{ background: c.swatch }} />
                      <span className="text-[10px] text-gray-300 text-center leading-tight">{c.name}</span>
                    </button>
                  ))}
                </div>
                <button
                  onClick={confirmCar}
                  className="w-full py-2.5 bg-sky-600 hover:bg-sky-500 text-white font-bold rounded-xl transition-colors"
                >
                  Ready to Launch
                </button>
              </div>
            </div>
          )}

          {/* Waiting-for-opponent overlay */}
          {phase === 'waiting' && !isOver && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 pointer-events-none">
              <p className="text-white text-lg font-semibold bg-black/40 px-5 py-2.5 rounded-xl">
                Waiting for {currentTurnPlayer?.username || 'the other player'} to launch…
              </p>
            </div>
          )}

          {/* Result overlay */}
          {phase === 'result' && myResult && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 pointer-events-none">
              <div className="bg-black/60 px-6 py-4 rounded-2xl text-center">
                <p className="text-4xl mb-1">{myResult.cleared ? '🏁' : '💥'}</p>
                <p className="text-white text-xl font-black">
                  {myResult.cleared ? 'Cleared the course!' : 'Crashed!'}
                </p>
                <p className="text-gray-300 text-sm mt-1">{Math.round(myResult.distance)}m travelled</p>
              </div>
            </div>
          )}

          {/* Round announcement */}
          {announcement && (
            <div key={announcement.key} className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="bg-gradient-to-br from-sky-700 to-indigo-800 px-6 py-4 rounded-2xl shadow-2xl border border-white/20 text-center animate-fade-in">
                <p className="text-white text-lg font-black">{announcement.text}</p>
              </div>
            </div>
          )}

          {/* Charge meter + tap button */}
          {(phase === 'ready' || phase === 'charging') && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-3 w-64">
              <div className="w-full h-4 bg-black/50 rounded-full overflow-hidden border border-white/20">
                <div
                  className="h-full bg-gradient-to-r from-yellow-400 via-orange-500 to-red-600 transition-[width] duration-75"
                  style={{ width: `${charge}%` }}
                />
              </div>
              <button
                onPointerDown={handleTap}
                className="w-40 h-40 rounded-full bg-gradient-to-br from-orange-500 to-red-600 active:scale-95 shadow-2xl text-white font-black text-lg flex items-center justify-center select-none touch-none"
              >
                {phase === 'ready' ? 'TAP TO\nCHARGE' : 'KEEP\nTAPPING!'}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
