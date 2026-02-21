// SessionPreview.jsx - Displays session preview with emoji → spinner → poster → GIF fallback
import React, { useState, useEffect } from 'react';

const SessionPreview = ({ session, previewUrl, posterUrl, isGenerating }) => {
  const [loadState, setLoadState] = useState('emoji'); // 'emoji' | 'loading' | 'poster' | 'gif'
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    if (isGenerating) {
      setLoadState('loading');
      return;
    }

    if (previewUrl && !imageError) {
      setLoadState('gif');
    } else if (posterUrl && !imageError) {
      setLoadState('poster');
    } else {
      setLoadState('emoji');
    }
  }, [previewUrl, posterUrl, isGenerating, imageError]);

  // Get source emoji based on session metadata
  const getSourceEmoji = () => {
    // ✅ Lecture hall specific detection
    if (session.watch_type === 'classroom' && session.class_type === 'lecture_hall') {
      // Check if there's active media
      if (session.current_media_url) return '📹'; // Uploaded video playing
      if (session.is_screen_sharing_active) {
        return session.sharing_source === 'watchfrom' ? '📺' : '💻'; // Watch From or LiveShare
      }
      return '🎓'; // Lecture hall with no media
    }
    
    if (session.watch_type === '3d_cinema') return '🎭';
    if (session.watch_type === 'classroom') return '🎓';
    return '🎬';
  };

  const getSourceLabel = () => {
    // ✅ Lecture hall specific labels
    if (session.watch_type === 'classroom' && session.class_type === 'lecture_hall') {
      if (session.current_media_url) return 'Video Playing';
      if (session.is_screen_sharing_active) {
        return session.sharing_source === 'watchfrom' ? 'Watch From Active' : 'LiveShare Active';
      }
      return 'Lecture Hall';
    }
    
    if (session.watch_type === '3d_cinema') return '3D Cinema';
    if (session.watch_type === 'classroom') return 'Classroom';
    return 'Video Watch';
  };

  return (
    <div className="w-full h-full bg-gray-100 dark:bg-gray-900 overflow-hidden">
      {/* Emoji State */}
      {loadState === 'emoji' && (
        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-purple-500 to-blue-600">
          <div className="text-8xl mb-4">{getSourceEmoji()}</div>
          <div className="text-white text-lg font-medium">{getSourceLabel()}</div>
        </div>
      )}

      {/* Loading State */}
      {loadState === 'loading' && (
        <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-gray-700 to-gray-800">
          <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-white mb-4"></div>
          <div className="text-white text-base">Generating preview...</div>
        </div>
      )}

      {/* Poster State */}
      {loadState === 'poster' && posterUrl && (
        <div className="relative w-full h-full">
          <img
            src={posterUrl}
            alt="Session poster"
            className="w-full h-full object-cover"
            onError={() => {
              setImageError(true);
              setLoadState('emoji');
            }}
          />
          {/* Optional: Loading overlay for GIF */}
          {isGenerating && (
            <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
              <div className="text-white text-sm">Generating GIF...</div>
            </div>
          )}
        </div>
      )}

      {/* GIF State */}
      {loadState === 'gif' && previewUrl && (
        <img
          src={previewUrl}
          alt="Session preview"
          className="w-full h-full object-cover"
          onError={() => {
            setImageError(true);
            // Fallback to poster if GIF fails
            if (posterUrl) {
              setLoadState('poster');
            } else {
              setLoadState('emoji');
            }
          }}
        />
      )}
    </div>
  );
};

export default SessionPreview;
