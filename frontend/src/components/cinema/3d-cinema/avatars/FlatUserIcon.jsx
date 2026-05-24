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
 * - Audio-reactive orb with cascading green ripples
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
  onClick,
  isSpeaking = false,
  audioLevel = 0, // 🎵 Audio level from LiveKit (0.0 to 1.0)
  lectureHallScale = 1, // 🎯 Scale multiplier for lecture hall (default 1 for cinema)
  isHost = false, // 🎯 Host flag for special rendering
  showChatBubbles = true, // 🎯 User preference for chat bubble visibility (default: ON)
}) {
  const groupRef = useRef();
  const planeRef = useRef();
  const [svgTexture, setSvgTexture] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const orbRef = useRef();
  const [isPulsing, setIsPulsing] = useState(false);
  
  // 🌊 Cascading ripple ring pool (2 bright white rings for cinema visibility)
  const ripple1Ref = useRef();
  const ripple2Ref = useRef();

  // 🔍 DEBUG: Log when component mounts and updates - DISABLED FOR PERFORMANCE
  // useEffect(() => {
  //   console.log('🎯 [FlatUserIcon] Component mounted/updated:', {
  //     userId,
  //     username,
  //     seatPosition,
  //     lectureHallScale,
  //     isHost,
  //     groupRefExists: !!groupRef.current
  //   });
  //   return () => {
  //     console.log('💀 [FlatUserIcon] Component unmounting:', { userId, username });
  //   };
  // }, [userId, username, seatPosition, lectureHallScale, isHost]);

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
  const finalScale = rowScale * lectureHallScale; // 🎯 Apply lecture hall scale multiplier

  // 🔍 DEBUG: Log actual scale being applied - DISABLED FOR PERFORMANCE
  // React.useEffect(() => {
  //   console.log(`📏 [FlatUserIcon] Scale calculation for ${username}:`, {
  //     lectureHallScale,
  //     rowNumber,
  //     baseScale,
  //     rowScale: rowScale.toFixed(3),
  //     finalScale: finalScale.toFixed(3),
  //     isHost
  //   });
  // }, [username, lectureHallScale, rowNumber, finalScale, isHost]);


  // ✅ Hide username label when chat bubble is showing (username is already in bubble)
  // ✅ Removed isHovered - username only shows on activity (emotes/speaking), not hover
  const showLabel = isActiveTimed && !hideLabelsForLocalViewer && !recentMessage;

  // 🐛 DEBUG: Log chat bubble state changes
  useEffect(() => {
    if (recentMessage) {
      console.log(`💬 [FlatUserIcon ${username}] Chat bubble ACTIVE:`, {
        text: recentMessage.text,
        username: recentMessage.username,
        color: recentMessage.color,
        showLabel,
        position: seatPosition
      });
    } else {
      // ⚠️ PERFORMANCE: Commented out to reduce logging overhead
      // console.log(`💬 [FlatUserIcon ${username}] Chat bubble INACTIVE, showLabel:`, showLabel);
    }
  }, [recentMessage, showLabel, username, seatPosition]);

  // 🎵 Audio-reactive orb animation
  useEffect(() => {
    setIsPulsing(!!isSpeaking);
  }, [isSpeaking]);

  // 🌊 Animate cascading ripples with audio levels (scale-based — no geometry allocation)
  useFrame(({ camera }) => {
    if (isSpeaking && ripple1Ref.current && ripple2Ref.current) {
      const time = Date.now() * 0.001;
      const level = audioLevel || 0.5;
      const speedMultiplier = 0.8 + level * 0.4;

      // Ring 1: base geometry radius 0.02, grows to 0.07 → maxScale 3.5
      // Ring 2: base geometry radius 0.07, grows to 0.12 → maxScale ~1.71
      const ripples = [
        { ref: ripple1Ref, maxScale: 3.5,  delay: 0.0 },
        { ref: ripple2Ref, maxScale: 1.714, delay: 0.5 },
      ];

      const cycleDuration = 1.5;

      ripples.forEach(({ ref, maxScale, delay }) => {
        const progress = ((time * speedMultiplier + delay) % cycleDuration) / cycleDuration;
        const s = 1 + progress * (maxScale - 1);
        ref.current.scale.set(s, s, 1);

        const fadeStart = 0.8;
        const fade = progress < fadeStart ? 1.0 : 1.0 - (progress - fadeStart) / (1.0 - fadeStart);
        ref.current.material.opacity = fade * Math.max(level, 0.8);

        ref.current.lookAt(camera.position);
      });
    } else if (ripple1Ref.current && ripple2Ref.current) {
      ripple1Ref.current.material.opacity = 0;
      ripple2Ref.current.material.opacity = 0;
    }
  });

  // console.log('🎨 [FlatUserIcon] Rendering JSX for:', username, 'at position:', seatPosition, 'scale:', finalScale);

  return (
    <group
      ref={groupRef}
      position={seatPosition}
      scale={[finalScale, finalScale, finalScale]}
    >
      {/* MAIN AVATAR PLANE - Black Silhouette SVG */}
      <mesh
        ref={planeRef}
        position={[0, 0, 0]}
        onPointerOver={() => onHover?.(userId)}
        onPointerOut={() => onHover?.(null)}
        onClick={onClick}
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
      <meshBasicMaterial color={userColor} />
    </mesh>

    {/* 🌊 RIPPLE 1 - Inner ring (0.02 → 0.07) ⚪ WHITE FOR VISIBILITY */}
    <mesh ref={ripple1Ref} position={[0, 0.08, 0.01]}>
      <ringGeometry args={[0.02, 0.022, 32]} />
      <meshBasicMaterial
        color="#ffffff"
        transparent
        opacity={0}
        side={THREE.DoubleSide}
      />
    </mesh>

    {/* 🌊 RIPPLE 2 - Outer ring (0.07 → 0.12) ⚪ WHITE FOR VISIBILITY */}
    <mesh ref={ripple2Ref} position={[0, 0.08, 0.01]}>
      <ringGeometry args={[0.07, 0.072, 32]} />
      <meshBasicMaterial
        color="#ffffff"
        transparent
        opacity={0}
        side={THREE.DoubleSide}
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
          isSpeaking={isSpeaking}
        />
      )}

      {/* Chat Bubble */}
      {recentMessage && showChatBubbles && (
        <ChatBubble
          message={recentMessage.text}
          username={recentMessage.username || username} // ✅ Use username from message data
          color={recentMessage.color || userColor} // ✅ Use color from message data
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