// frontend/src/components/AdBanner.jsx
import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

const AdBanner = ({ placement = 'lobby_sidebar' }) => {
  const { currentUser } = useAuth();
  const [ad, setAd] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAd();
  }, [currentUser]);

  const fetchAd = async () => {
    try {
      const userAge = currentUser?.date_of_birth 
        ? Math.floor((new Date() - new Date(currentUser.date_of_birth)) / (365.25 * 24 * 60 * 60 * 1000))
        : null;

      const params = new URLSearchParams({
        ad_type: 'banner',
        ...(userAge && { user_age: userAge })
      });

      const response = await fetch(`/api/ads/active?${params}`);
      if (response.ok) {
        const data = await response.json();
        if (data.campaigns && data.campaigns.length > 0) {
          setAd(data.campaigns[0]);
          // Track impression
          trackImpression(data.campaigns[0].id);
        }
      }
    } catch (error) {
      console.error('Failed to fetch ad:', error);
    } finally {
      setLoading(false);
    }
  };

  const trackImpression = async (campaignId) => {
    try {
      await fetch(`/api/ads/campaigns/${campaignId}/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clicked: false,
          view_duration: 0
        })
      });
    } catch (error) {
      console.error('Failed to track impression:', error);
    }
  };

  const handleClick = async () => {
    if (!ad) return;

    // Track click
    try {
      await fetch(`/api/ads/campaigns/${ad.id}/track`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clicked: true,
          view_duration: 0
        })
      });
    } catch (error) {
      console.error('Failed to track click:', error);
    }

    // Open link
    window.open(ad.click_url, '_blank', 'noopener,noreferrer');
  };

  if (loading) {
    return (
      <div className="w-full bg-gray-800/50 rounded-lg p-4 animate-pulse">
        <div className="h-40 bg-gray-700 rounded"></div>
      </div>
    );
  }

  if (!ad) {
    return null; // No ad to display
  }

  return (
    <div className="w-full mb-4">
      <div 
        onClick={handleClick}
        className="relative cursor-pointer group overflow-hidden rounded-lg border border-gray-700 hover:border-purple-500 transition-all"
      >
        <img 
          src={ad.media_url} 
          alt={ad.campaign_name}
          className="w-full h-auto object-cover group-hover:scale-105 transition-transform duration-300"
        />
        
        {/* Sponsored label */}
        <div className="absolute top-2 left-2 bg-black/70 px-2 py-1 rounded text-xs text-gray-300">
          Sponsored
        </div>

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="absolute bottom-2 left-2 right-2">
            <p className="text-white text-sm font-semibold truncate">
              {ad.campaign_name}
            </p>
            <p className="text-gray-300 text-xs">Click to learn more →</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdBanner;
