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
  speechStyle = 'pulse', // 'pulse' = lecture hall sonar ring | 'glow' = cinema orb brightness
}) {
  const groupRef = useRef();
  const planeRef = useRef();
  const [svgTexture, setSvgTexture] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const orbRef = useRef();
  const [isPulsing, setIsPulsing] = useState(false);
  const auraRef = useRef();

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

  // Extract hue + saturation from userColor for per-frame lightness animation
  // Returns null for hex colors (host/premium) — those stay static
  const orbBaseHSL = React.useMemo(() => {
    const match = userColor.match(/hsl\((\d+\.?\d*),\s*(\d+)%/);
    if (!match) return null;
    return { h: parseFloat(match[1]), s: parseInt(match[2]) };
  }, [userColor]);

  // Dim version of orb color for cinema glow mode resting state (30% lightness)
  const dimColor = React.useMemo(() => {
    if (speechStyle !== 'glow' || !orbBaseHSL) return userColor;
    return `hsl(${orbBaseHSL.h}, ${orbBaseHSL.s}%, 30%)`;
  }, [speechStyle, orbBaseHSL, userColor]);

  // Pulse ring color — same hue source, mapped into 220°–280° (blue→purple arc)
  const pulseColor = React.useMemo(() => {
    const hash = userId.toString().split('').reduce((acc, char) => {
      return char.charCodeAt(0) + ((acc << 5) - acc);
    }, 0);
    const hue = Math.abs(hash) % 360;
    const mappedHue = 220 + (hue / 360) * 60;
    return `hsl(${mappedHue}, 75%, 65%)`;
  }, [userId]);

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

  // Speech indicator — branches on speechStyle
  useFrame(({ camera }) => {
    const t = Date.now() * 0.001;

    if (speechStyle === 'glow') {
      // Cinema: orb dims to 30% at rest, brightens to 85% when speaking — no ring
      if (orbRef.current && orbBaseHSL) {
        const lightness = isSpeaking ? 30 + audioLevel * 55 : 30;
        orbRef.current.material.color.setStyle(`hsl(${orbBaseHSL.h}, ${orbBaseHSL.s}%, ${lightness}%)`);
      }
    } else {
      // Lecture hall pulse: orb lightness 50%→85%, sonar ping ring
      if (orbRef.current && orbBaseHSL) {
        const lightness = isSpeaking ? 50 + audioLevel * 35 : 50;
        orbRef.current.material.color.setStyle(`hsl(${orbBaseHSL.h}, ${orbBaseHSL.s}%, ${lightness}%)`);
      }
      if (auraRef.current) {
        // audioLevel > 0.01 guard prevents ghost ring when muted mid-speech
        if (isSpeaking && audioLevel > 0.01) {
          const level = Math.max(audioLevel, 0.1);
          const progress = (t % 2.8) / 2.8;
          auraRef.current.scale.setScalar(1 + progress * 2.5);
          auraRef.current.material.opacity = 0.55 * (1 - progress) * level;
          auraRef.current.lookAt(camera.position);
        } else {
          auraRef.current.scale.setScalar(1);
          auraRef.current.material.opacity = 0;
        }
      }
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

    {/* GLOWING DOT - inside avatar's head; dimColor sets correct resting brightness per mode */}
    <mesh ref={orbRef} position={[0, 0.08, 0.01]}>
      <sphereGeometry args={[0.02, 12, 12]} />
      <meshBasicMaterial color={dimColor} />
    </mesh>

    {/* SONAR PING — pulse mode only (lecture hall) */}
    {speechStyle === 'pulse' && (
      <mesh ref={auraRef} position={[0, 0.08, 0.005]}>
        <ringGeometry args={[0.022, 0.032, 32]} />
        <meshBasicMaterial color={pulseColor} transparent opacity={0} side={THREE.DoubleSide} />
      </mesh>
    )}

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