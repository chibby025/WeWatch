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
const CAMERA_DISTANCE = 6;
const HOUSE_RADIUS = 1.9;
const RING_CONTENT_FRACTION = 0.9;

function ringLabel(x, y) {
  const r = Math.hypot(x, y);
  if (r <= BUTTON_R) return 'BUTTON';
  if (r <= FOUR_FOOT_R) return '4-FOOT';
  if (r <= EIGHT_FOOT_R) return '8-FOOT';
  if (r <= 1.0) return '12-FOOT';
  return 'OUT';
}

function boardPixelRadius(viewportHeightPx) {
  const fovRad = (CAMERA_FOV_DEG * Math.PI) / 180;
  const worldVisibleHeight = 2 * CAMERA_DISTANCE * Math.tan(fovRad / 2);
  const pixelsPerWorldUnit = viewportHeightPx / worldVisibleHeight;
  return HOUSE_RADIUS * pixelsPerWorldUnit;
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

export default function CurlingGame({ gameState, players = [], currentUserId, onMove, onClose, onEndGame, onPostResult }) {
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
  const chargeStartRef = useRef(0);

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
  useEffect(() => {
    if (!lastShot || lastShot.x == null) return;
    const key = `${lastShot.player_id}-${lastShot.x}-${lastShot.y}`;
    if (lastShotKeyRef.current === key) return;
    lastShotKeyRef.current = key;

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
    const from = new THREE.Vector3(0, -2.3, 0.06);
    mesh.position.copy(from);
    group.add(mesh);
    slidingStoneRef.current = { mesh, from, to, startTime: performance.now(), duration: 700 };
  }, [lastShot, players]);

  const previewLabel = useMemo(() => ringLabel(aim.x, aim.y), [aim]);

  const handleAimDrag = useCallback((clientX, clientY) => {
    const mount = mountRef.current;
    if (!mount) return;
    const rect = mount.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const radiusPx = boardPixelRadius(rect.height) * RING_CONTENT_FRACTION;
    let nx = (clientX - cx) / radiusPx;
    let ny = -(clientY - cy) / radiusPx;
    const r = Math.hypot(nx, ny);
    if (r > 1.15) { nx = (nx / r) * 1.15; ny = (ny / r) * 1.15; }
    setAim({ x: nx, y: ny });
  }, []);

  const CHARGE_PERIOD_MS = 950;
  const readTrianglePower = useCallback((elapsedMs) => {
    const phase = (elapsedMs % CHARGE_PERIOD_MS) / CHARGE_PERIOD_MS;
    return phase < 0.5 ? phase * 2 : (1 - phase) * 2;
  }, []);

  const startCharge = useCallback(() => {
    if (!isMyTurn || isOver) return;
    setCharging(true);
    chargeStartRef.current = performance.now();
  }, [isMyTurn, isOver]);

  const releaseCharge = useCallback(() => {
    setCharging((wasCharging) => {
      if (!wasCharging) return false;
      const elapsed = performance.now() - chargeStartRef.current;
      onMove({ move_type: 'throw', aim_x: aim.x, aim_y: aim.y, power: readTrianglePower(elapsed) });
      return false;
    });
  }, [aim, onMove, readTrianglePower]);

  useEffect(() => {
    if (!charging) { setDisplayPower(0); return undefined; }
    let raf;
    const tick = () => {
      setDisplayPower(readTrianglePower(performance.now() - chargeStartRef.current));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [charging, readTrianglePower]);

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
            {!isOver && isMyTurn && (
              <div
                className="absolute inset-0"
                style={{ touchAction: 'none', cursor: 'crosshair' }}
                onPointerMove={(e) => { if (!charging) handleAimDrag(e.clientX, e.clientY); }}
                onPointerDown={(e) => handleAimDrag(e.clientX, e.clientY)}
              />
            )}
          </div>

          {isMyTurn && !isOver && (
            <div className="px-5 pb-4 pt-2 shrink-0">
              <p className="text-center text-xs text-gray-400 mb-1.5">
                Aiming: <span className="text-white font-semibold">{previewLabel}</span> — the closest stone(s) to the button win the end. Hold to charge weight, release to throw
              </p>
              <div className="relative h-5 bg-gray-800 rounded-full overflow-hidden border border-gray-700">
                <div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-400 to-blue-700"
                  style={{ width: `${(charging ? displayPower : 0) * 100}%` }}
                />
              </div>
              <button
                onPointerDown={startCharge}
                onPointerUp={releaseCharge}
                onPointerLeave={() => { if (charging) releaseCharge(); }}
                className="mt-3 w-full py-2.5 rounded-lg bg-blue-700 hover:bg-blue-600 active:bg-blue-800 text-white font-bold text-sm select-none"
              >
                {charging ? 'Release to Throw!' : 'Hold to Charge Weight'}
              </button>
            </div>
          )}

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
          gameType="curling"
          gameStats={{ lines: players.map(p => ({ label: p.username, value: `${scores[String(p.user_id)] ?? 0} pts` })) }}
          isForfeit={gameState?.status === 'forfeited'}
          onClose={onClose}
          onPostResult={onPostResult}
        />
      )}
    </>
  );
}
