// frontend/src/components/ads/InSessionAdPanel.jsx
import React, { useState, useRef, useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { SpeakerWaveIcon, SpeakerXMarkIcon } from '@heroicons/react/24/solid';

/**
 * InSessionAdPanel - Unified Ad Component
 * 
 * Supports two modes:
 * 1. Break Screen (fullscreen=true): Full-screen video ad during host breaks
 * 2. Banner/Sidebar (fullscreen=false): 80-20 split banner/GIF/video ads
 * 
 * @param {Object} ad - Ad object { id, media_url, click_url, duration, ad_type }
 * @param {Function} onComplete - Callback when ad finishes
 * @param {Function} onTrackImpression - Callback to track impression
 * @param {Boolean} fullscreen - If true, show as full-screen break ad
 */
const InSessionAdPanel = ({ ad, onComplete, onTrackImpression, fullscreen = false }) => {
  const [isMuted, setIsMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const videoRef = useRef(null);
  const imgRef = useRef(null);

  // Handle null ad gracefully
  if (!ad) {
    return null;
  }

  // Detect if ad is video or image/gif
  const isVideo = ad?.media_url?.match(/\.(mp4|webm|mov|avi)$/i);
  const isAnimated = ad?.media_url?.match(/\.(gif|webp)$/i);

  // Track impression on mount
  useEffect(() => {
    if (ad && onTrackImpression) {
      onTrackImpression(ad.id);
    }
  }, [ad, onTrackImpression]);

  // Handle video end
  useEffect(() => {
    if (!isVideo) {
      // For non-video ads (GIF/image), auto-close after duration or 15 seconds
      const timeout = setTimeout(() => {
        if (onComplete) {
          onComplete();
        }
      }, (ad.duration || 15) * 1000);

      return () => clearTimeout(timeout);
    }

    const video = videoRef.current;
    if (!video) return;

    const handleEnded = () => {
      console.log('🎬 [InSessionAdPanel] Ad completed, calling onComplete');
      if (onComplete) {
        onComplete();
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
    };

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
    };

    video.addEventListener('ended', handleEnded);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('loadedmetadata', handleLoadedMetadata);

    return () => {
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
    };
  }, [onComplete, isVideo, ad?.duration]);

  // Handle ad click
  const handleAdClick = () => {
    if (ad.click_url) {
      window.open(ad.click_url, '_blank', 'noopener,noreferrer');
      // Track click
      if (onTrackImpression) {
        onTrackImpression(ad.id, true); // true = clicked
      }
    }
  };

  // Toggle mute
  const toggleMute = (e) => {
    e.stopPropagation(); // Prevent triggering ad click
    setIsMuted(!isMuted);
    if (videoRef.current) {
      videoRef.current.muted = !isMuted;
    }
  };

  if (!ad) return null;

  // Progress bar percentage
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  const remainingTime = isVideo 
    ? Math.ceil(duration - currentTime)
    : Math.ceil((ad.duration || 15) - (Date.now() - (ad._startTime || Date.now())) / 1000);

  // Full-screen break ad layout
  if (fullscreen) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
        {/* Video Ad */}
        {isVideo && (
          <video
            ref={videoRef}
            src={ad.media_url}
            autoPlay
            muted={isMuted}
            playsInline
            className="w-full h-full object-contain"
            onError={(e) => console.error('Video load error:', e)}
          />
        )}

        {/* Image/GIF Ad */}
        {!isVideo && (
          <img
            ref={imgRef}
            src={ad.media_url}
            alt={ad.campaign_name}
            className="w-full h-full object-contain"
          />
        )}

        {/* Mute/Unmute Button (video only) */}
        {isVideo && (
          <button
            onClick={toggleMute}
            className="absolute top-8 right-8 bg-black/70 hover:bg-black/90 text-white rounded-full p-3 transition-all z-10"
            aria-label={isMuted ? 'Unmute ad' : 'Mute ad'}
          >
            {isMuted ? (
              <SpeakerXMarkIcon className="w-7 h-7" />
            ) : (
              <SpeakerWaveIcon className="w-7 h-7" />
            )}
          </button>
        )}

        {/* Progress Bar */}
        <div className="absolute bottom-0 left-0 right-0 h-2 bg-gray-800">
          <div
            className="h-full bg-blue-500 transition-all duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Ad Info */}
        <div className="absolute bottom-8 left-8 bg-black/70 text-white px-6 py-3 rounded-lg">
          <div className="text-sm">Advertisement</div>
          <div className="text-2xl font-bold">{remainingTime}s remaining</div>
        </div>

        {/* Click to Learn More */}
        {ad.click_url && (
          <button
            onClick={handleAdClick}
            className="absolute bottom-8 right-8 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg transition-all font-semibold"
          >
            Learn More →
          </button>
        )}
      </div>
    );
  }

  // Sidebar/Banner ad layout (80-20 split)
  return (
    <div className="relative w-full h-full bg-black flex items-center justify-center overflow-hidden group"
      onClick={ad.click_url ? handleAdClick : undefined}
      style={{ cursor: ad.click_url ? 'pointer' : 'default' }}
    >
      {/* Video Ad */}
      {isVideo && (
        <video
          ref={videoRef}
          src={ad.media_url}
          autoPlay
          muted={isMuted}
          playsInline
          className="w-full h-full object-cover"
        />
      )}

      {/* Image/GIF Ad */}
      {!isVideo && (
        <img
          ref={imgRef}
          src={ad.media_url}
          alt={ad.campaign_name}
          className="w-full h-full object-cover"
        />
      )}

      {/* Mute/Unmute Button */}
      {isVideo && (
        <button
          onClick={toggleMute}
          className="absolute top-4 right-4 bg-black/60 hover:bg-black/80 text-white rounded-full p-2 transition-all z-10"
          aria-label={isMuted ? 'Unmute ad' : 'Mute ad'}
        >
          {isMuted ? (
            <SpeakerXMarkIcon className="w-5 h-5 sm:w-6 sm:h-6" />
          ) : (
            <SpeakerWaveIcon className="w-5 h-5 sm:w-6 sm:h-6" />
          )}
        </button>
      )}

      {/* Progress Bar (video only) */}
      {isVideo && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-700">
          <div
            className="h-full bg-blue-500 transition-all duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Ad Info (bottom-left) */}
      <div className="absolute bottom-4 left-4 bg-black/60 text-white text-xs sm:text-sm px-3 py-1.5 rounded">
        Ad • {remainingTime}s remaining
      </div>

      {/* Click to Learn More (bottom-center) */}
      {ad.click_url && (
        <button
          onClick={handleAdClick}
          className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm px-4 py-2 rounded-lg transition-all opacity-0 group-hover:opacity-100"
        >
          Learn More →
        </button>
      )}
    </div>
  );
};

export default InSessionAdPanel;
