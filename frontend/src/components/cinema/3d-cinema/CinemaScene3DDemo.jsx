import React from 'react';
import CinemaScene3D from './CinemaScene3D';

/**
 * CinemaScene3DDemo - Test component for 3D Cinema GLB
 */
export default function CinemaScene3DDemo() {
  return (
    <div className="w-full h-screen">
      <CinemaScene3D useGLBModel={true} />
      
      {/* Debug overlay */}
      <div className="absolute bottom-4 right-4 bg-black bg-opacity-75 text-white p-4 rounded-lg text-sm max-w-xs">
        <h3 className="font-bold mb-2">🎬 GLB Cinema Viewer</h3>
        <p className="text-xs mb-2">Exploring raw GLB model from Sketchfab</p>
        <div className="text-xs opacity-70 space-y-1">
          <p>🖱️ Drag to rotate</p>
          <p>🔍 Scroll to zoom</p>
          <p>📐 Grid/Axes helpers visible</p>
          <p className="text-yellow-400 mt-2">Find the cinema interior inside the box!</p>
        </div>
      </div>
    </div>
  );
}
