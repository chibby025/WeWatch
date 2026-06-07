import React, { useRef, useState, useEffect, forwardRef, useImperativeHandle, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import CinemaTheaterGLB from './CinemaTheaterGLB';
import SeatMarkers, { SeatMarkerInfo } from './SeatMarkers';
import SeatPositionMarkers from './SeatPositionMarkers'; // 🎯 New: Visual markers for seat positions
import { generateAllSeats, assignUserToSeat, getSeatByPosition } from './seatCalculator';
import CinemaAvatarManager from './avatars/CinemaAvatarManager';
import FirstPersonAvatar from './avatars/FirstPersonAvatar';
import { useGLTF } from '@react-three/drei';
import LocalEmoteNotification from './ui/LocalEmoteNotification';
import useEmoteSounds from '../../../hooks/useEmoteSounds';

// 🚀 PHASE 2: Preload cinema model for instant loading
useGLTF.preload('/models/cinema.glb');

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
  seatData, // ✅ ADD THIS
  onControlsReady, // ✅ ADD THIS - callback to expose controls ref
  onCameraMove, // 🎯 NEW: Callback for Position Calculator
  cameraLookAt, // ✅ NEW: LookAt target from cinemaSeats.json center view
  isChatActive, // 🚫 Disable keyboard bindings when chat is open
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
  
  // ✅ Initial lookAt target from cinemaSeats.json center view
  const initialLookAtTarget = cameraLookAt || [0, 3, 0];

  // Keyboard controls - different behavior for locked vs unlocked modes
  useEffect(() => {
    if (!controlsRef.current) return;

    const handleKeyDown = (event) => {
      // 🚫 Don't trigger camera controls when chat is open
      if (isChatActive) return;
      
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
        const moveSpeed = 0.3; // 🎯 Reduced for finer control in smaller cinema space
        const newPosition = camera.position.clone();
        
        // WASD - Move camera position
        if (key === 'w') {
          // Move forward (negative Z)
          newPosition.z -= moveSpeed;
          camera.position.copy(newPosition);
          controls.target.z -= moveSpeed;
          controls.update();
          // 🎯 Report position to Position Calculator
          if (onCameraMove) {
            onCameraMove(
              [camera.position.x, camera.position.y, camera.position.z],
              [controls.target.x, controls.target.y, controls.target.z]
            );
          }
          //console.log('⬆️ Moving forward');
        } else if (key === 's') {
          // Move backward (positive Z)
          newPosition.z += moveSpeed;
          camera.position.copy(newPosition);
          controls.target.z += moveSpeed;
          controls.update();
          // 🎯 Report position to Position Calculator
          if (onCameraMove) {
            onCameraMove(
              [camera.position.x, camera.position.y, camera.position.z],
              [controls.target.x, controls.target.y, controls.target.z]
            );
          }
          //console.log('⬇️ Moving backward');
        } else if (key === 'a') {
          // Move left (negative X)
          newPosition.x -= moveSpeed;
          camera.position.copy(newPosition);
          controls.target.x -= moveSpeed;
          controls.update();
          // 🎯 Report position to Position Calculator
          if (onCameraMove) {
            onCameraMove(
              [camera.position.x, camera.position.y, camera.position.z],
              [controls.target.x, controls.target.y, controls.target.z]
            );
          }
          //console.log('⬅️ Moving left');
        } else if (key === 'd') {
          // Move right (positive X)
          newPosition.x += moveSpeed;
          camera.position.copy(newPosition);
          controls.target.x += moveSpeed;
          controls.update();
          // 🎯 Report position to Position Calculator
          if (onCameraMove) {
            onCameraMove(
              [camera.position.x, camera.position.y, camera.position.z],
              [controls.target.x, controls.target.y, controls.target.z]
            );
          }
          //console.log('➡️ Moving right');
        } else if (key === 'c') {
          // Move up (positive Y)
          newPosition.y += moveSpeed;
          camera.position.copy(newPosition);
          controls.target.y += moveSpeed;
          controls.update();
          // 🎯 Report position to Position Calculator
          if (onCameraMove) {
            onCameraMove(
              [camera.position.x, camera.position.y, camera.position.z],
              [controls.target.x, controls.target.y, controls.target.z]
            );
          }
          //console.log('⬆️ Moving up');
        } else if (key === 'v') {
          // Move down (negative Y)
          newPosition.y -= moveSpeed;
          camera.position.copy(newPosition);
          controls.target.y -= moveSpeed;
          controls.update();
          // 🎯 Report position to Position Calculator
          if (onCameraMove) {
            onCameraMove(
              [camera.position.x, camera.position.y, camera.position.z],
              [controls.target.x, controls.target.y, controls.target.z]
            );
          }
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
  }, [isViewLocked, camera, onCameraMove, isChatActive]);

  // "L" key - Look left, "C" key - Look at screen, "R" key - Look right
  useEffect(() => {
    if (!controlsRef.current) return;

    const handleLookDirection = (event) => {
      // 🚫 Don't trigger camera controls when chat is open
      if (isChatActive) return;
      
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
  }, [seatData, camera, isChatActive]);

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

  // 🚀 PHASE 2: Track camera position and trigger re-render only when position changes
  const lastPositionRef = useRef(new THREE.Vector3());
  const lastRotationRef = useRef(new THREE.Euler());
  
  useFrame(({ invalidate }) => {
    if (camera && onPositionUpdate) {
      const pos = camera.position;
      
      // If view is locked, force camera to stay at seat position
      if (isViewLocked) {
        if (pos.distanceTo(seatViewPosition) > 0.01) {
          camera.position.copy(seatViewPosition);
          invalidate(); // 🚀 Trigger re-render when camera moved
        }
      }
      
      const rot = camera.rotation;
      
      // 🚀 Only update if position or rotation changed significantly
      const posChanged = pos.distanceTo(lastPositionRef.current) > 0.01;
      const rotChanged = Math.abs(rot.x - lastRotationRef.current.x) > 0.01 || 
                         Math.abs(rot.y - lastRotationRef.current.y) > 0.01;
      
      if (posChanged || rotChanged) {
        lastPositionRef.current.copy(pos);
        lastRotationRef.current.copy(rot);
        invalidate(); // 🚀 Trigger re-render when camera moved
        
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
    }
    
    // 🎯 Continuously update Position Calculator with camera position + lookAt target
    if (camera && controlsRef.current && onCameraMove) {
      const controls = controlsRef.current;
      onCameraMove(
        [camera.position.x, camera.position.y, camera.position.z],
        [controls.target.x, controls.target.y, controls.target.z]
      );
    }
  });

  // Expose controls ref to parent via callback
  useEffect(() => {
    if (controlsRef.current && onControlsReady) {
      onControlsReady(controlsRef);
    }
  }, [onControlsReady]);
  
  // ✅ Initialize OrbitControls target with lookAt from cinemaSeats.json
  useEffect(() => {
    if (controlsRef.current && initialLookAtTarget) {
      controlsRef.current.target.set(
        initialLookAtTarget[0],
        initialLookAtTarget[1],
        initialLookAtTarget[2]
      );
      controlsRef.current.update();
      console.log('📹 [CinemaCamera] Initialized lookAt target:', initialLookAtTarget);
    }
  }, [initialLookAtTarget]);

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
        minAzimuthAngle={-Infinity}      // Unlimited horizontal rotation (full 360°)
        maxAzimuthAngle={Infinity}       // Unlimited horizontal rotation (full 360°)
        minPolarAngle={0}                // Full vertical rotation (can look all the way up)
        maxPolarAngle={Math.PI}          // Full vertical rotation (can look all the way down)
      />
    </>
  );
}

/**
 * DynamicLighting - Screen light and room lights that illuminate the theater
 */
function DynamicLighting({ screenRef, intensity = 1, lightsOn = false, darknessLevel = 'regular' }) {
  const screenLightRef = useRef();
  const ceilingLightsRef = useRef([]);
  const wallLightsRef = useRef([]);
  const [color, setColor] = useState('#ffffff');

  // 🚀 PHASE 2: Only trigger re-render when lights actually change
  useFrame(({ invalidate }) => {
    let needsUpdate = false;
    
    if (screenLightRef.current) {
      // Position light at the screen
      screenLightRef.current.position.set(0, 4, -17);
      
      // Pulse effect for immersion
      const pulse = Math.sin(Date.now() * 0.001) * 0.2 + 0.8;
      const newIntensity = intensity * pulse;
      if (Math.abs(screenLightRef.current.intensity - newIntensity) > 0.01) {
        screenLightRef.current.intensity = newIntensity;
        needsUpdate = true;
      }
    }

    // Smooth transition for room lights
    ceilingLightsRef.current.forEach((light) => {
      if (light) {
        const targetIntensity = lightsOn ? 4.0 : 0.1;
        const oldIntensity = light.intensity;
        const newIntensity = light.intensity + (targetIntensity - light.intensity) * 0.05;
        
        if (Math.abs(newIntensity - oldIntensity) > 0.01) {
          light.intensity = newIntensity;
          needsUpdate = true;
        }
      }
    });

    wallLightsRef.current.forEach(light => {
      if (light) {
        const targetIntensity = lightsOn ? 2.5 : 0.05;
        const oldIntensity = light.intensity;
        const newIntensity = light.intensity + (targetIntensity - light.intensity) * 0.05;
        
        if (Math.abs(newIntensity - oldIntensity) > 0.01) {
          light.intensity = newIntensity;
          needsUpdate = true;
        }
      }
    });
    
    if (needsUpdate) {
      invalidate(); // 🚀 Only trigger re-render when lights changed
    }
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
const CinemaScene3D = forwardRef(({ 
  videoElement, 
  cameraVideoElement,
  gameCanvas, // ✅ NEW: Game canvas for texture
  liveShareMode,
  authenticatedUserID,
  onVideoTextureUpdate,
  podcastCanvas, // 🎙️ Canvas with podcast overlays
  hideLabelsForLocalViewer = false,
  onZoomComplete,
  debugMode = false,
  onAvatarClick,
  useGLBModel = true,
  showPositionDebug = false,
  remoteParticipants = new Map(),
  currentUserSeat,
  showSeatMarkers = true,  // Toggle to show/hide seat position markers
  cinemaSeats = { seats: [] }, // 🎯 Seat position data from JSON
  isViewLocked = true,     // View lock state (controlled by parent)
  setIsViewLocked,         // Function to update lock state
  lightsOn = true,         // Lights state (controlled by parent)
  darknessLevel = 'regular', // ✅ Darkness level: 'regular' | 'extreme'
  setLightsOn,             // Function to update lights state
  roomMembers = [],        // Array of users in the room
  userSeats = {},          // ✅ Map of userId -> seatId for filtering avatars
  onEmoteReceived,         // WebSocket emote event handler
  onChatMessageReceived,   // WebSocket chat message event handler
  onEmoteSend,             // Function to send emote via WebSocket
  triggerLocalEmoteRef,    // Ref to expose function for triggering local emotes
  isMobile = false,        // 📱 Mobile device flag
  isChatActive = false,    // 🚫 Disable keyboard bindings when chat is open
  onCameraMove,            // 🎯 Position Calculator callback
  onScreenClick,           // 🎬 Click handler for 3D screen to trigger fullscreen
  showChatBubbles = true,  // 💬 User preference for chat bubble visibility
  activeSpeakers = new Map(), // 🎤 Active speakers for ripple animation
}, ref) => {
  const screenRef = useRef();
  const theaterRef = useRef();
  const controlsRef = useRef(); // 📱 Store controls ref for triggerViewPreset
  const [currentCameraPos, setCurrentCameraPos] = useState({
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    lookingAt: [0, 0, 0]
  });

  // Pause the render loop when the tab is hidden — zero GPU/battery drain when user switches apps.
  const [isTabVisible, setIsTabVisible] = useState(true);
  useEffect(() => {
    const handleVisibility = () => setIsTabVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);
  const [currentUserEmote, setCurrentUserEmote] = useState(null); // Current user's active emote
  const [localEmoteNotifications, setLocalEmoteNotifications] = useState([]); // Array of {id, emote} for 2D overlay

  // Initialize emote sounds
  const { playEmoteSound, preloadAllSounds } = useEmoteSounds();

  // Preload all sounds on mount
  useEffect(() => {
    preloadAllSounds();
  }, [preloadAllSounds]);

  // 📱 Expose triggerViewPreset and setCameraView functions to parent via ref
  useImperativeHandle(ref, () => ({
    triggerViewPreset: (direction) => {
      const seatData = assignedSeat;
      const presets = seatData?.viewPresets;
      
      if (!presets) {
        console.warn('⚠️ [CinemaScene3D] No viewPresets found in seatData');
        return;
      }

      let target;
      if (direction === 'lookLeft') {
        target = presets.lookLeft?.target;
      } else if (direction === 'lookRight') {
        target = presets.lookRight?.target;
      } else if (direction === 'lookCenter') {
        target = presets.lookCenter?.target;
      }

      if (!target) {
        console.warn(`⚠️ [CinemaScene3D] Missing ${direction} target in presets`);
        return;
      }

      if (controlsRef.current) {
        controlsRef.current.target.copy(new THREE.Vector3(...target));
        controlsRef.current.update();
        console.log(`📱 [CinemaScene3D] View preset triggered: ${direction}`);
      }
    },
    
    // 🎬 NEW: Set camera to specific position and lookAt target
    setCameraView: (position, lookAt) => {
      if (controlsRef.current && controlsRef.current.object) {
        const camera = controlsRef.current.object;
        
        // Set camera position
        camera.position.set(position[0], position[1], position[2]);
        
        // Set lookAt target
        controlsRef.current.target.set(lookAt[0], lookAt[1], lookAt[2]);
        
        // Update controls
        controlsRef.current.update();
        
        console.log('🎬 [CinemaScene3D] Camera view set:', {
          position: position,
          lookAt: lookAt
        });
      } else {
        console.warn('⚠️ [CinemaScene3D] Controls not ready for setCameraView');
      }
    }
  }));

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
  
  // ✅ Use currentUserSeat from useSeatController (includes cinemaSeats.json camera views)
  const assignedSeat = currentUserSeat || {
    id: 1,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    cameraPosition: [0, 1.6, 0],
    cameraLookAt: [0, 3, 0],
    label: "Default",
    isPremium: false
  };
  
  //console.log('👤 [CinemaScene3D] User assigned to seat:', assignedSeat);
  // ✅ Use camera position and lookAt from cinemaSeats.json center view
  const cameraStartPosition = assignedSeat.cameraPosition;
  const cameraStartLookAt = assignedSeat.cameraLookAt || [0, 3, 0];
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
      
      // 🚫 Don't trigger emotes when chat is open
      if (isChatActive) return;

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
  }, [authenticatedUserID, assignedSeat.id, onEmoteSend, localEmoteNotifications, playEmoteSound, isChatActive]);

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

  // ✅ Use assignedSeat directly to prevent camera jump on initial load
  const activeCameraPosition = assignedSeat.cameraPosition;
  const activeCameraRotation = assignedSeat.rotation;

  // Row 1 = front (screen side), row 6 = back. Users cannot see rows behind them.
  // Default to 6 so all avatars render when seat data hasn't loaded yet.
  const currentUserRow = assignedSeat.row ?? 6;

  // Log only when seat actually changes (not on every render)
  const prevSeatIdRef = useRef(assignedSeat.id);
  useEffect(() => {
    if (prevSeatIdRef.current !== assignedSeat.id) {
      console.log('🔄 [CinemaScene3D] Camera updated to seat:', assignedSeat.id);
      prevSeatIdRef.current = assignedSeat.id;
    }
  }, [assignedSeat.id]);

  return (
    <div className="relative w-full h-screen bg-black overflow-hidden">
      {/* 3D Canvas */}
      <div className="absolute inset-0">
        <Canvas
          shadows={false}
          frameloop={isTabVisible ? 'always' : 'demand'}
          gl={{
            antialias: true,
            alpha: false,
            powerPreference: 'high-performance',
          }}
          flat
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
            cameraLookAt={assignedSeat.cameraLookAt} // ✅ Pass lookAt target from JSON
            onControlsReady={(ref) => { controlsRef.current = ref.current; }}
            onCameraMove={onCameraMove} // 🎯 Pass callback for Position Calculator
            isChatActive={isChatActive} // 🚫 Pass chat state to disable keyboard controls
          />

          {/* Dynamic lighting - toggle between bright and dark */}
          {/* Helper to get darkness intensity: regular (original values) vs extreme (new values) */}
          {(() => {
            const getDarkIntensity = (regular, extreme) => {
              if (lightsOn) return null; // Not used when lights are on
              return darknessLevel === 'extreme' ? extreme : regular;
            };
            const ambientDark = getDarkIntensity(0.5, 0.02);
            const ceilingDark = getDarkIntensity(8, 0.03);
            const wallDark = getDarkIntensity(1.5, 0.02);
            const pathwayDark = getDarkIntensity(1.2, 0.03);
            
            return (
              <>
                <ambientLight intensity={lightsOn ? 1.0 : ambientDark} />
                
                {/* Ceiling lights - white when on, blue when off */}
                <pointLight 
                  position={[0, 10, -5]} 
                  intensity={lightsOn ? 5.5 : ceilingDark} 
                  distance={30} 
                  color={lightsOn ? "#ffffff" : "#1e90ff"}
                  castShadow={false}
                />
                <pointLight 
                  position={[0, 10, 5]} 
                  intensity={lightsOn ? 5.5 : ceilingDark} 
                  distance={30} 
                  color={lightsOn ? "#ffffff" : "#1e90ff"}
                  castShadow={false}
                />
                <pointLight 
                  position={[0, 10, 12]} 
                  intensity={lightsOn ? 5.5 : ceilingDark} 
                  distance={30} 
                  color={lightsOn ? "#ffffff" : "#1e90ff"}
                  castShadow={false}
                />
          
          {/* Additional directional lighting */}
          <directionalLight position={[0, 10, 0]} intensity={lightsOn ? 1.0 : 0.02} castShadow={false} color={lightsOn ? "#ffffff" : "#4169e1"} />
          <directionalLight position={[0, -10, 0]} intensity={lightsOn ? 1.0 : 0.02} castShadow={false} />
          
          {/* Corner fill lights */}
          <pointLight position={[10, 5, 10]} intensity={lightsOn ? 3.2 : 1.2} distance={100} color={lightsOn ? "#ffffff" : "#4682b4"} />
          <pointLight position={[-10, 5, 10]} intensity={lightsOn ? 3.2 : 1.2} distance={100} color={lightsOn ? "#ffffff" : "#4682b4"} />
          <pointLight position={[10, 5, -10]} intensity={lightsOn ? 3.2 : 1.2} distance={100} color={lightsOn ? "#ffffff" : "#4682b4"} />
          <pointLight position={[-10, 5, -10]} intensity={lightsOn ? 3.2 : 1.2} distance={100} color={lightsOn ? "#ffffff" : "#4682b4"} />
          <pointLight position={[0, 5, 0]} intensity={lightsOn ? 3.2 : 1.5} distance={100} color={lightsOn ? "#ffffff" : "#5a9fd4"} />

                {/* Blue ambient wall lights - always on, more visible when main lights off */}
                {/* Left wall blue lights */}
                <pointLight 
                  position={[-14, 4, -10]} 
                  intensity={lightsOn ? 3.2 : wallDark} 
                  distance={20} 
                  color="#4a90e2"
                />
                <pointLight 
                  position={[-14, 4, 0]} 
                  intensity={lightsOn ? 3.2 : wallDark} 
                  distance={20} 
                  color="#4a90e2"
                />
                <pointLight 
                  position={[-14, 4, 10]} 
                  intensity={lightsOn ? 3.2 : wallDark} 
                  distance={20} 
                  color="#4a90e2"
                />
                
                {/* Right wall blue lights */}
                <pointLight 
                  position={[14, 4, -10]} 
                  intensity={lightsOn ? 3.2 : wallDark} 
                  distance={20} 
                  color="#4a90e2"
                />
                <pointLight 
                  position={[14, 4, 0]} 
                  intensity={lightsOn ? 3.2 : wallDark} 
                  distance={20} 
                  color="#4a90e2"
                />
                <pointLight 
                  position={[14, 4, 10]} 
                  intensity={lightsOn ? 3.2 : wallDark} 
                  distance={20} 
                  color="#4a90e2"
                />

                {/* Back wall blue lights */}
                <pointLight 
                  position={[-10, 4, 15]} 
                  intensity={lightsOn ? 1.3 : pathwayDark} 
                  distance={18} 
                  color="#5a9fd4"
                />
                <pointLight 
                  position={[0, 4, 15]} 
                  intensity={lightsOn ? 1.3 : pathwayDark} 
                  distance={18} 
                  color="#5a9fd4"
                />
                <pointLight 
                  position={[10, 4, 15]} 
                  intensity={lightsOn ? 1.3 : pathwayDark} 
                  distance={18} 
                  color="#5a9fd4"
                />
              </>
            );
          })()}

          {/* GLB Cinema Model */}
          <CinemaTheaterGLB 
            position={glbModelPosition} 
            videoElement={videoElement}
            cameraVideoElement={cameraVideoElement}
            gameCanvas={gameCanvas} // ✅ NEW: Game canvas for texture
            podcastCanvas={podcastCanvas} // 🎙️ Podcast canvas with overlays
            liveShareMode={liveShareMode}
            onVideoTextureUpdate={onVideoTextureUpdate}
            onScreenClick={onScreenClick}
          />

          {/* User Avatars */}
          {!hideLabelsForLocalViewer && (() => {
            const realMembers = roomMembers.filter(m => !m.id.toString().startsWith('demo'));
            const realSeats = Object.keys(userSeats).filter(k => !k.startsWith('demo'));
            // Reduced spam: only log member/seat count, not every frame
            return (
              <CinemaAvatarManager
                roomMembers={roomMembers}
                userSeats={userSeats} // ✅ Pass seat assignments for filtering
                currentUserId={authenticatedUserID}
                onEmoteReceived={onEmoteReceived}
                onAvatarClick={onAvatarClick}
                onChatMessageReceived={onChatMessageReceived}
                remoteParticipants={remoteParticipants}
                hideLabelsForLocalViewer={hideLabelsForLocalViewer}
                cinemaSeats={cinemaSeats} // ✅ Pass cinemaSeats.json for accurate positioning
                showChatBubbles={showChatBubbles} // 💬 User preference for chat bubble visibility
                activeSpeakers={activeSpeakers} // 🎤 Pass active speakers for ripple animation
                maxRow={currentUserRow} // Only render avatars in rows the user can see
              />
            );
          })()}

          {/* Seat position markers (visual verification) */}
          {showSeatMarkers && <SeatPositionMarkers seats={cinemaSeats.seats} visible={showSeatMarkers} />}

          {/* Helpers to understand the space - only rendered when position debug is active */}
          {showPositionDebug && <gridHelper args={[50, 50, '#444444', '#222222']} position={[0, 0, 0]} />}
          {showPositionDebug && <axesHelper args={[10]} />}
        </Canvas>
      </div>

      {/* Legend for seat markers */}
      {showSeatMarkers && (
        <div className="absolute top-4 right-4 bg-black/80 text-white p-3 rounded-lg text-xs font-mono">
          <div className="font-bold mb-2">🎯 Seat Position Markers</div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{backgroundColor: '#ff6b6b'}}></div>
              <span>Row 1 (Front)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{backgroundColor: '#4ecdc4'}}></div>
              <span>Row 2</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{backgroundColor: '#45b7d1'}}></div>
              <span>Row 3</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{backgroundColor: '#ffa07a'}}></div>
              <span>Row 4</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{backgroundColor: '#98d8c8'}}></div>
              <span>Row 5</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full" style={{backgroundColor: '#c77dff'}}></div>
              <span>Row 6 (Back)</span>
            </div>
          </div>
          <div className="mt-2 pt-2 border-t border-gray-600 text-[10px] text-gray-400">
            Press <kbd className="bg-gray-700 px-1 py-0.5 rounded">M</kbd> to toggle
          </div>
        </div>
      )}

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
});

// Add display name for better debugging
CinemaScene3D.displayName = 'CinemaScene3D';

export default CinemaScene3D;