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

  // Floating animation (disabled for lecture hall to match position markers)
  useFrame((state) => {
    if (!groupRef.current) return;
    // Position exactly at seat position, no extra height or floating
    groupRef.current.position.y = seatPosition[1];
  });

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

  // 🎶 Animate orb and ripples with audio levels
  useFrame(({ camera }) => {
    if (orbRef.current) {
      // 💡 Orb stays constant size, subtle emissive glow
      orbRef.current.material.emissiveIntensity = 0.2;
      orbRef.current.scale.set(1, 1, 1); // ✅ Constant size
    }

    // 🌊 Ripple animations (only when speaking)
    if (isSpeaking && ripple1Ref.current && ripple2Ref.current) {
      const time = Date.now() * 0.001; // Time in seconds
      const level = audioLevel || 0.3; // Base audio level (0.0 to 1.0)
      
      // 🎵 Speed increases with audio intensity
      const speedMultiplier = 1.0 + (level * 2.0); // 1.0x to 3.0x speed
      
      // 🌊 Ripple 1 animation (first wave)
      const ripple1Phase = (time * speedMultiplier) % 2; // 0 to 2 seconds loop
      const ripple1Scale = 1.0 + (ripple1Phase * level * 1.0); // Expands 1x to 3x based on audio (max 3x orb size = 0.06)
      const ripple1Opacity = Math.max(0, 1.0 - (ripple1Phase / 2)); // Fade out as it expands
      
      ripple1Ref.current.scale.set(ripple1Scale, ripple1Scale, 1);
      ripple1Ref.current.material.opacity = ripple1Opacity * 0.6; // Max 60% opacity
      
      // 🌊 Ripple 2 animation (second wave, delayed by 0.5s)
      const ripple2Phase = ((time * speedMultiplier) + 1.0) % 2; // Offset by 1 second
      const ripple2Scale = 1.0 + (ripple2Phase * level * 1.0); // Expands 1x to 3x based on audio
      const ripple2Opacity = Math.max(0, 1.0 - (ripple2Phase / 2));
      
      ripple2Ref.current.scale.set(ripple2Scale, ripple2Scale, 1);
      ripple2Ref.current.material.opacity = ripple2Opacity * 0.5; // Max 50% opacity (slightly dimmer)
      
      // 📐 Billboard ripples toward camera
      ripple1Ref.current.lookAt(camera.position);
      ripple2Ref.current.lookAt(camera.position);
    } else if (ripple1Ref.current && ripple2Ref.current) {
      // Hide ripples when not speaking
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
      frustumCulled={false}
    >
      {/* MAIN AVATAR PLANE - Black Silhouette SVG */}
      <mesh
        ref={planeRef}
        position={[0, 0, 0]}
        onPointerOver={() => onHover?.(userId)}
        onPointerOut={() => onHover?.(null)}
        onClick={onClick} 
        frustumCulled={false}
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

    {/* 🌊 RIPPLE 1 - First expanding ring (only visible when speaking) */}
    <mesh ref={ripple1Ref} position={[0, 0.08, 0.01]}>
      <ringGeometry args={[0.01, 0.011, 32]} />
      <meshBasicMaterial
        color={userColor}
        transparent
        opacity={0}
        side={THREE.DoubleSide}
      />
    </mesh>

    {/* 🌊 RIPPLE 2 - Second expanding ring (delayed, only visible when speaking) */}
    <mesh ref={ripple2Ref} position={[0, 0.08, 0.01]}>
      <ringGeometry args={[0.01, 0.011, 32]} />
      <meshBasicMaterial
        color={userColor}
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