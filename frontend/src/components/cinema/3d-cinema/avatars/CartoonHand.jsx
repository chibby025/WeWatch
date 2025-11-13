import React, { forwardRef } from 'react';
import * as THREE from 'three';

/**
 * CartoonHand - 5-finger cartoon glove with rim lighting
 * Features:
 * - White glove base color
 * - User-color rim/outline glow
 * - 5 fingers (thumb, index, middle, ring, pinky)
 * - Palm rounded box shape
 */
const CartoonHand = forwardRef(({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  userColor = '#88ccff',
  isLeft = false,
  scale = 1,
}, ref) => {
  const gloveColor = '#F5F5DC'; // Cream/white glove
  
  // Calculate rim light color from user color
  const rimColor = userColor;

  // Create material with emission for rim lighting effect
  const gloveMaterial = (
    <meshStandardMaterial 
      color={gloveColor}
      emissive={rimColor}
      emissiveIntensity={0.3} // Subtle glow
      roughness={0.8}
      metalness={0.1}
    />
  );

  return (
    <group ref={ref} position={position} rotation={rotation} scale={scale}>
      {/* PALM - Rounded box shape */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.12, 0.15, 0.06]} />
        {gloveMaterial}
      </mesh>

      {/* THUMB - Angled at side */}
      <mesh 
        position={isLeft ? [-0.08, -0.02, 0] : [0.08, -0.02, 0]} 
        rotation={[0, 0, isLeft ? 0.8 : -0.8]}
      >
        <capsuleGeometry args={[0.03, 0.08, 4, 8]} />
        {gloveMaterial}
      </mesh>

      {/* INDEX FINGER */}
      <mesh position={[-0.045, 0.11, 0]}>
        <capsuleGeometry args={[0.025, 0.08, 4, 8]} />
        {gloveMaterial}
      </mesh>

      {/* MIDDLE FINGER (longest) */}
      <mesh position={[-0.015, 0.12, 0]}>
        <capsuleGeometry args={[0.025, 0.09, 4, 8]} />
        {gloveMaterial}
      </mesh>

      {/* RING FINGER */}
      <mesh position={[0.015, 0.11, 0]}>
        <capsuleGeometry args={[0.025, 0.075, 4, 8]} />
        {gloveMaterial}
      </mesh>

      {/* PINKY (shortest) */}
      <mesh position={[0.045, 0.09, 0]}>
        <capsuleGeometry args={[0.025, 0.06, 4, 8]} />
        {gloveMaterial}
      </mesh>

      {/* Optional: Add subtle rim light using point light */}
      <pointLight
        position={[0, 0, 0.1]}
        color={rimColor}
        intensity={0.5}
        distance={0.3}
      />
    </group>
  );
});

CartoonHand.displayName = 'CartoonHand';

export default CartoonHand;
