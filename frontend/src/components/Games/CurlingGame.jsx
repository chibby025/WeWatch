// src/components/Games/CurlingGame.jsx
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { X } from 'lucide-react';
import GameWinnerBanner from './GameWinnerBanner';
import GameRulesButton from './GameRulesButton';

// Mirrors backend curling.go's curlingRingLabel exactly — real approximate
// curling-house ring boundaries, normalized so the house's own outer edge
// sits at radius 1.0.
const ENDS = 4;
const STONES_PER_END = 4;
const BUTTON_R = 0.08;
const FOUR_FOOT_R = 0.33;
const EIGHT_FOOT_R = 0.67;

const CAMERA_FOV_DEG = 45;
// Pulled back from the original 6 — the flick redesign gives a weak throw a
// real, large approach-lane distance to fall short across (see
// curling.go's curlingLaneApproachLength), and a stone stopping partway
// down that lane needs to still be visible, not just clipped outside the
// old tight, house-only framing.
const CAMERA_DISTANCE = 11;
const HOUSE_RADIUS = 1.9;
const RING_CONTENT_FRACTION = 0.9;
// Mirrors curling.go's own curlingLaneApproachLength exactly — used only for
// drawing the visual lane strip below the house, never for any landing math
// (that's 100% server-authoritative, same trust model as before).
const LANE_APPROACH_LENGTH = 2.6;

function ringLabel(x, y) {
  const r = Math.hypot(x, y);
  if (r <= BUTTON_R) return 'BUTTON';
  if (r <= FOUR_FOOT_R) return '4-FOOT';
  if (r <= EIGHT_FOOT_R) return '8-FOOT';
  if (r <= 1.0) return '12-FOOT';
  return 'OUT';
}

// Procedurally draws a real curling house — concentric rings alternating
// the traditional blue/red/white/blue scheme, viewed from directly above
// (this game's camera looks straight down the sheet at the house, unlike
// Darts'/Archery's face-on target).
function drawHouseTexture(size = 1024) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size / 2, cy = size / 2;
  const R = size / 2;
  const houseR = R * RING_CONTENT_FRACTION;

  // Ice background
  ctx.fillStyle = '#e8f1f5';
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();

  const rings = [
    { r: 1.0, color: '#1d5fd6' },
    { r: EIGHT_FOOT_R, color: '#f5f0e6' },
    { r: FOUR_FOOT_R, color: '#d6362a' },
    { r: BUTTON_R, color: '#f5f0e6' },
  ];
  for (const ring of rings) {
    ctx.beginPath();
    ctx.arc(cx, cy, houseR * ring.r, 0, Math.PI * 2);
    ctx.fillStyle = ring.color;
    ctx.fill();
  }
  // Button center dot
  ctx.beginPath();
  ctx.arc(cx, cy, houseR * 0.02, 0, Math.PI * 2);
  ctx.fillStyle = '#1a1a1a';
  ctx.fill();

  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = size * 0.0012;
  for (const ring of rings) {
    ctx.beginPath();
    ctx.arc(cx, cy, houseR * ring.r, 0, Math.PI * 2);
    ctx.stroke();
  }

  return canvas;
}

const STONE_COLORS = { 0: 0xd6362a, 1: 0xf5d020 };

export default function CurlingGame({ gameState, players = [], currentUserId, onMove, onClose, onEndGame, onPostResult, onPlayAgain }) {
  const mountRef = useRef(null);
  const stoneGroupRef = useRef(null);
  const stoneAssetsRef = useRef(null);
  const slidingStoneRef = useRef(null);

  const gs = gameState?.game_state || {};
  const scores = useMemo(() => gs.scores || {}, [gs.scores]);
  const currentEnd = gs.current_end ?? 1;
  const stonesThisEnd = useMemo(() => gs.stones_this_end || {}, [gs.stones_this_end]);
  const lastShot = gs.last_shot;

  const currentTurn = gameState?.current_turn ?? 0;
  const currentPlayer = players[currentTurn];
  const isMyTurn = currentPlayer?.user_id === currentUserId;
  const isPlayer = players.some((p) => p.user_id === currentUserId);
  const winner = gameState?.winner_id ? players.find((p) => p.user_id === gameState.winner_id) : null;
  const isOver = ['finished', 'forfeited', 'completed'].includes(gameState?.status);

  const myStonesThrown = (stonesThisEnd[String(currentUserId)] || []).length;

  const [aim, setAim] = useState({ x: 0, y: 0 });
  const [charging, setCharging] = useState(false);
  const [displayPower, setDisplayPower] = useState(0);

  // ── Three.js scene setup (once) ──────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xdfeef5);

    const width = mount.clientWidth || 1, height = mount.clientHeight || 1;
    const camera = new THREE.PerspectiveCamera(CAMERA_FOV_DEG, width / height, 0.1, 100);
    camera.position.set(0, 0, CAMERA_DISTANCE);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    mount.appendChild(renderer.domElement);

    const iceGeo = new THREE.PlaneGeometry(20, 20);
    const iceMat = new THREE.MeshStandardMaterial({ color: 0xcfe6ee });
    const ice = new THREE.Mesh(iceGeo, iceMat);
    ice.position.z = -1.5;
    scene.add(ice);

    const texCanvas = drawHouseTexture(1024);
    const houseTexture = new THREE.CanvasTexture(texCanvas);
    houseTexture.colorSpace = THREE.SRGBColorSpace;
    const houseGeo = new THREE.CircleGeometry(HOUSE_RADIUS, 64);
    const houseMat = new THREE.MeshStandardMaterial({ map: houseTexture });
    const house = new THREE.Mesh(houseGeo, houseMat);
    scene.add(house);

    // Approach lane — a real visual cue for the flick redesign: a stone
    // that falls short (or overshoots) now travels far enough to land well
    // outside the house rings above, and this strip is what makes that
    // distance actually legible as "a lane," not just empty background ice.
    // Matches curling.go's curlingLaneApproachLength (same normalized
    // scaling used everywhere else in this file for stone/house placement).
    const laneWorldLength = LANE_APPROACH_LENGTH * HOUSE_RADIUS * RING_CONTENT_FRACTION;
    const laneWidth = 0.55;
    const laneGeo = new THREE.PlaneGeometry(laneWidth, laneWorldLength);
    const laneMat = new THREE.MeshStandardMaterial({ color: 0xc3dde8 });
    const lane = new THREE.Mesh(laneGeo, laneMat);
    lane.position.set(0, -laneWorldLength / 2, -0.02);
    scene.add(lane);

    const laneLineGeo = new THREE.PlaneGeometry(0.02, laneWorldLength);
    const laneLineMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const laneLineL = new THREE.Mesh(laneLineGeo, laneLineMat);
    laneLineL.position.set(-laneWidth / 2, -laneWorldLength / 2, -0.01);
    scene.add(laneLineL);
    const laneLineR = new THREE.Mesh(laneLineGeo, laneLineMat);
    laneLineR.position.set(laneWidth / 2, -laneWorldLength / 2, -0.01);
    scene.add(laneLineR);

    const stoneGeo = new THREE.CylinderGeometry(0.09, 0.11, 0.09, 24);
    const stoneMats = {
      0: new THREE.MeshStandardMaterial({ color: STONE_COLORS[0] }),
      1: new THREE.MeshStandardMaterial({ color: STONE_COLORS[1] }),
    };
    stoneAssetsRef.current = { geo: stoneGeo, mats: stoneMats };

    const stoneGroup = new THREE.Group();
    scene.add(stoneGroup);
    stoneGroupRef.current = stoneGroup;

    scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const spot = new THREE.SpotLight(0xffffff, 1.2);
    spot.position.set(0, 2, 5);
    spot.target = house;
    scene.add(spot);
    scene.add(spot.target);

    let raf;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const ss = slidingStoneRef.current;
      if (ss) {
        const t = Math.min(1, (performance.now() - ss.startTime) / ss.duration);
        const eased = 1 - Math.pow(1 - t, 2);
        ss.mesh.position.lerpVectors(ss.from, ss.to, eased);
        if (t >= 1) slidingStoneRef.current = null;
      }
      renderer.render(scene, camera);
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
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      houseTexture.dispose();
      houseGeo.dispose();
      houseMat.dispose();
      laneGeo.dispose();
      laneMat.dispose();
      laneLineGeo.dispose();
      laneLineMat.dispose();
      iceGeo.dispose();
      iceMat.dispose();
      stoneGeo.dispose();
      stoneMats[0].dispose();
      stoneMats[1].dispose();
      stoneAssetsRef.current = null;
      slidingStoneRef.current = null;
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []);

  // ── Render every stone thrown so far this end (both players' stones are
  // simultaneously visible on a real curling house) ───────────────────
  useEffect(() => {
    const group = stoneGroupRef.current;
    const assets = stoneAssetsRef.current;
    if (!group || !assets) return;
    while (group.children.length) group.remove(group.children[group.children.length - 1]);
    players.forEach((p, idx) => {
      const myStones = stonesThisEnd[String(p.user_id)] || [];
      const mat = assets.mats[idx % 2];
      for (const s of myStones) {
        const mesh = new THREE.Mesh(assets.geo, mat);
        mesh.position.set((s.x ?? 0) * HOUSE_RADIUS * RING_CONTENT_FRACTION, (s.y ?? 0) * HOUSE_RADIUS * RING_CONTENT_FRACTION, 0.05);
        mesh.rotation.x = Math.PI / 2;
        group.add(mesh);
      }
    });
  }, [stonesThisEnd, players]);

  // ── Animate the most recently confirmed stone sliding in ─────────────
  const lastShotKeyRef = useRef(null);
  const [lastShotResultLabel, setLastShotResultLabel] = useState(null);
  const lastShotResultTimerRef = useRef(null);
  useEffect(() => () => { if (lastShotResultTimerRef.current) clearTimeout(lastShotResultTimerRef.current); }, []);
  useEffect(() => {
    if (!lastShot || lastShot.x == null) return;
    const key = `${lastShot.player_id}-${lastShot.x}-${lastShot.y}`;
    if (lastShotKeyRef.current === key) return;
    lastShotKeyRef.current = key;

    // Real, direct feedback for the flick redesign's own core mechanic —
    // players should immediately know WHY a stone landed "OUT" (never
    // reached the house at all vs. flicked clean through it), not just see
    // a stone stop somewhere far away with no explanation.
    let resultText = lastShot.label;
    if (lastShot.label === 'OUT') {
      resultText = lastShot.y > 1.0 ? 'FELL SHORT!' : lastShot.y < -1.0 ? 'OVERSHOT!' : 'OUT';
    }
    setLastShotResultLabel(resultText);
    if (lastShotResultTimerRef.current) clearTimeout(lastShotResultTimerRef.current);
    lastShotResultTimerRef.current = setTimeout(() => setLastShotResultLabel(null), 1800);

    const group = stoneGroupRef.current;
    const assets = stoneAssetsRef.current;
    if (!group || !assets) return;

    if (slidingStoneRef.current) {
      group.remove(slidingStoneRef.current.mesh);
      slidingStoneRef.current = null;
    }

    const shooterIdx = players.findIndex((p) => p.user_id === lastShot.player_id);
    const mat = assets.mats[shooterIdx >= 0 ? shooterIdx % 2 : 0];
    const mesh = new THREE.Mesh(assets.geo, mat);
    mesh.rotation.x = Math.PI / 2;
    const to = new THREE.Vector3(lastShot.x * HOUSE_RADIUS * RING_CONTENT_FRACTION, lastShot.y * HOUSE_RADIUS * RING_CONTENT_FRACTION, 0.06);
    // Starts from just past the far end of the drawn lane strip — with the
    // flick redesign, every stone (including one that falls well short)
    // genuinely travels a meaningful distance up the lane toward the house,
    // so the slide-in animation should traverse that same visible distance
    // rather than a short, fixed hop from the old close-up-only framing.
    const from = new THREE.Vector3(0, -(LANE_APPROACH_LENGTH * HOUSE_RADIUS * RING_CONTENT_FRACTION) - 0.3, 0.06);
    mesh.position.copy(from);
    group.add(mesh);
    slidingStoneRef.current = { mesh, from, to, startTime: performance.now(), duration: 700 };
  }, [lastShot, players]);

  // Mirrors curling.go's curlingLandingFromFlick — the deterministic,
  // pre-wobble half only (the server still applies its own real random
  // wobble; this is purely a live preview cue while the player is pulling
  // back, same "client shows an estimate, server has final authority" trust
  // model already used throughout this game).
  const previewLanding = useMemo(() => ({
    x: aim.x,
    y: (1 - (charging ? displayPower : 0)) * LANE_APPROACH_LENGTH,
  }), [aim.x, charging, displayPower]);
  const previewLabel = useMemo(() => ringLabel(previewLanding.x, previewLanding.y), [previewLanding]);

  // A real flick gesture: press down anywhere on the ice, pull back
  // (downward, away from the house at the top of the frame — a slingshot
  // motion) to build power, drag left/right to steer, release to throw.
  // Replaces the old hold-and-release-at-the-right-instant timing minigame
  // entirely — power is now a direct, continuous function of how far back
  // the player pulls, not a timing skill.
  const FLICK_REFERENCE_FRACTION = 0.4; // fraction of the mount's height that maps to power=1.0 ("ideal") pull-back distance
  const flickStartRef = useRef(null);

  const handleFlickStart = useCallback((clientX, clientY) => {
    if (!isMyTurn || isOver) return;
    const mount = mountRef.current;
    if (!mount) return;
    const rect = mount.getBoundingClientRect();
    flickStartRef.current = { x: clientX, y: clientY, rect };
    setCharging(true);
    setAim((prev) => ({ x: prev.x, y: 0 }));
  }, [isMyTurn, isOver]);

  const handleFlickMove = useCallback((clientX, clientY) => {
    const start = flickStartRef.current;
    if (!start) return;
    const { rect } = start;
    const pullDy = clientY - start.y; // positive = dragged down/back = charging power
    const power = Math.max(0, Math.min(1.5, pullDy / (rect.height * FLICK_REFERENCE_FRACTION)));
    setDisplayPower(power);
    const laneCenterX = rect.left + rect.width / 2;
    let nx = ((clientX - laneCenterX) / (rect.width / 2)) * 1.15;
    if (nx > 1.15) nx = 1.15; else if (nx < -1.15) nx = -1.15;
    setAim({ x: nx, y: 0 });
  }, []);

  const handleFlickEnd = useCallback(() => {
    const start = flickStartRef.current;
    if (!start) { setCharging(false); return; }
    flickStartRef.current = null;
    setCharging(false);
    setDisplayPower((finalPower) => {
      if (finalPower > 0.03) { // ignore an accidental tap with no real pull-back
        onMove({ move_type: 'throw', aim_x: aim.x, power: finalPower });
      }
      return 0;
    });
  }, [aim.x, onMove]);

  const handleForfeit = () => {
    if (winner || isOver) { onClose(); return; }
    (onEndGame || onClose)();
  };

  const sortedPlayers = useMemo(
    () => [...players].sort((a, b) => (scores[String(b.user_id)] ?? 0) - (scores[String(a.user_id)] ?? 0)),
    [players, scores],
  );

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <div className="relative bg-gray-900 rounded-2xl shadow-2xl w-full max-w-3xl mx-4 overflow-hidden flex flex-col" style={{ maxHeight: '92vh' }}>
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 shrink-0">
            <div>
              <h2 className="text-white text-xl font-bold">Curling 🥌</h2>
              <p className="text-gray-400 text-sm">End {Math.min(currentEnd, ENDS)} of {ENDS}</p>
            </div>
            <div className="flex items-center gap-2">
              <GameRulesButton gameType="curling" />
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

          <div className="flex items-center justify-center gap-3 px-5 py-2.5 flex-wrap shrink-0 border-b border-gray-800">
            {sortedPlayers.map((p) => {
              const idx = players.findIndex((pp) => pp.user_id === p.user_id);
              return (
                <div
                  key={p.user_id}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
                    currentPlayer?.user_id === p.user_id ? 'bg-purple-900/40 ring-2 ring-purple-500' : 'bg-gray-800/50'
                  }`}
                >
                  <span
                    className="w-3 h-3 rounded-full inline-block"
                    style={{ background: idx % 2 === 0 ? '#d6362a' : '#f5d020' }}
                  />
                  <span className="text-white text-sm font-medium">{p.username}</span>
                  <span className="text-yellow-400 font-bold text-sm">{scores[String(p.user_id)] ?? 0}</span>
                </div>
              );
            })}
          </div>

          {!isOver && (
            <div className="text-center py-1.5 shrink-0">
              <p className={`text-sm font-medium ${isMyTurn ? 'text-green-400' : 'text-gray-400'}`}>
                {isMyTurn
                  ? `Your turn — stone ${myStonesThrown + 1} of ${STONES_PER_END} this end`
                  : `${currentPlayer?.username || 'Opponent'}'s turn`}
              </p>
            </div>
          )}

          <div className="relative flex-1 min-h-[320px]">
            <div ref={mountRef} className="absolute inset-0" />
            {lastShotResultLabel && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/70 text-yellow-400 font-bold text-sm pointer-events-none">
                {lastShotResultLabel}
              </div>
            )}
            {!isOver && isMyTurn && (
              // A real flick gesture, directly on the ice: press down, pull
              // back (down/away from the house) to charge power, drag
              // left/right to steer, release to throw — replaces the old
              // separate "hold this button" charge meter entirely.
              <div
                className="absolute inset-0"
                style={{ touchAction: 'none', cursor: charging ? 'grabbing' : 'grab' }}
                onPointerDown={(e) => handleFlickStart(e.clientX, e.clientY)}
                onPointerMove={(e) => handleFlickMove(e.clientX, e.clientY)}
                onPointerUp={handleFlickEnd}
                onPointerLeave={() => { if (charging) handleFlickEnd(); }}
              />
            )}
          </div>

          {isMyTurn && !isOver && (
            <div className="px-5 pb-4 pt-2 shrink-0">
              <p className="text-center text-xs text-gray-400 mb-1.5">
                {charging ? (
                  <>Aiming: <span className="text-white font-semibold">{previewLabel}</span> — release to flick!</>
                ) : (
                  'Press and pull back on the ice to flick — too weak falls short, too hard overshoots'
                )}
              </p>
              <div className="relative h-5 bg-gray-800 rounded-full overflow-hidden border border-gray-700">
                <div
                  className={`absolute inset-y-0 left-0 bg-gradient-to-r ${
                    displayPower > 1 ? 'from-orange-400 to-red-600' : 'from-blue-400 to-blue-700'
                  }`}
                  style={{ width: `${Math.min(100, (charging ? displayPower : 0) * (100 / 1.3))}%` }}
                />
                <div className="absolute inset-y-0 w-[2px] bg-white/70" style={{ left: `${100 / 1.3}%` }} />
              </div>
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
          gameType="curling"
          gameStats={{ lines: players.map(p => ({ label: p.username, value: `${scores[String(p.user_id)] ?? 0} pts` })) }}
          isForfeit={gameState?.status === 'forfeited'}
          onClose={onClose}
          onPostResult={onPostResult}
          secondaryAction={(gameState?.host_id ?? players?.[0]?.user_id) === currentUserId && onPlayAgain ? { label: 'Play Again 🔄', onClick: onPlayAgain } : undefined}
        />
      )}
    </>
  );
}
