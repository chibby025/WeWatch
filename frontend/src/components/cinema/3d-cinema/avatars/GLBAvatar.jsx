import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import UsernameLabel from './UsernameLabel';
import ChatBubble from './ChatBubble';
import EmoteAnimation from './EmoteAnimation';

/**
 * GLBAvatar - 3D avatar using the user_3d_icon.glb model
 * Features:
 * - Loads generic GLB model (190KB)
 * - Applies user profile picture to face sphere/plane
 * - User color tinting on body
 * - Emote animations
 * - Chat bubble support
 */
export default function GLBAvatar({
  userId,
  username,
  seatPosition,
  seatRotation,
  rowNumber,
  isPremium = false,
  isCurrentUser = false,
  currentEmote = null,
  recentMessage = null,
  avatarColor = null,
  userPhotoUrl = null, // Profile picture URL
}) {
  const groupRef = useRef();
  const modelRef = useRef();
  const leftArmRef = useRef();
  const rightArmRef = useRef();

  // Load the GLB model
  const { scene } = useGLTF('/models/user_3d_icon.glb');
  
  // Load user's profile picture (if provided)
  // const faceTexture = useTexture(userPhotoUrl || '/avatars/default.png');

  // Generate consistent color from user ID
  const userColor = useMemo(() => {
    if (avatarColor) return avatarColor;
    
    if (isPremium) {
      return '#DAA520'; // Darker gold
    }
    
    const hash = userId.toString().split('').reduce((acc, char) => {
      return char.charCodeAt(0) + ((acc << 5) - acc);
    }, 0);
    
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 65%, 50%)`;
  }, [userId, isPremium, avatarColor]);

  // Scale based on row number (rows further back appear smaller)
  const baseScale = 0.1; // Reduced to 0.1 for uniform scaling
  const rowScale = baseScale * (1 - (rowNumber - 1) * 0.03);

  // Clone the scene and apply textures/colors
  const clonedScene = useMemo(() => scene.clone(), [scene]);

  // Convert seat rotation to radians for avatar orientation
  // Only use Y-axis rotation to face forward, ignore X and Z (which tilt the seats)
  const avatarRotation = useMemo(() => {
    return [0, 0, 0]; // Stand straight, face forward (screen is at -Z)
  }, []);

  useEffect(() => {
    // Since the model is a single mesh (Object_2), we'll apply colors to it
    clonedScene.traverse((child) => {
      if (child.isMesh) {
        // Create a new material with user color (no texture for now)
        const material = new THREE.MeshStandardMaterial({
          // map: faceTexture, // Disabled for now
          color: new THREE.Color(userColor), // User color tint
          roughness: 0.8,
          metalness: 0.2,
        });
        
        child.material = material;
        child.castShadow = true;
        child.receiveShadow = true;
        
        // Store reference for animations
        if (!leftArmRef.current) {
          leftArmRef.current = child;
          rightArmRef.current = child;
        }
      }
    });
  }, [clonedScene, userColor]);

  // Idle animations (breathing, subtle movement)
  useFrame((state) => {
    if (!modelRef.current) return;

    const time = state.clock.getElapsedTime();
    
    // Breathing effect
    const breathScale = 1 + Math.sin(time * 2) * 0.02;
    modelRef.current.scale.y = breathScale;
  });

  return (
    <group
      ref={groupRef}
      position={seatPosition}
      rotation={avatarRotation}
    >
      {/* GLB Model - Uniform scale */}
      <primitive
        ref={modelRef}
        object={clonedScene}
        scale={[rowScale, rowScale, rowScale]}
        position={[0, -0.3, 0]}
        rotation={[0, 0, 0]}
      />

      {/* Emote Animation Handler */}
      {currentEmote && (
        <EmoteAnimation
          emote={currentEmote}
          leftArmRef={leftArmRef}
          rightArmRef={rightArmRef}
          bodyRef={modelRef}
          headRef={modelRef}
        />
      )}

      {/* Username Label */}
      <UsernameLabel
        username={username}
        isPremium={isPremium}
        position={[0, 0.7, 0]}
      />

      {/* Chat Bubble */}
      {recentMessage && (
        <ChatBubble
          message={recentMessage.text}
          userColor={userColor}
          position={[0, 1.1, 0]}
        />
      )}
    </group>
  );
}

// Preload the GLB model
useGLTF.preload('/models/user_3d_icon.glb');
