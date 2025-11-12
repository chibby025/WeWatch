import React, { useState, useEffect } from 'react';
import CinemaScene3D from './CinemaScene3D';

/**
 * CinemaScene3DDemo - Test component for 3D Cinema with seat assignment
 */
export default function CinemaScene3DDemo() {
  const [testUserId, setTestUserId] = useState(1); // Test different seat assignments
  const [showMarkers, setShowMarkers] = useState(true);
  const [viewLockKey, setViewLockKey] = useState(0); // Key to force re-render with lock

  // Auto-lock view when seat changes
  useEffect(() => {
    setViewLockKey(prev => prev + 1); // Force CinemaScene3D to re-mount with lock
  }, [testUserId]);

  return (
    <div className="w-full h-screen">
      <CinemaScene3D 
        key={viewLockKey}  // Re-mount when seat changes to reset view lock
        useGLBModel={true} 
        authenticatedUserID={testUserId}
        showSeatMarkers={showMarkers}
      />
      
      {/* Test controls */}
      <div className="absolute top-4 right-4 bg-black bg-opacity-90 text-white p-4 rounded-lg text-sm max-w-xs">
        <h3 className="font-bold mb-3 text-yellow-400">🎬 Seat Test Controls</h3>
        
        <div className="space-y-3">
          {/* Seat selector */}
          <div>
            <label className="text-xs text-gray-300 block mb-1">Test Seat (1-42):</label>
            <div className="flex gap-2">
              <input 
                type="number" 
                min="1" 
                max="42" 
                value={testUserId}
                onChange={(e) => setTestUserId(parseInt(e.target.value) || 1)}
                className="bg-gray-800 text-white px-2 py-1 rounded w-16 text-xs"
              />
              <button
                onClick={() => setTestUserId(Math.floor(Math.random() * 42) + 1)}
                className="bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded text-xs"
              >
                Random
              </button>
            </div>
          </div>

          {/* Quick seat buttons */}
          <div>
            <div className="text-xs text-gray-300 mb-1">Quick Jump:</div>
            <div className="grid grid-cols-3 gap-1">
              <button onClick={() => setTestUserId(1)} className="bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-[10px]">
                Front-L
              </button>
              <button onClick={() => setTestUserId(4)} className="bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-[10px]">
                Front-M
              </button>
              <button onClick={() => setTestUserId(7)} className="bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-[10px]">
                Front-R
              </button>
              <button onClick={() => setTestUserId(15)} className="bg-yellow-700 hover:bg-yellow-600 px-2 py-1 rounded text-[10px]">
                Mid-L ⭐
              </button>
              <button onClick={() => setTestUserId(18)} className="bg-yellow-700 hover:bg-yellow-600 px-2 py-1 rounded text-[10px]">
                Mid-M ⭐
              </button>
              <button onClick={() => setTestUserId(21)} className="bg-yellow-700 hover:bg-yellow-600 px-2 py-1 rounded text-[10px]">
                Mid-R ⭐
              </button>
              <button onClick={() => setTestUserId(36)} className="bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-[10px]">
                Back-L
              </button>
              <button onClick={() => setTestUserId(39)} className="bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-[10px]">
                Back-M
              </button>
              <button onClick={() => setTestUserId(42)} className="bg-gray-700 hover:bg-gray-600 px-2 py-1 rounded text-[10px]">
                Back-R
              </button>
            </div>
          </div>

          {/* Toggle markers */}
          <div>
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input 
                type="checkbox"
                checked={showMarkers}
                onChange={(e) => setShowMarkers(e.target.checked)}
                className="w-4 h-4"
              />
              <span>Show Seat Markers</span>
            </label>
          </div>

          <div className="border-t border-gray-700 pt-2 mt-2 text-[10px] text-gray-400">
            <p>⭐ = Premium middle seats</p>
            <p className="mt-1">Markers verify calculated positions</p>
          </div>
        </div>
      </div>
    </div>
  );
}
