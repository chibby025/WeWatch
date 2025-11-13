import React, { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { TextureLoader } from 'three';
import UsernameLabel from './UsernameLabel';
import ChatBubble from './ChatBubble';
import EmoteAnimation from './EmoteAnimation';

/**
 * CustomAvatar - Procedural avatar with proper proportions
 * Features:
 * - Spherical head (floating above body)
 * - Inverted hemisphere body (dome-shaped)
 * - Gap between head and body for floating effect
 * - Bouncy idle animation
 * - Uniform scaling that maintains proportions
 */
export default function CustomAvatar({
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
}) {
  const groupRef = useRef();
  const headRef = useRef();
  const bodyRef = useRef();
  const leftArmRef = useRef();
  const rightArmRef = useRef();

  // State for texture loading
  const [profileTexture, setProfileTexture] = useState(null);
  const [isLoadingTexture, setIsLoadingTexture] = useState(false);

  // Load user profile image as texture
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
        // Configure the texture for optimal avatar display
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        
        // Ensure the texture is centered and properly scaled
        texture.offset.set(0, 0);
        texture.repeat.set(1, 1);
        texture.center.set(0.5, 0.5);
        
        setProfileTexture(texture);
        setIsLoadingTexture(false);
        console.log('✅ [CustomAvatar] Profile texture loaded for user:', username);
      },
      (progress) => {
        console.log('⏳ [CustomAvatar] Loading profile image...', progress);
      },
      (error) => {
        console.warn('⚠️ [CustomAvatar] Failed to load profile image for user:', username, error);
        setProfileTexture(null);
        setIsLoadingTexture(false);
      }
    );
  }, [userPhotoUrl, username]);

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

  // Create materials for head (with or without texture)
  const headMaterial = useMemo(() => {
    if (profileTexture) {
      // Use texture for the head
      return new THREE.MeshStandardMaterial({
        map: profileTexture,
        roughness: 0.6,
        metalness: 0.2,
      });
    } else {
      // Fallback to colored material
      return new THREE.MeshStandardMaterial({
        color: userColor,
        roughness: 0.6,
        metalness: 0.2,
      });
    }
  }, [profileTexture, userColor]);

  // Body material (always uses color)
  const bodyMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: userColor,
      roughness: 0.6,
      metalness: 0.2,
      side: THREE.DoubleSide,
    });
  }, [userColor]);

  // Scale based on row number (rows further back appear smaller)
  const baseScale = 0.15; // Larger base scale for better visibility
  const rowScale = baseScale * (1 - (rowNumber - 1) * 0.03);

  // Bounce animation
  useFrame((state) => {
    if (!groupRef.current) return;

    const time = state.clock.getElapsedTime();
    
    // Gentle bounce (up and down)
    const bounce = Math.sin(time * 2) * 0.05;
    groupRef.current.position.y = seatPosition[1] + bounce;
  });

  return (
    <group
      ref={groupRef}
      position={seatPosition}
      rotation={[0, 0, 0]}
      scale={[rowScale, rowScale, rowScale]}
    >
      {/* SPHERICAL HEAD - Floating above body with optional texture */}
      <mesh
        ref={headRef}
        position={[0, 1.5, 0]}
        castShadow
        receiveShadow
      >
        <sphereGeometry args={[0.4, 32, 32]} />
        <primitive object={headMaterial} />
      </mesh>

      {/* Loading indicator for texture */}
      {isLoadingTexture && (
        <mesh position={[0, 1.5, 0.42]}>
          <planeGeometry args={[0.1, 0.1]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.8} />
        </mesh>
      )}

      {/* INVERTED HEMISPHERE BODY - Dome shape */}
      <mesh
        ref={bodyRef}
        position={[0, 0.5, 0]}
        rotation={[Math.PI, 0, 0]} // Flip upside down to invert
        castShadow
        receiveShadow
      >
        {/* SphereGeometry with limited phi angles to create hemisphere */}
        <sphereGeometry 
          args={[
            0.6,           // radius
            32,            // widthSegments (smooth)
            32,            // heightSegments (smooth)
            0,             // phiStart
            Math.PI * 2,   // phiLength (full circle)
            0,             // thetaStart
            Math.PI / 2    // thetaLength (half sphere = hemisphere)
          ]} 
        />
        <primitive object={bodyMaterial} />
      </mesh>

      {/* LEFT ARM - Simple sphere */}
      <mesh
        ref={leftArmRef}
        position={[-0.6, 0.9, 0]}
        castShadow
      >
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshStandardMaterial 
          color={userColor}
          roughness={0.6}
          metalness={0.2}
        />
      </mesh>

      {/* RIGHT ARM - Simple sphere */}
      <mesh
        ref={rightArmRef}
        position={[0.6, 0.9, 0]}
        castShadow
      >
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshStandardMaterial 
          color={userColor}
          roughness={0.6}
          metalness={0.2}
        />
      </mesh>

      {/* Emote Animation Handler */}
      {currentEmote && (
        <EmoteAnimation
          emote={currentEmote}
          leftArmRef={leftArmRef}
          rightArmRef={rightArmRef}
          bodyRef={bodyRef}
          headRef={headRef}
        />
      )}

      {/* Username Label */}
      <UsernameLabel
        username={username}
        isPremium={isPremium}
        position={[0, 1.9, 0]}
      />

      {/* Chat Bubble */}
      {recentMessage && (
        <ChatBubble
          message={recentMessage.text}
          userColor={userColor}
          position={[0, 2.3, 0]}
        />
      )}
    </group>
  );
}
