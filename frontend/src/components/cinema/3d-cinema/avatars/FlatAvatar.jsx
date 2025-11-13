import React, { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TextureLoader } from 'three';
import UsernameLabel from './UsernameLabel';
import ChatBubble from './ChatBubble';

/**
 * FlatAvatar - Simple 2D profile picture in 3D space
 * Features:
 * - Always faces camera (billboard effect)
 * - Perfect image display with no distortion
 * - Circular or square frame options
 * - Minimal 3D footprint but clean appearance
 */
export default function FlatAvatar({
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
  userPhotoUrl = null,
  shape = 'circle', // 'circle' or 'square'
}) {
  const groupRef = useRef();
  const avatarRef = useRef();

  // State for texture loading
  const [profileTexture, setProfileTexture] = useState(null);
  const [defaultTexture, setDefaultTexture] = useState(null);
  const [isLoadingTexture, setIsLoadingTexture] = useState(false);

  // Load default user icon
  useEffect(() => {
    const loader = new TextureLoader();
    loader.load(
      '/avatars/default.png',
      (texture) => {
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        setDefaultTexture(texture);
      },
      undefined,
      (error) => console.warn('⚠️ Could not load default avatar')
    );
  }, []);

  // Load user profile image
  useEffect(() => {
    if (!userPhotoUrl) {
      setProfileTexture(null);
      return;
    }

    setIsLoadingTexture(true);
    const loader = new TextureLoader();
    loader.load(
      userPhotoUrl,
      (texture) => {
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        
        setProfileTexture(texture);
        setIsLoadingTexture(false);
      },
      undefined,
      (error) => {
        console.warn('⚠️ Failed to load profile image for:', username);
        setProfileTexture(null);
        setIsLoadingTexture(false);
      }
    );
  }, [userPhotoUrl, username]);

  // Generate color for fallback
  const userColor = useMemo(() => {
    if (avatarColor) return avatarColor;
    if (isPremium) return '#DAA520';
    
    const hash = userId.toString().split('').reduce((acc, char) => {
      return char.charCodeAt(0) + ((acc << 5) - acc);
    }, 0);
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 65%, 50%)`;
  }, [userId, isPremium, avatarColor]);

  // Avatar material
  const avatarMaterial = useMemo(() => {
    const textureToUse = profileTexture || defaultTexture;
    
    if (textureToUse) {
      return new THREE.MeshBasicMaterial({
        map: textureToUse,
        transparent: true,
        side: THREE.DoubleSide,
      });
    } else {
      return new THREE.MeshBasicMaterial({
        color: userColor,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
      });
    }
  }, [profileTexture, defaultTexture, userColor]);

  // Border material
  const borderMaterial = useMemo(() => {
    return new THREE.MeshBasicMaterial({
      color: isPremium ? '#FFD700' : '#FFFFFF',
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
    });
  }, [isPremium]);

  // Scale based on row
  const baseScale = 0.8;
  const rowScale = baseScale * (1 - (rowNumber - 1) * 0.1);

  // Billboard effect - always face camera
  useFrame(({ camera }) => {
    if (avatarRef.current) {
      avatarRef.current.lookAt(camera.position);
    }
  });

  // Gentle floating animation
  useFrame((state) => {
    if (!groupRef.current) return;
    const time = state.clock.getElapsedTime();
    const float = Math.sin(time * 2) * 0.05;
    groupRef.current.position.y = seatPosition[1] + float;
  });

  const geometry = shape === 'circle' ? 
    <circleGeometry args={[0.5, 32]} /> : 
    <planeGeometry args={[1, 1]} />;

  const borderGeometry = shape === 'circle' ? 
    <ringGeometry args={[0.5, 0.55, 32]} /> : 
    <planeGeometry args={[1.1, 1.1]} />;

  return (
    <group
      ref={groupRef}
      position={seatPosition}
      scale={[rowScale, rowScale, rowScale]}
    >
      <group ref={avatarRef}>
        {/* Border */}
        <mesh position={[0, 1.2, -0.01]}>
          {borderGeometry}
          <primitive object={borderMaterial} />
        </mesh>

        {/* Main avatar */}
        <mesh position={[0, 1.2, 0]}>
          {geometry}
          <primitive object={avatarMaterial} />
        </mesh>

        {/* Loading spinner */}
        {isLoadingTexture && (
          <mesh position={[0, 1.2, 0.01]}>
            <ringGeometry args={[0.2, 0.25, 8]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.8} />
          </mesh>
        )}
      </group>

      {/* Username Label */}
      <UsernameLabel
        username={username}
        isPremium={isPremium}
        position={[0, 0.5, 0]}
      />

      {/* Chat Bubble */}
      {recentMessage && (
        <ChatBubble
          message={recentMessage.text}
          userColor={userColor}
          position={[0, 1.8, 0]}
        />
      )}
    </group>
  );
}