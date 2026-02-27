// src/components/cinema/3d-cinema/CinemaTheaterGLB.jsx
import React, { useEffect, useRef, useState } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

export default function CinemaTheaterGLB({ 
  position = [0, 0, 0], 
  videoElement, 
  cameraVideoElement,
  liveShareMode,
  onScreenClick 
}) {
  const { scene } = useGLTF('/models/cinema.glb');
  const videoTextureRef = useRef();
  const cameraTextureRef = useRef();
  const [videoTexture, setVideoTexture] = useState(null);
  const [cameraTexture, setCameraTexture] = useState(null);

  if (!scene) return null;

  // Create main screen video texture when videoElement changes
  useEffect(() => {
    if (!videoElement) return;

    const texture = new THREE.VideoTexture(videoElement);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.encoding = THREE.sRGBEncoding;
    
    videoTextureRef.current = texture;
    setVideoTexture(texture);

    return () => {
      texture.dispose();
    };
  }, [videoElement]);

  // Create camera PIP texture when cameraVideoElement changes
  useEffect(() => {
    if (!cameraVideoElement) {
      setCameraTexture(null);
      if (cameraTextureRef.current) {
        cameraTextureRef.current.dispose();
        cameraTextureRef.current = null;
      }
      return;
    }

    const texture = new THREE.VideoTexture(cameraVideoElement);
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.encoding = THREE.sRGBEncoding;
    
    cameraTextureRef.current = texture;
    setCameraTexture(texture);

    return () => {
      if (cameraTextureRef.current) {
        cameraTextureRef.current.dispose();
      }
    };
  }, [cameraVideoElement]);

  // 🚀 PHASE 2: Update textures only when video is actually playing
  const frameCountRef = useRef(0);
  const lastFpsLogRef = useRef(Date.now());
  
  useFrame(({ invalidate }) => {
    let needsUpdate = false;
    
    // Update main video texture
    if (
      videoTextureRef.current &&
      videoElement &&
      !videoElement.paused &&
      videoElement.readyState >= 2
    ) {
      videoTextureRef.current.needsUpdate = true;
      needsUpdate = true;
      frameCountRef.current++;
      
      // ⚠️ PERFORMANCE: FPS logging commented out to reduce overhead
      // const now = Date.now();
      // if (now - lastFpsLogRef.current >= 5000) {
      //   const fps = frameCountRef.current / 5;
      //   console.log(`🎬 [3D SCREEN FPS] ${fps.toFixed(1)} fps | Video: ${videoElement.videoWidth}x${videoElement.videoHeight} | readyState: ${videoElement.readyState}`);
      //   frameCountRef.current = 0;
      //   lastFpsLogRef.current = now;
      // }
    }
    
    // Update camera texture
    if (
      cameraTextureRef.current &&
      cameraVideoElement &&
      !cameraVideoElement.paused &&
      cameraVideoElement.readyState >= 2
    ) {
      cameraTextureRef.current.needsUpdate = true;
      needsUpdate = true;
    }
    
    // 🚀 PHASE 2: Only trigger re-render when video textures need updating
    if (needsUpdate) {
      invalidate();
    }
  });

  // Calculate local position for main screen
  const worldPos = new THREE.Vector3(-3.49, 3.95, 2.26);
  const localPos = new THREE.Vector3();
  localPos.subVectors(worldPos, new THREE.Vector3(...position));

  const width = 4.8;
  const height = width * (9 / 16);

  // Camera PIP position (bottom-right corner of main screen)
  const pipWidth = width * 0.25; // 25% of main screen width
  const pipHeight = pipWidth * (9 / 16);
  const pipOffsetX = (width / 2) - (pipWidth / 2) - 0.1; // 0.1 margin from edge
  const pipOffsetY = -(height / 2) + (pipHeight / 2) + 0.1;
  const pipLocalPos = new THREE.Vector3(
    localPos.x + pipOffsetX,
    localPos.y + pipOffsetY,
    localPos.z - 0.01 // Slightly in front of main screen
  );

  // ✅ Camera PIP only shows in 'both' mode (screen + camera)
  const showCameraPIP = cameraTexture && liveShareMode === 'both';
  
  // ✅ In camera-only mode, use camera texture for main screen
  const mainScreenTexture = liveShareMode === 'camera' ? cameraTexture : videoTexture;

  return (
    <group position={position}>
      <primitive object={scene} />
      
      {/* ✅ Main video screen mesh with click handler */}
      {mainScreenTexture && (
        <mesh
          position={[localPos.x, localPos.y, localPos.z]}
          rotation-y={Math.PI}
          onClick={(e) => {
            e.stopPropagation();
            if (onScreenClick) {
              onScreenClick();
            }
          }}
          onPointerOver={(e) => {
            e.stopPropagation();
            document.body.style.cursor = 'pointer';
          }}
          onPointerOut={(e) => {
            e.stopPropagation();
            document.body.style.cursor = 'default';
          }}
        >
          <planeGeometry args={[width, height]} />
          <meshBasicMaterial
            map={mainScreenTexture}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>
      )}
      
      {/* 📹 Camera PIP overlay (bottom-right corner) */}
      {showCameraPIP && (
        <mesh
          position={[pipLocalPos.x, pipLocalPos.y, pipLocalPos.z]}
          rotation-y={Math.PI}
        >
          <planeGeometry args={[pipWidth, pipHeight]} />
          <meshBasicMaterial
            map={cameraTexture}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>
      )}
    </group>
  );
}

useGLTF.preload('/models/cinema.glb');