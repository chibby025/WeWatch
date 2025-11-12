import React, { useEffect } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';

/**
 * CinemaTheaterGLB - Loads and displays a GLB cinema model RAW (no modifications)
 */
export function CinemaTheaterGLB({ position = [0, 0, 0] }) {
  // Load the GLB model
  const { scene } = useGLTF('/models/cinema.glb');
  
  console.log('🎬 [CinemaTheaterGLB] Model loaded at position:', position);
  console.log('🎬 [CinemaTheaterGLB] Scene:', scene);

  // Inspect the model structure to find seats
  useEffect(() => {
    if (scene) {
      console.log('🔍 [CinemaTheaterGLB] Inspecting model structure...');
      const seats = [];
      
      scene.traverse((child) => {
        // Log all objects to see what's in the model
        if (child.isMesh) {
          console.log('  📦 Mesh found:', child.name, '| Position:', child.position.toArray());
          
          // Look for objects that might be seats (common naming patterns)
          const name = child.name.toLowerCase();
          if (name.includes('seat') || name.includes('chair') || name.includes('sitz')) {
            seats.push({
              name: child.name,
              position: child.position.toArray(),
              worldPosition: child.getWorldPosition(new THREE.Vector3()).toArray()
            });
          }
        }
      });
      
      if (seats.length > 0) {
        console.log('🪑 [CinemaTheaterGLB] Found', seats.length, 'potential seats:');
        seats.forEach((seat, i) => {
          console.log(`  Seat ${i + 1}:`, seat.name, '| World Pos:', seat.worldPosition.map(n => n.toFixed(2)));
        });
      } else {
        console.log('⚠️ [CinemaTheaterGLB] No seats found by name. Listing ALL meshes:');
        scene.traverse((child) => {
          if (child.isMesh) {
            const worldPos = child.getWorldPosition(new THREE.Vector3());
            console.log(`  - "${child.name}" at world position: [${worldPos.x.toFixed(2)}, ${worldPos.y.toFixed(2)}, ${worldPos.z.toFixed(2)}]`);
          }
        });
      }
    }
  }, [scene]);

  if (!scene) {
    console.warn('⚠️ [CinemaTheaterGLB] Scene not loaded yet');
    return null;
  }

  // Position the model where specified
  return (
    <primitive 
      object={scene} 
      position={position}
      rotation={[0, 0, 0]}
      scale={1}
    />
  );
}

// Preload the model
useGLTF.preload('/models/cinema.glb');

export default CinemaTheaterGLB;
