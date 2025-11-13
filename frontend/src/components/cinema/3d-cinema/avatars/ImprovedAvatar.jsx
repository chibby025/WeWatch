import React, { useRef, useMemo, useState, useEffect } from 'react';
import { useFrame, useLoader } from '@react-three/fiber';
import * as THREE from 'three';
import { TextureLoader } from 'three';
import UsernameLabel from './UsernameLabel';
import ChatBubble from './ChatBubble';
import EmoteAnimation from './EmoteAnimation';

/**
 * ImprovedAvatar - Better proportioned 3D humanoid avatar
 * Features:
 * - Spherical head with face texture mapping
 * - Proper hemisphere body (not inverted cone)
 * - Better proportions and positioning
 * - Floating hands like Rayman style
 * - More natural avatar appearance
 */
export default function ImprovedAvatar({
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
  const leftHandRef = useRef();
  const rightHandRef = useRef();

  // State for texture loading
  const [profileTexture, setProfileTexture] = useState(null);
  const [isLoadingTexture, setIsLoadingTexture] = useState(false);

  // Load user profile image as texture with better UV mapping
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
        // Better texture configuration for face mapping
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        
        // Center the texture on the sphere
        texture.offset.set(0, 0);
        texture.repeat.set(1, 1);
        texture.center.set(0.5, 0.5);
        
        setProfileTexture(texture);
        setIsLoadingTexture(false);
        console.log('✅ [ImprovedAvatar] Profile texture loaded for user:', username);
      },
      (progress) => {
        console.log('⏳ [ImprovedAvatar] Loading profile image...', progress);
      },
      (error) => {
        console.warn('⚠️ [ImprovedAvatar] Failed to load profile image for user:', username, error);
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
    return `hsl(${hue}, 70%, 55%)`;
  }, [userId, isPremium, avatarColor]);

  // Create materials
  const headMaterial = useMemo(() => {
    if (profileTexture) {
      return new THREE.MeshStandardMaterial({
        map: profileTexture,
        roughness: 0.4,
        metalness: 0.1,
      });
    } else {
      // Skin-tone color for better default
      return new THREE.MeshStandardMaterial({
        color: '#FDBCB4', // Peachy skin tone
        roughness: 0.5,
        metalness: 0.1,
      });
    }
  }, [profileTexture]);

  const bodyMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: userColor,
      roughness: 0.6,
      metalness: 0.2,
    });
  }, [userColor]);

  const handMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: '#FDBCB4', // Skin tone for hands
      roughness: 0.5,
      metalness: 0.1,
    });
  }, []);

  // Scale based on row number
  const baseScale = 0.23; // Further increased for better visibility
  const rowScale = baseScale * (1 - (rowNumber - 1) * 0.025);

  // Breathing and idle animations
  useFrame((state) => {
    if (!groupRef.current) return;

    const time = state.clock.getElapsedTime();
    
    // Gentle breathing motion
    const breathe = Math.sin(time * 3) * 0.02;
    groupRef.current.position.y = seatPosition[1] + breathe;

    // Body breathing scale
    if (bodyRef.current) {
      const breatheScale = 1 + Math.sin(time * 3) * 0.03;
      bodyRef.current.scale.y = breatheScale;
    }

    // Hands floating animation
    if (leftHandRef.current && rightHandRef.current) {
      const float1 = Math.sin(time * 2.3) * 0.05;
      const float2 = Math.sin(time * 2.7) * 0.05;
      
      leftHandRef.current.position.y = 0.8 + float1;
      rightHandRef.current.position.y = 0.8 + float2;
    }
  });

  return (
    <group
      ref={groupRef}
      position={seatPosition}
      rotation={[0, 0, 0]}
      scale={[rowScale, rowScale, rowScale]}
    >
      {/* HEAD - Sphere with face texture */}
      <mesh
        ref={headRef}
        position={[0, 1.5, 0]}
        castShadow
        receiveShadow
      >
        <sphereGeometry args={[0.35, 32, 32]} />
        <primitive object={headMaterial} />
      </mesh>

      {/* Loading indicator for texture */}
      {isLoadingTexture && (
        <mesh position={[0, 1.5, 0.37]}>
          <ringGeometry args={[0.1, 0.15, 8]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.9} />
        </mesh>
      )}

      {/* GAP BETWEEN HEAD AND BODY - visible separation */}
      {/* The gap is created by positioning head at 1.5 and body top at ~1.1 */}

      {/* BODY - Proper hemisphere (not inverted) */}
      <mesh
        ref={bodyRef}
        position={[0, 0.6, 0]}
        castShadow
        receiveShadow
      >
        {/* Hemisphere sitting right-side up */}
        <sphereGeometry 
          args={[
            0.5,           // radius
            32,            // widthSegments
            32,            // heightSegments
            0,             // phiStart
            Math.PI * 2,   // phiLength (full circle)
            0,             // thetaStart
            Math.PI / 2    // thetaLength (hemisphere)
          ]} 
        />
        <primitive object={bodyMaterial} />
      </mesh>

      {/* LEFT HAND - Floating sphere */}
      <mesh
        ref={leftHandRef}
        position={[-0.55, 0.8, 0.1]}
        castShadow
        receiveShadow
      >
        <sphereGeometry args={[0.1, 16, 16]} />
        <primitive object={handMaterial} />
      </mesh>

      {/* RIGHT HAND - Floating sphere */}
      <mesh
        ref={rightHandRef}
        position={[0.55, 0.8, 0.1]}
        castShadow
        receiveShadow
      >
        <sphereGeometry args={[0.1, 16, 16]} />
        <primitive object={handMaterial} />
      </mesh>

      {/* Emote Animation Handler */}
      {currentEmote && (
        <EmoteAnimation
          emote={currentEmote}
          leftArmRef={leftHandRef}
          rightArmRef={rightHandRef}
          bodyRef={bodyRef}
          headRef={headRef}
        />
      )}

      {/* Username Label */}
      <UsernameLabel
        username={username}
        isPremium={isPremium}
        color={userColor}
        position={[0, 2.0, 0]}
      />

      {/* Chat Bubble */}
      {recentMessage && (
        <ChatBubble
          message={recentMessage.text}
          userColor={userColor}
          position={[0, 2.4, 0]}
        />
      )}
    </group>
  );
}