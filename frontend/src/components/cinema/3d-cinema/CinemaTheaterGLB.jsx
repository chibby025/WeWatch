// src/components/cinema/3d-cinema/CinemaTheaterGLB.jsx
import React, { useEffect, useRef, useState } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { SRGBColorSpace } from 'three';

// ─── JITTER INVESTIGATION NOTES (2026-06) ────────────────────────────────────
//
// SYMPTOM: Member tab shows jitter/stutter on the 3D cinema screen.
//          Host tab is smooth. Fullscreen (2D) mode is smooth for both.
//
// ROOT CAUSE (confirmed by debug logs):
//   CinemaScene3DDemo re-renders on every incoming WS message. Every 8 seconds
//   usePlaybackSync sends playback_control seek from the host, which the backend
//   relays to all members. The member's setMessages() triggers a full re-render
//   of the 271KB CinemaScene3DDemo component. This appears to block the main
//   thread long enough to delay RAF → useFrame misses frames → needsUpdate is
//   not set → GPU shows stale video frame → visible stutter.
//
//   The gaps logged are 84ms–2199ms with seeking=false readyState=4 paused=false,
//   meaning the VIDEO itself is fine; the stall is purely in the render pipeline.
//   The host never receives their own WS echoes, so they never hit this.
//
// ─── FIX 1 (applied, partial improvement) ────────────────────────────────────
//   Changed Canvas frameloop="demand" → frameloop="always" in CinemaScene3D.jsx.
//   "demand" mode skips frames when invalidate() isn't called; "always" renders
//   every RAF. Result: slight improvement but jitter persists because the main
//   thread is still being blocked, delaying the RAF itself.
//
// ─── FIX 2 (tried, WORSE — reverted 2026-06) ─────────────────────────────────
//   Removed all useState for textures; applied textures imperatively via mesh
//   refs (screenMeshRef.current.material.map = texture, mesh.visible = true).
//   Moved updateMainScreen/updatePIP into useCallback helpers called from effects.
//   Result: WORSE. Imperative material updates ran outside the R3F render cycle,
//   causing the screen mesh to blank for entire render passes. Reverted.
//
// ─── FIX 3 (tried, WORSE — reverted 2026-06) ─────────────────────────────────
//   Extracted useFrame into a separate memoized CinemaTextureFrameLoop component
//   that receives a single stable bagRef (so it never re-renders and useFrame is
//   never unregistered). Rendered inside the <group> to stay inside Canvas context.
//   Result: WORSE. The frame loop ran on stale/disposed textures after parent
//   re-renders, producing corrupted frames. Reverted.
//
// ─── FIX 4 (tried, BROKE VIDEO — reverted 2026-06) ───────────────────────────
//   Added requestVideoFrameCallback (rVFC) loop inside the videoElement useEffect
//   to set needsUpdate=true directly from the video decode pipeline, bypassing
//   any compositor visibility throttling that might stall hidden elements.
//   Theory: Chrome throttles compositor callbacks for opacity:0 z-index:-1 elements;
//   rVFC fires from the decoder regardless of visibility.
//   Result: BROKE video entirely — no texture appeared on screen. Reverted.
//   Possible reason: rVFC fires asynchronously between RAF frames; THREE.js needs
//   needsUpdate=true to be set synchronously BEFORE the render call in that same
//   frame. rVFC + useFrame together may have caused double-update or timing clash.
//
// ─── FIX 5 (tried, WORSE — reverted 2026-06) ─────────────────────────────────
//   Wrapped setMessages() in React.startTransition() in useWebSocket.js so React
//   treats WS message state updates as non-urgent, letting the browser fire RAF
//   before committing the re-render.
//   Result: WORSE. For a component as large as CinemaScene3DDemo, concurrent mode
//   restarts the transition render each time a new message interrupts it. The
//   restart overhead accumulated and blocked the thread MORE than a single
//   synchronous render. Reverted.
//
// ─── NEXT INVESTIGATION DIRECTION ────────────────────────────────────────────
//   The debug logs below (FRAME GAP, WS MESSAGE TIMING, RENDER COUNT) should
//   be used to confirm that each FRAME GAP timestamp matches a WS message
//   arrival timestamp in CinemaScene3DDemo logs. If confirmed, the fix needs
//   to target the message processing pipeline:
//     - Process playback_control seek without going through React state at all
//       (direct ref callback, bypassing setMessages entirely)
//     - OR debounce/coalesce the 8s sync messages so CinemaScene3DDemo re-renders
//       less frequently
//     - OR split CinemaScene3DDemo so the 3D canvas subtree is isolated from the
//       WS message state tree (no cascading re-renders into the Canvas)
// ─────────────────────────────────────────────────────────────────────────────

// Custom comparator: only re-render when actual media sources change.
// onScreenClick and position are intentionally excluded — position is fixed at
// model load time; onScreenClick is a new ref every parent render but is only
// called on user interaction, so a stale closure is safe.
function arePropsEqual(prev, next) {
  return (
    prev.videoElement === next.videoElement &&
    prev.cameraVideoElement === next.cameraVideoElement &&
    prev.gameCanvas === next.gameCanvas &&
    prev.podcastCanvas === next.podcastCanvas &&
    prev.liveShareMode === next.liveShareMode
  );
}

const CinemaTheaterGLB = React.memo(function CinemaTheaterGLB({
  position = [0, 0, 0],
  videoElement,
  cameraVideoElement,
  gameCanvas,
  podcastCanvas,
  liveShareMode,
  onScreenClick
}) {
  const { scene } = useGLTF('/models/cinema.glb');
  const videoTextureRef   = useRef();
  const cameraTextureRef  = useRef();
  const gameTextureRef    = useRef();
  const podcastTextureRef = useRef();
  const [videoTexture,   setVideoTexture]   = useState(null);
  const [cameraTexture,  setCameraTexture]  = useState(null);
  const [gameTexture,    setGameTexture]    = useState(null);
  const [podcastTexture, setPodcastTexture] = useState(null);

  if (!scene) return null;

  // ── Video texture ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!videoElement) return;
    console.log(`[CinemaTheaterGLB] 🎬 Creating VideoTexture for: ...${videoElement.src?.slice(-40)}`);
    const texture = new THREE.VideoTexture(videoElement);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.colorSpace = SRGBColorSpace;
    videoTextureRef.current = texture;
    setVideoTexture(texture);
    return () => {
      console.log(`[CinemaTheaterGLB] 🗑️ Disposing VideoTexture`);
      texture.dispose();
    };
  }, [videoElement]);

  // ── Camera PIP texture ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!cameraVideoElement) {
      setCameraTexture(null);
      if (cameraTextureRef.current) { cameraTextureRef.current.dispose(); cameraTextureRef.current = null; }
      return;
    }
    const texture = new THREE.VideoTexture(cameraVideoElement);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.colorSpace = SRGBColorSpace;
    cameraTextureRef.current = texture;
    setCameraTexture(texture);
    return () => { if (cameraTextureRef.current) cameraTextureRef.current.dispose(); };
  }, [cameraVideoElement]);

  // ── Game canvas texture ────────────────────────────────────────────────────
  useEffect(() => {
    if (!gameCanvas) {
      setGameTexture(null);
      if (gameTextureRef.current) { gameTextureRef.current.dispose(); gameTextureRef.current = null; }
      return;
    }
    const texture = new THREE.CanvasTexture(gameCanvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;
    gameTextureRef.current = texture;
    setGameTexture(texture);
    return () => { if (gameTextureRef.current) gameTextureRef.current.dispose(); };
  }, [gameCanvas]);

  // ── Podcast canvas texture ─────────────────────────────────────────────────
  useEffect(() => {
    if (!podcastCanvas) {
      setPodcastTexture(null);
      if (podcastTextureRef.current) { podcastTextureRef.current.dispose(); podcastTextureRef.current = null; }
      return;
    }
    console.log('🎙️ [CinemaTheaterGLB] Creating podcast canvas texture');
    const texture = new THREE.CanvasTexture(podcastCanvas);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;
    podcastTextureRef.current = texture;
    setPodcastTexture(texture);
    return () => {
      console.log('🎙️ [CinemaTheaterGLB] Disposing podcast canvas texture');
      if (podcastTextureRef.current) podcastTextureRef.current.dispose();
    };
  }, [podcastCanvas]);

  // ── Debug counters ─────────────────────────────────────────────────────────
  const renderCountRef    = useRef(0);
  const frameCountRef     = useRef(0);
  const blockedFramesRef  = useRef(0);
  const lastTexUpdateRef  = useRef(Date.now()); // wall-clock time of last successful needsUpdate
  const lastGapLogRef     = useRef(0);          // wall-clock time of last FRAME GAP log (dedup)

  // Log every re-render. Each re-render potentially re-registers useFrame (gap risk).
  // After initial texture setup (renders #2-6), further re-renders during playback
  // indicate the memo comparator is failing — likely because videoElement prop changed
  // reference (liveShareVideoRef.current switching in/out in parent expression).
  renderCountRef.current++;
  if (renderCountRef.current > 1) {
    console.warn(
      `[CinemaTheaterGLB] ⚠️ Re-render #${renderCountRef.current} at ${new Date().toISOString()} ` +
      `— videoElement src: ...${videoElement?.src?.slice(-40)} ` +
      `readyState=${videoElement?.readyState} paused=${videoElement?.paused}`
    );
  }

  // ── Frame loop: set needsUpdate each frame so THREE.js uploads the latest ──
  // decoded video frame to the GPU. In "always" frameloop the canvas renders
  // every RAF; this just ensures the texture is flagged for upload before render.
  //
  // DEBUG: measures inter-frame gap between consecutive successful needsUpdate calls.
  // A gap > 80ms means the GPU showed a stale frame. Gaps correlate with either:
  //   (a) videoElement becoming paused/unready (seeking, buffering) — readyState < 2
  //   (b) useFrame not running because RAF was delayed by main-thread JS work
  //       (React reconciling CinemaScene3DDemo in response to WS messages)
  // The wall-clock timestamp in each log can be compared against WS message arrival
  // logs in CinemaScene3DDemo to confirm (b).
  useFrame(({ invalidate }) => {
    let needsUpdate = false;

    if (
      videoTextureRef.current &&
      videoElement &&
      !videoElement.paused &&
      videoElement.readyState >= 2
    ) {
      videoTextureRef.current.needsUpdate = true;
      needsUpdate = true;

      const now = Date.now();
      const gap = now - lastTexUpdateRef.current;
      lastTexUpdateRef.current = now;

      // Log stalls > 80ms (~5 dropped frames at 60fps).
      // Include wall-clock time so you can line up with WS message arrival logs.
      if (gap > 80 && now - lastGapLogRef.current > 200) {
        lastGapLogRef.current = now;
        console.warn(
          `[CinemaTheaterGLB] ⏱️ FRAME GAP ${gap}ms at ${new Date(now).toISOString()} — ` +
          `seeking=${videoElement.seeking} readyState=${videoElement.readyState} paused=${videoElement.paused}`
        );
      }

      frameCountRef.current++;
      blockedFramesRef.current = 0;
    } else if (videoElement && videoTextureRef.current) {
      blockedFramesRef.current++;
      if (blockedFramesRef.current === 1) {
        console.warn(
          `[CinemaTheaterGLB] 🔴 Texture BLOCKED frame 1 at ${new Date().toISOString()} — ` +
          `paused=${videoElement.paused} seeking=${videoElement.seeking} readyState=${videoElement.readyState}`
        );
      }
      if (blockedFramesRef.current === 30) {
        console.warn(
          `[CinemaTheaterGLB] 🔴 Still BLOCKED after 30 frames — ` +
          `paused=${videoElement.paused} seeking=${videoElement.seeking} readyState=${videoElement.readyState}`
        );
      }
    }

    if (cameraTextureRef.current && cameraVideoElement && !cameraVideoElement.paused && cameraVideoElement.readyState >= 2) {
      cameraTextureRef.current.needsUpdate = true;
      needsUpdate = true;
    }
    if (gameTextureRef.current && gameCanvas) {
      gameTextureRef.current.needsUpdate = true;
      needsUpdate = true;
    }
    if (podcastTextureRef.current && podcastCanvas) {
      podcastTextureRef.current.needsUpdate = true;
      needsUpdate = true;
    }

    if (needsUpdate) invalidate();
  });

  // ── Geometry ───────────────────────────────────────────────────────────────
  const worldPos  = new THREE.Vector3(-3.49, 3.95, 2.26);
  const localPos  = new THREE.Vector3();
  localPos.subVectors(worldPos, new THREE.Vector3(...position));

  const width  = 4.8;
  const height = width * (9 / 16);

  const pipWidth   = width * 0.25;
  const pipHeight  = pipWidth * (9 / 16);
  const pipOffsetX = (width / 2) - (pipWidth / 2) - 0.1;
  const pipOffsetY = -(height / 2) + (pipHeight / 2) + 0.1;
  const pipLocalPos = new THREE.Vector3(
    localPos.x + pipOffsetX,
    localPos.y + pipOffsetY,
    localPos.z - 0.01
  );

  const showCameraPIP    = cameraTexture && liveShareMode === 'both';
  const mainScreenTexture = podcastTexture || gameTexture || (liveShareMode === 'camera' ? cameraTexture : videoTexture);

  return (
    <group position={position}>
      <primitive object={scene} />

      {mainScreenTexture && (
        <mesh
          position={[localPos.x, localPos.y, localPos.z]}
          rotation-y={Math.PI}
          onClick={(e) => { e.stopPropagation(); if (onScreenClick) onScreenClick(); }}
          onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer'; }}
          onPointerOut={(e)  => { e.stopPropagation(); document.body.style.cursor = 'default'; }}
        >
          <planeGeometry args={[width, height]} />
          <meshBasicMaterial map={mainScreenTexture} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      )}

      {showCameraPIP && (
        <mesh position={[pipLocalPos.x, pipLocalPos.y, pipLocalPos.z]} rotation-y={Math.PI}>
          <planeGeometry args={[pipWidth, pipHeight]} />
          <meshBasicMaterial map={cameraTexture} side={THREE.DoubleSide} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}, arePropsEqual);

export default CinemaTheaterGLB;
useGLTF.preload('/models/cinema.glb');
