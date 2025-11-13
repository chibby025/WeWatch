import React from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import GLBAvatar from './avatars/GLBAvatar';

/**
 * GLBAvatarTest - Simple test page to analyze the user_3d_icon.glb model
 */
export default function GLBAvatarTest() {
  return (
    <div className="w-full h-screen bg-gray-900">
      <Canvas camera={{ position: [0, 1.5, 3], fov: 50 }}>
        {/* Lighting */}
        <ambientLight intensity={0.5} />
        <directionalLight position={[5, 5, 5]} intensity={1} />
        
        {/* Test Avatar */}
        <GLBAvatar
          userId={1}
          username="Test User"
          seatPosition={[0, 0, 0]}
          seatRotation={[0, 0, 0]}
          rowNumber={1}
          isPremium={false}
          userPhotoUrl="/avatars/default.png"
        />
        
        {/* Ground plane for reference */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.5, 0]}>
          <planeGeometry args={[10, 10]} />
          <meshStandardMaterial color="#333333" />
        </mesh>
        
        {/* Controls */}
        <OrbitControls />
      </Canvas>
      
      {/* Instructions */}
      <div className="absolute top-4 left-4 bg-black bg-opacity-90 text-white p-4 rounded-lg text-sm max-w-md">
        <h3 className="font-bold mb-2 text-yellow-400">🔍 GLB Avatar Analysis</h3>
        <p className="text-xs text-gray-300 mb-2">
          Open browser console (F12) to see GLB model structure analysis.
        </p>
        <p className="text-xs text-gray-300">
          This will show:
        </p>
        <ul className="text-xs text-gray-400 ml-4 list-disc space-y-1">
          <li>All mesh names in the model</li>
          <li>Vertex counts</li>
          <li>Material names</li>
          <li>UV mapping availability</li>
          <li>Which meshes can receive face texture</li>
        </ul>
      </div>
    </div>
  );
}
