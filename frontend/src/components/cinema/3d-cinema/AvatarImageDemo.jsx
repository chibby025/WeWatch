import React, { useState } from 'react';
import CinemaScene3D from './CinemaScene3D';

/**
 * AvatarImageDemo - Demonstrates custom avatar images in the 3D cinema
 * This shows how user profile pictures are applied to avatar heads
 */
export default function AvatarImageDemo() {
  const [testUserId, setTestUserId] = useState(1);

  // Mock room members with different types of avatar images for testing
  const [mockRoomMembers] = useState([
    // Real profile pictures from placeholder services
    { id: 1, username: 'Alice_Real', avatar_url: 'https://i.pravatar.cc/150?img=1' },
    { id: 2, username: 'Bob_Real', avatar_url: 'https://i.pravatar.cc/150?img=3' },
    { id: 3, username: 'Charlie_Real', avatar_url: 'https://i.pravatar.cc/150?img=7' },
    
    // Local sample SVG avatars
    { id: 4, username: 'Diana_SVG', avatar_url: '/avatars/sample-avatar-1.svg' },
    { id: 5, username: 'Eve_SVG', avatar_url: '/avatars/sample-avatar-2.svg' },
    
    // Default fallback (no image or broken URL)
    { id: 6, username: 'Frank_Default', avatar_url: null },
    { id: 7, username: 'Grace_Broken', avatar_url: 'https://broken-url.com/image.jpg' },
    
    // Different sizes and cartoon styles
    { id: 8, username: 'Henry_Large', avatar_url: 'https://i.pravatar.cc/300?img=11' },
  ]);

  const [testImageUrls] = useState([
    'https://i.pravatar.cc/150?img=1',
    'https://i.pravatar.cc/150?img=3',
    'https://i.pravatar.cc/150?img=7',
    'https://api.multiavatar.com/test.png',
    'https://i.pravatar.cc/150?img=9',
    null, // No image
    'https://broken-url.com/image.jpg', // Broken URL
    'https://i.pravatar.cc/300?img=11', // Larger image
  ]);

  return (
    <div className="w-full h-screen">
      <CinemaScene3D 
        useGLBModel={false} // Use CustomAvatar for image support
        authenticatedUserID={testUserId}
        showSeatMarkers={false}
        isViewLocked={true}
        lightsOn={true}
        roomMembers={mockRoomMembers}
        onEmoteReceived={(handler) => console.log('Emote handler registered:', handler)}
        onChatMessageReceived={(handler) => console.log('Chat handler registered:', handler)}
        onEmoteSend={(emoteData) => console.log('🎭 Emote sent:', emoteData)}
      />
      
      {/* Test controls */}
      <div className="absolute top-4 right-4 bg-black bg-opacity-95 text-white p-6 rounded-lg text-sm max-w-sm">
        <h3 className="font-bold mb-4 text-cyan-400 text-lg">🖼️ Avatar Image Demo</h3>
        
        <div className="space-y-4">
          {/* Seat selector */}
          <div>
            <label className="text-sm text-gray-300 block mb-2 font-medium">Switch Between Users:</label>
            <div className="grid grid-cols-2 gap-2">
              {mockRoomMembers.map((member) => (
                <button
                  key={member.id}
                  onClick={() => setTestUserId(member.id)}
                  className={`px-3 py-2 rounded text-xs font-medium transition-colors ${
                    testUserId === member.id
                      ? 'bg-cyan-600 hover:bg-cyan-700 text-white'
                      : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                  }`}
                >
                  {member.username.split('_')[0]}
                </button>
              ))}
            </div>
          </div>

          {/* Current user info */}
          <div className="border-t border-gray-700 pt-4">
            <h4 className="font-bold text-white mb-2">Current User Info:</h4>
            {(() => {
              const currentUser = mockRoomMembers.find(m => m.id === testUserId);
              return currentUser ? (
                <div className="text-xs space-y-1">
                  <p><span className="text-gray-400">Name:</span> {currentUser.username}</p>
                  <p><span className="text-gray-400">Avatar URL:</span></p>
                  <p className="break-all text-blue-400 text-[10px]">
                    {currentUser.avatar_url || 'null (fallback color)'}
                  </p>
                </div>
              ) : null;
            })()}
          </div>

          {/* Avatar types explanation */}
          <div className="border-t border-gray-700 pt-4 text-xs space-y-2">
            <h4 className="font-bold text-white mb-2">Avatar Types Shown:</h4>
            <div className="space-y-2 text-[11px]">
              <div>
                <span className="text-green-400 font-medium">Real Photos:</span>
                <p className="text-gray-400 ml-2">Alice, Bob, Charlie, Henry - Using pravatar.cc</p>
              </div>
              <div>
                <span className="text-purple-400 font-medium">Local SVG:</span>
                <p className="text-gray-400 ml-2">Diana, Eve - Custom SVG avatars</p>
              </div>
              <div>
                <span className="text-yellow-400 font-medium">Fallbacks:</span>
                <p className="text-gray-400 ml-2">Frank (no URL), Grace (broken URL)</p>
              </div>
            </div>
          </div>

          {/* Technical info */}
          <div className="border-t border-gray-700 pt-4 text-xs space-y-2">
            <h4 className="font-bold text-white mb-2">🔧 Technical Features:</h4>
            <ul className="text-gray-400 space-y-1 text-[10px] list-disc list-inside">
              <li>Automatic texture loading & caching</li>
              <li>Fallback to color when image fails</li>
              <li>Support for different image sizes</li>
              <li>Proper UV mapping on sphere geometry</li>
              <li>Loading indicators during texture fetch</li>
              <li>Error handling for broken URLs</li>
            </ul>
          </div>

          {/* Usage guide */}
          <div className="border-t border-gray-700 pt-4 text-xs">
            <h4 className="font-bold text-yellow-400 mb-2">💡 How to Use in Your App:</h4>
            <div className="text-[10px] text-gray-400 space-y-1">
              <p>1. Set <code className="text-cyan-400">userPhotoUrl</code> prop</p>
              <p>2. Use any image URL (jpg, png, webp)</p>
              <p>3. Component handles loading/errors automatically</p>
              <p>4. Falls back to colored sphere if no image</p>
            </div>
          </div>
        </div>
      </div>

      {/* View info overlay */}
      <div className="absolute bottom-4 left-4 bg-black bg-opacity-90 text-white p-3 rounded-lg text-xs max-w-md">
        <p className="font-bold text-cyan-400 mb-1">🎬 Current View</p>
        <p className="text-gray-300">
          Viewing from seat of: <span className="text-white font-medium">
            {mockRoomMembers.find(m => m.id === testUserId)?.username || 'Unknown'}
          </span>
        </p>
        <p className="text-gray-400 text-[10px] mt-1">
          Look around to see other users' avatar images!
        </p>
      </div>
    </div>
  );
}