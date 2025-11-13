import React, { useState } from 'react';
import CinemaScene3D from './CinemaScene3D';

/**
 * AvatarStyleComparison - Compare different avatar designs
 */
export default function AvatarStyleComparison() {
  const [currentStyle, setCurrentStyle] = useState('improved'); // Default to improved 3D
  const [testUserId, setTestUserId] = useState(1);

  // Mock room members
  const mockRoomMembers = [
    { id: 1, username: 'Alice', avatar_url: 'https://i.pravatar.cc/150?img=1' },
    { id: 2, username: 'Bob', avatar_url: 'https://i.pravatar.cc/150?img=3' },
    { id: 3, username: 'Charlie', avatar_url: 'https://i.pravatar.cc/150?img=7' },
    { id: 4, username: 'Diana', avatar_url: '/avatars/sample-avatar-1.svg' },
    { id: 5, username: 'Eve', avatar_url: null }, // No image
    { id: 6, username: 'Frank', avatar_url: 'https://i.pravatar.cc/150?img=9' },
    { id: 7, username: 'Grace', avatar_url: 'https://broken-url.com/image.jpg' }, // Broken
    { id: 8, username: 'Henry', avatar_url: 'https://i.pravatar.cc/300?img=11' },
  ];

  const avatarStyles = [
    { 
      id: 'modern', 
      name: '🖼️ Modern Panel', 
      description: 'Clean square profile cards with depth',
      useGLB: 'modern'
    },
    { 
      id: 'improved', 
      name: '👤 Improved 3D', 
      description: 'Better proportioned humanoid avatars',
      useGLB: 'improved'
    },
    { 
      id: 'flat', 
      name: '⚪ Flat Circular', 
      description: 'Simple 2D profile pictures',
      useGLB: 'flat'
    },
    { 
      id: 'custom', 
      name: '🔮 Original Custom', 
      description: 'Current sphere + inverted cone',
      useGLB: false
    },
  ];

  const currentStyleInfo = avatarStyles.find(s => s.id === currentStyle);

  return (
    <div className="w-full h-screen">
      <CinemaScene3D 
        useGLBModel={currentStyleInfo?.useGLB || false}
        authenticatedUserID={testUserId}
        showSeatMarkers={false}
        isViewLocked={true}
        lightsOn={true}
        roomMembers={mockRoomMembers}
        onEmoteReceived={(handler) => console.log('Emote handler registered')}
        onChatMessageReceived={(handler) => console.log('Chat handler registered')}
        onEmoteSend={(emoteData) => console.log('🎭 Emote sent:', emoteData)}
      />
      
      {/* Style selector */}
      <div className="absolute top-4 right-4 bg-black bg-opacity-95 text-white p-6 rounded-lg text-sm max-w-sm">
        <h3 className="font-bold mb-4 text-purple-400 text-lg">🎭 Avatar Style Comparison</h3>
        
        <div className="space-y-4">
          {/* Style buttons */}
          <div>
            <label className="text-sm text-gray-300 block mb-3 font-medium">Choose Avatar Style:</label>
            <div className="space-y-2">
              {avatarStyles.map((style) => (
                <button
                  key={style.id}
                  onClick={() => setCurrentStyle(style.id)}
                  className={`w-full text-left px-4 py-3 rounded transition-colors ${
                    currentStyle === style.id
                      ? 'bg-purple-600 hover:bg-purple-700 text-white'
                      : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                  }`}
                >
                  <div className="font-medium text-sm">{style.name}</div>
                  <div className="text-xs text-gray-400 mt-1">{style.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Current style info */}
          <div className="border-t border-gray-700 pt-4">
            <h4 className="font-bold text-white mb-2">Current Style:</h4>
            <div className="text-xs space-y-1">
              <p><span className="text-purple-400 font-medium">{currentStyleInfo?.name}</span></p>
              <p className="text-gray-400">{currentStyleInfo?.description}</p>
            </div>
          </div>

          {/* User switcher */}
          <div className="border-t border-gray-700 pt-4">
            <label className="text-sm text-gray-300 block mb-2 font-medium">Switch User View:</label>
            <div className="grid grid-cols-2 gap-1">
              {mockRoomMembers.map((member) => (
                <button
                  key={member.id}
                  onClick={() => setTestUserId(member.id)}
                  className={`px-2 py-1 rounded text-xs transition-colors ${
                    testUserId === member.id
                      ? 'bg-cyan-600 hover:bg-cyan-700 text-white'
                      : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                  }`}
                >
                  {member.username}
                </button>
              ))}
            </div>
          </div>

          {/* Style comparisons */}
          <div className="border-t border-gray-700 pt-4 text-xs">
            <h4 className="font-bold text-white mb-2">Style Comparison:</h4>
            <div className="space-y-3">
              
              <div className="bg-gray-800 p-3 rounded">
                <h5 className="text-purple-400 font-medium">🖼️ Modern Panel (Recommended)</h5>
                <div className="text-[10px] text-gray-400 mt-1 space-y-1">
                  <p>✅ Perfect image display (no distortion)</p>
                  <p>✅ Clean, modern appearance</p>
                  <p>✅ Good 3D presence with depth</p>
                  <p>✅ Premium border effects</p>
                  <p>⚠️ Less "avatar-like" than humanoid</p>
                </div>
              </div>

              <div className="bg-gray-800 p-3 rounded">
                <h5 className="text-green-400 font-medium">👤 Improved 3D</h5>
                <div className="text-[10px] text-gray-400 mt-1 space-y-1">
                  <p>✅ Natural humanoid proportions</p>
                  <p>✅ Good face mapping on sphere</p>
                  <p>✅ Floating hands (Rayman style)</p>
                  <p>✅ Breathing animations</p>
                  <p>⚠️ Some image distortion on sphere</p>
                </div>
              </div>

              <div className="bg-gray-800 p-3 rounded">
                <h5 className="text-blue-400 font-medium">⚪ Flat Circular</h5>
                <div className="text-[10px] text-gray-400 mt-1 space-y-1">
                  <p>✅ Zero image distortion</p>
                  <p>✅ Familiar profile picture look</p>
                  <p>✅ Very lightweight performance</p>
                  <p>✅ Always faces camera</p>
                  <p>⚠️ Less immersive in 3D space</p>
                </div>
              </div>

              <div className="bg-gray-800 p-3 rounded">
                <h5 className="text-orange-400 font-medium">🔮 Original Custom</h5>
                <div className="text-[10px] text-gray-400 mt-1 space-y-1">
                  <p>✅ Your current implementation</p>
                  <p>⚠️ Awkward proportions (sphere + cone)</p>
                  <p>⚠️ Image distortion on sphere</p>
                  <p>⚠️ Not very avatar-like</p>
                </div>
              </div>

            </div>
          </div>

          {/* Recommendations */}
          <div className="border-t border-gray-700 pt-4 text-xs">
            <h4 className="font-bold text-yellow-400 mb-2">💡 Recommendations:</h4>
            <div className="text-[10px] text-gray-400 space-y-1">
              <p><strong>For Social Apps:</strong> Modern Panel - clean and familiar</p>
              <p><strong>For Gaming:</strong> Improved 3D - more immersive</p>
              <p><strong>For Performance:</strong> Flat Circular - lightweight</p>
              <p><strong>For Unique Style:</strong> Custom design your own!</p>
            </div>
          </div>

        </div>
      </div>

      {/* Quick info */}
      <div className="absolute bottom-4 left-4 bg-black bg-opacity-90 text-white p-3 rounded-lg text-xs max-w-md">
        <p className="font-bold text-purple-400 mb-1">🎬 Avatar Style Testing</p>
        <p className="text-gray-300">
          Current: <span className="text-white font-medium">{currentStyleInfo?.name}</span>
        </p>
        <p className="text-gray-300">
          Viewing as: <span className="text-white font-medium">
            {mockRoomMembers.find(m => m.id === testUserId)?.username}
          </span>
        </p>
        <p className="text-gray-400 text-[10px] mt-1">
          Switch styles to see how user images look with different avatar designs!
        </p>
      </div>
    </div>
  );
}