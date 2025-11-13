import React, { useState } from 'react';
import CinemaScene3D from './CinemaScene3D';

/**
 * ImprovedAvatarDemo - Showcase the improved 3D avatar design
 * Demonstrates the chosen avatar style with proper spacing and styling
 */
export default function ImprovedAvatarDemo() {
  const [testUserId, setTestUserId] = useState(1);

  // Mock room members with mix of images and defaults
  const mockRoomMembers = [
    { id: 1, username: 'Alice', avatar_url: 'https://i.pravatar.cc/150?img=1' },
    { id: 2, username: 'Bob', avatar_url: 'https://i.pravatar.cc/150?img=3' },
    { id: 3, username: 'Charlie', avatar_url: null }, // No image
    { id: 4, username: 'Diana', avatar_url: 'https://i.pravatar.cc/150?img=9' },
    { id: 5, username: 'Eve', avatar_url: '/avatars/sample-avatar-1.svg' },
    { id: 6, username: 'Frank', avatar_url: 'https://i.pravatar.cc/150?img=11' },
    { id: 7, username: 'Grace', avatar_url: '/avatars/sample-avatar-2.svg' },
    { id: 8, username: 'Henry', avatar_url: 'https://i.pravatar.cc/150?img=4' },
  ];

  return (
    <div className="w-full h-screen">
      <CinemaScene3D 
        useGLBModel="improved" // Use ImprovedAvatar
        authenticatedUserID={testUserId}
        showSeatMarkers={false}
        isViewLocked={true}
        lightsOn={true}
        roomMembers={mockRoomMembers}
        onEmoteReceived={(handler) => console.log('Emote handler registered')}
        onChatMessageReceived={(handler) => console.log('Chat handler registered')}
        onEmoteSend={(emoteData) => console.log('🎭 Emote sent:', emoteData)}
      />
      
      {/* Controls panel */}
      <div className="absolute top-4 right-4 bg-black bg-opacity-95 text-white p-6 rounded-lg text-sm max-w-sm">
        <h3 className="font-bold mb-4 text-green-400 text-lg">👤 Improved 3D Avatar</h3>
        
        <div className="space-y-4">
          {/* Features highlight */}
          <div className="bg-green-900 bg-opacity-30 p-3 rounded border border-green-500">
            <h4 className="font-bold text-green-300 mb-2 text-xs">✨ Key Features:</h4>
            <ul className="text-[10px] text-gray-300 space-y-1 list-disc list-inside">
              <li>Visible gap between head & torso</li>
              <li>Username text with white outline</li>
              <li>Proper hemisphere body shape</li>
              <li>Sphere head with face texture</li>
              <li>Floating hands (Rayman style)</li>
              <li>Breathing animation</li>
              <li>Skin-tone default when no image</li>
            </ul>
          </div>

          {/* User switcher */}
          <div>
            <label className="text-sm text-gray-300 block mb-2 font-medium">Switch User View:</label>
            <div className="grid grid-cols-2 gap-1">
              {mockRoomMembers.map((member) => (
                <button
                  key={member.id}
                  onClick={() => setTestUserId(member.id)}
                  className={`px-2 py-1 rounded text-xs transition-colors ${
                    testUserId === member.id
                      ? 'bg-green-600 hover:bg-green-700 text-white'
                      : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                  }`}
                >
                  {member.username}
                </button>
              ))}
            </div>
          </div>

          {/* Design notes */}
          <div className="border-t border-gray-700 pt-4 text-xs">
            <h4 className="font-bold text-white mb-2">🎨 Design Details:</h4>
            <div className="text-[10px] text-gray-400 space-y-2">
              <div>
                <span className="text-green-400 font-medium">Head-Torso Gap:</span>
                <p className="ml-2">Creates floating head effect, adds character</p>
              </div>
              <div>
                <span className="text-green-400 font-medium">White Outline:</span>
                <p className="ml-2">Username text stands out against any background</p>
              </div>
              <div>
                <span className="text-green-400 font-medium">Hemisphere Body:</span>
                <p className="ml-2">Natural torso shape (not inverted cone)</p>
              </div>
              <div>
                <span className="text-green-400 font-medium">Face Texture:</span>
                <p className="ml-2">User images mapped onto sphere head</p>
              </div>
            </div>
          </div>

          {/* Image info */}
          <div className="border-t border-gray-700 pt-4">
            <h4 className="font-bold text-white mb-2">Current User:</h4>
            {(() => {
              const currentUser = mockRoomMembers.find(m => m.id === testUserId);
              return currentUser ? (
                <div className="text-xs space-y-1">
                  <p><span className="text-gray-400">Name:</span> {currentUser.username}</p>
                  <p><span className="text-gray-400">Has Image:</span> {currentUser.avatar_url ? '✅ Yes' : '❌ No (uses skin tone)'}</p>
                  {currentUser.avatar_url && (
                    <p className="break-all text-blue-400 text-[9px]">{currentUser.avatar_url}</p>
                  )}
                </div>
              ) : null;
            })()}
          </div>

          {/* Controls reminder */}
          <div className="border-t border-gray-700 pt-4 text-[10px] text-gray-400">
            <p className="font-bold text-white mb-1">⌨️ Keyboard Controls:</p>
            <p>• Press 1-5: Trigger emotes</p>
            <p>• L: Look left</p>
            <p>• C: Look at screen</p>
            <p>• R: Look right</p>
            <p>• WASD / Arrows: Look around</p>
          </div>

        </div>
      </div>

      {/* Quick info */}
      <div className="absolute bottom-4 left-4 bg-black bg-opacity-90 text-white p-3 rounded-lg text-xs max-w-md">
        <p className="font-bold text-green-400 mb-1">🎬 Improved 3D Avatar Demo</p>
        <p className="text-gray-300">
          Viewing as: <span className="text-white font-medium">
            {mockRoomMembers.find(m => m.id === testUserId)?.username}
          </span>
        </p>
        <p className="text-gray-400 text-[10px] mt-1">
          Look around to see other users with the improved avatar design!
        </p>
      </div>
    </div>
  );
}