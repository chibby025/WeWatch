// src/components/cinema/3d-cinema/CinemaTheaterGLB.jsx
import React, { useEffect, useRef } from 'react';
import { useGLTF, Html } from '@react-three/drei'; // ✅ Added Html
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

/**
 * CinemaTheaterGLB - Loads and displays a GLB cinema model with video on screen
 */
export function CinemaTheaterGLB({ position = [0, 0, 0], videoElement }) {
  const { scene } = useGLTF('/models/cinema.glb');
  const screenMeshRef = useRef(null);

  // ✅ Apply video texture to screen mesh — TRY THESE NAMES
  useEffect(() => {
    if (!scene || !videoElement) {
      console.warn('⚠️ [CinemaTheaterGLB] Missing scene or videoElement');
      return;
    }

    // 🔍 DEBUG: Log all mesh names once
    if (!window._cinemaGLBMeshesLogged) {
      console.log('🔍 [CinemaTheaterGLB] All meshes in cinema.glb:');
      scene.traverse(child => {
        if (child.isMesh) {
          console.log(`  - Name: "${child.name}" | UUID: ${child.uuid} | Geometry: ${child.geometry?.type}`);
        }
      });
      window._cinemaGLBMeshesLogged = true; // Only log once
    }

    // 🔑 Priority: Known candidate names
    const CANDIDATE_NAMES = [
      "オブジェクト_87",
      "オブジェクト_75",
      "オブジェクト_1",
      "オブジェクト_83",
      "オブジェクト_86",
      "Screen",
      "screen",
      "ProjectionScreen",
      "Plane",
      "Mesh_87",
      "Object_87"
    ];

    let screenMesh = null;

    // First pass: match by name
    scene.traverse(child => {
      if (child.isMesh && CANDIDATE_NAMES.includes(child.name)) {
        screenMesh = child;
      }
    });

    // Second pass: fallback to heuristic (flat, wide, front-facing)
    if (!screenMesh) {
      console.log('⚠️ [CinemaTheaterGLB] No named screen found. Trying heuristic...');
      scene.traverse(child => {
        if (child.isMesh && !screenMesh) {
          const { geometry } = child;
          if (!geometry || !geometry.parameters) return;

          const { width, height, depth } = geometry.parameters;
          const isFlat = depth === undefined || depth < 0.1;
          const isWide = width > 5 && width / (height || 1) > 1.3;

          if (isFlat && isWide) {
            console.log('🎯 [CinemaTheaterGLB] Heuristic match:', child.name || 'unnamed', { width, height, depth });
            screenMesh = child;
          }
        }
      });
    }

    if (!screenMesh) {
      console.error('❌ [CinemaTheaterGLB] Screen mesh NOT found. Tried names:', CANDIDATE_NAMES);
      return;
    }

    // ✅ Apply video texture
    const applyVideoTexture = (material) => {
      if (material.map) {
        material.map.dispose();
      }

      const videoTexture = new THREE.VideoTexture(videoElement);
      videoTexture.minFilter = THREE.LinearFilter;
      videoTexture.magFilter = THREE.LinearFilter;
      videoTexture.encoding = THREE.sRGBEncoding;
      videoTexture.needsUpdate = true;

      material.map = videoTexture;
      material.needsUpdate = true;
      material.side = THREE.DoubleSide;
      material.transparent = false;
      if (material.metalness !== undefined) material.metalness = 0;
      if (material.roughness !== undefined) material.roughness = 1;
    };

    if (Array.isArray(screenMesh.material)) {
      screenMesh.material.forEach(applyVideoTexture);
    } else if (screenMesh.material) {
      applyVideoTexture(screenMesh.material);
    } else {
      console.warn('⚠️ [CinemaTheaterGLB] Screen mesh has no material');
      return;
    }

    screenMeshRef.current = screenMesh;
    console.log('✅ [CinemaTheaterGLB] Video texture applied to mesh:', screenMesh.name || 'unnamed');
  }, [scene, videoElement]);

  if (!scene) {
    console.warn('⚠️ [CinemaTheaterGLB] Scene not loaded yet');
    return null;
  }

  // DEBUG: Highly visible markers for candidate screen meshes
  const ScreenDebugMarkers = React.useMemo(() => {
    if (!scene) return null;

    const candidates = [];
    let index = 1; // Start numbering from 1
    scene.traverse(child => {
      if (child.isMesh) {
        const { geometry } = child;
        if (!geometry || !geometry.parameters) return;

        const { width, height, depth } = geometry.parameters || {};
        const isFlat = !depth || depth < 0.5;
        const isWide = width > 3 && (height > 1) && width / height > 1.2;
        if (isFlat && isWide) {
          const worldPos = new THREE.Vector3();
          child.getWorldPosition(worldPos);
          candidates.push({
            id: index++,
            mesh: child,
            name: child.name || 'unnamed',
            worldPos: worldPos.toArray(),
            localPos: child.position.toArray(),
            size: { width, height, depth }
          });
        }
      }
    });

    console.log('🔍 [DEBUG] Candidate screen meshes:', candidates);

    return (
      <group>
        {candidates.map((cand) => (
          <group key={cand.id} position={cand.worldPos}>
            {/* Large bright sphere */}
            <mesh>
              <sphereGeometry args={[1.0, 32, 32]} /> {/* Bigger: radius 1.0 */}
              <meshStandardMaterial
                color="#ff00ff"       // Magenta for high contrast
                emissive="#ff00ff"
                emissiveIntensity={5}
                transparent
                opacity={0.9}
                depthTest={false}    // Always render on top
                depthWrite={false}
              />
            </mesh>
            {/* Large numbered label */}
            <Html>
              <div style={{
                background: 'rgba(255,0,255,0.9)',
                color: 'white',
                padding: '8px 12px',
                borderRadius: '50%',
                fontSize: '24px',
                fontWeight: 'bold',
                pointerEvents: 'none',
                width: '40px',
                height: '40px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid white'
              }}>
                {cand.id}
              </div>
            </Html>
          </group>
        ))}
      </group>
    );
  }, [scene]);

  useFrame(() => {
    // Update original screen mesh (if found)
    if (screenMeshRef.current?.material?.map instanceof THREE.VideoTexture) {
      screenMeshRef.current.material.map.needsUpdate = true;
    }

    // Update custom plane texture
    if (CustomVideoPlane?.plane?.material?.map instanceof THREE.VideoTexture) {
      CustomVideoPlane.plane.material.map.needsUpdate = true;
    }
  });

  // ✅ Custom Video Plane — Scaled down by 300% (1/3 size)
  const CustomVideoPlane = React.useMemo(() => {
    if (!videoElement || !scene) return null;

    // 📏 Ultra-compact cinematic screen
    const width = 4.8; // 10% smaller than 5.33
    const height = width * (9 / 16); // ~3.0 units tall (maintains 16:9)

    const geometry = new THREE.PlaneGeometry(width, height);
    const videoTexture = new THREE.VideoTexture(videoElement);
    videoTexture.minFilter = THREE.LinearFilter;
    videoTexture.magFilter = THREE.LinearFilter;
    videoTexture.encoding = THREE.sRGBEncoding;

    const material = new THREE.MeshBasicMaterial({
      map: videoTexture,
      side: THREE.DoubleSide,
      toneMapped: false
    });

    const plane = new THREE.Mesh(geometry, material);

    // 🔑 Precise world position: [-2.68, 4.07, 2.26]
    const worldPos = new THREE.Vector3(-3.49, 3.95, 2.26);
    const localPos = new THREE.Vector3();
    localPos.subVectors(worldPos, new THREE.Vector3(...position));
    plane.position.copy(localPos);

    // Face audience
    plane.rotation.y = Math.PI;

    const cleanup = () => {
      geometry.dispose();
      material.dispose();
      videoTexture.dispose();
    };

    return { plane, cleanup };
  }, [videoElement, scene, position]);

  // Cleanup on unmount or change
  useEffect(() => {
    if (CustomVideoPlane?.plane) {
      scene.add(CustomVideoPlane.plane);
    }
    return () => {
      if (CustomVideoPlane?.plane) {
        scene.remove(CustomVideoPlane.plane);
        CustomVideoPlane.cleanup();
      }
    };
  }, [scene, CustomVideoPlane]);

  // ✅ Render both scene AND debug markers
  return (
    <group position={position}>
      <primitive object={scene} />
      {ScreenDebugMarkers}
    </group>
  );
}

useGLTF.preload('/models/cinema.glb');
export default CinemaTheaterGLB;