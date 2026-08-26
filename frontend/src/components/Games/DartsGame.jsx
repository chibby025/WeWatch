// src/components/Games/DartsGame.jsx
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import * as THREE from 'three';
import { X } from 'lucide-react';
import GameWinnerBanner from './GameWinnerBanner';
import GameRulesButton from './GameRulesButton';

// Standard dartboard layout — mirrors backend darts.go's dartsScoreAt/
// dartsSectorOrder exactly (real proportions: 170mm outer edge, 162/170mm
// double ring, 99/107mm triple ring, 15.9mm outer bull, 6.35mm inner bull),
// so the visual board matches what the server actually scores against.
const SECTOR_ORDER = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
const INNER_BULL_R = 6.35 / 170;
const OUTER_BULL_R = 15.9 / 170;
const TRIPLE_INNER = 99 / 170;
const TRIPLE_OUTER = 107 / 170;
const DOUBLE_INNER = 162 / 170;
const DOUBLE_OUTER = 1.0;
const ROUNDS = 3;
const DARTS_PER_TURN = 3;

const CAMERA_FOV_DEG = 45;
const CAMERA_DISTANCE = 6;
const BOARD_RADIUS = 1.9;

// THREE.CircleGeometry only ever displays the INSCRIBED circle of whatever
// texture is mapped onto it (texture UV (0.5,0.5)=center, corners map to the
// bounding square's corners) — content drawn outside that inscribed circle
// (r > canvas half-size) is silently clipped and never rendered on the mesh
// at all. Confirmed by an actual headless render test: the sector-number
// labels, originally drawn just outside the ring content's own radius,
// landed outside the canvas's own half-size and were invisible on a real
// mesh. Fix: the ring content only fills RING_CONTENT_FRACTION of the
// texture's half-size, leaving a real margin inside the inscribed circle for
// the labels. This same fraction is threaded through the aim-drag pixel↔
// score-unit conversion and dart-landing visual placement below so the
// interactive area, the visible rings, and where a dart actually appears to
// land can never drift out of sync with each other.
const RING_CONTENT_FRACTION = 0.86;

// Board-local (x,y) is normalized so the outer edge is radius 1.0, with y
// pointing UP (toward the top of the board / sector 20) — matches the
// backend's own atan2(x,y) convention exactly. This is only used for a
// local "what would this land as" preview label — the server is always the
// real authority on the actual score.
function scoreAt(x, y) {
  const r = Math.hypot(x, y);
  if (r > DOUBLE_OUTER) return { score: 0, label: 'MISS' };
  if (r <= INNER_BULL_R) return { score: 50, label: 'BULLSEYE' };
  if (r <= OUTER_BULL_R) return { score: 25, label: 'OUTER BULL' };
  let angle = Math.atan2(x, y);
  if (angle < 0) angle += Math.PI * 2;
  const sectorWidth = (Math.PI * 2) / 20;
  const idx = Math.floor((angle + sectorWidth / 2) / sectorWidth) % 20;
  const num = SECTOR_ORDER[idx];
  if (r >= TRIPLE_INNER && r <= TRIPLE_OUTER) return { score: num * 3, label: `TRIPLE ${num}` };
  if (r >= DOUBLE_INNER && r <= DOUBLE_OUTER) return { score: num * 2, label: `DOUBLE ${num}` };
  return { score: num, label: `${num}` };
}

// The on-screen pixel radius the 3D board actually projects to, computed
// from the real camera FOV/distance rather than a guessed fraction of the
// viewport — keeps the invisible 2D aim-drag overlay precisely aligned with
// the visually rendered board regardless of viewport size/aspect ratio.
function boardPixelRadius(viewportHeightPx) {
  const fovRad = (CAMERA_FOV_DEG * Math.PI) / 180;
  const worldVisibleHeight = 2 * CAMERA_DISTANCE * Math.tan(fovRad / 2);
  const pixelsPerWorldUnit = viewportHeightPx / worldVisibleHeight;
  return BOARD_RADIUS * pixelsPerWorldUnit;
}

function ringWedgePath(ctx, cx, cy, rInner, rOuter, startAngle, endAngle) {
  ctx.beginPath();
  ctx.arc(cx, cy, rOuter, startAngle, endAngle, false);
  ctx.arc(cx, cy, rInner, endAngle, startAngle, true);
  ctx.closePath();
}

// Procedurally draws a real dartboard face (20 sectors, alternating
// black/white singles, alternating red/green rings, sector numbers, bull) —
// board-local angle convention matches scoreAt exactly, via the single
// `angleFromTop - PI/2` offset that converts to canvas's own angle
// convention (0 = +x, clockwise as y grows down).
function drawDartboardTexture(size = 1024) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const cx = size / 2, cy = size / 2;
  const R = size / 2; // the inscribed-circle radius — the hard clip boundary
  const boardR = R * RING_CONTENT_FRACTION; // the actual ring content radius

  // Wood-surround background fills the FULL inscribed circle — the label
  // margin between boardR and R sits on top of this, not blank/transparent.
  ctx.fillStyle = '#2b1d12';
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.fill();

  const sectorWidth = (Math.PI * 2) / 20;
  const BLACK = '#141414', WHITE = '#e8e0d0', RED = '#b3122a', GREEN = '#0f6b34';

  for (let i = 0; i < 20; i++) {
    const angleFromTop = i * sectorWidth;
    const canvasCenter = angleFromTop - Math.PI / 2;
    const startAngle = canvasCenter - sectorWidth / 2;
    const endAngle = canvasCenter + sectorWidth / 2;
    const isDark = i % 2 === 0;
    const singleColor = isDark ? BLACK : WHITE;
    const ringColor = isDark ? GREEN : RED;

    ringWedgePath(ctx, cx, cy, boardR * TRIPLE_OUTER, boardR * DOUBLE_INNER, startAngle, endAngle);
    ctx.fillStyle = singleColor; ctx.fill();
    ringWedgePath(ctx, cx, cy, boardR * OUTER_BULL_R, boardR * TRIPLE_INNER, startAngle, endAngle);
    ctx.fillStyle = singleColor; ctx.fill();
    ringWedgePath(ctx, cx, cy, boardR * TRIPLE_INNER, boardR * TRIPLE_OUTER, startAngle, endAngle);
    ctx.fillStyle = ringColor; ctx.fill();
    ringWedgePath(ctx, cx, cy, boardR * DOUBLE_INNER, boardR * DOUBLE_OUTER, startAngle, endAngle);
    ctx.fillStyle = ringColor; ctx.fill();

    // Label sits in the margin between boardR and R — comfortably inside the
    // inscribed circle (R), never past it, unlike the original placement.
    const labelR = (boardR + R) / 2;
    ctx.fillStyle = '#f5f0e6';
    ctx.font = `bold ${Math.round(size * 0.038)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(SECTOR_ORDER[i]), cx + Math.cos(canvasCenter) * labelR, cy + Math.sin(canvasCenter) * labelR);

    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = size * 0.0015;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(startAngle) * boardR * OUTER_BULL_R, cy + Math.sin(startAngle) * boardR * OUTER_BULL_R);
    ctx.lineTo(cx + Math.cos(startAngle) * boardR * DOUBLE_OUTER, cy + Math.sin(startAngle) * boardR * DOUBLE_OUTER);
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(cx, cy, boardR * OUTER_BULL_R, 0, Math.PI * 2);
  ctx.fillStyle = GREEN; ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, boardR * INNER_BULL_R, 0, Math.PI * 2);
  ctx.fillStyle = RED; ctx.fill();

  return canvas;
}

export default function DartsGame({ gameState, players = [], currentUserId, onMove, onClose, onEndGame, onPostResult }) {
  const mountRef = useRef(null);
  const dartGroupRef = useRef(null);
  const dartAssetsRef = useRef(null); // { geo, mat } — shared by every dart mesh, disposed once
  const flyingDartRef = useRef(null);

  const gs = gameState?.game_state || {};
  const scores = gs.scores || {};
  const currentRound = gs.current_round ?? 1;
  const dartsThisTurn = gs.darts_this_turn ?? 0;
  const lastThrow = gs.last_throw;
  const currentThrows = useMemo(() => (Array.isArray(gs.current_throws) ? gs.current_throws : []), [gs.current_throws]);

  const currentTurn = gameState?.current_turn ?? 0;
  const currentPlayer = players[currentTurn];
  const isMyTurn = currentPlayer?.user_id === currentUserId;
  const isPlayer = players.some(p => p.user_id === currentUserId);
  const winner = gameState?.winner_id ? players.find(p => p.user_id === gameState.winner_id) : null;
  const isOver = ['finished', 'forfeited', 'completed'].includes(gameState?.status);

  const [aim, setAim] = useState({ x: 0, y: 0.3 });
  const [charging, setCharging] = useState(false);
  const [displayPower, setDisplayPower] = useState(0);
  const chargeStartRef = useRef(0);

  // ── Three.js scene setup (once) ──────────────────────────────────────
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0f);

    const width = mount.clientWidth || 1, height = mount.clientHeight || 1;
    const camera = new THREE.PerspectiveCamera(CAMERA_FOV_DEG, width / height, 0.1, 100);
    camera.position.set(0, 0, CAMERA_DISTANCE);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    mount.appendChild(renderer.domElement);

    const wallGeo = new THREE.PlaneGeometry(20, 20);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x241a12 });
    const wall = new THREE.Mesh(wallGeo, wallMat);
    wall.position.z = -1.5;
    scene.add(wall);

    const texCanvas = drawDartboardTexture(1024);
    const boardTexture = new THREE.CanvasTexture(texCanvas);
    boardTexture.colorSpace = THREE.SRGBColorSpace;
    const boardGeo = new THREE.CircleGeometry(BOARD_RADIUS, 64);
    const boardMat = new THREE.MeshStandardMaterial({ map: boardTexture });
    const board = new THREE.Mesh(boardGeo, boardMat);
    scene.add(board);

    const dartGeo = new THREE.ConeGeometry(0.045, 0.26, 8);
    const dartMat = new THREE.MeshStandardMaterial({ color: 0xf2c14e });
    dartAssetsRef.current = { geo: dartGeo, mat: dartMat };

    const dartGroup = new THREE.Group();
    scene.add(dartGroup);
    dartGroupRef.current = dartGroup;

    scene.add(new THREE.AmbientLight(0xffffff, 0.7));
    const spot = new THREE.SpotLight(0xffffff, 1.5);
    spot.position.set(0, 2, 5);
    spot.target = board;
    scene.add(spot);
    scene.add(spot.target);

    let raf;
    const animate = () => {
      raf = requestAnimationFrame(animate);
      const fd = flyingDartRef.current;
      if (fd) {
        const t = Math.min(1, (performance.now() - fd.startTime) / fd.duration);
        const eased = 1 - Math.pow(1 - t, 3);
        fd.mesh.position.lerpVectors(fd.from, fd.to, eased);
        fd.mesh.position.z += Math.sin(t * Math.PI) * fd.arcHeight;
        if (t >= 1) {
          flyingDartRef.current = null;
        }
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
      boardTexture.dispose();
      boardGeo.dispose();
      boardMat.dispose();
      wallGeo.dispose();
      wallMat.dispose();
      dartGeo.dispose();
      dartMat.dispose();
      dartAssetsRef.current = null;
      flyingDartRef.current = null;
      if (mount.contains(renderer.domElement)) mount.removeChild(renderer.domElement);
    };
  }, []);

  // ── Render already-stuck darts for the in-progress turn (darts 1-2) ──
  useEffect(() => {
    const group = dartGroupRef.current;
    const assets = dartAssetsRef.current;
    if (!group || !assets) return;
    while (group.children.length) group.remove(group.children[group.children.length - 1]);
    for (const t of currentThrows) {
      const mesh = new THREE.Mesh(assets.geo, assets.mat);
      mesh.position.set((t.x ?? 0) * BOARD_RADIUS * RING_CONTENT_FRACTION, (t.y ?? 0) * BOARD_RADIUS * RING_CONTENT_FRACTION, 0.05);
      mesh.rotation.x = Math.PI / 2;
      group.add(mesh);
    }
  }, [currentThrows]);

  // ── Animate the most recently confirmed throw flying in from off-screen ─
  const lastThrowKeyRef = useRef(null);
  useEffect(() => {
    if (!lastThrow || !lastThrow.label) return;
    const key = `${lastThrow.player_id}-${lastThrow.x}-${lastThrow.y}-${lastThrow.score}`;
    if (lastThrowKeyRef.current === key) return;
    lastThrowKeyRef.current = key;

    const group = dartGroupRef.current;
    const assets = dartAssetsRef.current;
    if (!group || !assets) return;

    // A fast double-throw could in principle arrive before the previous
    // flight animation finished — clean it up rather than leak two flying
    // meshes into the group.
    if (flyingDartRef.current) {
      group.remove(flyingDartRef.current.mesh);
      flyingDartRef.current = null;
    }

    const mesh = new THREE.Mesh(assets.geo, assets.mat);
    mesh.rotation.x = Math.PI / 2;
    const to = new THREE.Vector3(lastThrow.x * BOARD_RADIUS * RING_CONTENT_FRACTION, lastThrow.y * BOARD_RADIUS * RING_CONTENT_FRACTION, 0.06);
    const from = new THREE.Vector3(0, -1.1, 4.2);
    mesh.position.copy(from);
    group.add(mesh);
    flyingDartRef.current = { mesh, from, to, startTime: performance.now(), duration: 500, arcHeight: 0.35 };
  }, [lastThrow]);

  // ── Aim + power interaction ─────────────────────────────────────────
  const previewScore = useMemo(() => scoreAt(aim.x, aim.y), [aim]);

  const handleAimDrag = useCallback((clientX, clientY) => {
    const mount = mountRef.current;
    if (!mount) return;
    const rect = mount.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    // Normalize against the RING CONTENT's own on-screen radius (not the
    // full mesh radius, which includes the label margin) so a drag reaching
    // the visible double-ring edge maps to exactly score-unit radius 1.0.
    const radiusPx = boardPixelRadius(rect.height) * RING_CONTENT_FRACTION;
    let nx = (clientX - cx) / radiusPx;
    let ny = -(clientY - cy) / radiusPx; // screen Y grows down; board-local Y must grow up
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
      onMove({ move_type: 'throw', aim_x: aim.x, aim_y: aim.y, power: readTrianglePower(elapsed) });
      return false;
    });
  }, [aim, onMove, readTrianglePower]);

  useEffect(() => {
    if (!charging) { setDisplayPower(0); return; }
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
              <h2 className="text-white text-xl font-bold">Darts 🎯</h2>
              <p className="text-gray-400 text-sm">Round {Math.min(currentRound, ROUNDS)} of {ROUNDS}</p>
            </div>
            <div className="flex items-center gap-2">
              <GameRulesButton gameType="darts" />
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
            <div className="text-center py-1.5 shrink-0">
              <p className={`text-sm font-medium ${isMyTurn ? 'text-green-400' : 'text-gray-400'}`}>
                {isMyTurn ? `Your turn — dart ${dartsThisTurn + 1} of ${DARTS_PER_TURN}` : `${currentPlayer?.username || 'Opponent'}'s turn`}
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
                Aiming: <span className="text-white font-semibold">{previewScore.label}</span> — hold to charge power, release to throw
              </p>
              <div className="relative h-5 bg-gray-800 rounded-full overflow-hidden border border-gray-700">
                <div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-yellow-500 to-red-500"
                  style={{ width: `${(charging ? displayPower : 0) * 100}%` }}
                />
                <div className="absolute inset-y-0 right-[8%] w-[2px] bg-white/70" />
              </div>
              <button
                onPointerDown={startCharge}
                onPointerUp={releaseCharge}
                onPointerLeave={() => { if (charging) releaseCharge(); }}
                className="mt-3 w-full py-2.5 rounded-lg bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-bold text-sm select-none"
              >
                {charging ? 'Release to Throw!' : 'Hold to Charge'}
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
          gameType="darts"
          gameStats={{ lines: players.map(p => ({ label: p.username, value: `${scores[String(p.user_id)] ?? 0} pts` })) }}
          isForfeit={gameState?.status === 'forfeited'}
          onClose={onClose}
          onPostResult={onPostResult}
        />
      )}
    </>
  );
}
