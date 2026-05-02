// frontend/src/components/ads/FeedAdCard.jsx
import React, { useEffect } from 'react';
import { formatCount } from '../../utils/formatCount';

/**
 * Feed Ad Card Component
 * Displays ads in session feeds and discover feeds
 * Matches design of regular session/post cards for native integration
 */
export default function FeedAdCard({ ad, onTrackImpression }) {
  // Track impression on mount
  useEffect(() => {
    if (ad && onTrackImpression) {
      onTrackImpression(false); // Not clicked, just viewed
    }
  }, [ad?.id]);

  if (!ad) return null;

  // Handle click - open advertiser URL and track click
  const handleClick = () => {
    if (ad.click_url) {
      window.open(ad.click_url, '_blank');
    }
    if (onTrackImpression) {
      onTrackImpression(true); // Clicked
    }
  };

  // Detect media type
  const isVideo = ad.media_url?.match(/\.(mp4|webm|mov|avi)$/i);
  const isGif = ad.media_url?.match(/\.(gif|webp)$/i);

  return (
    <div 
      onClick={handleClick}
      className="relative w-full max-w-4xl mx-auto rounded-2xl overflow-hidden shadow-2xl hover:shadow-3xl transition-all duration-300 transform hover:scale-[1.02] cursor-pointer group"
      style={{ minHeight: '500px' }}
    >
      {/* Media Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-900 to-blue-900">
        {isVideo ? (
          <video
            src={ad.media_url}
            className="w-full h-full object-cover"
            autoPlay
            loop
            muted
            playsInline
          />
        ) : (
          <img
            src={ad.media_url || ad.thumbnail_url}
            alt={ad.advertiser_name}
            className="w-full h-full object-cover"
          />
        )}
      </div>
      
      {/* Dark Gradient Overlay for readability */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none"></div>
      
      {/* Content Overlay (TikTok-style) */}
      <div 
        className="absolute bottom-4 left-4 right-20 text-white pointer-events-auto"
        style={{ fontFamily: '"Outfit", -apple-system, "Segoe UI", sans-serif' }}
      >
        {/* Row 1: Advertiser Avatar + Name */}
        <div className="flex items-center gap-3 mb-3">
          <div className="relative w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white font-bold text-sm overflow-hidden">
            {ad.advertiser_logo ? (
              <img src={ad.advertiser_logo} alt={ad.advertiser_name} className="w-full h-full object-cover" />
            ) : (
              ad.advertiser_name?.[0]?.toUpperCase() || 'A'
            )}
          </div>
          
          <span 
            className="font-semibold text-white text-sm truncate"
            style={{ textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}
          >
            {ad.advertiser_name}
          </span>
        </div>
        
        {/* Row 2: Ad Title */}
        <h3 
          className="text-xl sm:text-2xl font-bold mb-2 line-clamp-2"
          style={{ textShadow: '0 2px 8px rgba(0,0,0,0.9)' }}
        >
          {ad.title || ad.advertiser_name}
        </h3>
        
        {/* Row 3: Description (if available) */}
        {ad.description && (
          <p 
            className="text-sm text-white/90 mb-3 line-clamp-2"
            style={{ textShadow: '0 2px 4px rgba(0,0,0,0.8)' }}
          >
            {ad.description}
          </p>
        )}
        
        {/* Row 4: CTA Button */}
        <button
          onClick={handleClick}
          className="px-6 py-2 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold rounded-full shadow-lg transition-all transform hover:scale-105"
        >
          Learn More
        </button>
      </div>
      
      {/* Right Side Stats (Fake engagement for native feel) */}
      <div className="absolute right-4 bottom-24 flex flex-col gap-4 text-white">
        {/* View Count */}
        <div className="flex flex-col items-center gap-1">
          <div className="w-12 h-12 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center">
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
            </svg>
          </div>
          <span className="text-xs font-semibold">{formatCount(Math.floor(Math.random() * 10000) + 1000)}</span>
        </div>
      </div>
    </div>
  );
}
