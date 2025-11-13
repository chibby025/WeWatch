import React, { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { TextureLoader } from 'three';
import UsernameLabel from './UsernameLabel';
import ChatBubble from './ChatBubble';
import EmoteAnimation from './EmoteAnimation';

/**
 * ModernAvatar - Profile card style avatar with clean design
 * Features:
 * - Square profile image panel (like modern social media)
 * - Subtle 3D depth and tilt
 * - Clean border frame
 * - Default user icon when no image
 * - Maintains 3D presence while showing images perfectly
 */
export default function ModernAvatar({
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
  const panelRef = useRef();
  const borderRef = useRef();

  // State for texture loading
  const [profileTexture, setProfileTexture] = useState(null);
  const [defaultTexture, setDefaultTexture] = useState(null);
  const [isLoadingTexture, setIsLoadingTexture] = useState(false);

  // Load default user icon
  useEffect(() => {
    const loader = new TextureLoader();
    loader.load(
      '/avatars/default.png', // Default user icon
      (texture) => {
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        setDefaultTexture(texture);
      },
      undefined,
      (error) => {
        console.warn('⚠️ Could not load default avatar icon');
      }
    );
  }, []);

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
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        
        setProfileTexture(texture);
        setIsLoadingTexture(false);
        console.log('✅ [ModernAvatar] Profile texture loaded for user:', username);
      },
      (progress) => {
        console.log('⏳ [ModernAvatar] Loading profile image...', progress);
      },
      (error) => {
        console.warn('⚠️ [ModernAvatar] Failed to load profile image for user:', username, error);
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

  // Create material for the avatar panel
  const panelMaterial = useMemo(() => {
    const textureToUse = profileTexture || defaultTexture;
    
    if (textureToUse) {
      return new THREE.MeshStandardMaterial({
        map: textureToUse,
        roughness: 0.3,
        metalness: 0.1,
      });
    } else {
      // Fallback to solid color with subtle gradient effect
      return new THREE.MeshStandardMaterial({
        color: userColor,
        roughness: 0.6,
        metalness: 0.2,
      });
    }
  }, [profileTexture, defaultTexture, userColor]);

  // Border material (premium users get gold border)
  const borderMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: isPremium ? '#FFD700' : '#444444',
      roughness: 0.4,
      metalness: isPremium ? 0.8 : 0.1,
    });
  }, [isPremium]);

  // Scale based on row number (rows further back appear smaller)
  const baseScale = 0.12;
  const rowScale = baseScale * (1 - (rowNumber - 1) * 0.02);

  // Gentle floating animation
  useFrame((state) => {
    if (!groupRef.current) return;

    const time = state.clock.getElapsedTime();
    
    // Gentle float (up and down)
    const float = Math.sin(time * 2) * 0.03;
    groupRef.current.position.y = seatPosition[1] + float;

    // Gentle rotation for more life
    const sway = Math.sin(time * 1.5) * 0.02;
    groupRef.current.rotation.y = sway;
  });

  return (
    <group
      ref={groupRef}
      position={seatPosition}
      rotation={[0, 0, 0]}
      scale={[rowScale, rowScale, rowScale]}
    >
      {/* BORDER FRAME - Slightly larger panel behind */}
      <mesh
        ref={borderRef}
        position={[0, 1.2, 0]}
        rotation={[0, 0, 0]}
        castShadow
      >
        <boxGeometry args={[1.1, 1.1, 0.08]} />
        <primitive object={borderMaterial} />
      </mesh>

      {/* MAIN AVATAR PANEL - Square with slight depth */}
      <mesh
        ref={panelRef}
        position={[0, 1.2, 0.05]}
        rotation={[0, 0, 0]}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[1.0, 1.0, 0.06]} />
        <primitive object={panelMaterial} />
      </mesh>

      {/* Loading indicator */}
      {isLoadingTexture && (
        <mesh position={[0, 1.2, 0.11]}>
          <ringGeometry args={[0.15, 0.2, 8]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.8} />
        </mesh>
      )}

      {/* SIMPLE BASE/STAND - Small cylinder */}
      <mesh
        position={[0, 0.1, 0]}
        castShadow
        receiveShadow
      >
        <cylinderGeometry args={[0.3, 0.4, 0.2, 8]} />
        <meshStandardMaterial 
          color={userColor}
          roughness={0.7}
          metalness={0.3}
        />
      </mesh>

      {/* Emote Animation Handler */}
      {currentEmote && (
        <EmoteAnimation
          emote={currentEmote}
          leftArmRef={null}   // No arms for this style
          rightArmRef={null}  // No arms for this style
          bodyRef={panelRef}
          headRef={panelRef}
        />
      )}

      {/* Username Label */}
      <UsernameLabel
        username={username}
        isPremium={isPremium}
        position={[0, 0.4, 0]}
      />

      {/* Chat Bubble */}
      {recentMessage && (
        <ChatBubble
          message={recentMessage.text}
          userColor={userColor}
          position={[0, 2.0, 0]}
        />
      )}
    </group>
  );
}