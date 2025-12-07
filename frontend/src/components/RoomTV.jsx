// WeWatch/frontend/src/components/RoomTV.jsx
// Dynamic content banner - shows sessions, events, announcements, and (future) ads
import React, { useState, useEffect } from 'react';
import { PlayIcon, ClockIcon, XMarkIcon, UsersIcon } from '@heroicons/react/24/outline';

// CSS Animations for RoomTV text
const animations = `
  @keyframes scrollLeft {
    0% { transform: translateX(100%); }
    100% { transform: translateX(-100%); }
  }
  @keyframes scrollLeftSlow {
    0% { transform: translateX(100%); }
    100% { transform: translateX(-100%); }
  }
  @keyframes scrollLeftFast {
    0% { transform: translateX(100%); }
    100% { transform: translateX(-100%); }
  }
  @keyframes fadePulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.7; transform: scale(1.05); }
  }
  @keyframes fadePulseSlow {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.7; transform: scale(1.05); }
  }
  @keyframes fadePulseFast {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.7; transform: scale(1.05); }
  }
  @keyframes slideUp {
    0% { transform: translateY(100%); opacity: 0; }
    100% { transform: translateY(0); opacity: 1; }
  }
  @keyframes slideUpSlow {
    0% { transform: translateY(100%); opacity: 0; }
    100% { transform: translateY(0); opacity: 1; }
  }
  @keyframes slideUpFast {
    0% { transform: translateY(100%); opacity: 0; }
    100% { transform: translateY(0); opacity: 1; }
  }
  @keyframes bounceIn {
    0% { transform: scale(0.3); opacity: 0; }
    50% { transform: scale(1.1); }
    70% { transform: scale(0.9); }
    100% { transform: scale(1); opacity: 1; }
  }
  @keyframes bounceInSlow {
    0% { transform: scale(0.3); opacity: 0; }
    50% { transform: scale(1.1); }
    70% { transform: scale(0.9); }
    100% { transform: scale(1); opacity: 1; }
  }
  @keyframes bounceInFast {
    0% { transform: scale(0.3); opacity: 0; }
    50% { transform: scale(1.1); }
    70% { transform: scale(0.9); }
    100% { transform: scale(1); opacity: 1; }
  }
  @keyframes zoomFlash {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.2); filter: brightness(1.3); }
  }
  @keyframes zoomFlashSlow {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.2); filter: brightness(1.3); }
  }
  @keyframes zoomFlashFast {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.2); filter: brightness(1.3); }
  }
  @keyframes typewriter {
    from { width: 0; }
    to { width: 100%; }
  }
  @keyframes typewriterSlow {
    from { width: 0; }
    to { width: 100%; }
  }
  @keyframes typewriterFast {
    from { width: 0; }
    to { width: 100%; }
  }

  /* Animation classes with speed variants */
  .animate-scroll-left { animation: scrollLeft 15s linear infinite; }
  .animate-scroll-left-slow { animation: scrollLeftSlow 25s linear infinite; }
  .animate-scroll-left-medium { animation: scrollLeft 15s linear infinite; }
  .animate-scroll-left-fast { animation: scrollLeftFast 8s linear infinite; }
  
  .animate-fade-pulse { animation: fadePulse 2s ease-in-out infinite; }
  .animate-fade-pulse-slow { animation: fadePulseSlow 4s ease-in-out infinite; }
  .animate-fade-pulse-medium { animation: fadePulse 2s ease-in-out infinite; }
  .animate-fade-pulse-fast { animation: fadePulseFast 1s ease-in-out infinite; }
  
  .animate-slide-up { animation: slideUp 0.8s ease-out forwards; }
  .animate-slide-up-slow { animation: slideUpSlow 1.5s ease-out forwards; }
  .animate-slide-up-medium { animation: slideUp 0.8s ease-out forwards; }
  .animate-slide-up-fast { animation: slideUpFast 0.4s ease-out forwards; }
  
  .animate-bounce-in { animation: bounceIn 1s ease-out forwards; }
  .animate-bounce-in-slow { animation: bounceInSlow 2s ease-out forwards; }
  .animate-bounce-in-medium { animation: bounceIn 1s ease-out forwards; }
  .animate-bounce-in-fast { animation: bounceInFast 0.5s ease-out forwards; }
  
  .animate-zoom-flash { animation: zoomFlash 1.5s ease-in-out infinite; }
  .animate-zoom-flash-slow { animation: zoomFlashSlow 3s ease-in-out infinite; }
  .animate-zoom-flash-medium { animation: zoomFlash 1.5s ease-in-out infinite; }
  .animate-zoom-flash-fast { animation: zoomFlashFast 0.8s ease-in-out infinite; }
  
  .animate-typewriter { 
    overflow: hidden;
    white-space: nowrap;
    animation: typewriter 4s steps(40, end) forwards;
  }
  .animate-typewriter-slow { 
    overflow: hidden;
    white-space: nowrap;
    animation: typewriterSlow 8s steps(40, end) forwards;
  }
  .animate-typewriter-medium { 
    overflow: hidden;
    white-space: nowrap;
    animation: typewriter 4s steps(40, end) forwards;
  }
  .animate-typewriter-fast { 
    overflow: hidden;
    white-space: nowrap;
    animation: typewriterFast 2s steps(40, end) forwards;
  }
`;

const RoomTV = ({ 
  roomId, 
  activeSession, 
  upcomingEvents = [],
  hostContent = null,
  onJoinSession,
  isHost = false,
  onCreateContent,
  onDismissContent
}) => {
  const [content, setContent] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);

  // Helper: Get animation class based on type and speed
  const getAnimationClass = (animationType, speed = 'medium') => {
    if (!animationType) return '';
    const baseClass = `animate-${animationType}`;
    return speed === 'medium' ? baseClass : `${baseClass}-${speed}`;
  };

  // Priority logic: Session > Host Content > Upcoming Event > Ad (Phase 2)
  useEffect(() => {
    const determineContent = () => {
      // Priority 1: Active Watch Session
      if (activeSession) {
        return {
          type: 'session',
          data: activeSession,
          duration: null // Stays until session ends
        };
      }

      // Priority 2: Host Content (announcement/media)
      if (hostContent && hostContent.ends_at && new Date(hostContent.ends_at) > new Date()) {
        return {
          type: 'host_content',
          data: hostContent,
          duration: Math.floor((new Date(hostContent.ends_at) - new Date()) / 1000)
        };
      }

      // Priority 3: Upcoming Event (within 1 hour)
      const upcomingEvent = upcomingEvents.find(event => {
        const eventTime = new Date(event.scheduled_for);
        const now = new Date();
        const hourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
        return eventTime > now && eventTime < hourFromNow;
      });

      if (upcomingEvent) {
        return {
          type: 'event',
          data: upcomingEvent,
          duration: 300 // Show for 5 minutes, then auto-hide
        };
      }

      // Priority 4: Ads (Phase 2 - Commented out)
      // if (adsEnabled && !content) {
      //   return {
      //     type: 'ad',
      //     data: adContent,
      //     duration: 30
      //   };
      // }

      return null;
    };

    const newContent = determineContent();
    setContent(newContent);
    setIsExpanded(!!newContent);

    // Auto-hide after duration (if specified)
    if (newContent?.duration) {
      const timer = setTimeout(() => {
        setIsExpanded(false);
        setTimeout(() => setContent(null), 300); // Wait for animation
      }, newContent.duration * 1000);

      return () => clearTimeout(timer);
    }
  }, [activeSession, hostContent, upcomingEvents]);

  // Render nothing if no content
  if (!content) return null;

  return (
    <>
      {/* Inject CSS animations */}
      <style>{animations}</style>
      
      <div 
        className={`transition-all duration-300 ease-in-out overflow-hidden bg-gray-800 border-b border-gray-700 ${
          isExpanded ? 'max-h-48' : 'max-h-0'
        }`}
      >
      <div className="px-4 py-3">
        {/* Session Content */}
        {content.type === 'session' && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-red-600 rounded-full flex items-center justify-center animate-pulse">
                <PlayIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="text-white font-semibold">
                  Watch Session Active
                </div>
                <div className="text-sm text-gray-300 flex items-center gap-2">
                  <UsersIcon className="w-4 h-4" />
                  {content.data.members?.length || 0} watching • {content.data.watch_type === '3d_cinema' ? '3D Cinema' : 'Video'}
                </div>
              </div>
            </div>
            <button
              onClick={onJoinSession}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              <PlayIcon className="w-4 h-4" />
              Join Now
            </button>
          </div>
        )}

        {/* Host Content (Announcement/Media) - with animations */}
        {content.type === 'host_content' && (
          <div 
            className="flex items-start justify-between rounded-lg overflow-hidden"
            style={{
              background: content.data.bg_gradient || 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
              padding: '12px',
            }}
          >
            <div className="flex-1">
              {content.data.thumbnail_url && (
                <img 
                  src={content.data.thumbnail_url} 
                  alt={content.data.title}
                  className="w-full h-32 object-cover rounded-lg mb-2"
                />
              )}
              <div 
                className={`font-bold mb-1 text-lg ${
                  getAnimationClass(content.data.animation_type, content.data.animation_speed)
                }`}
                style={{ color: content.data.text_color || '#FFFFFF' }}
              >
                {content.data.title || 'Host Announcement'}
              </div>
              <div 
                className="text-sm"
                style={{ color: content.data.text_color ? `${content.data.text_color}CC` : '#FFFFFFCC' }}
              >
                {content.data.description}
              </div>
              {content.data.content_url && (
                <a 
                  href={content.data.content_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm mt-2 inline-block font-medium hover:underline"
                  style={{ color: content.data.text_color || '#FFFFFF' }}
                >
                  View Content →
                </a>
              )}
            </div>
            {isHost && (
              <button
                onClick={() => onDismissContent?.(content.data.id)}
                className="ml-4 hover:opacity-80 transition-opacity"
                style={{ color: content.data.text_color || '#FFFFFF' }}
                title="Dismiss"
              >
                <XMarkIcon className="w-5 h-5" />
              </button>
            )}
          </div>
        )}

        {/* Upcoming Event */}
        {content.type === 'event' && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-purple-600 rounded-full flex items-center justify-center">
                <ClockIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="text-white font-semibold">
                  {content.data.title || 'Upcoming Event'}
                </div>
                <div className="text-sm text-gray-300">
                  Starts at {new Date(content.data.scheduled_for).toLocaleTimeString('en-US', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })} • {content.data.watch_type === '3d_cinema' ? '3D Cinema' : 'Video'}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-white font-mono text-lg">
                {getCountdown(content.data.scheduled_for)}
              </div>
              <div className="text-xs text-gray-400">until start</div>
            </div>
          </div>
        )}

        {/* Phase 2: Ad Content (Commented out) */}
        {/* {content.type === 'ad' && (
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="text-xs text-gray-400 mb-1">SPONSORED</div>
              <div className="text-white font-semibold mb-1">
                {content.data.title}
              </div>
              <div className="text-sm text-gray-300">
                {content.data.description}
              </div>
            </div>
            <a
              href={content.data.url}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-4 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Learn More
            </a>
          </div>
        )} */}
      </div>
    </div>
    </>
  );
};

// Helper: Calculate countdown
const getCountdown = (targetTime) => {
  const now = new Date();
  const target = new Date(targetTime);
  const diff = Math.max(0, target - now);
  
  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
};

export default RoomTV;
