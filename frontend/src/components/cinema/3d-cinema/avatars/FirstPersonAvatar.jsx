import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import CartoonHand from './CartoonHand';

/**
 * FirstPersonAvatar - Partial avatar for current user (first-person view)
 * Features:
 * - Shows only body and arms (head is the camera)
 * - Positioned below camera viewport
 * - Responds to emote animations
 * - Visible to current user only
 */
export default function FirstPersonAvatar({
  userColor = '#88ccff',
  currentEmote = null,
}) {
  const bodyRef = useRef();
  const leftArmRef = useRef();
  const rightArmRef = useRef();

  // Idle breathing animation
  const breathingPhaseRef = useRef(0);

  useFrame((state, delta) => {
    // Don't animate if emote is active
    if (currentEmote) {
      // Emote animations handled below
      handleEmoteAnimation(currentEmote, delta);
      return;
    }

    // Subtle breathing
    breathingPhaseRef.current += delta * 1.5;
    const breathScale = 1 + Math.sin(breathingPhaseRef.current) * 0.015;
    
    if (bodyRef.current) {
      bodyRef.current.scale.y = breathScale;
    }
  });

  // Handle emote-specific animations for first-person view
  const handleEmoteAnimation = (emote, delta) => {
    const elapsed = Date.now() % 2000; // 2-second cycle
    const progress = elapsed / 2000;
    const phase = progress * Math.PI * 2;

    switch (emote) {
      case 'wave':
        // Right arm waves into view
        if (rightArmRef.current) {
          rightArmRef.current.rotation.x = Math.sin(phase * 4) * 0.5;
          rightArmRef.current.position.y = -0.3 + Math.sin(phase) * 0.2;
        }
        break;
      
      case 'clap':
        // Both arms come together in view
        if (leftArmRef.current && rightArmRef.current) {
          const clapPhase = Math.sin(phase * 2);
          leftArmRef.current.position.x = 0.3 - clapPhase * 0.2;
          rightArmRef.current.position.x = -0.3 + clapPhase * 0.2;
          leftArmRef.current.position.z = -0.5 + clapPhase * 0.3;
          rightArmRef.current.position.z = -0.5 + clapPhase * 0.3;
        }
        break;
      
      case 'thumbs_up':
        // Right arm raises into view
        if (rightArmRef.current) {
          rightArmRef.current.position.y = -0.3 + Math.min(progress, 0.5);
          rightArmRef.current.rotation.x = Math.min(progress * 0.5, 0.3);
        }
        break;
      
      case 'laugh':
        // Body bounces
        if (bodyRef.current) {
          bodyRef.current.position.y = -1.0 + Math.abs(Math.sin(phase * 3)) * 0.1;
        }
        break;
      
      case 'heart':
        // Arms form heart above (not visible in FP, but move upward)
        if (leftArmRef.current && rightArmRef.current) {
          leftArmRef.current.position.y = -0.3 + progress * 0.5;
          rightArmRef.current.position.y = -0.3 + progress * 0.5;
        }
        break;
      
      default:
        resetToNeutral();
    }
  };

  const resetToNeutral = () => {
    if (leftArmRef.current) {
      leftArmRef.current.position.set(0.3, -0.3, -0.4);
      leftArmRef.current.rotation.set(0, 0, 0);
    }
    if (rightArmRef.current) {
      rightArmRef.current.position.set(-0.3, -0.3, -0.4);
      rightArmRef.current.rotation.set(0, 0, 0);
    }
    if (bodyRef.current) {
      bodyRef.current.position.set(0, -1.0, -0.5);
    }
  };

  return (
    <group>
      {/* BODY (lower torso visible) */}
      <mesh
        ref={bodyRef}
        position={[0, -1.0, -0.5]}
        castShadow
      >
        <cylinderGeometry args={[0.15, 0.2, 0.4, 16]} />
        <meshStandardMaterial 
          color={userColor}
          roughness={0.7}
          metalness={0.1}
        />
      </mesh>

      {/* 👇 HIDE HANDS: Comment out or delete these */}

      {/* 
      <CartoonHand
        ref={leftArmRef}
        position={[0.4, -0.3, -0.4]}
        rotation={[0, 0, 0]}
        userColor={userColor}
        isLeft={true}
        scale={0.8}
      />
      <CartoonHand
        ref={rightArmRef}
        position={[-0.4, -0.3, -0.4]}
        rotation={[0, 0, 0]}
        userColor={userColor}
        isLeft={false}
        scale={0.8}
      />
      */}
    </group>
  );
}
