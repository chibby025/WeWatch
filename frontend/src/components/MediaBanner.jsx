// frontend/src/components/MediaBanner.jsx
import React from 'react';
import { ChevronDownIcon, ChevronUpIcon, PlayIcon, TrashIcon, ArrowUpTrayIcon } from '@heroicons/react/24/outline';

const MediaBanner = ({
  isExpanded,
  onToggle,
  mediaItems = [],
  currentMedia,
  onPlayMedia,
  onDeleteMedia,
  onUploadClick,
  isHost,
}) => {
  return (
    <div className="w-full bg-gray-800 border-b border-gray-700">
      {/* Collapsed View - Now Playing Bar */}
      <div 
        className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-gray-750 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3 flex-1">
          {/* Movie Poster/Icon */}
          {currentMedia?.thumbnail_url ? (
            <img 
              src={currentMedia.thumbnail_url} 
              alt={currentMedia.title}
              className="w-10 h-10 rounded object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded bg-gray-700 flex items-center justify-center">
              <PlayIcon className="w-6 h-6 text-gray-400" />
            </div>
          )}
          
          {/* Now Playing Info */}
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">Now Playing:</span>
              <span className="text-white font-medium">{currentMedia?.title || 'Select Media'}</span>
            </div>
            {currentMedia && (
              <div className="text-xs text-gray-500">
                {currentMedia.duration ? `${Math.floor(currentMedia.duration / 60)}min` : 'Duration unknown'}
              </div>
            )}
          </div>
          
          {/* Media Library Count */}
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <span>📂 Media Library ({mediaItems.length})</span>
            {isExpanded ? (
              <ChevronUpIcon className="w-5 h-5" />
            ) : (
              <ChevronDownIcon className="w-5 h-5" />
            )}
          </div>
        </div>
      </div>

      {/* Expanded View - Media Library */}
      {isExpanded && (
        <div className="border-t border-gray-700 bg-gray-850 max-h-[200px] overflow-y-auto">
          {/* Upload Button (Host Only) */}
          {isHost && (
            <div className="p-3 border-b border-gray-700">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onUploadClick();
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                <ArrowUpTrayIcon className="w-5 h-5" />
                <span>Upload New Media</span>
              </button>
            </div>
          )}

          {/* Media Items List */}
          {mediaItems.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              <PlayIcon className="w-12 h-12 mx-auto mb-2 opacity-30" />
              <p>No media items yet</p>
              {isHost && (
                <p className="text-sm mt-1">Upload videos to get started</p>
              )}
            </div>
          ) : (
            <div className="divide-y divide-gray-700">
              {mediaItems.map((item) => (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 p-3 hover:bg-gray-800 transition-colors ${
                    currentMedia?.id === item.id ? 'bg-gray-800 border-l-4 border-blue-500' : ''
                  }`}
                >
                  {/* Thumbnail */}
                  {item.thumbnail_url ? (
                    <img
                      src={item.thumbnail_url}
                      alt={item.title}
                      className="w-16 h-16 rounded object-cover"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded bg-gray-700 flex items-center justify-center">
                      <PlayIcon className="w-8 h-8 text-gray-400" />
                    </div>
                  )}

                  {/* Media Info */}
                  <div className="flex-1 min-w-0">
                    <h4 className="text-white font-medium truncate">{item.title}</h4>
                    <p className="text-xs text-gray-500 truncate">
                      {item.media_type} • {item.duration ? `${Math.floor(item.duration / 60)}min` : 'Unknown duration'}
                    </p>
                    {currentMedia?.id === item.id && (
                      <span className="inline-block mt-1 text-xs bg-blue-600 text-white px-2 py-0.5 rounded">
                        Now Playing
                      </span>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2">
                    {currentMedia?.id !== item.id && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onPlayMedia(item.id);
                        }}
                        className="p-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                        title="Play this media"
                      >
                        <PlayIcon className="w-5 h-5" />
                      </button>
                    )}
                    
                    {isHost && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`Delete "${item.title}"?`)) {
                            onDeleteMedia(item.id);
                          }
                        }}
                        className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                        title="Delete media"
                      >
                        <TrashIcon className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MediaBanner;
