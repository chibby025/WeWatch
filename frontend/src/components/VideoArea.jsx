import React from 'react';
import VideoPlayer from './VideoPlayer';
import {
  PlayIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';

const VideoArea = ({
  room,
  selectedMediaItem,
  isPlaying, // ✅ Receive isPlaying
  setIsPlaying, // ✅ Receive setter if needed for internal controls
  ws,
  wsConnected,
  wsError,
  isHost,
  authenticatedUserID,
  overrideCurrentlyPlaying,
  overrideComingNext,
  isOverriding,
  handleStartOverride,
  handleSaveOverride,
  handleCancelOverride,
  loopMode,
  handleLoopModeChange,
  mediaItems = [],
  handlePlayMedia,
}) => {
  // Helper to get status display
  const getStatusDisplay = () => {
    if (isOverriding) {
      return {
        currentlyPlaying: overrideCurrentlyPlaying,
        comingNext: overrideComingNext
      };
    }
    if (selectedMediaItem) {
      const currentIndex = mediaItems.findIndex(item => item.ID === selectedMediaItem.ID);
      const upcoming = mediaItems.slice(currentIndex + 1, currentIndex + 4);
      return {
        currentlyPlaying: selectedMediaItem.original_name,
        comingNext: upcoming.length > 0 ? upcoming[0].original_name : ''
      };
    }
    return {
      currentlyPlaying: 'No media playing',
      comingNext: 'Nothing queued'
    };
  };

  return (
    <div className="space-y-4">
      {/* Host Override UI - Only shown to host */}
      {isHost && (
        <div className="bg-yellow-50 p-3 rounded mb-3 border border-yellow-200">
          <div className="flex justify-between items-center mb-2">
            <h4 className="font-semibold text-yellow-800">Host Override</h4>
            {!isOverriding ? (
              <button
                onClick={handleStartOverride}
                className="bg-yellow-500 hover:bg-yellow-600 text-white text-sm px-3 py-1 rounded"
              >
                Edit Status
              </button>
            ) : (
              <div className="flex space-x-2">
                <button
                  onClick={handleCancelOverride}
                  className="bg-gray-500 hover:bg-gray-600 text-white text-sm px-3 py-1 rounded"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveOverride}
                  className="bg-green-500 hover:bg-green-600 text-white text-sm px-3 py-1 rounded"
                >
                  Save Override
                </button>
              </div>
            )}
          </div>
          {isOverriding && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Currently Playing:
                </label>
                <input
                  type="text"
                  value={overrideCurrentlyPlaying}
                  onChange={(e) => handleStartOverride(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter currently playing text"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Coming Next:
                </label>
                <input
                  type="text"
                  value={overrideComingNext}
                  onChange={(e) => handleStartOverride(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter coming next text"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Status Display */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-blue-50 p-3 rounded">
          <h4 className="font-semibold text-blue-800">Currently Playing:</h4>
          <p className="text-sm">
            {getStatusDisplay().currentlyPlaying}
          </p>
        </div>
        <div className="bg-gray-50 p-3 rounded">
          <h4 className="font-semibold text-gray-800">Coming Next:</h4>
          <p className="text-sm">
            {getStatusDisplay().comingNext}
          </p>
        </div>
      </div>

      {/* Main Video Player */}
      <div className="relative mb-6">
        <VideoPlayer
          mediaItem={selectedMediaItem}
          isPlaying={isPlaying} 
          roomId={room.id}
          isHost={isHost}
          authenticatedUserID={authenticatedUserID}
          ws={ws}
          wsConnected={wsConnected}
          wsError={wsError}
        />
      </div>

      {/* Playlist Controls */}
      <div className="bg-blue-50 p-3 rounded mb-3 border border-blue-200">
        <div className="flex justify-between items-center">
          <h4 className="font-semibold text-blue-800">Playlist Controls</h4>
        </div>
        <div className="mt-2 flex items-center space-x-4">
          <span className="text-sm font-medium text-gray-700">Loop Mode:</span>
          <div className="flex space-x-2">
            <button
              onClick={() => handleLoopModeChange('none')}
              className={`px-3 py-1 text-sm rounded ${
                loopMode === 'none' 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              None
            </button>
            <button
              onClick={() => handleLoopModeChange('playlist-once')}
              className={`px-3 py-1 text-sm rounded ${
                loopMode === 'playlist-once' 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Playlist (1x)
            </button>
            <button
              onClick={() => handleLoopModeChange('playlist-infinite')}
              className={`px-3 py-1 text-sm rounded ${
                loopMode === 'playlist-infinite' 
                  ? 'bg-blue-500 text-white' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Playlist (∞)
            </button>
          </div>
        </div>
        {mediaItems.length > 0 && (
          <div className="mt-2 text-sm text-gray-600">
            {mediaItems.length} items in playlist
          </div>
        )}
      </div>
    </div>
  );
};

export default VideoArea;