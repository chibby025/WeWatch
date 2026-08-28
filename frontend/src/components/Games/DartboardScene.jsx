// src/components/Games/DartboardScene.jsx
//
// A real 3D dartboard scene + swipe-throw gesture, forked from
// crispierry/dart-room (MIT — https://github.com/crispierry/dart-room),
// specifically its DartboardScene.tsx. Ported to plain JS/WeWatch's dark
// modal styling, and re-wired for a server-authoritative backend instead of
// dart-room's own local scoring:
//
//   - dart-room computes the actual landing point CLIENT-SIDE (aim + its own
//     gesture-quality-driven random spread), and trusts that outright.
//   - WeWatch's darts.go is deliberately server-authoritative instead: the
//     client reports where it AIMED plus a 0-1 "power" (how clean the
//     throw's timing/technique was), and the SERVER applies its own random
//     wobble (dartsWobble in darts.go) and decides the real landing point —
//     a skill mechanic explicitly documented there, not something to bypass
//     just to simplify this port.
//
// So this version does NOT call throwAt() itself when a gesture completes —
// it reports { x, y, quality } via onAimRelease and waits. The parent
// (DartsGame.jsx) sends that to the backend as { aim_x, aim_y, power:
// quality }, and only calls throwAt() once the server's own last_throw
// broadcast confirms the real landing spot — for BOTH players uniformly,
// exactly mirroring how Pool's "client renders, server confirms" split
// already works elsewhere in this game package.
//
// Coordinate convention: board-local (x, y) with y pointing toward the top
// of the board (sector 20) and angle measured via atan2(x, y) — CONFIRMED
// identical to darts.go's own dartsScoreAt (same SEGMENTS/SECTOR_ORDER
// array, same atan2(x,y) convention) — no rotation/reflection needed. The
// only difference is scale: dart-room's own BOARD.doubleOuter is ~2.22
// scene units (its whole scene — camera distance, dart throw arc, fog — is
// tuned around that), while darts.go normalizes to doubleOuter=1.0. Rather
// than rescale dart-room's tuned geometry (risking subtly breaking its
// throw-arc feel), DART_SCALE converts at the two boundary points instead:
// divide by DART_SCALE before reporting to the server, multiply by
// DART_SCALE when replaying a server-confirmed position.
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import * as THREE from 'three';

// Standard dartboard layout — byte-identical to darts.go's own
// dartsSectorOrder/ring constants, confirmed directly against the backend
// source. BOARD here stays at dart-room's native scene-unit scale
// (doubleOuter ~2.22, not normalized to 1.0) — see DART_SCALE above.
// Not exported (besides the default component) — this file's own constants
// share the file with a component, so exporting them here would defeat Fast
// Refresh (the linter's own react-refresh/only-export-components rule).
// DartsGame.jsx keeps its own small DART_SCALE=2.22 constant matching
// BOARD.doubleOuter below rather than importing it — a real, deliberately
// duplicated single scalar, not worth a whole extra file for.
const SEGMENTS = [20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5];
const BOARD = Object.freeze({
  bull: 0.14,
  outerBull: 0.35,
  tripleInner: 1.35,
  tripleOuter: 1.55,
  doubleInner: 2.02,
  doubleOuter: 2.22,
});

const FULL_CIRCLE = Math.PI * 2;
const SEGMENT_ANGLE = FULL_CIRCLE / SEGMENTS.length;
const SEGMENT_RADIANS = SEGMENT_ANGLE;

function normalizeAngle(angle) {
  return ((angle % FULL_CIRCLE) + FULL_CIRCLE) % FULL_CIRCLE;
}

// Purely a LOCAL, optimistic preview label for the onHit callback (sound +
// a transient "Triple 20!" style toast) — the real, authoritative score
// always comes from the server's own last_throw. Mirrors darts.go's
// dartsScoreAt exactly, so the two only ever disagree on genuine float
// rounding at a ring boundary (a real dart landing exactly on a wire), never
// in a way that matters.
function scoreImpact(x, y) {
  const radius = Math.hypot(x, y);
  if (radius > BOARD.doubleOuter) return { x, y, score: 0, label: 'Miss' };
  if (radius <= BOARD.bull) return { x, y, score: 50, label: 'Bullseye · 50' };
  if (radius <= BOARD.outerBull) return { x, y, score: 25, label: 'Outer bull · 25' };
  const clockwiseFromTop = normalizeAngle(Math.atan2(x, y));
  const segmentIndex = Math.floor((clockwiseFromTop + SEGMENT_ANGLE / 2) / SEGMENT_ANGLE) % SEGMENTS.length;
  const base = SEGMENTS[segmentIndex];
  if (radius >= BOARD.doubleInner) return { x, y, score: base * 2, label: `Double ${base} · ${base * 2}` };
  if (radius >= BOARD.tripleInner && radius <= BOARD.tripleOuter) return { x, y, score: base * 3, label: `Triple ${base} · ${base * 3}` };
  return { x, y, score: base, label: `${base}` };
}

function ringSegmentGeometry(inner, outer, start, end) {
  const shape = new THREE.Shape();
  shape.moveTo(Math.cos(start) * inner, Math.sin(start) * inner);
  shape.lineTo(Math.cos(start) * outer, Math.sin(start) * outer);
  shape.absarc(0, 0, outer, start, end, false);
  shape.lineTo(Math.cos(end) * inner, Math.sin(end) * inner);
  shape.absarc(0, 0, inner, end, start, true);
  shape.closePath();
  return new THREE.ShapeGeometry(shape, 10);
}

function addSegmentRing(group, inner, outer, colors, z) {
  SEGMENTS.forEach((_, index) => {
    const center = Math.PI / 2 - index * SEGMENT_RADIANS;
    const geometry = ringSegmentGeometry(inner, outer, center - SEGMENT_RADIANS / 2, center + SEGMENT_RADIANS / 2);
    const material = new THREE.MeshStandardMaterial({ color: colors[index % 2], roughness: 0.82, metalness: 0.02 });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.z = z;
    group.add(mesh);
  });
}

function textSprite(text) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (context) {
    context.clearRect(0, 0, 128, 128);
    context.fillStyle = '#ece7da';
    context.font = '700 48px Arial';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, 64, 68);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.38, 0.38, 1);
  sprite.renderOrder = 20;
  return sprite;
}

function createBoard() {
  const group = new THREE.Group();
  const edgeMaterial = new THREE.MeshStandardMaterial({ color: '#111719', roughness: 0.72, metalness: 0.22 });
  const edge = new THREE.Mesh(new THREE.CylinderGeometry(2.52, 2.52, 0.32, 96), edgeMaterial);
  edge.rotation.x = Math.PI / 2;
  edge.position.z = -0.12;
  group.add(edge);

  const face = new THREE.Mesh(new THREE.CircleGeometry(2.42, 96), new THREE.MeshStandardMaterial({ color: '#111516', roughness: 0.9 }));
  face.position.z = 0.052;
  group.add(face);

  addSegmentRing(group, BOARD.outerBull, BOARD.tripleInner, ['#efe9d9', '#161a1b'], 0.064);
  addSegmentRing(group, BOARD.tripleInner, BOARD.tripleOuter, ['#e4524d', '#39aa7a'], 0.068);
  addSegmentRing(group, BOARD.tripleOuter, BOARD.doubleInner, ['#efe9d9', '#161a1b'], 0.064);
  addSegmentRing(group, BOARD.doubleInner, BOARD.doubleOuter, ['#e4524d', '#39aa7a'], 0.068);

  const outerBull = new THREE.Mesh(new THREE.CircleGeometry(BOARD.outerBull, 48), new THREE.MeshStandardMaterial({ color: '#39aa7a', roughness: 0.78 }));
  outerBull.position.z = 0.074;
  group.add(outerBull);

  const bull = new THREE.Mesh(new THREE.CircleGeometry(BOARD.bull, 40), new THREE.MeshStandardMaterial({ color: '#e4524d', roughness: 0.76 }));
  bull.position.z = 0.082;
  group.add(bull);

  const wireMaterial = new THREE.MeshBasicMaterial({ color: '#c6c4b8', transparent: true, opacity: 0.52 });
  [BOARD.outerBull, BOARD.tripleInner, BOARD.tripleOuter, BOARD.doubleInner, BOARD.doubleOuter].forEach((radius) => {
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius - 0.008, radius + 0.008, 96), wireMaterial);
    ring.position.z = 0.09;
    group.add(ring);
  });

  SEGMENTS.forEach((segment, index) => {
    const angle = Math.PI / 2 - index * SEGMENT_RADIANS;
    const sprite = textSprite(String(segment));
    sprite.position.set(Math.cos(angle) * 2.34, Math.sin(angle) * 2.34, 0.13);
    group.add(sprite);
  });

  const halo = new THREE.Mesh(new THREE.RingGeometry(2.54, 2.6, 96), new THREE.MeshBasicMaterial({ color: '#72e5cf', transparent: true, opacity: 0.22 }));
  halo.position.z = 0.02;
  group.add(halo);
  return group;
}

function createDart(color) {
  const group = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: '#d9dfdc', metalness: 0.78, roughness: 0.25 });
  const accent = new THREE.MeshStandardMaterial({ color, metalness: 0.18, roughness: 0.46 });

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.72, 12), metal);
  barrel.rotation.x = Math.PI / 2;
  group.add(barrel);

  const point = new THREE.Mesh(new THREE.ConeGeometry(0.036, 0.35, 10), metal);
  point.rotation.x = -Math.PI / 2;
  point.position.z = -0.52;
  group.add(point);

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.48, 10), accent);
  shaft.rotation.x = Math.PI / 2;
  shaft.position.z = 0.56;
  group.add(shaft);

  const flightGeometry = new THREE.BoxGeometry(0.38, 0.018, 0.34);
  const flightA = new THREE.Mesh(flightGeometry, accent);
  flightA.position.z = 0.96;
  group.add(flightA);
  const flightB = new THREE.Mesh(flightGeometry, accent);
  flightB.rotation.z = Math.PI / 2;
  flightB.position.z = 0.96;
  group.add(flightB);

  group.scale.setScalar(0.82);
  return group;
}

function disposeObject(object) {
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh) && !(child instanceof THREE.Sprite)) return;
    if (child.geometry) child.geometry.dispose();
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.forEach((material) => {
      if (material?.map instanceof THREE.Texture) material.map.dispose();
      material?.dispose();
    });
  });
}

function easeOutCubic(value) {
  return 1 - (1 - value) ** 3;
}

const DartboardScene = forwardRef(function DartboardScene({ disabled, playerColor, onAimRelease, onHit }, ref) {
  const mountRef = useRef(null);
  const throwAtRef = useRef(() => false);
  const clearRef = useRef(() => undefined);
  const disabledRef = useRef(disabled);
  const colorRef = useRef(playerColor);
  const onAimReleaseRef = useRef(onAimRelease);
  const onHitRef = useRef(onHit);
  const [gesture, setGesture] = useState(null);
  const [hint, setHint] = useState('Drag upward and release over your target');

  disabledRef.current = disabled;
  colorRef.current = playerColor;
  onAimReleaseRef.current = onAimRelease;
  onHitRef.current = onHit;

  useImperativeHandle(ref, () => ({
    throwAt: (x, y, color) => throwAtRef.current(x, y, color),
    clearDarts: () => clearRef.current(),
  }), []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    const container = mount;

    const scene = new THREE.Scene();
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    scene.fog = new THREE.FogExp2('#0a0a0f', 0.02);
    // Restored to the original dart-room camera (near head-on, narrow 36°
    // FOV) per explicit request — an oblique/wide-FOV variant was tried and
    // shipped for a while but reverted back to this. Aiming/raycasting is
    // unaffected either way: planePoint below always resolves against the
    // board's own fixed Z=0 plane regardless of camera position/FOV.
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 40);
    camera.position.set(0, -0.05, 8.8);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.touchAction = 'none';
    renderer.domElement.setAttribute('aria-hidden', 'true');
    container.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight('#3a3a44', '#08080a', 1.6));
    const key = new THREE.DirectionalLight('#fff2d3', 3.2);
    key.position.set(-3, 4, 7);
    scene.add(key);
    const rim = new THREE.PointLight('#68a4e4', 16, 14, 2);
    rim.position.set(3.5, -1, 5);
    scene.add(rim);

    const wall = new THREE.Mesh(new THREE.PlaneGeometry(28, 18), new THREE.MeshStandardMaterial({ color: '#15151d', roughness: 0.95 }));
    wall.position.z = -0.52;
    scene.add(wall);

    const board = createBoard();
    board.rotation.z = -0.006;
    scene.add(board);

    const oche = new THREE.Mesh(new THREE.PlaneGeometry(8, 5), new THREE.MeshStandardMaterial({ color: '#1c1c24', roughness: 0.92, metalness: 0.02 }));
    oche.rotation.x = -Math.PI / 2;
    oche.position.set(0, -3.25, 3.8);
    scene.add(oche);

    const reticle = new THREE.Group();
    const reticleMaterial = new THREE.MeshBasicMaterial({ color: '#f3c85f', transparent: true, opacity: 0.95 });
    const reticleRing = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.118, 36), reticleMaterial);
    reticle.add(reticleRing);
    const reticleLineH = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.012), reticleMaterial);
    reticle.add(reticleLineH);
    const reticleLineV = new THREE.Mesh(new THREE.PlaneGeometry(0.012, 0.34), reticleMaterial);
    reticle.add(reticleLineV);
    reticle.position.z = 0.19;
    reticle.visible = false;
    scene.add(reticle);

    const raycaster = new THREE.Raycaster();
    const boardPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    const activeDarts = [];
    const landedDarts = [];
    let frame = 0;
    let pointer = null;

    function resize() {
      const width = Math.max(1, container.clientWidth);
      const height = Math.max(1, container.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.position.z = Math.max(8.8, 8.2 / Math.max(0.7, camera.aspect));
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
    }

    function planePoint(clientX, clientY) {
      const bounds = renderer.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((clientX - bounds.left) / bounds.width) * 2 - 1,
        -((clientY - bounds.top) / bounds.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      return raycaster.ray.intersectPlane(boardPlane, new THREE.Vector3());
    }

    function clearDarts() {
      for (const dart of [...activeDarts]) {
        scene.remove(dart.group);
        disposeObject(dart.group);
      }
      activeDarts.length = 0;
      for (const dart of [...landedDarts]) {
        scene.remove(dart);
        disposeObject(dart);
      }
      landedDarts.length = 0;
    }

    // Called only by the PARENT (via the ref), once the server's own
    // last_throw confirms a real landing spot — never invoked directly from
    // the local gesture handler below anymore (see this file's header
    // comment for why: darts.go, not the client, decides the real outcome).
    function throwAt(x, y, color = colorRef.current) {
      if (activeDarts.length > 0) return false;
      const hit = scoreImpact(x, y);
      const dart = createDart(color);
      const start = new THREE.Vector3(THREE.MathUtils.clamp(x * 0.13, -0.5, 0.5), -2.85, 7.25);
      const end = new THREE.Vector3(x, y, 0.54);
      dart.position.copy(start);
      dart.rotation.set(-0.04, 0.08, Math.atan2(y + 2.85, x) * 0.015);
      scene.add(dart);
      activeDarts.push({ group: dart, start, end, startedAt: performance.now(), duration: prefersReducedMotion ? 120 : 610, hit, reported: false });
      reticle.visible = false;
      return true;
    }

    throwAtRef.current = throwAt;
    clearRef.current = clearDarts;

    function updateReticle(event) {
      if (disabledRef.current || pointer) return;
      const point = planePoint(event.clientX, event.clientY);
      if (!point) return;
      reticle.position.x = point.x;
      reticle.position.y = point.y;
      reticle.visible = Math.hypot(point.x, point.y) <= BOARD.doubleOuter + 0.25;
    }

    function handlePointerDown(event) {
      event.preventDefault();
      if (disabledRef.current || activeDarts.length > 0) return;
      renderer.domElement.setPointerCapture(event.pointerId);
      pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, startedAt: performance.now() };
      setGesture({ startX: event.clientX, startY: event.clientY, endX: event.clientX, endY: event.clientY });
      setHint('Swipe toward the board');
    }

    function handlePointerMove(event) {
      event.preventDefault();
      updateReticle(event);
      if (!pointer || event.pointerId !== pointer.id) return;
      setGesture({ startX: pointer.x, startY: pointer.y, endX: event.clientX, endY: event.clientY });
      const point = planePoint(event.clientX, event.clientY);
      if (point) {
        reticle.position.x = point.x;
        reticle.position.y = point.y;
        reticle.visible = true;
      }
    }

    // The gesture's quality (straightness/length/speed of the swipe) becomes
    // the "power" darts.go already expects — the SAME 0-1 skill signal the
    // original click-drag-then-hold-a-power-bar UI used to produce, just
    // derived from a single continuous throwing motion instead. This
    // function reports the RAW raycasted point, with none of dart-room's own
    // spread/bias applied — that randomization is the server's job now
    // (dartsWobble in darts.go), not duplicated here.
    function finishPointer(event) {
      event.preventDefault();
      if (!pointer || event.pointerId !== pointer.id) return;
      const currentPointer = pointer;
      pointer = null;
      setGesture(null);
      const vertical = currentPointer.y - event.clientY;
      const horizontal = event.clientX - currentPointer.x;
      const duration = Math.max(80, performance.now() - currentPointer.startedAt);
      const distance = Math.hypot(horizontal, vertical);
      const point = planePoint(event.clientX, event.clientY);

      if (!point || vertical < 42 || distance < 58) {
        setHint('Use a longer upward swipe');
        reticle.visible = false;
        return;
      }

      const speed = distance / duration;
      const straightness = Math.max(0, 1 - Math.abs(horizontal) / Math.max(90, distance));
      const lengthQuality = Math.max(0, 1 - Math.abs(distance - 210) / 300);
      const speedQuality = Math.max(0, 1 - Math.abs(speed - 0.82) / 1.25);
      const quality = THREE.MathUtils.clamp(straightness * 0.45 + lengthQuality * 0.3 + speedQuality * 0.25, 0.15, 1);
      setHint(quality > 0.78 ? 'Clean release — throw sent' : quality > 0.5 ? 'Good throw — throw sent' : 'Wobbly release — throw sent');
      reticle.visible = false;
      onAimReleaseRef.current?.({ x: point.x, y: point.y, quality });
    }

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('pointermove', handlePointerMove);
    renderer.domElement.addEventListener('pointerup', finishPointer);
    renderer.domElement.addEventListener('pointercancel', finishPointer);
    const preventTouchScroll = (event) => event.preventDefault();
    renderer.domElement.addEventListener('touchmove', preventTouchScroll, { passive: false });
    const handlePointerLeave = (event) => {
      if (!pointer || event.pointerId !== pointer.id) reticle.visible = false;
    };
    renderer.domElement.addEventListener('pointerleave', handlePointerLeave);

    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    function render(now) {
      frame = requestAnimationFrame(render);
      board.rotation.z = prefersReducedMotion ? -0.006 : -0.006 + Math.sin(now * 0.00022) * 0.0015;

      for (let index = activeDarts.length - 1; index >= 0; index -= 1) {
        const dart = activeDarts[index];
        const raw = Math.min(1, (now - dart.startedAt) / dart.duration);
        const eased = easeOutCubic(raw);
        dart.group.position.lerpVectors(dart.start, dart.end, eased);
        dart.group.position.y += Math.sin(raw * Math.PI) * 0.62;
        dart.group.rotation.x = -0.04 + raw * 0.13;

        if (raw >= 1 && !dart.reported) {
          dart.reported = true;
          activeDarts.splice(index, 1);
          landedDarts.push(dart.group);
          dart.group.position.copy(dart.end);
          dart.group.rotation.set(0.08, -0.05, (Math.random() - 0.5) * 0.14);
          onHitRef.current?.(dart.hit);
        }
      }

      renderer.render(scene, camera);
    }

    frame = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('pointermove', handlePointerMove);
      renderer.domElement.removeEventListener('pointerup', finishPointer);
      renderer.domElement.removeEventListener('pointercancel', finishPointer);
      renderer.domElement.removeEventListener('touchmove', preventTouchScroll);
      renderer.domElement.removeEventListener('pointerleave', handlePointerLeave);
      clearDarts();
      disposeObject(board);
      disposeObject(wall);
      disposeObject(oche);
      disposeObject(reticle);
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, []);

  const gestureStyle = gesture
    ? {
      position: 'fixed',
      zIndex: 100,
      left: gesture.startX,
      top: gesture.startY,
      height: 3,
      width: Math.hypot(gesture.endX - gesture.startX, gesture.endY - gesture.startY),
      transformOrigin: 'left center',
      transform: `rotate(${Math.atan2(gesture.endY - gesture.startY, gesture.endX - gesture.startX)}rad)`,
      borderRadius: 3,
      background: 'linear-gradient(90deg, rgba(232,194,104,0.15), #e8c268)',
      boxShadow: '0 0 16px rgba(232,194,104,0.5)',
      pointerEvents: 'none',
    }
    : undefined;

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{ touchAction: 'none', overscrollBehavior: 'none', cursor: disabled ? 'default' : 'crosshair' }}
      role="img"
      aria-label="A three-dimensional regulation dartboard. Drag upward and release over a target to throw."
    >
      <div ref={mountRef} className="absolute inset-0" style={{ touchAction: 'none' }} />
      {gesture ? <span style={gestureStyle} aria-hidden="true" /> : null}
      <div
        className="absolute left-1/2 bottom-4 -translate-x-1/2 flex items-center gap-2 px-3 py-2 rounded-md bg-black/60 backdrop-blur border border-gray-700 text-xs font-semibold text-gray-200"
        aria-hidden="true"
      >
        <span className="text-yellow-400 text-base leading-none animate-bounce">↑</span>
        {disabled ? 'Waiting for the other player' : hint}
      </div>
    </div>
  );
});

export default DartboardScene;
