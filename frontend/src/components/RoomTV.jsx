// WeWatch/frontend/src/components/RoomTV.jsx
// Dynamic content banner - shows sessions, events, announcements, and (future) ads
import React, { useState, useEffect, useRef } from 'react';
import { PlayIcon, ClockIcon, XMarkIcon, UsersIcon } from '@heroicons/react/24/outline';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

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
  @keyframes marquee {
    0% { transform: translateX(0); }
    100% { transform: translateX(-100%); }
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
  onEndSession,
  isHost = false,
  onCreateContent,
  onDismissContent,
  refetchTrigger = 0 // Add this to allow parent to trigger refetch
}) => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const [content, setContent] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedVideoUrl, setExpandedVideoUrl] = useState(null);
  const [roomPosts, setRoomPosts] = useState([]);
  const [currentPostIndex, setCurrentPostIndex] = useState(0);
  const [adContent, setAdContent] = useState(null);
  const [adDismissed, setAdDismissed] = useState(false);
  const adTimeoutRef = useRef(null);
  const postRotationRef = useRef(null);
  const postDismissRef = useRef(null);

  // Helper: Get random gradient for jumbotron
  const getRandomGradient = () => {
    const gradients = [
      'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
      'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
      'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
      'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
      'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
      'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
      'linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%)',
      'linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%)',
      'linear-gradient(135deg, #ff6e7f 0%, #bfe9ff 100%)',
    ];
    return gradients[Math.floor(Math.random() * gradients.length)];
  };

  // Helper: Get animation class based on type and speed
  const getAnimationClass = (animationType, speed = 'medium') => {
    if (!animationType) return '';
    const baseClass = `animate-${animationType}`;
    return speed === 'medium' ? baseClass : `${baseClass}-${speed}`;
  };

  // Fetch room posts (host posts to this room)
  useEffect(() => {
    if (roomId) {
      console.log('🔄 [RoomTV] Refetch triggered - fetching room posts (trigger:', refetchTrigger, ')');
      fetchRoomPosts();
    }
  }, [roomId, refetchTrigger]);

  const fetchRoomPosts = async () => {
    try {
      console.log('📡 [RoomTV] Fetching room posts for room', roomId);
      const response = await apiClient.get(`/api/rooms/${roomId}/posts?limit=5`);
      console.log('📬 [RoomTV] Received posts response:', {
        count: response.data.posts?.length || 0,
        posts: response.data.posts?.map(p => ({ id: p.id, title: p.title, created_at: p.created_at }))
      });
      
      if (response.data.posts && response.data.posts.length > 0) {
        // Filter posts: only show posts created within last 5 minutes
        const now = new Date();
        const recentPosts = response.data.posts.filter(post => {
          const postCreatedAt = new Date(post.created_at);
          const ageInMinutes = (now - postCreatedAt) / (1000 * 60);
          return ageInMinutes <= 5; // Only show posts less than 5 minutes old
        });
        
        console.log('⏱️ [RoomTV] After age filter (< 5 min):', recentPosts.length, 'posts remain');
        
        if (recentPosts.length > 0) {
          console.log('✅ [RoomTV] Setting room posts:', recentPosts.map(p => p.title));
          setRoomPosts(recentPosts);
          setCurrentPostIndex(0);
        } else {
          console.log('⚠️ [RoomTV] No recent posts found (all older than 5 minutes)');
          setRoomPosts([]);
        }
      } else {
        console.log('ℹ️ [RoomTV] No posts found for room');
        setRoomPosts([]);
      }
    } catch (error) {
      console.error('Failed to fetch room posts:', error);
      setRoomPosts([]);
    }
  };

  // Track ad impression or click
  const trackAdEvent = async (campaignId, clicked = false) => {
    try {
      await apiClient.post(`/api/ads/campaigns/${campaignId}/track`, {
        clicked,
        user_id: currentUser?.id
      });
      console.log(`✅ [RoomTV Ad] Tracked ${clicked ? 'click' : 'impression'} for campaign ${campaignId}`);
    } catch (error) {
      console.error('❌ [RoomTV Ad] Failed to track:', error);
    }
  };

  // Fetch RoomTV ad (when idle)
  const fetchRoomTVAd = async () => {
    if (!roomId || !currentUser) {
      console.log('🚫 [RoomTV Ad] Cannot fetch: missing roomId or currentUser');
      return null;
    }
    
    try {
      console.log('🎯 [RoomTV Ad] Fetching ad for room', roomId, 'user', currentUser.id);
      const response = await apiClient.get('/api/ads/roomtv', {
        params: { room_id: roomId, user_id: currentUser.id }
      });
      console.log('📥 [RoomTV Ad] Response:', response.data);
      
      // Backend returns { ad: {...}, message: "..." }
      if (response.data && response.data.ad) {
        console.log('✅ [RoomTV Ad] Ad found:', response.data.ad);
        const ad = response.data.ad;
        
        // Track impression immediately
        if (ad.id) {
          trackAdEvent(ad.id, false);
        }
        
        return ad;
      } else {
        console.log('⚠️ [RoomTV Ad] No ad in response:', response.data);
        return null;
      }
    } catch (error) {
      // Silently fail - ads are optional
      console.log('❌ [RoomTV Ad] Error fetching:', error.response?.data?.message || error.message);
      return null;
    }
  };

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (adTimeoutRef.current) clearTimeout(adTimeoutRef.current);
      if (postRotationRef.current) clearInterval(postRotationRef.current);
      if (postDismissRef.current) clearTimeout(postDismissRef.current);
    };
  }, []);

  // Priority logic: Session > Host Content > Upcoming Event > Room Posts > Ad
  useEffect(() => {
    console.log('🔍 [RoomTV] useEffect triggered, activeSession:', activeSession);
    
    const determineContent = async () => {
      // Priority 1: Active Watch Session
      if (activeSession) {
        console.log('✅ [RoomTV] Active session detected:', {
          sessionId: activeSession.session_id,
          watchType: activeSession.watch_type,
          members: activeSession.members,
          startedAt: activeSession.started_at
        });
        
        // Clear post rotation and ad timers
        if (postRotationRef.current) clearInterval(postRotationRef.current);
        if (postDismissRef.current) clearTimeout(postDismissRef.current);
        if (adTimeoutRef.current) clearTimeout(adTimeoutRef.current);
        
        return {
          type: 'session',
          data: activeSession,
          duration: null // Stays until session ends
        };
      } else {
        console.log('ℹ️ [RoomTV] No active session (activeSession is null/undefined)');
      }

      // Priority 2: Host Content (announcement/media)
      if (hostContent && hostContent.ends_at && new Date(hostContent.ends_at) > new Date()) {
        // Clear post rotation and ad timers
        if (postRotationRef.current) clearInterval(postRotationRef.current);
        if (postDismissRef.current) clearTimeout(postDismissRef.current);
        if (adTimeoutRef.current) clearTimeout(adTimeoutRef.current);
        
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
        // Clear post rotation and ad timers
        if (postRotationRef.current) clearInterval(postRotationRef.current);
        if (postDismissRef.current) clearTimeout(postDismissRef.current);
        if (adTimeoutRef.current) clearTimeout(adTimeoutRef.current);
        
        return {
          type: 'event',
          data: upcomingEvent,
          duration: 300 // Show for 5 minutes, then auto-hide
        };
      }

      // Priority 4: Room Posts (host posts to this room)
      if (roomPosts.length > 0) {
        // Only set up timers if they don't already exist (prevents resetting on rotation)
        if (!postRotationRef.current) {
          // Rotate posts every 10 seconds
          postRotationRef.current = setInterval(() => {
            setCurrentPostIndex(prev => (prev + 1) % roomPosts.length);
          }, 10000);
        }
        
        if (!postDismissRef.current) {
          // Auto-dismiss all posts after 2 minutes
          postDismissRef.current = setTimeout(() => {
            if (postRotationRef.current) {
              clearInterval(postRotationRef.current);
              postRotationRef.current = null;
            }
            setRoomPosts([]); // Clear posts array
            setIsExpanded(false);
            setTimeout(() => setContent(null), 300);
          }, 120000); // 2 minutes
        }
        
        // Clear ad timeout if it exists
        if (adTimeoutRef.current) clearTimeout(adTimeoutRef.current);
        
        return {
          type: 'room_posts',
          data: roomPosts[currentPostIndex],
          duration: 120 // 2 minutes total
        };
      }

      // Priority 5: Ads (when idle and not dismissed)
      if (!adDismissed) {
        const ad = await fetchRoomTVAd();
        
        // Only display ads with valid titles
        if (ad && ad.title && ad.title.trim() !== '') {
          // Clear any existing ad timeout
          if (adTimeoutRef.current) clearTimeout(adTimeoutRef.current);
          
          // Auto-dismiss after ad duration
          const adDuration = ad.duration || 15; // Default 15s
          adTimeoutRef.current = setTimeout(() => {
            setAdDismissed(true);
            setIsExpanded(false);
            setTimeout(() => setContent(null), 300);
          }, adDuration * 1000);
          
          return {
            type: 'ad',
            data: ad,
            duration: adDuration
          };
        }
      }

      return null;
    };

    determineContent().then(newContent => {
      console.log('📺 [RoomTV] Content determined:', newContent ? `type: ${newContent.type}` : 'null');
      setContent(newContent);
      setIsExpanded(!!newContent);
    });

  }, [activeSession, hostContent, upcomingEvents, roomPosts, adDismissed]); // Removed currentPostIndex to prevent timer resets

  // Render nothing if no content
  if (!content) return null;

  return (
    <>
      {/* Inject CSS animations */}
      <style>{animations}</style>
      
      <div 
        className={`transition-all duration-300 ease-in-out overflow-y-auto custom-sleek-scrollbar border-b ${
          content?.type === 'session' 
            ? 'bg-gradient-to-r from-blue-900/90 via-purple-900/90 to-blue-900/90 border-blue-700 shadow-lg shadow-blue-900/50' 
            : 'bg-gray-800 border-gray-700'
        } ${
          isExpanded ? 'max-h-48 md:max-h-48 max-[768px]:max-h-[120px]' : 'max-h-0'
        }`}
      >
      <div className="px-2 py-2 sm:px-4 sm:py-3">
        {/* Session Content */}
        {content.type === 'session' && (
          <div className="space-y-2">
            {/* Mobile: Compact single-line layout */}
            <div className="md:hidden flex items-center justify-between gap-2">
              {/* Left: Play icon + Title + Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <div className="w-5 h-5 bg-red-600 rounded-full flex items-center justify-center animate-pulse flex-shrink-0">
                    <PlayIcon className="w-2.5 h-2.5 text-white" />
                  </div>
                  <div className="text-white font-semibold text-xs truncate">
                    Watch Session Active
                  </div>
                </div>
                <div className="text-[9px] text-gray-300 flex items-center gap-1 ml-6">
                  <UsersIcon className="w-2.5 h-2.5" />
                  {content.data.members?.length || 0} watching • {content.data.watch_type === '3d_cinema' ? '3D Cinema' : 'Video'}
                </div>
              </div>
              
              {/* Right: Buttons with icon above text */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  onClick={onJoinSession}
                  className="px-2 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex flex-col items-center gap-0.5"
                >
                  <PlayIcon className="w-4 h-4" />
                  <span className="text-[9px] font-medium">Join</span>
                </button>
                {isHost && onEndSession && (
                  <button
                    onClick={() => {
                      if (window.confirm('End this watch session for everyone? All participants will be returned to the room lobby.')) {
                        onEndSession();
                      }
                    }}
                    className="px-2 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors flex flex-col items-center gap-0.5"
                    title="End Watch Session"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-4 h-4">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-9a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 004.5 21h9a2.25 2.25 0 002.25-2.25V15M18 12H6m12 0l-3-3m3 3l-3 3" />
                    </svg>
                    <span className="text-[9px] font-medium">End</span>
                  </button>
                )}
              </div>
            </div>
            
            {/* Desktop: Single-line layout with icon above text buttons */}
            <div className="hidden md:flex items-center justify-between">
              {/* Left: Play icon + Title + Info */}
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
              
              {/* Right: Buttons with icon above text (vertically stacked) */}
              <div className="flex items-center gap-3">
                <button
                  onClick={onJoinSession}
                  className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors flex flex-col items-center gap-1"
                >
                  <PlayIcon className="w-6 h-6" />
                  <span className="text-xs font-medium whitespace-nowrap">Join Now{content.data.ticketing_enabled && ' 🪙'}</span>
                </button>
                {isHost && onEndSession && (
                  <button
                    onClick={() => {
                      if (window.confirm('End this watch session for everyone? All participants will be returned to the room lobby.')) {
                        onEndSession();
                      }
                    }}
                    className="px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors flex flex-col items-center gap-1"
                    title="End Watch Session"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor" className="w-6 h-6">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-9a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 004.5 21h9a2.25 2.25 0 002.25-2.25V15M18 12H6m12 0l-3-3m3 3l-3 3" />
                    </svg>
                    <span className="text-xs font-medium whitespace-nowrap">End Session</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Host Content (Announcement/Media) - with animations & VIDEO SUPPORT */}
        {content.type === 'host_content' && (
          <div 
            className="flex items-start justify-between rounded-lg overflow-hidden"
            style={{
              background: content.data.bg_gradient || 'linear-gradient(90deg, #667eea 0%, #764ba2 100%)',
              padding: window.innerWidth < 768 ? '8px' : '12px',
            }}
          >
            <div className="flex-1">
              {/* ✅ VIDEO PLAYER for uploaded content */}
              {content.data.is_uploaded && content.data.content_url ? (
                <div className="relative">
                  <video
                    src={content.data.content_url}
                    autoPlay
                    muted
                    loop={true}
                    className="w-full h-20 sm:h-32 object-cover rounded-lg"
                  />
                  
                  {/* Expand button overlay */}
                  <button
                    onClick={() => setExpandedVideoUrl(content.data.content_url)}
                    className="absolute top-1 right-1 sm:top-2 sm:right-2 bg-black/60 hover:bg-black/80 text-white px-2 py-0.5 sm:px-3 sm:py-1 rounded-lg text-xs sm:text-sm font-medium transition-colors flex items-center gap-1"
                  >
                    <svg className="w-3 h-3 sm:w-4 sm:h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                    </svg>
                    <span className="hidden sm:inline">Expand</span>
                  </button>
                </div>
              ) : content.data.thumbnail_url ? (
                <img 
                  src={content.data.thumbnail_url} 
                  alt={content.data.title}
                  className="w-full h-20 sm:h-32 object-cover rounded-lg mb-2"
                />
              ) : null}
              
              <div 
                className={`font-bold mb-1 text-sm sm:text-lg ${
                  getAnimationClass(content.data.animation_type, content.data.animation_speed)
                }`}
                style={{ color: content.data.text_color || '#FFFFFF' }}
              >
                {content.data.title || 'Host Announcement'}
              </div>
              <div 
                className="text-xs sm:text-sm line-clamp-2"
                style={{ color: content.data.text_color ? `${content.data.text_color}CC` : '#FFFFFFCC' }}
              >
                {content.data.description}
              </div>
              {content.data.content_url && !content.data.is_uploaded && (
                <a 
                  href={content.data.content_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs sm:text-sm mt-1 sm:mt-2 inline-block font-medium hover:underline"
                  style={{ color: content.data.text_color || '#FFFFFF' }}
                >
                  View Content →
                </a>
              )}
            </div>
            {isHost && (
              <button
                onClick={() => onDismissContent?.(content.data.id)}
                className="ml-2 sm:ml-4 hover:opacity-80 transition-opacity flex-shrink-0"
                style={{ color: content.data.text_color || '#FFFFFF' }}
                title="Dismiss"
              >
                <XMarkIcon className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            )}
          </div>
        )}

        {/* Upcoming Event */}
        {content.type === 'event' && (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-4 min-w-0">
              <div className="w-8 h-8 sm:w-12 sm:h-12 bg-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
                <ClockIcon className="w-4 h-4 sm:w-6 sm:h-6 text-white" />
              </div>
              <div className="min-w-0">
                <div className="text-white font-semibold text-sm sm:text-base truncate">
                  {content.data.title || 'Upcoming Event'}
                </div>
                <div className="text-xs sm:text-sm text-gray-300 truncate">
                  {new Date(content.data.scheduled_for).toLocaleTimeString('en-US', { 
                    hour: '2-digit', 
                    minute: '2-digit' 
                  })} • {content.data.watch_type === '3d_cinema' ? '3D Cinema' : 'Video'}
                </div>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <div className="text-white font-mono text-sm sm:text-lg">
                {getCountdown(content.data.scheduled_for)}
              </div>
              <div className="text-[10px] sm:text-xs text-gray-400">until start</div>
            </div>
          </div>
        )}

        {/* Room Posts Content - Jumbotron Style */}
        {content.type === 'room_posts' && content.data && (
          <div 
            className="cursor-pointer hover:opacity-90 transition-opacity rounded-lg overflow-hidden"
            style={{
              background: getRandomGradient(),
              padding: window.innerWidth < 768 ? '8px 12px' : '10px 16px',
            }}
            onClick={() => {
              // Navigate to Lobby page with post
              navigate('/lobby', { 
                state: { 
                  openPost: content.data.id, 
                  autoPlay: true 
                } 
              });
            }}
          >
            <div 
              className="font-semibold text-sm sm:text-base animate-fade-pulse truncate"
              style={{ color: '#FFFFFF' }}
            >
              🎬 New Post Available: {content.data.title}
            </div>
          </div>
        )}

        {/* Ad Content - BILLBOARD JUMBOTRON STYLE */}
        {content.type === 'ad' && content.data && (
          <a
            href={content.data.click_url}
            target="_blank"
            rel="noopener noreferrer"
            className="block relative rounded-lg overflow-hidden py-3 sm:py-4 cursor-pointer hover:opacity-90 transition-opacity"
            style={{
              background: getRandomGradient(),
              minHeight: window.innerWidth < 768 ? '60px' : '70px',
            }}
            onClick={(e) => {
              // Track click before opening URL
              if (content.data.id) {
                trackAdEvent(content.data.id, true);
              }
            }}
          >
            {/* Sponsored label - bottom right */}
            <div className="absolute bottom-2 right-2 bg-black/30 backdrop-blur-sm px-2 py-1 rounded text-[10px] text-white/80 font-medium">
              SPONSORED
            </div>
            
            {/* Centered content */}
            <div className="flex items-center justify-center text-center px-4 h-full">
              {/* Title with pulse animation */}
              <div className="text-white font-bold animate-fade-pulse max-w-full text-sm sm:text-base md:text-lg leading-tight">
                {content.data.title}
              </div>
            </div>
          </a>
        )}
      </div>
    </div>

    {/* ✅ FULL-SCREEN VIDEO MODAL */}
    {expandedVideoUrl && (
      <div 
        className="fixed inset-0 bg-black/95 z-[100] flex items-center justify-center"
        onClick={() => setExpandedVideoUrl(null)}
      >
        <button
          onClick={() => setExpandedVideoUrl(null)}
          className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors z-10"
        >
          <XMarkIcon className="w-8 h-8" />
        </button>
        
        <video
          src={expandedVideoUrl}
          controls
          autoPlay
          className="max-w-[90vw] max-h-[90vh] rounded-lg shadow-2xl"
          onClick={(e) => e.stopPropagation()} // Prevent closing when clicking video
        />
      </div>
    )}
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
