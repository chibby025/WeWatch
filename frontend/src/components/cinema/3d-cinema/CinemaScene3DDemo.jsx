import React, { useState, useEffect } from 'react';
import CinemaScene3D from './CinemaScene3D';

/**
 * CinemaScene3DDemo - Test component for 3D Cinema with seat assignment
 */
export default function CinemaScene3DDemo() {
  const [testUserId, setTestUserId] = useState(1); // Test different seat assignments
  const [showMarkers, setShowMarkers] = useState(false); // Hide markers for production
  const [viewLockKey, setViewLockKey] = useState(0); // Key to force re-render with lock
  const [isViewLocked, setIsViewLocked] = useState(true); // View lock state
  const [lightsOn, setLightsOn] = useState(true); // Lights state

  // Mock room members for testing avatars (with different avatar URLs for testing)
  const [mockRoomMembers] = useState([
    { id: 29, username: 'Alice', avatar_url: 'https://i.pravatar.cc/150?img=1' },
    { id: 30, username: 'Bob', avatar_url: 'https://i.pravatar.cc/150?img=3' },
    { id: 31, username: 'Charlie', avatar_url: 'https://i.pravatar.cc/150?img=7' },
    { id: 32, username: 'Diana', avatar_url: 'https://i.pravatar.cc/150?img=9' },
    { id: 33, username: 'Eve', avatar_url: 'https://i.pravatar.cc/150?img=5' },
    { id: 34, username: 'Frank', avatar_url: 'https://i.pravatar.cc/150?img=11' },
    { id: 35, username: 'Grace', avatar_url: 'https://i.pravatar.cc/150?img=2' },
  ]);

  // Auto-lock view when seat changes
  useEffect(() => {
    setViewLockKey(prev => prev + 1); // Force CinemaScene3D to re-mount with lock
  }, [testUserId]);

  return (
    <div className="w-full h-screen">
      <CinemaScene3D 
        key={viewLockKey}  // Re-mount when seat changes to reset view lock
        useGLBModel="improved" // Use ImprovedAvatar for better 3D humanoid design
        authenticatedUserID={testUserId}
        showSeatMarkers={showMarkers}
        isViewLocked={isViewLocked}
        setIsViewLocked={setIsViewLocked}
        lightsOn={lightsOn}
        setLightsOn={setLightsOn}
        roomMembers={mockRoomMembers}
        onEmoteReceived={(handler) => {
          // Mock emote handler for testing
          console.log('Emote handler registered:', handler);
        }}
        onChatMessageReceived={(handler) => {
          // Mock chat message handler for testing
          console.log('Chat message handler registered:', handler);
        }}
        onEmoteSend={(emoteData) => {
          // Mock emote sender for testing
          console.log('🎭 Emote sent:', emoteData);
          alert(`Emote sent: ${emoteData.emote} from user ${emoteData.user_id}`);
        }}
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

      {/* View controls - positioned below test controls */}
      <div className="absolute top-[420px] right-4 bg-black bg-opacity-90 text-white p-4 rounded-lg text-sm max-w-xs space-y-3">
        <h3 className="font-bold mb-3 text-blue-400">🎮 View Controls</h3>
        
        <button
          onClick={() => setIsViewLocked(!isViewLocked)}
          className={`w-full px-4 py-2 rounded font-medium transition-colors ${
            isViewLocked 
              ? 'bg-red-600 hover:bg-red-700' 
              : 'bg-green-600 hover:bg-green-700'
          }`}
        >
          {isViewLocked ? '🔒 View Locked' : '🔓 View Unlocked'}
        </button>

        <button
          onClick={() => setLightsOn(!lightsOn)}
          className={`w-full px-4 py-2 rounded font-medium transition-colors ${
            lightsOn 
              ? 'bg-yellow-600 hover:bg-yellow-700' 
              : 'bg-gray-700 hover:bg-gray-600'
          }`}
        >
          {lightsOn ? '💡 Lights On' : '🌑 Lights Off'}
        </button>

        <div className="border-t border-gray-700 pt-2 mt-2 text-[10px] text-gray-400">
          <p className="font-bold text-white mb-1">🎭 Avatar System:</p>
          <p>• {mockRoomMembers.length} users in cinema</p>
          <p>• Rayman-style floating hands</p>
          <p>• White gloves with colored glow</p>
          <p>• Breathing & look-around animations</p>
          <p className="mt-1 text-yellow-400">Try switching seats to see avatars!</p>
        </div>

        <div className="border-t border-gray-700 pt-2 mt-2 text-[10px] text-gray-400">
          <p className="font-bold text-white mb-1">😊 Emote Controls:</p>
          <p>• Press 1: 👋 Wave</p>
          <p>• Press 2: 👏 Clap</p>
          <p>• Press 3: 👍 Thumbs Up</p>
          <p>• Press 4: 😂 Laugh</p>
          <p>• Press 5: ❤️ Heart</p>
          <p className="mt-1 text-yellow-400">Test emotes with keyboard!</p>
        </div>

        <div className="border-t border-gray-700 pt-2 mt-2 text-[10px] text-gray-400">
          <p className="font-bold text-white mb-1">🖼️ Avatar Demos:</p>
          <div className="space-y-1">
            <button
              onClick={() => window.location.href = '/improved-avatar-demo'}
              className="w-full bg-green-600 hover:bg-green-700 px-3 py-1 rounded text-xs font-medium transition-colors"
            >
              👤 Improved Avatar Demo ⭐
            </button>
            <button
              onClick={() => window.location.href = '/avatar-image-demo'}
              className="w-full bg-cyan-600 hover:bg-cyan-700 px-3 py-1 rounded text-xs font-medium transition-colors"
            >
              🎭 Avatar Images Demo
            </button>
            <button
              onClick={() => window.location.href = '/avatar-style-comparison'}
              className="w-full bg-purple-600 hover:bg-purple-700 px-3 py-1 rounded text-xs font-medium transition-colors"
            >
              🎨 Avatar Style Comparison
            </button>
          </div>
          <p className="mt-1 text-[9px] text-gray-500">
            Test different avatar designs & user images
          </p>
        </div>

        <div className="border-t border-gray-700 pt-2 mt-2 text-[10px] text-gray-400">
          <p className="font-bold text-white mb-1">�🔒 Locked Mode (Seated):</p>
          <p>• WASD / Arrow Keys: Look around</p>
          <p>• Mouse drag: Also look around</p>
          <p>• L: Look left (default view)</p>
          <p>• C: Look at screen (center)</p>
          <p>• R: Look right (mirrored view)</p>
          <p>• Position locked to seat</p>
          <p className="font-bold text-white mt-2 mb-1">🔓 Unlocked Mode (Free Roam):</p>
          <p>• WASD: Move forward/back/left/right</p>
          <p>• Q/E: Move up/down</p>
          <p>• Arrow Keys: Pan view direction</p>
          <p>• 1-6: Snap to axis views</p>
          <p className="text-[9px] text-gray-500 mt-1">
            (1=Front, 2=Back, 3=Left, 4=Right, 5=Top, 6=Bottom)
          </p>
        </div>
      </div>
    </div>
  );
}
