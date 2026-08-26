// src/components/Games/ArcheryGame.jsx
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { X } from 'lucide-react';
import GameWinnerBanner from './GameWinnerBanner';
import GameRulesButton from './GameRulesButton';

// Mirrors backend archery.go's archeryScoreAt/archeryWindStrength exactly —
// a real World Archery 10-ring target face (10 concentric bands, uniform
// 1/10th-radius width each), so the visual board matches what the server
// actually scores against.
const ROUNDS = 3;
const ARROWS_PER_TURN = 3;
const WIND_STRENGTH = 0.22;

const CAMERA_FOV_DEG = 45;
const CAMERA_DISTANCE = 6;
const TARGET_RADIUS = 1.9;
const RING_CONTENT_FRACTION = 0.9; // see DartsGame.jsx's own comment on THREE.CircleGeometry clipping — same fix applied here proactively

// Real World Archery ring colors, indexed by ring number (1=outermost,
// 10=center bullseye) minus one.
const RING_COLORS = [
  '#f5f0e6', '#f5f0e6', // white — rings 1-2 (outermost, worth 1-2 points)
  '#1a1a1a', '#1a1a1a', // black — rings 3-4
  '#1d5fd6', '#1d5fd6', // blue — rings 5-6
  '#d6362a', '#d6362a', // red — rings 7-8
  '#e8b923', '#e8b923', // gold — rings 9-10 (center, worth 9-10 points)
];

function scoreAt(x, y) {
  const r = Math.hypot(x, y);
  if (r > 1.0) return { score: 0, label: 'MISS' };
  let ring = Math.ceil(r * 10);
  if (ring < 1) ring = 1;
  if (ring > 10) ring = 10;
  return { score: 11 - ring, label: `${11 - ring}` };
}

function boardPixelRadius(viewportHeightPx) {
  const fovRad = (CAMERA_FOV_DEG * Math.PI) / 180;
  const worldVisibleHeight = 2 * CAMERA_DISTANCE * Math.tan(fovRad / 2);
  const pixelsPerWorldUnit = viewportHeightPx / worldVisibleHeight;
  return TARGET_RADIUS * pixelsPerWorldUnit;
}

// Procedurally draws the real 10-ring World Archery target face.
function drawTargetTexture(size = 1024) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size / 2, cy = size / 2;
  const R = size / 2;
  const boardR = R * RING_CONTENT_FRACTION;

  // Draw from the outermost ring inward so each fillCircle naturally
  // overpaints the previous, larger one.
  for (let ring = 1; ring <= 10; ring++) {
    const outerFrac = (11 - ring) / 10; // ring 1 -> outerFrac=1.0 (outermost), ring 10 -> outerFrac=0.1
    ctx.beginPath();
    ctx.arc(cx, cy, boardR * outerFrac, 0, Math.PI * 2);
    ctx.fillStyle = RING_COLORS[ring - 1];
    ctx.fill();
  }
  // Ring separator lines
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = size * 0.0015;
  for (let ring = 1; ring <= 10; ring++) {
    const outerFrac = (11 - ring) / 10;
    ctx.beginPath();
    ctx.arc(cx, cy, boardR * outerFrac, 0, Math.PI * 2);
    ctx.stroke();
  }

  return canvas;
}

function WindIndicator({ wind }) {
  const strength = Math.abs(wind);
  const arrowLen = 20 + strength * 40;
  const pointingRight = wind >= 0;
  return (
    <div className="flex items-center gap-2 justify-center">
      <span className="text-xs text-gray-400">Wind:</span>
      <div className="relative w-24 h-5 flex items-center justify-center">
        <svg width="100" height="20" viewBox="0 0 100 20">
          <line
            x1={pointingRight ? 50 - arrowLen / 2 : 50 + arrowLen / 2}
            y1="10"
            x2={pointingRight ? 50 + arrowLen / 2 : 50 - arrowLen / 2}
            y2="10"
            stroke={strength < 0.15 ? '#6b7280' : '#38bdf8'}
            strokeWidth="3"
          />
          <polygon
            points={
              pointingRight
                ? `${50 + arrowLen / 2},10 ${50 + arrowLen / 2 - 8},5 ${50 + arrowLen / 2 - 8},15`
                : `${50 - arrowLen / 2},10 ${50 - arrowLen / 2 + 8},5 ${50 - arrowLen / 2 + 8},15`
            }
            fill={strength < 0.15 ? '#6b7280' : '#38bdf8'}
          />
        </svg>
      </div>
      <span className="text-xs text-gray-400">{strength < 0.15 ? 'calm' : strength < 0.5 ? 'light' : 'strong'}</span>
    </div>
  );
}

export default function ArcheryGame({ gameState, players = [], currentUserId, onMove, onClose, onEndGame, onPostResult }) {
  const mountRef = useRef(null);
  const arrowGroupRef = useRef(null);
  const arrowAssetsRef = useRef(null);
  const flyingArrowRef = useRef(null);

  const gs = gameState?.game_state || {};
  // gs.scores is a fresh object reference on any render where it's absent
  // (`|| {}` allocating a new literal each time) — memoized here so the
  // sortedPlayers useMemo below doesn't recompute on every render
  // regardless of whether the underlying data actually changed.
  const scores = useMemo(() => gs.scores || {}, [gs.scores]);
  const currentRound = gs.current_round ?? 1;
  const arrowsThisTurn = gs.arrows_this_turn ?? 0;
  const wind = gs.wind ?? 0;
  const lastShot = gs.last_shot;
  const currentShots = useMemo(() => (Array.isArray(gs.current_shots) ? gs.current_shots : []), [gs.current_shots]);

  const currentTurn = gameState?.current_turn ?? 0;
  const currentPlayer = players[currentTurn];
  const isMyTurn = currentPlayer?.user_id === currentUserId;
  const isPlayer = players.some((p) => p.user_id === currentUserId);
  const winner = gameState?.winner_id ? players.find((p) => p.user_id === gameState.winner_id) : null;
  const isOver = ['finished', 'forfeited', 'completed'].includes(gameState?.status);

  const [aim, setAim] = useState({ x: 0, y: 0 });
  const [charging, setCharging] = useState(false);
  const [displayPower, setDisplayPower] = useState(0);
  const chargeStartRef = useRef(0);

  // ── Three.js scene setup (once) ──────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d1b0f);

    const width = mount.clientWidth || 1, height = mount.clientHeight || 1;
    const camera = new THREE.PerspectiveCamera(CAMERA_FOV_DEG, width / height, 0.1, 100);
    camera.position.set(0, 0, CAMERA_DISTANCE);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    mount.appendChild(renderer.domElement);

    const fieldGeo = new THREE.PlaneGeometry(20, 20);
    const fieldMat = new THREE.MeshStandardMaterial({ color: 0x1c3a1f });
    const field = new THREE.Mesh(fieldGeo, fieldMat);
    field.position.z = -1.5;
    scene.add(field);

    const texCanvas = drawTargetTexture(1024);
    const targetTexture = new THREE.CanvasTexture(texCanvas);
    targetTexture.colorSpace = THREE.SRGBColorSpace;
    const targetGeo = new THREE.CircleGeometry(TARGET_RADIUS, 64);
    const targetMat = new THREE.MeshStandardMaterial({ map: targetTexture });
    const target = new THREE.Mesh(targetGeo, targetMat);
    scene.add(target);

    const arrowGeo = new THREE.CylinderGeometry(0.025, 0.025, 0.5, 6);
    const arrowMat = new THREE.MeshStandardMaterial({ color: 0x8b5a2b });
    arrowAssetsRef.current = { geo: arrowGeo, mat: arrowMat };

    const arrowGroup = new THREE.Group();
    scene.add(arrowGroup);
    arrowGroupRef.current = arrowGroup;

    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const spot = new THREE.SpotLight(0xffffff, 1.4);
    spot.position.set(0, 2, 5);
    spot.target = target;
    scene.add(spot);
    scene.add(spot.target);

    let raf;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const fa = flyingArrowRef.current;
      if (fa) {
        const t = Math.min(1, (performance.now() - fa.startTime) / fa.duration);
        const eased = 1 - Math.pow(1 - t, 3);
        fa.mesh.position.lerpVectors(fa.from, fa.to, eased);
        fa.mesh.position.z += Math.sin(t * Math.PI) * fa.arcHeight;
        if (t >= 1) flyingArrowRef.current = null;
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
      targetTexture.dispose();
      targetGeo.dispose();
      targetMat.dispose();
      fieldGeo.dispose();
      fieldMat.dispose();
      arrowGeo.dispose();
      arrowMat.dispose();
      arrowAssetsRef.current = null;
      flyingArrowRef.current = null;
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []);

  // ── Render already-stuck arrows for the in-progress turn ─────────────
  useEffect(() => {
    const group = arrowGroupRef.current;
    const assets = arrowAssetsRef.current;
    if (!group || !assets) return;
    while (group.children.length) group.remove(group.children[group.children.length - 1]);
    for (const s of currentShots) {
      const mesh = new THREE.Mesh(assets.geo, assets.mat);
      mesh.position.set((s.x ?? 0) * TARGET_RADIUS * RING_CONTENT_FRACTION, (s.y ?? 0) * TARGET_RADIUS * RING_CONTENT_FRACTION, 0.05);
      mesh.rotation.x = Math.PI / 2;
      group.add(mesh);
    }
  }, [currentShots]);

  // ── Animate the most recently confirmed shot flying in ───────────────
  const lastShotKeyRef = useRef(null);
  useEffect(() => {
    if (!lastShot || lastShot.x == null) return;
    const key = `${lastShot.player_id}-${lastShot.x}-${lastShot.y}-${lastShot.score}`;
    if (lastShotKeyRef.current === key) return;
    lastShotKeyRef.current = key;

    const group = arrowGroupRef.current;
    const assets = arrowAssetsRef.current;
    if (!group || !assets) return;

    if (flyingArrowRef.current) {
      group.remove(flyingArrowRef.current.mesh);
      flyingArrowRef.current = null;
    }

    const mesh = new THREE.Mesh(assets.geo, assets.mat);
    mesh.rotation.x = Math.PI / 2;
    const to = new THREE.Vector3(lastShot.x * TARGET_RADIUS * RING_CONTENT_FRACTION, lastShot.y * TARGET_RADIUS * RING_CONTENT_FRACTION, 0.06);
    const from = new THREE.Vector3(0, -1.3, 4.5);
    mesh.position.copy(from);
    group.add(mesh);
    flyingArrowRef.current = { mesh, from, to, startTime: performance.now(), duration: 420, arcHeight: 0.2 };
  }, [lastShot]);

  const previewScore = useMemo(() => scoreAt(aim.x, aim.y), [aim]);

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

  const CHARGE_PERIOD_MS = 900;
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
      onMove({ move_type: 'shoot', aim_x: aim.x, aim_y: aim.y, power: readTrianglePower(elapsed) });
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
              <h2 className="text-white text-xl font-bold">Archery Battle 🏹</h2>
              <p className="text-gray-400 text-sm">Round {Math.min(currentRound, ROUNDS)} of {ROUNDS}</p>
            </div>
            <div className="flex items-center gap-2">
              <GameRulesButton gameType="archery" />
              <button onClick={handleForfeit} className="text-gray-400 hover:text-white" title={winner || isOver ? 'Close' : 'Forfeit'}>
                <X className="w-6 h-6" />
              </button>
            </div>
          </div>

          <div className="flex items-center justify-center gap-3 px-5 py-2.5 flex-wrap shrink-0 border-b border-gray-800">
            {sortedPlayers.map((p) => (
              <div
                key={p.user_id}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${
                  currentPlayer?.user_id === p.user_id ? 'bg-purple-900/40 ring-2 ring-purple-500' : 'bg-gray-800/50'
                }`}
              >
                <span className="text-white text-sm font-medium">{p.username}</span>
                <span className="text-yellow-400 font-bold text-sm">{scores[String(p.user_id)] ?? 0}</span>
              </div>
            ))}
          </div>

          {!isOver && (
            <div className="text-center py-1.5 shrink-0 flex flex-col items-center gap-1">
              <p className={`text-sm font-medium ${isMyTurn ? 'text-green-400' : 'text-gray-400'}`}>
                {isMyTurn ? `Your turn — arrow ${arrowsThisTurn + 1} of ${ARROWS_PER_TURN}` : `${currentPlayer?.username || 'Opponent'}'s turn`}
              </p>
              <WindIndicator wind={wind} />
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
                Aiming: <span className="text-white font-semibold">{previewScore.label === 'MISS' ? 'MISS' : `${previewScore.label} pts`}</span> — remember to compensate for the wind! Hold to charge power, release to shoot
              </p>
              <div className="relative h-5 bg-gray-800 rounded-full overflow-hidden border border-gray-700">
                <div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-yellow-500 to-green-600"
                  style={{ width: `${(charging ? displayPower : 0) * 100}%` }}
                />
                <div className="absolute inset-y-0 right-[2%] w-[2px] bg-white/70" />
              </div>
              <button
                onPointerDown={startCharge}
                onPointerUp={releaseCharge}
                onPointerLeave={() => { if (charging) releaseCharge(); }}
                className="mt-3 w-full py-2.5 rounded-lg bg-green-700 hover:bg-green-600 active:bg-green-800 text-white font-bold text-sm select-none"
              >
                {charging ? 'Release to Shoot!' : 'Hold to Charge'}
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
          gameType="archery"
          gameStats={{ lines: players.map(p => ({ label: p.username, value: `${scores[String(p.user_id)] ?? 0} pts` })) }}
          isForfeit={gameState?.status === 'forfeited'}
          onClose={onClose}
          onPostResult={onPostResult}
        />
      )}
    </>
  );
}
