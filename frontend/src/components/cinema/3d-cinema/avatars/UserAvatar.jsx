import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import UsernameLabel from './UsernameLabel';
import ChatBubble from './ChatBubble';
import EmoteAnimation from './EmoteAnimation';
import CartoonHand from './CartoonHand';

/**
 * UserAvatar - 3D avatar for a user in the cinema
 * Features:
 * - Simple geometry (sphere head + cylinder body + arms)
 * - Random pastel color generated from user ID
 * - Row-based scaling for perspective effect
 * - Idle animations (breathing, look around)
 * - Emote animations
 * - Chat bubble support
 */
export default function UserAvatar({
  userId,
  username,
  seatPosition,
  seatRotation,
  rowNumber,
  isPremium = false,
  isCurrentUser = false,
  currentEmote = null,
  recentMessage = null,
  avatarColor = null, // Optional override
}) {
  const groupRef = useRef();
  const headRef = useRef();
  const bodyRef = useRef();
  const leftArmRef = useRef();
  const rightArmRef = useRef();

  // Generate consistent color from user ID
  const userColor = useMemo(() => {
    if (avatarColor) return avatarColor;
    
    // Premium seats get gold color
    if (isPremium) {
      return '#DAA520'; // Darker gold (goldenrod)
    }
    
    // Generate darker pastel color from user ID
    const hash = userId.toString().split('').reduce((acc, char) => {
      return char.charCodeAt(0) + ((acc << 5) - acc);
    }, 0);
    
    const hue = Math.abs(hash % 360);
    const saturation = 65; // Slightly less saturated
    const lightness = 50;  // Much darker (was 75, now 50)
    
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
  }, [userId, isPremium, avatarColor]);

  // Calculate scale based on row (perspective effect)
  const avatarScale = useMemo(() => {
    const baseScale = 0.1; // Reduced to 0.1 for uniform scaling
    const scaleDecrement = 0.03; // 3% smaller per row
    const minScale = 0.08; // Don't get smaller than 8%
    
    const scale = Math.max(
      baseScale - (rowNumber - 1) * scaleDecrement,
      minScale
    );
    
    return scale;
  }, [rowNumber]);

  // Idle animation state
  const breathingPhaseRef = useRef(0);
  const lookAroundPhaseRef = useRef(0);
  const nextLookTimeRef = useRef(Date.now() + Math.random() * 10000 + 5000);

  // Idle animations (breathing + occasional look around)
  useFrame((state, delta) => {
    if (!groupRef.current) return;

    // Don't animate if emote is active
    if (currentEmote) return;

    // BREATHING ANIMATION (subtle Y-axis scale)
    breathingPhaseRef.current += delta * 1.5; // Breathing speed
    const breathScale = 1 + Math.sin(breathingPhaseRef.current) * 0.02; // ±2%
    
    if (bodyRef.current) {
      bodyRef.current.scale.y = breathScale;
    }

    // LOOK AROUND ANIMATION (head rotation)
    const now = Date.now();
    if (now > nextLookTimeRef.current) {
      // Start new look around cycle
      lookAroundPhaseRef.current += delta * 2;
      
      if (lookAroundPhaseRef.current > Math.PI * 2) {
        // Finished one look around cycle
        lookAroundPhaseRef.current = 0;
        nextLookTimeRef.current = now + Math.random() * 10000 + 8000; // Next in 8-18 seconds
      }
      
      // Rotate head slightly left/right
      const lookRotation = Math.sin(lookAroundPhaseRef.current) * 0.3; // ±30 degrees
      if (headRef.current) {
        headRef.current.rotation.y = lookRotation;
      }
    }
  });

  return (
    <group 
      ref={groupRef}
      position={seatPosition}
      rotation={[0, 0, 0]}
      scale={avatarScale}
    >
      {/* HEAD (Sphere) */}
      <mesh
        ref={headRef}
        position={[0, 0.2, 0]}
        castShadow
        receiveShadow
      >
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshStandardMaterial 
          color={userColor}
          roughness={0.6}
          metalness={0.2}
        />
      </mesh>

      {/* BODY (Cylinder) */}
      <mesh
        ref={bodyRef}
        position={[0, -0.3, 0]}
        castShadow
        receiveShadow
      >
        <cylinderGeometry args={[0.2, 0.25, 0.6, 16]} />
        <meshStandardMaterial 
          color={userColor}
          roughness={0.7}
          metalness={0.1}
        />
      </mesh>

      {/* LEFT HAND - Floating cartoon glove */}
      <CartoonHand
        ref={leftArmRef}
        position={[-0.45, -0.1, 0]}
        rotation={[0, 0, 0]}
        userColor={userColor}
        isLeft={true}
        scale={avatarScale}
      />

      {/* RIGHT HAND - Floating cartoon glove */}
      <CartoonHand
        ref={rightArmRef}
        position={[0.45, -0.1, 0]}
        rotation={[0, 0, 0]}
        userColor={userColor}
        isLeft={false}
        scale={avatarScale}
      />

      {/* USERNAME LABEL (floating above head) */}
      <UsernameLabel 
        username={username}
        color={userColor}
        position={[0, 0.7, 0]}
        isPremium={isPremium}
        isCurrentUser={isCurrentUser}
      />

      {/* CHAT BUBBLE (if recent message) */}
      {recentMessage && (
        <ChatBubble
          message={recentMessage.text}
          color={userColor}
          position={[0, 1.1, 0]}
          duration={5000} // 5 seconds
          onComplete={() => {
            // Message expired - handled by parent
          }}
        />
      )}

      {/* EMOTE ANIMATION (if active) */}
      {currentEmote && (
        <EmoteAnimation
          emote={currentEmote}
          headRef={headRef}
          bodyRef={bodyRef}
          leftArmRef={leftArmRef}
          rightArmRef={rightArmRef}
          userColor={userColor}
        />
      )}
    </group>
  );
}
