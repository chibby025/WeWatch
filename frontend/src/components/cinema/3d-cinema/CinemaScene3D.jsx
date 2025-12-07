import React, { useRef, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import CinemaTheater from './CinemaTheater';
import CinemaTheaterGLB from './CinemaTheaterGLB';
import SeatMarkers, { SeatMarkerInfo } from './SeatMarkers';
import { generateAllSeats, assignUserToSeat, getSeatByPosition } from './seatCalculator';
import AvatarManager from './avatars/AvatarManager';
import FirstPersonAvatar from './avatars/FirstPersonAvatar';
import { useGLTF } from '@react-three/drei';
import LocalEmoteNotification from './ui/LocalEmoteNotification';
import useEmoteSounds from '../../../hooks/useEmoteSounds';

/**
 * CinemaCamera - Handles camera movement and controls
 */
function CinemaCamera({
  userSeatPosition,
  initialRotation,
  onPositionUpdate,
  isViewLocked,
  currentUserEmote,
  userColor,
  seatData // ✅ ADD THIS
}) {
  const cameraRef = useRef();
  const { camera } = useThree();
  const controlsRef = useRef();

  // Seat view position (first-person view from user seat)
  const seatViewPosition = new THREE.Vector3(
    userSeatPosition[0],
    userSeatPosition[1], // Use exact Y position, don't add eye level
    userSeatPosition[2]
  );

  // Keyboard controls - different behavior for locked vs unlocked modes
  useEffect(() => {
    if (!controlsRef.current) return;

    const handleKeyDown = (event) => {
      const key = event.key.toLowerCase();
      const controls = controlsRef.current;
      
      if (isViewLocked) {
        // LOCKED MODE: Look around (shift lookAt target)
        const offset = new THREE.Vector3().subVectors(controls.target, camera.position);
        const currentDistance = offset.length();
        const horizontalStep = 2;
        const verticalStep = 1.5;

        if (key === 'arrowleft' || key === 'a') {
          offset.x -= horizontalStep;
          controls.target.copy(camera.position).add(offset.normalize().multiplyScalar(currentDistance));
          controls.update();
          //console.log('⬅️ Looking left');
        } else if (key === 'arrowright' || key === 'd') {
          offset.x += horizontalStep;
          controls.target.copy(camera.position).add(offset.normalize().multiplyScalar(currentDistance));
          controls.update();
          //console.log('➡️ Looking right');
        } else if (key === 'arrowup' || key === 'w') {
          offset.y += verticalStep;
          controls.target.copy(camera.position).add(offset.normalize().multiplyScalar(currentDistance));
          controls.update();
          //console.log('⬆️ Looking up');
        } else if (key === 'arrowdown' || key === 's') {
          offset.y -= verticalStep;
          controls.target.copy(camera.position).add(offset.normalize().multiplyScalar(currentDistance));
          controls.update();
          //console.log('⬇️ Looking down');
        }
      } else {
        // UNLOCKED MODE: Free movement and view snapping
        const moveSpeed = 1.5;
        const newPosition = camera.position.clone();
        
        // WASD - Move camera position
        if (key === 'w') {
          // Move forward (negative Z)
          newPosition.z -= moveSpeed;
          camera.position.copy(newPosition);
          controls.target.z -= moveSpeed;
          controls.update();
          //console.log('⬆️ Moving forward');
        } else if (key === 's') {
          // Move backward (positive Z)
          newPosition.z += moveSpeed;
          camera.position.copy(newPosition);
          controls.target.z += moveSpeed;
          controls.update();
          //console.log('⬇️ Moving backward');
        } else if (key === 'a') {
          // Move left (negative X)
          newPosition.x -= moveSpeed;
          camera.position.copy(newPosition);
          controls.target.x -= moveSpeed;
          controls.update();
          //console.log('⬅️ Moving left');
        } else if (key === 'd') {
          // Move right (positive X)
          newPosition.x += moveSpeed;
          camera.position.copy(newPosition);
          controls.target.x += moveSpeed;
          controls.update();
          //console.log('➡️ Moving right');
        } else if (key === 'q') {
          // Move up (positive Y)
          newPosition.y += moveSpeed;
          camera.position.copy(newPosition);
          controls.target.y += moveSpeed;
          controls.update();
          //console.log('⬆️ Moving up');
        } else if (key === 'e') {
          // Move down (negative Y)
          newPosition.y -= moveSpeed;
          camera.position.copy(newPosition);
          controls.target.y -= moveSpeed;
          controls.update();
          //console.log('⬇️ Moving down');
        }
        
        // Arrow keys - Pan view (look around)
        else if (key === 'arrowleft') {
          controls.target.x -= moveSpeed;
          controls.update();
          //console.log('👀 Looking left');
        } else if (key === 'arrowright') {
          controls.target.x += moveSpeed;
          controls.update();
          //console.log('👀 Looking right');
        } else if (key === 'arrowup') {
          controls.target.y += moveSpeed;
          controls.update();
          //console.log('👀 Looking up');
        } else if (key === 'arrowdown') {
          controls.target.y -= moveSpeed;
          controls.update();
          //console.log('👀 Looking down');
        }
        
        // Number keys - Snap to orthogonal views
        else if (key === '1') {
          // Front view (looking at negative Z)
          const pos = camera.position;
          controls.target.set(pos.x, pos.y, pos.z - 10);
          controls.update();
          //console.log('📐 Front view (Z-)');
        } else if (key === '2') {
          // Back view (looking at positive Z)
          const pos = camera.position;
          controls.target.set(pos.x, pos.y, pos.z + 10);
          controls.update();
          //console.log('📐 Back view (Z+)');
        } else if (key === '3') {
          // Left view (looking at negative X)
          const pos = camera.position;
          controls.target.set(pos.x - 10, pos.y, pos.z);
          controls.update();
          //console.log('📐 Left view (X-)');
        } else if (key === '4') {
          // Right view (looking at positive X)
          const pos = camera.position;
          controls.target.set(pos.x + 10, pos.y, pos.z);
          controls.update();
          //console.log('📐 Right view (X+)');
        } else if (key === '5') {
          // Top view (looking down at negative Y)
          const pos = camera.position;
          controls.target.set(pos.x, pos.y - 10, pos.z);
          controls.update();
          //console.log('📐 Top view (Y-)');
        } else if (key === '6') {
          // Bottom view (looking up at positive Y)
          const pos = camera.position;
          controls.target.set(pos.x, pos.y + 10, pos.z);
          controls.update();
          //console.log('📐 Bottom view (Y+)');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isViewLocked, camera]);

  // "L" key - Look left, "C" key - Look at screen, "R" key - Look right
  useEffect(() => {
    if (!controlsRef.current) return;

    const handleLookDirection = (event) => {
      const key = event.key.toLowerCase();
      if (!['l', 'r', 'c'].includes(key)) return;

      const controls = controlsRef.current;
      const presets = seatData?.viewPresets;
      if (!presets) {
        console.warn('⚠️ No viewPresets found in seatData', seatData);
        return;
      }

      let target;
      let directionName;
      if (key === 'l') {
        target = presets.lookLeft?.target;
        directionName = 'LEFT';
      } else if (key === 'r') {
        target = presets.lookRight?.target;
        directionName = 'RIGHT';
      } else if (key === 'c') {
        target = presets.lookCenter?.target;
        directionName = 'CENTER';
      }

      if (!target) {
        console.warn(`⚠️ Missing ${directionName} target in presets`, presets);
        return;
      }

      // 🔍 DEBUG LOGS
      const camPos = camera.position.toArray();
      const deltaX = target[0] - camPos[0];
      console.log(`[LOOK ${directionName}]`);
      console.log(`  Camera position: [${camPos.map(x => x.toFixed(2)).join(', ')}]`);
      console.log(`  Target: [${target.map(x => x.toFixed(2)).join(', ')}]`);
      console.log(`  Delta X (target - camera): ${deltaX.toFixed(2)}`);
      console.log(`  Interpretation: ${deltaX < 0 ? 'Target is LEFT of camera' : 'Target is RIGHT of camera'}`);

      controls.target.copy(new THREE.Vector3(...target));
      controls.update();
    };

    window.addEventListener('keydown', handleLookDirection);
    return () => window.removeEventListener('keydown', handleLookDirection);
  }, [seatData, camera]);

  // Reset camera position when view is locked (but preserve orientation)
  useEffect(() => {
    if (isViewLocked && camera) {
      // Only reset position, not the target/orientation
      camera.position.copy(seatViewPosition);
      if (controlsRef.current) {
        controlsRef.current.update();
      }
      //console.log('🔒 [CinemaCamera] View locked - position fixed, orientation preserved');
    }
  }, [isViewLocked, camera, seatViewPosition]);

  // Track camera position and direction in real-time
  useFrame(() => {
    if (camera && onPositionUpdate) {
      const pos = camera.position;
      
      // If view is locked, force camera to stay at seat position
      if (isViewLocked) {
        if (pos.distanceTo(seatViewPosition) > 0.01) {
          camera.position.copy(seatViewPosition);
        }
      }
      
      const rot = camera.rotation;
      
      // Calculate what direction camera is looking
      const direction = new THREE.Vector3(0, 0, -1);
      direction.applyQuaternion(camera.quaternion);
      
      onPositionUpdate({
        position: [pos.x.toFixed(2), pos.y.toFixed(2), pos.z.toFixed(2)],
        rotation: [
          (rot.x * 180 / Math.PI).toFixed(1), 
          (rot.y * 180 / Math.PI).toFixed(1), 
          (rot.z * 180 / Math.PI).toFixed(1)
        ],
        lookingAt: [direction.x.toFixed(2), direction.y.toFixed(2), direction.z.toFixed(2)]
      });
    }
  });

  return (
    <>
      <PerspectiveCamera
        ref={cameraRef}
        makeDefault
        position={seatViewPosition.toArray()}
        fov={75}
        near={0.1}
        far={1000}
      >
        {/* First-person avatar (visible to current user only) */}
        <FirstPersonAvatar
          userColor={userColor}
          currentEmote={currentUserEmote}
        />
      </PerspectiveCamera>
      {/* OrbitControls - locked mode prevents movement but allows looking around */}
      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.05}
        enablePan={!isViewLocked}        // Disable panning when locked
        enableZoom={true}                 // Allow zoom in both modes
        enableRotate={true}               // Always allow rotation (looking around)
        minDistance={2}
        maxDistance={30}
        minAzimuthAngle={-Infinity}      // Unlimited horizontal rotation left
        maxAzimuthAngle={Infinity}       // Unlimited horizontal rotation right
        minPolarAngle={isViewLocked ? Math.PI/2 - Math.PI/4 : 0}  // 45° up from horizon when locked
        maxPolarAngle={isViewLocked ? Math.PI/2 + Math.PI/4 : Math.PI}   // 45° down from horizon when locked
      />
    </>
  );
}

/**
 * DynamicLighting - Screen light and room lights that illuminate the theater
 */
function DynamicLighting({ screenRef, intensity = 1, lightsOn = false }) {
  const screenLightRef = useRef();
  const ceilingLightsRef = useRef([]);
  const wallLightsRef = useRef([]);
  const [color, setColor] = useState('#ffffff');

  console.log('💡 [DynamicLighting] Rendering with lightsOn:', lightsOn);

  useFrame(() => {
    if (screenLightRef.current) {
      // Position light at the screen
      screenLightRef.current.position.set(0, 4, -17);
      
      // Pulse effect for immersion
      const pulse = Math.sin(Date.now() * 0.001) * 0.2 + 0.8;
      screenLightRef.current.intensity = intensity * pulse;
    }

    // Smooth transition for room lights
    ceilingLightsRef.current.forEach((light, index) => {
      if (light) {
        const targetIntensity = lightsOn ? 4.0 : 0.1;
        const oldIntensity = light.intensity;
        light.intensity += (targetIntensity - light.intensity) * 0.05;
        
        // Log only when changing significantly
        if (Math.abs(light.intensity - oldIntensity) > 0.01 && index === 0) {
          //console.log('🔆 [DynamicLighting] Ceiling light intensity:', light.intensity.toFixed(2), 'Target:', targetIntensity);
        }
      }
    });

    wallLightsRef.current.forEach(light => {
      if (light) {
        const targetIntensity = lightsOn ? 2.5 : 0.05;
        light.intensity += (targetIntensity - light.intensity) * 0.05;
      }
    });
  });

  return (
    <>
      {/* Main screen light */}
      <pointLight
        ref={screenLightRef}
        position={[0, 4, -17]}
        intensity={intensity * 3}
        distance={25}
        decay={2}
        color={color}
        castShadow
      />
      
      {/* Ambient light for basic visibility - MUCH brighter when on */}
      <ambientLight intensity={lightsOn ? 0.8 : 0.05} />
      
      {/* Ceiling lights - row of 3 - MUCH brighter */}
      <pointLight 
        ref={el => ceilingLightsRef.current[0] = el}
        position={[0, 9.5, -5]} 
        intensity={lightsOn ? 4.0 : 0.1} 
        distance={25} 
        color="#ffe5b4"
        castShadow
      />
      <pointLight 
        ref={el => ceilingLightsRef.current[1] = el}
        position={[0, 9.5, 5]} 
        intensity={lightsOn ? 4.0 : 0.1} 
        distance={25} 
        color="#ffe5b4"
      />
      <pointLight 
        ref={el => ceilingLightsRef.current[2] = el}
        position={[0, 9.5, 12]} 
        intensity={lightsOn ? 4.0 : 0.1} 
        distance={25} 
        color="#ffe5b4"
      />

      {/* Wall sconce lights - left wall - BRIGHTER */}
      <pointLight 
        ref={el => wallLightsRef.current[0] = el}
        position={[-14, 6, -8]} 
        intensity={lightsOn ? 2.5 : 0.05} 
        distance={15} 
        color="#ffd4a3"
      />
      <pointLight 
        ref={el => wallLightsRef.current[1] = el}
        position={[-14, 6, 0]} 
        intensity={lightsOn ? 2.5 : 0.05} 
        distance={15} 
        color="#ffd4a3"
      />
      <pointLight 
        ref={el => wallLightsRef.current[2] = el}
        position={[-14, 6, 8]} 
        intensity={lightsOn ? 2.5 : 0.05} 
        distance={15} 
        color="#ffd4a3"
      />

      {/* Wall sconce lights - right wall - BRIGHTER */}
      <pointLight 
        ref={el => wallLightsRef.current[3] = el}
        position={[14, 6, -8]} 
        intensity={lightsOn ? 2.5 : 0.05} 
        distance={15} 
        color="#ffd4a3"
      />
      <pointLight 
        ref={el => wallLightsRef.current[4] = el}
        position={[14, 6, 0]} 
        intensity={lightsOn ? 2.5 : 0.05} 
        distance={15} 
        color="#ffd4a3"
      />
      <pointLight 
        ref={el => wallLightsRef.current[5] = el}
        position={[14, 6, 8]} 
        intensity={lightsOn ? 2.5 : 0.05} 
        distance={15} 
        color="#ffd4a3"
      />

      {/* Floor aisle lights - MORE visible */}
      <spotLight
        position={[0, 0.1, 2]}
        angle={0.3}
        penumbra={0.5}
        intensity={lightsOn ? 1.0 : 0.05}
        distance={5}
        color="#ff6b35"
      />
      <spotLight
        position={[0, 0.1, 10]}
        angle={0.3}
        penumbra={0.5}
        intensity={lightsOn ? 1.0 : 0.05}
        distance={5}
        color="#ff6b35"
      />
    </>
  );
}

/**
 * CinemaScene3D - Main 3D Cinema Component
 */
export default function CinemaScene3D({ 
  videoElement, 
  authenticatedUserID,
  onVideoTextureUpdate,
  hideLabelsForLocalViewer = false,
  onZoomComplete: onExternalZoomComplete,
  debugMode = false,
  onAvatarClick,
  useGLBModel = true,
  showPositionDebug = false,
  remoteParticipants = new Map(),
  currentUserSeat,
  showSeatMarkers = true,  // Toggle to show/hide seat position markers
  isViewLocked = true,     // View lock state (controlled by parent)
  setIsViewLocked,         // Function to update lock state
  lightsOn = true,         // Lights state (controlled by parent)
  setLightsOn,             // Function to update lights state
  roomMembers = [],        // Array of users in the room
  userSeats = {},          // ✅ Map of userId -> seatId for filtering avatars
  onEmoteReceived,         // WebSocket emote event handler
  onChatMessageReceived,   // WebSocket chat message event handler
  onEmoteSend,             // Function to send emote via WebSocket
  triggerLocalEmoteRef     // Ref to expose function for triggering local emotes
}) {
  const screenRef = useRef();
  const theaterRef = useRef();
  const [currentCameraPos, setCurrentCameraPos] = useState({ 
    position: [0, 0, 0], 
    rotation: [0, 0, 0],
    lookingAt: [0, 0, 0]
  });
  const [currentUserEmote, setCurrentUserEmote] = useState(null); // Current user's active emote
  const [localEmoteNotifications, setLocalEmoteNotifications] = useState([]); // Array of {id, emote} for 2D overlay

  // Initialize emote sounds
  const { playEmoteSound, preloadAllSounds } = useEmoteSounds();

  // Preload all sounds on mount
  useEffect(() => {
    preloadAllSounds();
  }, [preloadAllSounds]);

  // Expose function to trigger local emote notifications via ref
  useEffect(() => {
    if (triggerLocalEmoteRef) {
      triggerLocalEmoteRef.current = (emote) => {
        // console.log('🎨 [CinemaScene3D] triggerLocalEmote called with:', emote);
        const emoteId = Date.now();
        setLocalEmoteNotifications(prev => {
          // console.log('📝 [CinemaScene3D] Adding local notification via ref');
          return [...prev, { id: emoteId, emote }];
        });
        
        // Play emote sound
        playEmoteSound(emote, 0.6);
      };
    }
  }, [triggerLocalEmoteRef, playEmoteSound]);

  // GLB model position - center of the cinema box
  const glbModelPosition = [66, 2, 25];
  
  // 🔥 Dynamically assign seat based on currentUserSeatId or fallback to user ID
  const assignedSeat = currentUserSeat || {
    id: 1,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    cameraPosition: [0, 1.6, 0],
    label: "Default",
    isPremium: false
  };
  
  //console.log('👤 [CinemaScene3D] User assigned to seat:', assignedSeat);
  // Use camera position (offset from avatar) for first-person view
  const cameraStartPosition = assignedSeat.cameraPosition;
  const cameraStartRotation = assignedSeat.rotation;

  // Keyboard emote listeners (1-5 keys)
  useEffect(() => {
    const handleEmoteKey = (e) => {
      // console.log('🔑 [CinemaScene3D] Key pressed:', e.key, 'Target:', e.target.tagName);
      
      // Don't trigger if typing in an input/textarea
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        // console.log('⚠️ [CinemaScene3D] Ignoring key in input/textarea');
        return;
      }

      // Map keys to emotes
      const emoteMap = {
        '1': 'wave',
        '2': 'clap',
        '3': 'thumbs_up',
        '4': 'laugh',
        '5': 'heart',
      };

      const emote = emoteMap[e.key];
      if (emote) {
        // console.log('👋 [CinemaScene3D] Sending emote:', emote);
        // console.log('📍 [CinemaScene3D] Current localEmoteNotifications:', localEmoteNotifications.length);
        
        // Show local 2D emote overlay for current user
        const emoteId = Date.now();
        setLocalEmoteNotifications(prev => {
          // console.log('📝 [CinemaScene3D] Adding emote notification:', { id: emoteId, emote });
          return [...prev, { id: emoteId, emote }];
        });
        
        // Play emote sound
        playEmoteSound(emote, 0.6);
        
        // Set local emote for first-person avatar (if needed for any other purpose)
        setCurrentUserEmote(emote);
        setTimeout(() => setCurrentUserEmote(null), 2500); // Clear after 2.5 seconds
        
        // Broadcast to other users
        if (onEmoteSend) {
          onEmoteSend({
            user_id: authenticatedUserID,
            emote: emote,
            seat_id: assignedSeat.id,
            timestamp: Date.now(),
          });
        }
      }
      // else {
      //   console.log('🚫 [CinemaScene3D] Key not mapped to emote:', e.key);
      // }
    };

    // console.log('🎯 [CinemaScene3D] Attaching emote keyboard listener');
    window.addEventListener('keydown', handleEmoteKey);
    return () => {
      // console.log('🗑️ [CinemaScene3D] Removing emote keyboard listener');
      window.removeEventListener('keydown', handleEmoteKey);
    };
  }, [authenticatedUserID, assignedSeat.id, onEmoteSend, localEmoteNotifications, playEmoteSound]);

  // Handle camera position updates
  const handlePositionUpdate = (posData) => {
    setCurrentCameraPos(posData);
  };

  // Calculate current user's avatar color (same logic as UserAvatar)
  const currentUserColor = React.useMemo(() => {
    if (assignedSeat.isPremium) {
      return '#DAA520'; // Darker gold for premium
    }
    
    const hash = authenticatedUserID.toString().split('').reduce((acc, char) => {
      return char.charCodeAt(0) + ((acc << 5) - acc);
    }, 0);
    
    const hue = Math.abs(hash % 360);
    return `hsl(${hue}, 65%, 50%)`; // Darker color
  }, [authenticatedUserID, assignedSeat.isPremium]);

  // Replace the static cameraStartPosition/cameraStartRotation lines with:
  const [activeCameraPosition, setActiveCameraPosition] = useState(cameraStartPosition);
  const [activeCameraRotation, setActiveCameraRotation] = useState(cameraStartRotation);

  // Add effect to update camera when assigned seat changes
  useEffect(() => {
    setActiveCameraPosition(assignedSeat.cameraPosition);
    setActiveCameraRotation(assignedSeat.rotation);
    console.log('🔄 [CinemaScene3D] Camera updated to seat:', assignedSeat.id);
  }, [assignedSeat]);

  return (
    <div className="relative w-full h-screen bg-black">
      {/* 3D Canvas */}
      <div className="absolute inset-0">
        <Canvas
          shadows={false}
          gl={{ 
            antialias: true, 
            alpha: false,
            powerPreference: 'high-performance'
          }}
        >
          {/* Camera positioned INSIDE the cinema box */}
          <CinemaCamera 
            userSeatPosition={activeCameraPosition}   // ✅
            initialRotation={activeCameraRotation}
            onPositionUpdate={handlePositionUpdate}
            isViewLocked={isViewLocked}
            currentUserEmote={currentUserEmote}
            userColor={currentUserColor}
            seatData={assignedSeat}
          />

          {/* Dynamic lighting - toggle between bright and dark */}
          <ambientLight intensity={lightsOn ? 3 : 0.5} />
          
          {/* Ceiling lights - white when on, blue when off */}
          <pointLight 
            position={[0, 10, -5]} 
            intensity={lightsOn ? 4 : 8} 
            distance={30} 
            color={lightsOn ? "#ffffff" : "#1e90ff"}
            castShadow={false}
          />
          <pointLight 
            position={[0, 10, 5]} 
            intensity={lightsOn ? 4 : 8} 
            distance={30} 
            color={lightsOn ? "#ffffff" : "#1e90ff"}
            castShadow={false}
          />
          <pointLight 
            position={[0, 10, 12]} 
            intensity={lightsOn ? 4 : 8} 
            distance={30} 
            color={lightsOn ? "#ffffff" : "#1e90ff"}
            castShadow={false}
          />
          
          {/* Additional directional lighting */}
          <directionalLight position={[0, 10, 0]} intensity={lightsOn ? 3 : 0.5} castShadow={false} color={lightsOn ? "#ffffff" : "#4169e1"} />
          <directionalLight position={[0, -10, 0]} intensity={lightsOn ? 2 : 0.3} castShadow={false} />
          
          {/* Corner fill lights */}
          <pointLight position={[10, 5, 10]} intensity={lightsOn ? 3 : 1} distance={100} color={lightsOn ? "#ffffff" : "#4682b4"} />
          <pointLight position={[-10, 5, 10]} intensity={lightsOn ? 3 : 1} distance={100} color={lightsOn ? "#ffffff" : "#4682b4"} />
          <pointLight position={[10, 5, -10]} intensity={lightsOn ? 3 : 1} distance={100} color={lightsOn ? "#ffffff" : "#4682b4"} />
          <pointLight position={[-10, 5, -10]} intensity={lightsOn ? 3 : 1} distance={100} color={lightsOn ? "#ffffff" : "#4682b4"} />
          <pointLight position={[0, 5, 0]} intensity={lightsOn ? 4 : 1.5} distance={100} color={lightsOn ? "#ffffff" : "#5a9fd4"} />

          {/* Blue ambient wall lights - always on, more visible when main lights off */}
          {/* Left wall blue lights */}
          <pointLight 
            position={[-14, 4, -10]} 
            intensity={lightsOn ? 0.5 : 1.5} 
            distance={20} 
            color="#4a90e2"
          />
          <pointLight 
            position={[-14, 4, 0]} 
            intensity={lightsOn ? 0.5 : 1.5} 
            distance={20} 
            color="#4a90e2"
          />
          <pointLight 
            position={[-14, 4, 10]} 
            intensity={lightsOn ? 0.5 : 1.5} 
            distance={20} 
            color="#4a90e2"
          />
          
          {/* Right wall blue lights */}
          <pointLight 
            position={[14, 4, -10]} 
            intensity={lightsOn ? 0.5 : 1.5} 
            distance={20} 
            color="#4a90e2"
          />
          <pointLight 
            position={[14, 4, 0]} 
            intensity={lightsOn ? 0.5 : 1.5} 
            distance={20} 
            color="#4a90e2"
          />
          <pointLight 
            position={[14, 4, 10]} 
            intensity={lightsOn ? 0.5 : 1.5} 
            distance={20} 
            color="#4a90e2"
          />

          {/* Back wall blue lights */}
          <pointLight 
            position={[-10, 4, 15]} 
            intensity={lightsOn ? 0.5 : 1.2} 
            distance={18} 
            color="#5a9fd4"
          />
          <pointLight 
            position={[0, 4, 15]} 
            intensity={lightsOn ? 0.5 : 1.2} 
            distance={18} 
            color="#5a9fd4"
          />
          <pointLight 
            position={[10, 4, 15]} 
            intensity={lightsOn ? 0.5 : 1.2} 
            distance={18} 
            color="#5a9fd4"
          />

          {/* GLB Cinema Model */}
          <CinemaTheaterGLB position={glbModelPosition} videoElement={videoElement} onVideoTextureUpdate={onVideoTextureUpdate} />

          {/* User Avatars */}
          {!hideLabelsForLocalViewer && (
            <AvatarManager
              roomMembers={roomMembers}
              userSeats={userSeats} // ✅ Pass seat assignments for filtering
              currentUserId={authenticatedUserID}
              onEmoteReceived={onEmoteReceived}
              onAvatarClick={onAvatarClick}
              onChatMessageReceived={onChatMessageReceived}
              remoteParticipants={remoteParticipants}
              hideLabelsForLocalViewer={hideLabelsForLocalViewer}
            />
          )}

          {/* Seat position markers (visual verification) */}
          {showSeatMarkers && <SeatMarkers showLabels={true} />}

          {/* Helpers to understand the space */}
          <gridHelper args={[50, 50, '#444444', '#222222']} position={[0, 0, 0]} />
          <axesHelper args={[10]} />
        </Canvas>
      </div>

      {/* Seat marker info panel */}
      {showSeatMarkers && <SeatMarkerInfo />}

      {/* Info overlay */}
      {showPositionDebug && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 text-white text-sm bg-black bg-opacity-50 px-4 py-2 rounded">
          Exploring GLB Cinema - Seat #{assignedSeat.id} ({assignedSeat.label})
        </div>
      )}

      {/* Position debug info */}
      {showPositionDebug && (
        <div className="absolute bottom-4 left-4 bg-black bg-opacity-75 text-white p-3 rounded text-xs font-mono max-w-md">
          <div className="font-bold text-green-400 mb-2">📍 CURRENT POSITION</div>
          <div className="bg-green-900 bg-opacity-30 p-2 rounded mb-2">
            <div className="text-green-300">Position: [{currentCameraPos.position.join(', ')}]</div>
            <div className="text-blue-300">Rotation: [{currentCameraPos.rotation.join(', ')}]°</div>
            <div className="text-purple-300">Looking At: [{currentCameraPos.lookingAt?.join(', ') || '0, 0, 0'}]</div>
          </div>
          <div className="text-gray-400 text-[10px] mb-2">
            ▶ Move to a good seat position, then copy the Position & Rotation values
          </div>
          <div className="border-t border-gray-600 pt-2 mt-2">
            <div className="text-yellow-300">Assigned Seat: #{assignedSeat.id} {assignedSeat.isPremium ? '⭐' : ''}</div>
            <div className="text-gray-300 text-[10px]">{assignedSeat.label}</div>
            <div className="text-gray-300 mt-1">Start Pos: [{cameraStartPosition.join(', ')}]</div>
            <div className="text-gray-300">Start Rot: [{cameraStartRotation.join(', ')}]°</div>
          </div>
          <div className="mt-2 text-yellow-400 text-[10px]">
            🟢 Green markers = All seats • 🟡 Gold = Premium
          </div>
        </div>
      )}

      {/* Local Emote Notifications (2D overlay for current user) */}
      {localEmoteNotifications.map(notification => (
        <LocalEmoteNotification
          key={notification.id}
          emote={notification.emote}
          onComplete={() => {
            setLocalEmoteNotifications(prev => 
              prev.filter(n => n.id !== notification.id)
            );
          }}
        />
      ))}
    </div>
  );
}