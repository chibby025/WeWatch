import React, { useRef, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { generateLectureHallSeats, setLectureHallMirror, getLectureHallMirror } from './seatCalculator';
import AvatarManager from './avatars/AvatarManager';
import FirstPersonAvatar from './avatars/FirstPersonAvatar';
import LocalEmoteNotification from './ui/LocalEmoteNotification';
import useEmoteSounds from '../../../hooks/useEmoteSounds';

/**
 * LectureHallModel - Loads and displays the lecture hall GLB
 */
function LectureHallModel({ position = [0, 0, 0] }) {
  const { scene } = useGLTF('/models/lecture_hall.glb');
  
  // Hide unwanted meshes
  useEffect(() => {
    if (scene) {
      const hiddenMeshes = ['walls_black_0', 'walls_screen_0'];
      scene.traverse((child) => {
        if (child.isMesh && hiddenMeshes.includes(child.name)) {
          child.visible = false;
          console.log(`🚫 Hidden mesh: ${child.name}`);
        }
      });
    }
  }, [scene]);
  
  return (
    <primitive 
      object={scene} 
      position={position}
      scale={1}
    />
  );
}

/**
 * LectureHallCamera - Handles camera movement and controls
 */
function LectureHallCamera({
  userSeatPosition,
  initialRotation,
  onPositionUpdate,
  isViewLocked,
  currentUserEmote,
  userColor,
  seatData,
  currentUser
}) {
  const cameraRef = useRef();
  const { camera } = useThree();
  const controlsRef = useRef();
  const lastLoggedPosition = useRef(null);
  const lastLoggedTarget = useRef(null);

  // Use calibrated camera position from JSON if available
  const calibratedPosition = seatData?.id && lectureHallCameraPositions[seatData.id]?.position;
  const cameraPosition = calibratedPosition 
    ? new THREE.Vector3(calibratedPosition.x, calibratedPosition.y, calibratedPosition.z)
    : new THREE.Vector3(userSeatPosition[0], userSeatPosition[1], userSeatPosition[2]);

  // Seat view position (first-person view from user seat)
  const seatViewPosition = cameraPosition;

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
        const horizontalStep = 3;
        const verticalStep = 2;

        if (key === 'arrowleft' || key === 'a') {
          offset.x -= horizontalStep;
          controls.target.copy(camera.position).add(offset.normalize().multiplyScalar(currentDistance));
          controls.update();
        } else if (key === 'arrowright' || key === 'd') {
          offset.x += horizontalStep;
          controls.target.copy(camera.position).add(offset.normalize().multiplyScalar(currentDistance));
          controls.update();
        } else if (key === 'arrowup' || key === 'w') {
          offset.y += verticalStep;
          controls.target.copy(camera.position).add(offset.normalize().multiplyScalar(currentDistance));
          controls.update();
        } else if (key === 'arrowdown' || key === 's') {
          offset.y -= verticalStep;
          controls.target.copy(camera.position).add(offset.normalize().multiplyScalar(currentDistance));
          controls.update();
        }
      } else {
        // UNLOCKED MODE: Free movement
        const moveSpeed = 2;
        const newPosition = camera.position.clone();
        const newTarget = controls.target.clone();
        
        if (key === 'w') {
          newPosition.z += moveSpeed;
          newTarget.z += moveSpeed;
          camera.position.copy(newPosition);
          controls.target.copy(newTarget);
          console.log(`⌨️ [KEY W] Cam: X: ${camera.position.x.toFixed(3)}, Y: ${camera.position.y.toFixed(3)}, Z: ${camera.position.z.toFixed(3)} | Target: X: ${controls.target.x.toFixed(3)}, Y: ${controls.target.y.toFixed(3)}, Z: ${controls.target.z.toFixed(3)}`);
          controls.update();
        } else if (key === 's') {
          newPosition.z -= moveSpeed;
          newTarget.z -= moveSpeed;
          camera.position.copy(newPosition);
          controls.target.copy(newTarget);
          console.log(`⌨️ [KEY S] Cam: X: ${camera.position.x.toFixed(3)}, Y: ${camera.position.y.toFixed(3)}, Z: ${camera.position.z.toFixed(3)} | Target: X: ${controls.target.x.toFixed(3)}, Y: ${controls.target.y.toFixed(3)}, Z: ${controls.target.z.toFixed(3)}`);
          controls.update();
        } else if (key === 'a') {
          newPosition.x -= moveSpeed;
          newTarget.x -= moveSpeed;
          camera.position.copy(newPosition);
          controls.target.copy(newTarget);
          controls.update();
        } else if (key === 'd') {
          newPosition.x += moveSpeed;
          newTarget.x += moveSpeed;
          camera.position.copy(newPosition);
          controls.target.copy(newTarget);
          controls.update();
        } else if (key === 'c') {
          // Move down (C key)
          newPosition.y -= moveSpeed;
          newTarget.y -= moveSpeed;
          camera.position.copy(newPosition);
          controls.target.copy(newTarget);
          controls.update();
        } else if (key === 'v') {
          // Move up (V key)
          newPosition.y += moveSpeed;
          newTarget.y += moveSpeed;
          camera.position.copy(newPosition);
          controls.target.copy(newTarget);
          controls.update();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [camera, isViewLocked]);

  // Reset camera position when view is locked
  useEffect(() => {
    if (isViewLocked && camera) {
      camera.position.copy(seatViewPosition);
      
      const currentPos = `${camera.position.x.toFixed(3)},${camera.position.y.toFixed(3)},${camera.position.z.toFixed(3)}`;
      if (lastLoggedPosition.current !== currentPos) {
        console.log(`🎥 [LOAD] Camera reset to: X: ${camera.position.x.toFixed(3)}, Y: ${camera.position.y.toFixed(3)}, Z: ${camera.position.z.toFixed(3)}`);
        lastLoggedPosition.current = currentPos;
      }
      
      if (controlsRef.current) {
        // Update target to look at seat's designated target (blackboard for students, students for host)
        const targetPos = seatData?.lookAtTarget || [seatViewPosition.x, seatViewPosition.y, seatViewPosition.z + 10];
        controlsRef.current.target.set(
          targetPos[0],
          targetPos[1],
          targetPos[2]
        );
        
        const currentTarget = `${controlsRef.current.target.x.toFixed(3)},${controlsRef.current.target.y.toFixed(3)},${controlsRef.current.target.z.toFixed(3)}`;
        if (lastLoggedTarget.current !== currentTarget) {
          console.log(`🎯 [LOAD] Target set to: X: ${controlsRef.current.target.x.toFixed(3)}, Y: ${controlsRef.current.target.y.toFixed(3)}, Z: ${controlsRef.current.target.z.toFixed(3)}`);
          lastLoggedTarget.current = currentTarget;
        }
        
        controlsRef.current.update();
      }
    }
  }, [isViewLocked, camera, seatViewPosition]);

  // Track camera position in real-time
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
      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.05}
        enablePan={!isViewLocked}
        enableRotate={!isViewLocked}
        enableZoom={!isViewLocked}
        minDistance={isViewLocked ? 0 : 1}
        maxDistance={isViewLocked ? 0 : 500}
        target={[
          seatViewPosition.x, 
          seatViewPosition.y, 
          seatViewPosition.z + 10
        ]}
      />
    </>
  );
}

/**
 * SeatMarkers - Visual spheres showing seat positions (for debugging)
 */
function SeatMarkers({ showLabels = false }) {
  const seats = generateLectureHallSeats();
  
  return (
    <group>
      {seats.map(seat => {
        // Color code by column: Red (Col1), Green (Col2), Blue (Col3), Gold (Host)
        let color = '#00ff00';
        if (seat.isHost) {
          color = '#ffd700'; // Gold for host
        } else if (seat.column === 1) {
          color = '#ff0000'; // Red for column 1
        } else if (seat.column === 2) {
          color = '#00ff00'; // Green for column 2
        } else if (seat.column === 3) {
          color = '#0000ff'; // Blue for column 3
        }
        
        return (
          <mesh key={seat.id} position={seat.position}>
            <sphereGeometry args={[seat.isHost ? 1 : 0.5, 16, 16]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
          </mesh>
        );
      })}
    </group>
  );
}

/**
 * CameraMarkers - Visual spheres showing calculated camera positions (for debugging)
 */
function CameraMarkers({ showLabels = false }) {
  const seats = generateLectureHallSeats();
  
  return (
    <group>
      {seats.map(seat => {
        // Camera markers in cyan/pink to distinguish from avatar markers
        let color = seat.isHost ? '#ff00ff' : '#00ffff'; // Pink for host, Cyan for students
        
        return (
          <mesh key={`camera-${seat.id}`} position={seat.cameraPosition}>
            <boxGeometry args={[seat.isHost ? 1.5 : 0.8, seat.isHost ? 1.5 : 0.8, seat.isHost ? 1.5 : 0.8]} />
            <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.7} wireframe={true} />
          </mesh>
        );
      })}
    </group>
  );
}


/**
 * LectureHallScene3D - Main 3D Lecture Hall Component
 */
export default function LectureHallScene3D({ 
  authenticatedUserID,
  hideLabelsForLocalViewer = false,
  debugMode = false,
  onAvatarClick,
  showPositionDebug = false,
  remoteParticipants = new Map(),
  currentUserSeat,
  showSeatMarkers = false,
  showCameraMarkers = false,
  isViewLocked = true,
  setIsViewLocked,
  lightsOn = true,
  setLightsOn,
  roomMembers = [],
  userSeats = {},
  onEmoteReceived,
  onChatMessageReceived,
  onEmoteSend,
  triggerLocalEmoteRef,
  onPositionUpdate
}) {
  const [currentCameraPos, setCurrentCameraPos] = useState({ 
    position: [0, 0, 0], 
    rotation: [0, 0, 0],
    lookingAt: [0, 0, 0]
  });
  const [currentUserEmote, setCurrentUserEmote] = useState(null);
  const [localEmoteNotifications, setLocalEmoteNotifications] = useState([]);

  // Initialize emote sounds
  const { playEmoteSound, preloadAllSounds } = useEmoteSounds();

  useEffect(() => {
    preloadAllSounds();
  }, [preloadAllSounds]);

  // Expose function to trigger local emote notifications
  useEffect(() => {
    if (triggerLocalEmoteRef) {
      triggerLocalEmoteRef.current = (emote) => {
        const emoteId = Date.now();
        setLocalEmoteNotifications(prev => [...prev, { id: emoteId, emote }]);
        playEmoteSound(emote, 0.6);
      };
    }
  }, [triggerLocalEmoteRef, playEmoteSound]);

  // --- Dev mirror toggles (quick on-screen controls) ---
  const [mirrorX, setMirrorX] = useState(false);
  const [mirrorZ, setMirrorZ] = useState(false);
  const [mirrorKey, setMirrorKey] = useState(0);

  useEffect(() => {
    try {
      const m = getLectureHallMirror();
      setMirrorX(Boolean(m.mirrorX));
      setMirrorZ(Boolean(m.mirrorZ));
    } catch (e) {}
  }, []);

  const toggleMirrorX = () => {
    const next = !mirrorX;
    setLectureHallMirror({ mirrorX: next, mirrorZ });
    setMirrorX(next);
    setMirrorKey(k => k + 1);
  };

  const toggleMirrorZ = () => {
    const next = !mirrorZ;
    setLectureHallMirror({ mirrorX, mirrorZ: next });
    setMirrorZ(next);
    setMirrorKey(k => k + 1);
  };

  // Assign seat (use provided seat or fallback to default)
  const assignedSeat = currentUserSeat || {
    id: 1,
    position: [0, 30, -100],
    rotation: [0, 0, 0],
    cameraPosition: [0, 32, -92],
    label: "Default Seat 1",
    isHost: false
  };

  const [activeCameraPosition, setActiveCameraPosition] = useState(assignedSeat.cameraPosition);
  const [activeCameraRotation, setActiveCameraRotation] = useState(assignedSeat.rotation);

  // Update camera when seat changes
  useEffect(() => {
    if (assignedSeat.cameraPosition) {
      setActiveCameraPosition(assignedSeat.cameraPosition);
    }
    if (assignedSeat.rotation) {
      setActiveCameraRotation(assignedSeat.rotation);
    }
    console.log('🎓 [LectureHallScene3D] Camera updated to seat:', assignedSeat.id);
  }, [assignedSeat]);

  // Handle camera position updates
  const handlePositionUpdate = (posData) => {
    setCurrentCameraPos(posData);
    if (onPositionUpdate) {
      onPositionUpdate(posData);
    }
  };

  // Calculate user color
  const currentUserColor = React.useMemo(() => {
    if (assignedSeat.isHost) {
      return '#ffd700'; // Gold for host/teacher
    }
    
    const hash = authenticatedUserID.toString().split('').reduce((acc, char) => {
      return char.charCodeAt(0) + ((acc << 5) - acc);
    }, 0);
    
    const hue = Math.abs(hash % 360);
    return `hsl(${hue}, 65%, 50%)`;
  }, [authenticatedUserID, assignedSeat.isHost]);

  // Keyboard controls: WASD+CV for camera movement, 1-5 for emotes
  useEffect(() => {
    const handleEmoteKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }

      const emoteMap = {
        '1': '👍',
        '2': '❤️',
        '3': '😂',
        '4': '😮',
        '5': '👏'
      };

      const emote = emoteMap[e.key];
      if (emote) {
        console.log(`🎭 [LectureHallScene3D] Emote ${emote} triggered by key ${e.key}`);
        
        // Show local emote
        setCurrentUserEmote(emote);
        setTimeout(() => setCurrentUserEmote(null), 2000);
        
        // Add to notification queue (prevent duplicates within 100ms)
        const now = Date.now();
        const recentDupe = localEmoteNotifications.find(
          n => n.emote === emote && (now - n.id) < 100
        );
        
        if (!recentDupe) {
          setLocalEmoteNotifications(prev => [...prev, { id: now, emote }]);
        }
        
        // Play sound
        playEmoteSound(emote, 0.6);
        
        // Send to server via WebSocket
        if (onEmoteSend && assignedSeat.id) {
          onEmoteSend(emote, assignedSeat.id, authenticatedUserID);
        }
      }
    };

    window.addEventListener('keydown', handleEmoteKey);
    return () => window.removeEventListener('keydown', handleEmoteKey);
  }, [authenticatedUserID, assignedSeat.id, onEmoteSend, localEmoteNotifications, playEmoteSound]);
  // WASD+CV keyboard controls for camera movement (testing)
  useEffect(() => {
    const moveSpeed = 0.5;
    const keysPressed = {};

    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
        return;
      }
      keysPressed[e.key.toLowerCase()] = true;
    };

    const handleKeyUp = (e) => {
      keysPressed[e.key.toLowerCase()] = false;
    };

    const moveCamera = () => {
      // This will be handled by OrbitControls ref in the Canvas
      // For now, we'll update the camera position state
      const keysToCheck = ['w', 'a', 's', 'd', 'c', 'v'];
      const anyKeyPressed = keysToCheck.some(key => keysPressed[key]);
      
      if (anyKeyPressed) {
        // Signal that camera is being manually controlled
        // The actual movement will be handled by the controls
        setIsViewLocked(false);
      }
    };

    const interval = setInterval(moveCamera, 50);

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    return () => {
      clearInterval(interval);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [setIsViewLocked]);
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
          key={`lecture-canvas-${mirrorX ? 1 : 0}-${mirrorZ ? 1 : 0}-${mirrorKey}`}
        >
          <LectureHallCamera 
            userSeatPosition={activeCameraPosition}
            initialRotation={activeCameraRotation}
            onPositionUpdate={handlePositionUpdate}
            isViewLocked={isViewLocked}
            currentUserEmote={currentUserEmote}
            userColor={currentUserColor}
            seatData={assignedSeat}
            currentUser={authenticatedUserID}
            intensity={lightsOn ? 100 : 30} 
            distance={200} 
            color={lightsOn ? "#ffffff" : "#87ceeb"}
          />
          <pointLight 
            position={[0, 100, -250]} 
            intensity={lightsOn ? 100 : 30} 
            distance={200} 
            color={lightsOn ? "#ffffff" : "#87ceeb"}
          />
          <pointLight 
            position={[0, 100, -350]} 
            intensity={lightsOn ? 100 : 30} 
            distance={200} 
            color={lightsOn ? "#ffffff" : "#87ceeb"}
          />
          
          {/* Side lighting for better depth perception */}
          <pointLight position={[-100, 80, -200]} intensity={lightsOn ? 80 : 20} distance={250} color="#f0f8ff" />
          <pointLight position={[100, 80, -200]} intensity={lightsOn ? 80 : 20} distance={250} color="#f0f8ff" />
          
          {/* Front podium spotlight */}
          <spotLight
            position={[0, 80, -230]}
            angle={0.4}
            penumbra={0.5}
            intensity={lightsOn ? 60 : 15}
            distance={100}
            target-position={[0, 20, -230]}
            color="#fffacd"
          />
          
          {/* Directional lights for overall illumination */}
          <directionalLight position={[50, 100, -100]} intensity={lightsOn ? 2 : 0.5} color="#ffffff" />
          <directionalLight position={[-50, 100, -100]} intensity={lightsOn ? 2 : 0.5} color="#ffffff" />

          {/* Lecture Hall Model */}
          <LectureHallModel position={[0, 0, 0]} />
          
          {/* Custom Centered Whiteboard - 120 wide × 60 tall */}
          <mesh position={[0, 65, -238]} rotation={[0, 0, 0]}>
            <planeGeometry args={[120, 60]} />
            <meshStandardMaterial 
              color="#f5f5f5" 
              emissive="#ffffff" 
              emissiveIntensity={0.3}
              side={2}
            />
          </mesh>
          
          {/* Whiteboard Frame/Border */}
          <mesh position={[0, 65, -238.1]} rotation={[0, 0, 0]}>
            <boxGeometry args={[126, 66, 0.5]} />
            <meshStandardMaterial color="#2d2d2d" />
          </mesh>

          {/* User Avatars */}
          {!hideLabelsForLocalViewer && (
            <AvatarManager
              roomMembers={roomMembers}
              userSeats={userSeats}
              currentUserId={authenticatedUserID}
              onEmoteReceived={onEmoteReceived}
              onAvatarClick={onAvatarClick}
              onChatMessageReceived={onChatMessageReceived}
              remoteParticipants={remoteParticipants}
              hideLabelsForLocalViewer={hideLabelsForLocalViewer}
            />
          )}

          {/* Seat position markers (for debugging/validation) */}
          {showSeatMarkers && <SeatMarkers showLabels={true} />}
          
          {/* Camera position markers (for debugging/validation) */}
          {showCameraMarkers && <CameraMarkers showLabels={true} />}

          {/* Debug helpers */}
          {debugMode && (
            <>
              <gridHelper args={[500, 50, '#444444', '#222222']} position={[0, 0, -200]} />
              <axesHelper args={[50]} />
            </>
          )}
          
          {/* Camera LookAt Target Indicator (always show for debugging) */}
          {assignedSeat?.lookAtTarget && (
            <mesh position={assignedSeat.lookAtTarget}>
              <sphereGeometry args={[2, 16, 16]} />
              <meshStandardMaterial color="#00ff00" emissive="#00ff00" emissiveIntensity={0.5} />
            </mesh>
          )}
          
          {/* Whiteboard Center Position Indicator (red sphere) */}
          <mesh position={[0, 65, -238]}>
            <sphereGeometry args={[3, 16, 16]} />
            <meshStandardMaterial color="#ff0000" emissive="#ff0000" emissiveIntensity={0.8} />
          </mesh>
        </Canvas>
      </div>

        {/* Dev mirror toggle panel */}
        <div className="absolute top-4 right-4 bg-black bg-opacity-60 text-white p-2 rounded text-xs z-50">
          <div className="font-semibold text-sm mb-1">DEV: Mirror</div>
          <label className="flex items-center space-x-2">
            <input type="checkbox" checked={mirrorX} onChange={toggleMirrorX} />
            <span>Mirror X</span>
          </label>
          <label className="flex items-center space-x-2 mt-1">
            <input type="checkbox" checked={mirrorZ} onChange={toggleMirrorZ} />
            <span>Mirror Z</span>
          </label>
          <div className="text-[10px] text-gray-300 mt-2">Center: x=0 z=-238</div>
        </div>

      {/* Info overlay */}
      {showPositionDebug && (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 text-white text-sm bg-black bg-opacity-50 px-4 py-2 rounded">
          🎓 Lecture Hall - Seat #{assignedSeat.id} {assignedSeat.isHost ? '(Host)' : `(Row ${assignedSeat.row}, Col ${assignedSeat.column})`}
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
          <div className="border-t border-gray-600 pt-2 mt-2">
            <div className="text-yellow-300">
              Assigned Seat: #{assignedSeat.id} {assignedSeat.isHost ? '👨‍🏫 HOST' : ''}
            </div>
            <div className="text-gray-300 text-[10px]">{assignedSeat.label}</div>
            {!assignedSeat.isHost && (
              <div className="text-gray-300 text-[10px]">
                Row {assignedSeat.row}, Column {assignedSeat.column}, Seat {assignedSeat.seatInRow}
              </div>
            )}
            <div className="text-gray-300 mt-1">Camera: [{activeCameraPosition.join(', ')}]</div>
          </div>
          <div className="mt-2 text-yellow-400 text-[10px]">
            🔴 Red = Col 1 • 🟢 Green = Col 2 • 🔵 Blue = Col 3 • 🟡 Gold = Host
          </div>
        </div>
      )}

      {/* Local Emote Notifications */}
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
