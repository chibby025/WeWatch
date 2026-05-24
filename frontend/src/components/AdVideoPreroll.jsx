// frontend/src/components/AdVideoPreroll.jsx
import React, { useState, useEffect, useRef } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL } from '../services/api';

const AdVideoPreroll = ({ onComplete, roomId, contentRating }) => {
  const { currentUser } = useAuth();
  const [ad, setAd] = useState(null);
  const [loading, setLoading] = useState(true);
  const [countdown, setCountdown] = useState(null);
  const [canSkip, setCanSkip] = useState(false);
  const videoRef = useRef(null);
  const viewStartTime = useRef(null);

  useEffect(() => {
    fetchAd();
  }, []);

  const fetchAd = async () => {
    try {
      const userAge = currentUser?.date_of_birth 
        ? Math.floor((new Date() - new Date(currentUser.date_of_birth)) / (365.25 * 24 * 60 * 60 * 1000))
        : null;

      const params = new URLSearchParams({
        ad_type: 'video_preroll',
        ...(userAge && { user_age: userAge }),
        ...(contentRating && { content_rating: contentRating })
      });

      const response = await fetch(`${API_BASE_URL}/api/ads/active?${params}`);
      if (response.ok) {
        const data = await response.json();
        if (data.campaigns && data.campaigns.length > 0) {
          setAd(data.campaigns[0]);
          viewStartTime.current = Date.now();
          // Track impression
          trackImpression(data.campaigns[0].id, false);
        } else {
          // No ad available, skip to content
          onComplete();
        }
      }
    } catch (error) {
      console.error('Failed to fetch ad:', error);
      onComplete(); // Skip to content on error
    } finally {
      setLoading(false);
    }
  };

  const trackImpression = async (campaignId, clicked) => {
    try {
      const viewDuration = viewStartTime.current 
        ? Math.floor((Date.now() - viewStartTime.current) / 1000)
        : 0;

      await fetch(`${API_BASE_URL}/api/ads/campaigns/${campaignId}/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_id: roomId,
          clicked,
          view_duration: viewDuration
        })
      });
    } catch (error) {
      console.error('Failed to track impression:', error);
    }
  };

  const handleVideoTimeUpdate = () => {
    if (!videoRef.current || !ad) return;

    const currentTime = videoRef.current.currentTime;
    const duration = videoRef.current.duration;

    // Update countdown
    const remaining = Math.ceil(duration - currentTime);
    setCountdown(remaining);

    // Enable skip button after 5 seconds
    if (currentTime >= 5 && !canSkip) {
      setCanSkip(true);
    }
  };

  const handleVideoEnd = () => {
    if (ad) {
      trackImpression(ad.id, false);
    }
    onComplete();
  };

  const handleSkip = () => {
    if (ad) {
      trackImpression(ad.id, false);
    }
    onComplete();
  };

  const handleClickAd = () => {
    if (!ad) return;
    
    trackImpression(ad.id, true);
    window.open(ad.click_url, '_blank', 'noopener,noreferrer');
  };

  // While fetching, render nothing — content stays visible in the background
  if (loading) return null;

  if (!ad) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black z-[9999] flex items-center justify-center">
      {/* Video */}
      <div className="relative w-full h-full flex items-center justify-center">
        <video
          ref={videoRef}
          src={ad.media_url}
          autoPlay
          onTimeUpdate={handleVideoTimeUpdate}
          onEnded={handleVideoEnd}
          className="max-w-full max-h-full"
        />

        {/* Overlay Controls */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Top Bar */}
          <div className="absolute top-0 left-0 right-0 p-4 bg-gradient-to-b from-black/80 to-transparent">
            <div className="flex items-center justify-between">
              <div className="pointer-events-auto">
                <span className="bg-yellow-500 text-black px-2 py-1 rounded text-xs font-bold">
                  AD
                </span>
                <span className="text-white text-sm ml-3">
                  {countdown !== null && countdown > 0 && `${countdown}s remaining`}
                </span>
              </div>

              {canSkip && (
                <button
                  onClick={handleSkip}
                  className="pointer-events-auto bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
                >
                  <XMarkIcon className="w-4 h-4" />
                  Skip Ad
                </button>
              )}
            </div>
          </div>

          {/* Bottom Bar - Ad Info */}
          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
            <div 
              onClick={handleClickAd}
              className="pointer-events-auto bg-white/10 hover:bg-white/20 backdrop-blur-sm rounded-lg p-4 cursor-pointer transition-all"
            >
              <p className="text-white font-semibold text-lg mb-1">
                {ad.campaign_name}
              </p>
              <p className="text-gray-300 text-sm mb-2">
                Click to learn more
              </p>
              <div className="flex items-center gap-2">
                <span className="text-purple-400 text-sm font-medium">
                  Visit Now →
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdVideoPreroll;
