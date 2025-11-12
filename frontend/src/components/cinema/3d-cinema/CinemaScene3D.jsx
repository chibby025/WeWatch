import React, { useRef, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import CinemaTheater from './CinemaTheater';
import CinemaTheaterGLB from './CinemaTheaterGLB';

/**
 * CinemaCamera - Handles camera movement and controls
 */
function CinemaCamera({ userSeatPosition, initialRotation, onPositionUpdate }) {
  const cameraRef = useRef();
  const { camera } = useThree();
  const controlsRef = useRef();

  // Seat view position (first-person view from user seat)
  const seatViewPosition = new THREE.Vector3(
    userSeatPosition[0],
    userSeatPosition[1], // Use exact Y position, don't add eye level
    userSeatPosition[2]
  );

  // Set initial rotation when camera is ready
  useEffect(() => {
    if (camera && initialRotation) {
      camera.rotation.set(
        initialRotation[0] * Math.PI / 180,
        initialRotation[1] * Math.PI / 180,
        initialRotation[2] * Math.PI / 180
      );
      console.log('📷 [CinemaCamera] Set initial rotation:', initialRotation);
    }
  }, [camera, initialRotation]);

  // Track camera position and direction in real-time
  useFrame(() => {
    if (camera && onPositionUpdate) {
      const pos = camera.position;
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
      />
      {/* OrbitControls for free exploration */}
      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.05}
        minDistance={2}
        maxDistance={30}
        maxPolarAngle={Math.PI / 2}
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
          console.log('🔆 [DynamicLighting] Ceiling light intensity:', light.intensity.toFixed(2), 'Target:', targetIntensity);
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
  userSeats = [],
  authenticatedUserID,
  onZoomComplete: onExternalZoomComplete,
  useGLBModel = true
}) {
  const screenRef = useRef();
  const theaterRef = useRef();
  const [currentCameraPos, setCurrentCameraPos] = useState({ 
    position: [0, 0, 0], 
    rotation: [0, 0, 0],
    lookingAt: [0, 0, 0]
  });

  console.log('🎬 [CinemaScene3D] Rendering GLB cinema model');

  // GLB model position - center of the cinema box
  const glbModelPosition = [66, 2, 25];
  
  // Camera starts at a good seat position with view of the screen
  // GLB Cinema: 7x6 grid (7 seats per row, 6 rows total)
  const cameraStartPosition = [-3.22, 3.89, -5.14]; // Seated view position
  const cameraStartRotation = [-150.5, -15.3, -171.5]; // Facing the screen

  // Handle camera position updates
  const handlePositionUpdate = (posData) => {
    setCurrentCameraPos(posData);
  };

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
            userSeatPosition={cameraStartPosition}
            initialRotation={cameraStartRotation}
            onPositionUpdate={handlePositionUpdate}
          />

          {/* VERY BRIGHT lighting to see everything clearly */}
          <ambientLight intensity={3} />
          <directionalLight position={[0, 10, 0]} intensity={3} castShadow={false} />
          <directionalLight position={[0, -10, 0]} intensity={2} castShadow={false} />
          <pointLight position={[10, 5, 10]} intensity={3} distance={100} />
          <pointLight position={[-10, 5, 10]} intensity={3} distance={100} />
          <pointLight position={[10, 5, -10]} intensity={3} distance={100} />
          <pointLight position={[-10, 5, -10]} intensity={3} distance={100} />
          <pointLight position={[0, 5, 0]} intensity={4} distance={100} />

          {/* GLB Cinema Model */}
          <CinemaTheaterGLB position={glbModelPosition} />

          {/* Helpers to understand the space */}
          <gridHelper args={[50, 50, '#444444', '#222222']} position={[0, 0, 0]} />
          <axesHelper args={[10]} />
        </Canvas>
      </div>

      {/* Info overlay */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 text-white text-sm bg-black bg-opacity-50 px-4 py-2 rounded">
        Exploring GLB Cinema - Drag to rotate, Scroll to zoom
      </div>

      {/* Position debug info */}
      <div className="absolute bottom-4 left-4 bg-black bg-opacity-75 text-white p-3 rounded text-xs font-mono max-w-md">
        <div className="font-bold text-green-400 mb-2">📍 LIVE CAMERA POSITION</div>
        <div className="bg-green-900 bg-opacity-30 p-2 rounded mb-2">
          <div className="text-green-300">Position: [{currentCameraPos.position.join(', ')}]</div>
          <div className="text-blue-300">Rotation: [{currentCameraPos.rotation.join(', ')}]°</div>
          <div className="text-purple-300">Looking At: [{currentCameraPos.lookingAt?.join(', ') || '0, 0, 0'}]</div>
        </div>
        <div className="text-gray-400 text-[10px] mb-2">
          ▶ Move to a good seat position, then copy the Position & Rotation values
        </div>
        <div className="border-t border-gray-600 pt-2 mt-2">
          <div className="text-gray-300">Start Pos: [{cameraStartPosition.join(', ')}]</div>
          <div className="text-gray-300">Start Rot: [{cameraStartRotation.join(', ')}]°</div>
          <div className="text-gray-300">GLB Position: [{glbModelPosition.join(', ')}]</div>
        </div>
        <div className="mt-2 text-yellow-400 text-[10px]">
          Drag to rotate • Scroll to zoom • Right-click to pan
        </div>
      </div>
    </div>
  );
}
