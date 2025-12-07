import React, { useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { TextureLoader } from 'three';
import UsernameLabel from './UsernameLabel';
import ChatBubble from './ChatBubble';

/**
 * FlatUserIcon - Lightweight 2D user silhouette in 3D space
 * Features:
 * - Billboarded plane (always faces camera)
 * - Glowing dot per user (unique color)
 * - Activity-based username label (30s timeout or hover)
 * - Supports chat bubbles and future emotes
 */
export default function FlatUserIcon({
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
  hideLabelsForLocalViewer = false,
  isActiveTimed = false,
  isHovered = false,
  onHover,
  isSpeaking = false,
}) {
  const groupRef = useRef();
  const planeRef = useRef();
  const [svgTexture, setSvgTexture] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const orbRef = useRef();
  const [isPulsing, setIsPulsing] = useState(false);

  // Generate consistent color from user ID (fallback)
  const userColor = React.useMemo(() => {
    if (avatarColor) return avatarColor;
    if (isPremium) return '#DAA520';
    const hash = userId.toString().split('').reduce((acc, char) => {
      return char.charCodeAt(0) + ((acc << 5) - acc);
    }, 0);
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 65%, 50%)`;
  }, [userId, isPremium, avatarColor]);

  // ✅ Load black silhouette SVG (same for everyone)
  useEffect(() => {
    const svgPath = '/icons/user1avatar.svg'; // Same SVG for all users
    
    setIsLoading(true);
    const loader = new TextureLoader();
    loader.load(
      svgPath,
      (texture) => {
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;
        setSvgTexture(texture);
        setIsLoading(false);
      },
      undefined,
      () => {
        console.warn('⚠️ Failed to load SVG avatar for:', username);
        setSvgTexture(null);
        setIsLoading(false);
      }
    );
  }, []); // ✅ Only load once (same SVG for all)

  // Billboard effect - always face camera
  useFrame(({ camera }) => {
    if (planeRef.current) {
      planeRef.current.lookAt(camera.position);
    }
  });

  // Scale based on row
  const baseScale = 0.8;
  const rowScale = baseScale * (1 - (rowNumber - 1) * 0.08);

  // Floating animation
  useFrame((state) => {
    if (!groupRef.current) return;
    const time = state.clock.getElapsedTime();
    const float = Math.sin(time * 1.5) * 0.02;
    
    // ✅ Extra height for Row 3 (and optionally Row 4)
    const extraHeight = rowNumber === 3 ? 0.15 : rowNumber === 4 ? 0.1 : 0;
    
    groupRef.current.position.y = seatPosition[1] + extraHeight + float;
  });

  const showLabel = (isActiveTimed || isHovered) && !hideLabelsForLocalViewer;

  // Pulse while user is speaking
  useEffect(() => {
    setIsPulsing(!!isSpeaking);
  }, [isSpeaking]);

  // Animate emissive intensity
  useFrame(() => {
    if (orbRef.current?.material && isPulsing) {
      const time = Date.now() * 0.005;
      const pulse = 0.5 + Math.sin(time * 8) * 0.5; // oscillate 0.5 → 1.0
      orbRef.current.material.emissiveIntensity = 0.9 + pulse * 0.6; // 0.9 → ~1.5
    }
  });

  return (
    <group
      ref={groupRef}
      position={seatPosition}
      scale={[rowScale, rowScale, rowScale]}
    >
      {/* MAIN AVATAR PLANE - Black Silhouette SVG */}
      <mesh
        ref={planeRef}
        position={[0, 0, 0]}
        onPointerOver={() => onHover?.(userId)}
        onPointerOut={() => onHover?.(null)}
      >
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial
          map={svgTexture || null}
          transparent
          side={THREE.DoubleSide}
        />
      </mesh>

    {/* GLOWING DOT - inside avatar's head (mouth area) */}
    <mesh ref={orbRef} position={[0, 0.08, 0.01]}>
      <sphereGeometry args={[0.02, 12, 12]} />
      <meshStandardMaterial
        color={userColor}
        emissive={userColor}
        emissiveIntensity={0.9}
        roughness={0.1}
        metalness={0}
      />
    </mesh>

      {/* Loading spinner */}
      {isLoading && (
        <mesh position={[0, 0, 0.05]}>
          <ringGeometry args={[0.2, 0.25, 8]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.8} />
        </mesh>
      )}

      {/* Username Label */}
      {showLabel && (
        <UsernameLabel
          username={username}
          isPremium={isPremium}
          color={userColor}
          position={[0, 0.6, 0]}
        />
      )}

      {/* Chat Bubble */}
      {recentMessage && (
        <ChatBubble
          message={recentMessage.text}
          userColor={userColor}
          position={[0, 1.2, 0]}
        />
      )}

      {/* Emote Placeholder (future) */}
      {currentEmote && (
        <group position={[0, 1.4, 0]}>
          <Html>
            <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
              {currentEmote === 'wave' && '👋'}
              {currentEmote === 'clap' && '👏'}
              {currentEmote === 'thumbs_up' && '👍'}
              {currentEmote === 'laugh' && '😂'}
              {currentEmote === 'heart' && '❤️'}
            </div>
          </Html>
        </group>
      )}
    </group>
  );
}