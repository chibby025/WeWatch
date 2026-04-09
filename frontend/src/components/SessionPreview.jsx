// SessionPreview.jsx - Displays session preview with emoji → spinner → poster → MP4 video fallback
import React, { useState, useEffect, useRef } from 'react';

const SessionPreview = ({ session, previewUrl, posterUrl, isGenerating }) => {
  const [loadState, setLoadState] = useState('emoji'); // 'emoji' | 'loading' | 'poster' | 'video'
  const [imageError, setImageError] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(null); // width / height
  const videoRef = useRef(null);

  useEffect(() => {
    if (isGenerating) {
      setLoadState('loading');
      return;
    }

    if (previewUrl && !imageError) {
      setLoadState('video');
    } else if (posterUrl && !imageError) {
      setLoadState('poster');
    } else {
      setLoadState('emoji');
    }
  }, [previewUrl, posterUrl, isGenerating, imageError]);

  // Detect video aspect ratio for TikTok-style rendering
  useEffect(() => {
    if (loadState === 'video' && videoRef.current) {
      const video = videoRef.current;
      
      const handleLoadedMetadata = () => {
        const ratio = video.videoWidth / video.videoHeight;
        setAspectRatio(ratio);
        console.log(`📐 Video aspect ratio: ${ratio.toFixed(2)} (${video.videoWidth}x${video.videoHeight})`);
      };

      video.addEventListener('loadedmetadata', handleLoadedMetadata);
      
      // If metadata already loaded
      if (video.videoWidth && video.videoHeight) {
        handleLoadedMetadata();
      }

      return () => {
        video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      };
    }
  }, [loadState, previewUrl]);

  // Determine fit style based on aspect ratio (TikTok-style)
  const getVideoFitStyle = () => {
    if (aspectRatio === null) return 'object-cover'; // Default while loading
    
    // Portrait videos (like TikTok): fill screen
    // Includes 9:16 (0.56), 3:4 (0.75), and other vertical orientations
    if (aspectRatio < 0.8) {
      return 'object-cover';
    }
    
    // Landscape/square videos: pillarbox (contain)
    return 'object-contain';
  };

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
          {/* Optional: Loading overlay for video generation */}
          {isGenerating && (
            <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
              <div className="text-white text-sm">Generating video...</div>
            </div>
          )}
        </div>
      )}

      {/* Video State */}
      {loadState === 'video' && previewUrl && (
        <video
          ref={videoRef}
          src={previewUrl}
          autoPlay
          loop
          muted
          playsInline
          className={`w-full h-full ${getVideoFitStyle()}`}
          onError={() => {
            setImageError(true);
            // Fallback to poster if video fails
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
